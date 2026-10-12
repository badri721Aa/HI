#!/usr/bin/env python3
"""Build an updated .mrpack from an extracted pack + a plan.

plan.json:
{
  "version_id": "1.1.0",
  "remove": ["mods/sodium-fabric-0.8.7+mc1.21.11.jar", ...],      # index paths to drop
  "enable": ["mods/x.jar.disabled", ...],                          # strip .disabled from path
  "add": ["sodium-extra", "appleskin", ...],                       # Modrinth slugs (mods)
  "replace": {"mods/old.jar": "slug"},                             # drop path, add newest 1.21.11 build of slug
  "pin": {"slug": "versionId"}                                     # optional exact versions
}

Needs network access to api.modrinth.com and cdn.modrinth.com.
Steps: resolve every addition to the newest Fabric 1.21.11 build (release > beta > alpha),
pull its required deps recursively, refuse anything that declares itself incompatible with
a mod in the pack, download every jar (old and new), verify hashes, then run a Fabric-style
dependency/breaks check over every fabric.mod.json (including jar-in-jar).
"""
import argparse, hashlib, io, json, os, re, shutil, sys, time, urllib.parse, zipfile

import requests

API = "https://api.modrinth.com/v2"
UA = {"User-Agent": "SOLO-pack-builder/1.1 (modpack maintenance script)"}
MC, LOADER, JAVA = "1.21.11", "0.19.3", "21"
S = requests.Session()
S.headers.update(UA)


def get(url, **kw):
    for i in range(5):
        r = S.get(url, timeout=60, **kw)
        if r.status_code == 429:
            time.sleep(int(r.headers.get("X-Ratelimit-Reset", "5")) + 1)
            continue
        if r.status_code >= 500:
            time.sleep(2 ** i)
            continue
        return r
    r.raise_for_status()


def api(path, **params):
    q = {k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in params.items()}
    r = get(f"{API}{path}", params=q)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


RANK = {"release": 0, "beta": 1, "alpha": 2}


LOADERS = {"mod": ["fabric"], "resourcepack": ["minecraft"], "shader": ["iris", "optifine"]}
FOLDER = {"mod": "mods", "resourcepack": "resourcepacks", "shader": "shaderpacks"}


def best_version(project, pin=None, ptype="mod"):
    if pin and re.fullmatch(r"[A-Za-z0-9]{8}", pin):
        return api(f"/version/{pin}")
    vs = api(f"/project/{project}/version", loaders=LOADERS.get(ptype, ["fabric"]), game_versions=[MC]) or []
    if pin:  # pin by version_number, e.g. "mc1.21.11-0.9.1+fabric"
        vs = [v for v in vs if v["version_number"] == pin]
    if not vs:
        return None
    vs.sort(key=lambda v: (RANK.get(v["version_type"], 3), -time.mktime(time.strptime(v["date_published"][:19], "%Y-%m-%dT%H:%M:%S"))))
    return vs[0]


def side(v):
    return {"required": "required", "optional": "optional", "unsupported": "unsupported"}.get(v, "optional")


def entry_for(proj, ver):
    f = next((x for x in ver["files"] if x.get("primary")), ver["files"][0])
    return {
        "path": f"{FOLDER.get(proj.get('project_type'), 'mods')}/{f['filename']}",
        "hashes": {"sha1": f["hashes"]["sha1"], "sha512": f["hashes"]["sha512"]},
        "env": {"client": side(proj.get("client_side")), "server": side(proj.get("server_side"))},
        "downloads": [f["url"]],
        "fileSize": f["size"],
        "_project": proj["id"], "_slug": proj["slug"], "_version": ver["id"], "_vnum": ver["version_number"],
    }


def pid_of(entry):
    u = entry["downloads"][0]
    m = re.search(r"/data/([A-Za-z0-9]{8})/versions/([A-Za-z0-9]{8})/", u)
    return (m.group(1), m.group(2)) if m else (None, None)


# ---------------- Fabric version predicates ----------------
def parse_ver(s):
    s = s.strip()
    s = s.split("+", 1)[0]
    core, _, pre = s.partition("-")
    parts = core.split(".")
    nums = []
    for p in parts:
        if p.isdigit():
            nums.append(int(p))
        elif p in ("x", "X", "*"):
            nums.append(None)
        else:
            return None
    return nums, pre


def cmp_pre(a, b):
    if a == b:
        return 0
    if not a:
        return 1
    if not b:
        return -1
    for x, y in zip(a.split("."), b.split(".")):
        if x == y:
            continue
        if x.isdigit() and y.isdigit():
            return -1 if int(x) < int(y) else 1
        if x.isdigit():
            return -1
        if y.isdigit():
            return 1
        return -1 if x < y else 1
    return (len(a.split(".")) > len(b.split("."))) - (len(a.split(".")) < len(b.split(".")))


def cmp_ver(a, b):
    an, ap = a
    bn, bp = b
    n = max(len(an), len(bn))
    for i in range(n):
        x = an[i] if i < len(an) else 0
        y = bn[i] if i < len(bn) else 0
        if x is None or y is None:
            return 0
        if x != y:
            return -1 if x < y else 1
    return cmp_pre(ap, bp)


def single_pred(pred, have):
    pred = pred.strip()
    if pred in ("", "*"):
        return True
    for op in (">=", "<=", ">", "<", "=", "~", "^"):
        if pred.startswith(op):
            target = pred[len(op):].strip()
            break
    else:
        op, target = "=", pred
    hv, tv = parse_ver(have), parse_ver(target)
    if hv is None or tv is None:
        return have.split("+")[0] == target.split("+")[0] if op == "=" else True
    tn, tp = tv
    if op == "=" and None in tn:  # wildcard 1.21.x
        k = tn.index(None)
        return hv[0][:k] + [0] * max(0, k - len(hv[0])) == tn[:k] if len(hv[0]) >= k else False
    c = cmp_ver(hv, tv)
    if op == "=":
        return c == 0
    if op == ">=":
        return c >= 0
    if op == "<=":
        return c <= 0
    if op == ">":
        return c > 0
    if op == "<":
        return c < 0
    if op in ("~", "^"):
        if c < 0:
            return False
        k = 1 if op == "^" else min(2, len(tn))
        upper = list(tn[:k])
        upper[-1] = (upper[-1] or 0) + 1
        return cmp_ver((hv[0], ""), (upper, "")) < 0
    return True


def satisfies(preds, have):
    if isinstance(preds, str):
        preds = [preds]
    for p in preds:  # OR
        if all(single_pred(x, have) for x in p.split()):  # AND
            return True
    return False


# ---------------- jar metadata ----------------
def read_fmj(zf):
    try:
        raw = zf.read("fabric.mod.json").decode("utf-8", "replace")
    except KeyError:
        return None
    raw = re.sub(r"^﻿", "", raw)
    try:
        return json.loads(raw, strict=False)
    except json.JSONDecodeError:
        raw2 = re.sub(r"(?m)^\s*//.*$", "", raw)
        return json.loads(raw2, strict=False)


def collect(data, src, out):
    zf = zipfile.ZipFile(io.BytesIO(data))
    fmj = read_fmj(zf)
    if not fmj:
        return
    out.append((src, fmj))
    for j in fmj.get("jars", []) or []:
        try:
            collect(zf.read(j["file"]), f"{src}!{j['file']}", out)
        except KeyError:
            pass


def fabric_check(jars):
    """jars: list of (path, bytes) for top-level mods/*.jar. Returns (errors, warnings, ids)."""
    mods = []
    tops = {}
    bad = []
    for path, data in jars:
        found = []
        try:
            collect(data, path, found)
        except zipfile.BadZipFile:
            bad.append(f"{path}: not a valid jar")
            continue
        if found:
            tops.setdefault(found[0][1]["id"], []).append(path)
        mods.extend(found)
    have = {"minecraft": MC, "fabricloader": LOADER, "java": JAVA, "fabric-loader": LOADER}
    for _, m in mods:
        mid = m.get("id")
        if mid:
            have.setdefault(mid, str(m.get("version", "0")))
        for p in m.get("provides", []) or []:
            have.setdefault(p, str(m.get("version", "0")))
    errors, warns = list(bad), []
    for mid, paths in tops.items():
        if len(paths) > 1:
            errors.append(f"DUPLICATE mod id '{mid}' in: {', '.join(paths)}")
    for src, m in mods:
        top = src.split("!")[0]
        for dep, pred in (m.get("depends") or {}).items():
            if dep not in have:
                errors.append(f"{top}: '{m.get('id')}' requires missing '{dep}' {pred}")
            elif not satisfies(pred, have[dep]):
                errors.append(f"{top}: '{m.get('id')}' requires {dep} {pred}, pack has {have[dep]}")
        for dep, pred in (m.get("breaks") or {}).items():
            if dep in have and satisfies(pred, have[dep]):
                errors.append(f"{top}: '{m.get('id')}' BREAKS with {dep} {pred} (pack has {have[dep]})")
        for dep, pred in (m.get("conflicts") or {}).items():
            if dep in have and satisfies(pred, have[dep]):
                warns.append(f"{top}: '{m.get('id')}' declares conflict with {dep} {pred} (pack has {have[dep]})")
        for dep, pred in (m.get("recommends") or {}).items():
            if dep not in have:
                warns.append(f"{top}: '{m.get('id')}' recommends '{dep}' {pred}")
    return errors, warns, have


def download(entry, cache):
    os.makedirs(cache, exist_ok=True)
    fn = os.path.join(cache, entry["hashes"]["sha512"][:32] + ".bin")
    if os.path.exists(fn):
        data = open(fn, "rb").read()
        if hashlib.sha512(data).hexdigest() == entry["hashes"]["sha512"]:
            return data
    r = get(entry["downloads"][0])
    r.raise_for_status()
    data = r.content
    if hashlib.sha512(data).hexdigest() != entry["hashes"]["sha512"] or hashlib.sha1(data).hexdigest() != entry["hashes"]["sha1"]:
        raise SystemExit(f"HASH MISMATCH for {entry['path']}")
    if len(data) != entry["fileSize"]:
        raise SystemExit(f"SIZE MISMATCH for {entry['path']}")
    open(fn, "wb").write(data)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="extracted pack dir (with modrinth.index.json, overrides/)")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--allow-errors", action="store_true")
    ap.add_argument("--offline", action="store_true", help="no API/downloads: only removals/enables + overrides")
    a = ap.parse_args()

    idx = json.load(open(os.path.join(a.src, "modrinth.index.json")))
    plan = json.load(open(a.plan))
    pins = plan.get("pin", {})
    files = idx["files"]
    log = []

    drop = set(plan.get("remove", [])) | set(plan.get("replace", {}).keys())
    missing = [p for p in drop if p not in {f["path"] for f in files}]
    if missing:
        raise SystemExit(f"plan removes unknown paths: {missing}")
    files = [f for f in files if f["path"] not in drop]
    for f in files:
        if f["path"] in plan.get("enable", []):
            f["path"] = f["path"][: -len(".disabled")]
            log.append(f"enabled {f['path']}")

    have_projects = {pid_of(f)[0]: f for f in files}
    queue = [] if a.offline else list(plan.get("add", [])) + list(plan.get("replace", {}).values())
    if a.offline and (plan.get("add") or plan.get("replace")):
        raise SystemExit("offline mode cannot add/replace mods")
    added, skipped = [], []
    seen = set()
    while queue:
        slug = queue.pop(0)
        if slug in seen:
            continue
        seen.add(slug)
        proj = api(f"/project/{slug}")
        if not proj:
            skipped.append((slug, "project not found"))
            continue
        if proj["id"] in have_projects:
            skipped.append((slug, "already in pack"))
            continue
        ver = best_version(proj["id"], pins.get(slug) or pins.get(proj["slug"]), proj.get("project_type", "mod"))
        if not ver:
            skipped.append((slug, f"no {MC} build for {proj.get('project_type')}"))
            continue
        bad = [d for d in ver["dependencies"] if d["dependency_type"] == "incompatible" and d.get("project_id") in have_projects]
        if bad:
            skipped.append((slug, "declares incompatible with " + ", ".join(have_projects[d['project_id']]['path'] for d in bad)))
            continue
        e = entry_for(proj, ver)
        files.append(e)
        have_projects[proj["id"]] = e
        added.append(e)
        for d in ver["dependencies"]:
            if d["dependency_type"] == "required" and d.get("project_id") and d["project_id"] not in have_projects:
                if d.get("version_id"):
                    pins[d["project_id"]] = d["version_id"]
                queue.append(d["project_id"])
                log.append(f"{proj['slug']} pulls required dep {d['project_id']}")

    # incompatibilities declared by existing pack mods' versions against new additions
    for f in ([] if a.offline else files):
        pid, vid = pid_of(f)
        if not vid or f.get("_version"):
            continue
        v = api(f"/version/{vid}")
        if not v:
            continue
        for d in v["dependencies"]:
            if d["dependency_type"] == "incompatible" and d.get("project_id") in {x["_project"] for x in added}:
                log.append(f"WARNING: existing {f['path']} declares incompatible with added {d['project_id']}")

    # download + fabric metadata check
    enabled = set(p[: -len(".disabled")] for p in plan.get("enable", []))
    for f in ([] if a.offline else files):  # verify every hash, incl. resource packs
        download(f, a.cache)
    while True:
        jars = [(f["path"], download(f, a.cache)) for f in ([] if a.offline else files)
                if f["path"].startswith("mods/") and f["path"].endswith(".jar")]
        errors, warns, have = fabric_check(jars) if jars else ([], ["offline: fabric dependency check skipped"], {})
        culprits = {e.split(":")[0].replace("DUPLICATE mod id", "").strip() for e in errors}
        added_paths = {e["path"] for e in added}
        prune = [p for p in culprits if p in added_paths or p in enabled]
        if not prune:
            break
        for f in files:
            if f["path"] in prune and f["path"] in enabled:
                f["path"] += ".disabled"
                enabled.discard(f["path"][: -len(".disabled")])
                log.append(f"re-disabled {f['path']} (failed Fabric check)")
        for e in [e for e in added if e["path"] in prune]:
            files.remove(e)
            added.remove(e)
            skipped.append((e["_slug"], "dropped: " + "; ".join(x for x in errors if x.startswith(e["path"]))))

    with open(a.report, "w") as r:
        r.write(f"# Build report\n\nAdded ({len(added)}):\n")
        for e in added:
            r.write(f"- {e['_slug']} {e['_vnum']} -> {e['path']}\n")
        r.write(f"\nSkipped ({len(skipped)}):\n")
        for s, why in skipped:
            r.write(f"- {s}: {why}\n")
        r.write("\nLog:\n" + "".join(f"- {l}\n" for l in log))
        r.write(f"\nFabric ERRORS ({len(errors)}):\n" + "".join(f"- {e}\n" for e in errors))
        r.write(f"\nFabric warnings ({len(warns)}):\n" + "".join(f"- {w}\n" for w in warns))
    print(open(a.report).read())
    if errors and not a.allow_errors:
        raise SystemExit("fabric dependency check failed; not writing pack")

    for f in files:
        for k in [k for k in f if k.startswith("_")]:
            del f[k]
    idx["files"] = sorted(files, key=lambda f: f["path"].lower())
    idx["versionId"] = plan.get("version_id", idx["versionId"])
    if plan.get("summary"):
        idx["summary"] = plan["summary"]
    tmp = a.out + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("modrinth.index.json", json.dumps(idx, indent=1, ensure_ascii=False))
        ov = os.path.join(a.src, "overrides")
        for root, _, fs in os.walk(ov):
            for fn in fs:
                full = os.path.join(root, fn)
                z.write(full, os.path.relpath(full, a.src))
    os.replace(tmp, a.out)
    print(f"wrote {a.out} with {len(idx['files'])} files")


if __name__ == "__main__":
    main()
