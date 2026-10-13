#!/usr/bin/env python3
# ============================================================================
#  Animal Company - LIVE SYMBOL REFRESH
#  Spawns the game via frida (same spawn-mode approach as bypass_direct.py)
#  and loads symbols_dump.js against it, with the output-file global set so
#  it writes a complete, ready-to-use symbols.js straight to bypass/dump/
#  instead of only printing a short console preview.
#
#  Use this whenever a game update makes the embedded symbol tables in
#  ac_bridge.js / symbols.js / dump_all.js go stale (dump_all.py will print
#  "[__SYM] 0/234 exports live - STALE" when that happens).
#
#  After it finishes: send bypass/dump/symbols_fresh.js back - that's the
#  full current-build canonical -> obfuscated name map, ready to replace
#  symbols.js and re-derive the other embedded copies from.
# ============================================================================
import os
import sys
import json
import tempfile
import subprocess

GAME_DIR = r"E:\SteamLibrary\steamapps\common\Animal Company"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
GAME_EXE = "AnimalCompany.exe"

PURPLE = "\033[38;5;242m"
LPURPLE = "\033[38;5;250m"
WHITE = "\033[97m"
GRAY = "\033[90m"
RESET = "\033[0m"
BOLD = "\033[1m"


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


def p(name):
    return os.path.join(GAME_DIR, name)


def main():
    exe = p(GAME_EXE)
    if not os.path.exists(exe):
        print(f"{LPURPLE}   [x] {RESET}{exe} not found")
        print(f"{GRAY}       If repair.py says it's currently wearing a different name,{RESET}")
        print(f"{GRAY}       run repair.py first to put it back.{RESET}")
        return

    out_dir = os.path.join(SCRIPT_DIR, "dump")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "symbols_fresh.js")

    wrapper = os.path.join(tempfile.gettempdir(), "ac_symbols_wrapper.js")
    with open(wrapper, "w", encoding="utf-8") as f:
        f.write(
            "globalThis.__SYMBOLS_OUT_FILE__ = %s;\n"
            % json.dumps(os.path.abspath(out_file).replace("\\", "/"))
        )

    os.system("cls")
    print()
    print(f"{PURPLE}{BOLD}   Animal Company - live symbol refresh{RESET}")
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print()
    print(f"{WHITE}   Make sure Steam is running and you're logged in.{RESET}")
    print(f"{WHITE}   Close any AnimalCompany.exe that's already running first.{RESET}")
    print()
    print(f"{LPURPLE}   [!] {RESET}Spawning {GAME_EXE} and dumping current symbols...")
    print(f"{GRAY}       Output: {out_file}{RESET}")
    print()

    try:
        subprocess.Popen(
            [
                "cmd", "/c", "frida",
                "-f", exe,
                "-l", wrapper,
                "-l", os.path.join(SCRIPT_DIR, "symbols_dump.js"),
                "&", "pause",
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            cwd=GAME_DIR,
        )
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Spawn failed: {e}")
        return

    print(f"{LPURPLE}   [+] {RESET}A frida console window opened. Wait for it to print")
    print(f"{GRAY}       \"=== SYMBOLS DUMP END ===\" and a resolved count, then close it.{RESET}")
    print(f"{GRAY}       If the game window doesn't show up on its own, type %resume{RESET}")
    print(f"{GRAY}       in that frida prompt and hit Enter.{RESET}")
    print()
    print(f"{WHITE}   Send back: {out_file}{RESET}")


if __name__ == "__main__":
    if not ensure_admin():
        sys.exit(0)
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
