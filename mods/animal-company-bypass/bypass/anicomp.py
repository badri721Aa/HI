#!/usr/bin/env python3
# ============================================================================
#  Animal Company - ONE FILE: spawn, live symbol resolve, bypass, Discord post
#
#  Replaces the rename dance entirely (direct frida spawn - proven to work:
#  EAC's driver only loads via EACLauncher.exe, which this never touches).
#  Resolves il2cpp_* exports FRESH from the live GameAssembly.dll export
#  table on every run instead of trusting a static embedded table, so a
#  game update can never make this go stale again - that was the recurring
#  failure all the previous separate scripts kept hitting.
#
#  Flow:
#    1. elevate (UAC) + install deps (frida, frida-tools, psutil, requests)
#    2. frida.spawn() AnimalCompany.exe, suspended
#    3. inject symbols_dump.js (+ bridge_dump.js) against the suspended-but-
#       injectable process, resume it so GameAssembly.dll actually loads,
#       capture the freshly resolved symbols.js-format output via Frida's
#       File API (same mechanism as the original dump_all.py WRAPPER)
#    4. build one combined script: ac_bridge.js + <fresh symbols.js> +
#       bypass.js + quest.js, inject it into the same (already running) game
#    5. POST the fresh symbols.js / bridge dump / canonical->obfuscated JSON
#       map to a Discord webhook
#
#  Requires: pip install frida frida-tools psutil requests
# ============================================================================
import os
import re
import sys
import json
import time
import subprocess

GAME_DIR = r"E:\SteamLibrary\steamapps\common\Animal Company"
GAME_EXE = "AnimalCompany.exe"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
DUMP_DIR = os.path.join(SCRIPT_DIR, "dump")

# FILL: paste your Discord webhook URL here (Server Settings -> Integrations
# -> Webhooks -> New Webhook -> Copy URL). Left empty, the script still runs
# the bypass, it just skips posting.
DISCORD_WEBHOOK_URL = ""

REGEN_TIMEOUT_S = 90
REGEN_POLL_S = 0.5


def ensure_admin():
    import ctypes
    try:
        if ctypes.windll.shell32.IsUserAnAdmin():
            return True
    except Exception:
        return True
    try:
        params = " ".join('"%s"' % a for a in sys.argv)
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, SCRIPT_DIR, 1)
    except Exception as e:
        print("Could not relaunch elevated (%s) - continuing without admin." % e)
        return True
    return False


def ensure_deps():
    needed = []
    for mod in ("frida", "psutil", "requests"):
        try:
            __import__(mod)
        except ImportError:
            needed.append(mod)
    if needed:
        print("Installing: %s ..." % ", ".join(needed))
        pkgs = [m if m != "frida" else "frida frida-tools" for m in needed]
        subprocess.check_call([sys.executable, "-m", "pip", "install"] + " ".join(pkgs).split())


def read_script(name):
    with open(os.path.join(SCRIPT_DIR, name), encoding="utf-8-sig", errors="replace") as f:
        return f.read()


def log(msg):
    print("[anicomp] %s" % msg)


def make_message_handler(label, collected):
    def on_message(message, data):
        if message.get("type") == "send":
            payload = message.get("payload")
            text = str(payload)
            collected.append(text)
            print("[%s] %s" % (label, text))
        elif message.get("type") == "error":
            print("[%s] JS ERROR: %s" % (label, message.get("description") or message))
    return on_message


def wait_for_file(path, timeout=REGEN_TIMEOUT_S):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            # give the writer a moment to finish flushing
            size1 = os.path.getsize(path)
            time.sleep(0.3)
            if os.path.exists(path) and os.path.getsize(path) == size1:
                return True
        time.sleep(REGEN_POLL_S)
    return False


def extract_sym_json(symbols_js_text):
    """Pulls the SYM = {...} object out of a generated symbols.js and
    returns it as a plain dict (canonical -> obfuscated name)."""
    m = re.search(r"var\s+SYM\s*=\s*\{", symbols_js_text)
    if not m:
        return {}
    start = m.end() - 1
    depth, i = 0, start
    while i < len(symbols_js_text):
        c = symbols_js_text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    block = symbols_js_text[start:i + 1]
    block = re.sub(r",\s*\}", "}", block)
    try:
        return json.loads(block)
    except Exception:
        return {}


def post_discord(content, attachments):
    """attachments: list of (filename, bytes)."""
    if not DISCORD_WEBHOOK_URL:
        log("DISCORD_WEBHOOK_URL not set - skipping Discord post")
        return
    import requests
    files = {}
    for idx, (name, data) in enumerate(attachments):
        files["files[%d]" % idx] = (name, data)
    payload = {"content": content}
    try:
        r = requests.post(
            DISCORD_WEBHOOK_URL,
            data={"payload_json": json.dumps(payload)},
            files=files,
            timeout=30,
        )
        if r.status_code >= 300:
            log("Discord post failed: %s %s" % (r.status_code, r.text[:300]))
        else:
            log("Posted to Discord.")
    except Exception as e:
        log("Discord post error: %s" % e)


def regen_symbols(device, pid):
    """Injects symbols_dump.js against the live process, waits for the
    freshly-resolved symbols.js output, returns its text content."""
    os.makedirs(DUMP_DIR, exist_ok=True)
    out_path = os.path.join(DUMP_DIR, "symbols_fresh.js")
    if os.path.exists(out_path):
        os.remove(out_path)
    wrapper = "globalThis.__SYMBOLS_OUT_FILE__ = %s;\n" % json.dumps(
        os.path.abspath(out_path).replace("\\", "/")
    )
    session = device.attach(pid)
    collected = []
    script = session.create_script(wrapper + read_script("symbols_dump.js"))
    script.on("message", make_message_handler("symbols", collected))
    script.load()
    device.resume(pid)
    log("Waiting for live symbol resolution...")
    ok = wait_for_file(out_path)
    try:
        script.unload()
    except Exception:
        pass
    session.detach()
    if not ok:
        raise RuntimeError("symbols_dump.js never wrote %s (GameAssembly.dll may not have loaded in time)" % out_path)
    with open(out_path, encoding="utf-8-sig", errors="replace") as f:
        return f.read(), out_path


def regen_bridge(device, pid):
    """Same idea against bridge_dump.js - best effort, archival only (the
    live bypass doesn't need this; ac_bridge.js's static getters get
    overridden by symbols.js's Il2Cpp.$config.exports shim at runtime)."""
    os.makedirs(DUMP_DIR, exist_ok=True)
    out_path = os.path.join(DUMP_DIR, "bridge_fresh.txt")
    if os.path.exists(out_path):
        os.remove(out_path)
    wrapper = "globalThis.__BRIDGE_OUT_FILE__ = %s;\n" % json.dumps(
        os.path.abspath(out_path).replace("\\", "/")
    )
    session = device.attach(pid)
    collected = []
    try:
        script = session.create_script(wrapper + read_script("bridge_dump.js"))
        script.on("message", make_message_handler("bridge", collected))
        script.load()
        ok = wait_for_file(out_path, timeout=30)
        try:
            script.unload()
        except Exception:
            pass
    finally:
        session.detach()
    if not ok:
        log("bridge_dump.js didn't produce output in time - skipping (non-fatal)")
        return None, None
    with open(out_path, encoding="utf-8-sig", errors="replace") as f:
        return f.read(), out_path


def run_bypass(device, pid, symbols_js_text):
    combined = "\n".join([
        read_script("ac_bridge.js"),
        symbols_js_text,
        read_script("bypass.js"),
        read_script("quest.js"),
    ])
    session = device.attach(pid)
    collected = []
    script = session.create_script(combined)
    script.on("message", make_message_handler("bypass", collected))
    script.load()
    time.sleep(2)  # let bypass.js's hooks + quest.js's install finish
    return session, script, collected


def main():
    import frida

    exe = os.path.join(GAME_DIR, GAME_EXE)
    if not os.path.exists(exe):
        log("%s not found" % exe)
        return

    device = frida.get_local_device()

    log("Spawning %s..." % exe)
    pid = device.spawn([exe])
    log("Spawned pid=%d" % pid)

    symbols_js_text, symbols_path = regen_symbols(device, pid)
    sym_map = extract_sym_json(symbols_js_text)
    log("Resolved %d/%d canonical exports" % (
        sum(1 for v in sym_map.values() if v and not v.startswith("/*")),
        len(sym_map) or 234,
    ))

    bridge_text, bridge_path = regen_bridge(device, pid)

    session, script, collected = run_bypass(device, pid, symbols_js_text)

    stale = [l for l in collected if "couldn't resolve export" in l or "STALE" in l]
    if stale:
        log("WARNING: still seeing stale-export errors after live regen:")
        for l in stale[:10]:
            log("  " + l)
    else:
        log("No export-resolution errors seen - looks clean.")

    current_sym_bytes = json.dumps(sym_map, indent=1).encode("utf-8")
    attachments = [("symbols_fresh.js", symbols_js_text.encode("utf-8")),
                    ("current_sym.json", current_sym_bytes)]
    if bridge_text:
        attachments.append(("bridge_fresh.txt", bridge_text.encode("utf-8")))

    resolved_count = sum(1 for v in sym_map.values() if v and not v.startswith("/*"))
    summary = "Animal Company bypass run - %s\nresolved %d/%d exports%s" % (
        time.strftime("%Y-%m-%d %H:%M:%S"),
        resolved_count, len(sym_map) or 234,
        " - **STALE NAMES DETECTED**" if stale else "",
    )
    post_discord(summary, attachments)

    log("Bypass loaded. Game is running (pid=%d). Leave this window open." % pid)
    import psutil
    try:
        while psutil.pid_exists(pid):
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    log("Game closed.")


if __name__ == "__main__":
    if not ensure_admin():
        sys.exit(0)
    ensure_deps()
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
