#!/usr/bin/env python3
"""Headless boot test for a Fabric .mrpack: install it like a launcher would, start the real
client under Xvfb + Mesa llvmpipe, and report whether it reaches the title screen.

Needs: api/cdn.modrinth.com, meta.fabricmc.net, maven.fabricmc.net, piston-meta.mojang.com,
piston-data.mojang.com, libraries.minecraft.net.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, time, zipfile

import requests

S = requests.Session()
S.headers.update({"User-Agent": "SOLO-pack-builder/1.1 (boot test)"})


def fetch(url, dest, sha1=None):
    if os.path.exists(dest) and (not sha1 or hashlib.sha1(open(dest, "rb").read()).hexdigest() == sha1):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for i in range(4):
        try:
            r = S.get(url, timeout=120)
            r.raise_for_status()
            break
        except Exception:
            if i == 3:
                raise
            time.sleep(2 ** i)
    data = r.content
    if sha1 and hashlib.sha1(data).hexdigest() != sha1:
        raise SystemExit(f"sha1 mismatch {url}")
    open(dest, "wb").write(data)
    return dest


def maven_path(name):
    parts = name.split(":")
    g, a, v = parts[0], parts[1], parts[2]
    cls = f"-{parts[3]}" if len(parts) > 3 else ""
    return f"{g.replace('.', '/')}/{a}/{v}/{a}-{v}{cls}.jar"


def rules_ok(rules):
    if not rules:
        return True
    ok = False
    for r in rules:
        osr = r.get("os")
        if "features" in r:
            continue
        match = osr is None or osr.get("name") == "linux"
        if match:
            ok = r["action"] == "allow"
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mrpack", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--cache", required=True, help="shared jar cache from build_pack.py")
    ap.add_argument("--timeout", type=int, default=1500)
    ap.add_argument("--xmx", default="8G")
    a = ap.parse_args()

    work = os.path.abspath(a.work)
    inst = os.path.join(work, "instance")
    libdir = os.path.join(work, "libraries")
    if os.path.exists(inst):
        shutil.rmtree(inst)
    os.makedirs(inst)

    # 1) install pack
    z = zipfile.ZipFile(a.mrpack)
    idx = json.loads(z.read("modrinth.index.json"))
    mc = idx["dependencies"]["minecraft"]
    loader = idx["dependencies"]["fabric-loader"]
    for f in idx["files"]:
        if f.get("env", {}).get("client") == "unsupported":
            continue
        dst = os.path.join(inst, f["path"])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        cached = os.path.join(a.cache, f["hashes"]["sha512"][:32] + ".bin")
        if os.path.exists(cached):
            shutil.copyfile(cached, dst)
        else:
            fetch(f["downloads"][0], dst, f["hashes"]["sha1"])
    for n in z.namelist():
        for pre in ("overrides/", "client-overrides/"):
            if n.startswith(pre) and not n.endswith("/"):
                dst = os.path.join(inst, n[len(pre):])
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                open(dst, "wb").write(z.read(n))
    # skip first-run dialogs that would block a headless start
    open(os.path.join(inst, "options.txt"), "w").write("onboardAccessibility:false\nsoundDevice:\"\"\nrenderDistance:8\n")

    # 2) vanilla + fabric metadata
    man = S.get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", timeout=60).json()
    vurl = next(v["url"] for v in man["versions"] if v["id"] == mc)
    vj = S.get(vurl, timeout=60).json()
    fj = S.get(f"https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/profile/json", timeout=60).json()

    cp = []
    seen = set()
    for lib in fj["libraries"]:
        key = ":".join(lib["name"].split(":")[:2])
        seen.add(key)
        p = maven_path(lib["name"])
        cp.append(fetch(lib.get("url", "https://maven.fabricmc.net/").rstrip("/") + "/" + p, os.path.join(libdir, p), lib.get("sha1")))
    for lib in vj["libraries"]:
        if not rules_ok(lib.get("rules")):
            continue
        art = lib.get("downloads", {}).get("artifact")
        if not art:
            continue
        key = ":".join(lib["name"].split(":")[:2]) + (":" + lib["name"].split(":")[3] if len(lib["name"].split(":")) > 3 else "")
        if key in seen:
            continue
        cp.append(fetch(art["url"], os.path.join(libdir, art["path"]), art["sha1"]))
    client = fetch(vj["downloads"]["client"]["url"], os.path.join(work, "versions", mc, f"{mc}.jar"), vj["downloads"]["client"]["sha1"])
    cp.append(client)
    ai = vj["assetIndex"]
    fetch(ai["url"], os.path.join(work, "assets", "indexes", f"{ai['id']}.json"), ai["sha1"])

    # 3) launch
    logs = os.path.join(inst, "logs")
    cmd = [
        "xvfb-run", "-a", "-s", "-screen 0 1280x720x24",
        "java", f"-Xmx{a.xmx}", "-Xms2G", "-XX:+UseG1GC",
        "-Dorg.lwjgl.util.Debug=false", "-Djava.awt.headless=true",
        "-cp", ":".join(cp), fj["mainClass"],
        "--username", "BootTest", "--version", mc, "--gameDir", inst,
        "--assetsDir", os.path.join(work, "assets"), "--assetIndex", ai["id"],
        "--uuid", "00000000000000000000000000000000", "--accessToken", "0", "--userType", "msa",
        "--width", "1280", "--height", "720",
    ]
    env = dict(os.environ, LIBGL_ALWAYS_SOFTWARE="1", GALLIUM_DRIVER="llvmpipe", MESA_GL_VERSION_OVERRIDE="4.6", MESA_GLSL_VERSION_OVERRIDE="460")
    env.pop("JAVA_TOOL_OPTIONS", None)
    out = open(os.path.join(work, "stdout.log"), "w")
    t0 = time.time()
    p = subprocess.Popen(cmd, cwd=inst, stdout=out, stderr=subprocess.STDOUT, env=env)
    verdict = "timeout"
    while time.time() - t0 < a.timeout:
        time.sleep(5)
        txt = open(os.path.join(work, "stdout.log"), errors="replace").read()
        if re.search(r"Game took [\d.]+ seconds to start", txt):
            verdict = "title-screen"
            time.sleep(20)
            break
        crashes = os.path.join(inst, "crash-reports")
        if os.path.isdir(crashes) and os.listdir(crashes):
            verdict = "crash-report"
            break
        if p.poll() is not None:
            verdict = f"exited({p.returncode})"
            break
    if p.poll() is None:
        p.terminate()
        try:
            p.wait(30)
        except subprocess.TimeoutExpired:
            p.kill()
    print(json.dumps({"verdict": verdict, "seconds": round(time.time() - t0), "stdout": os.path.join(work, "stdout.log"), "instance": inst}))


if __name__ == "__main__":
    main()
