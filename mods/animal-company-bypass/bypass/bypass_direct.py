#!/usr/bin/env python3
# ============================================================================
#  Animal Company - DIRECT LAUNCH bypass (no file renaming at all)
#
#  The rename dance (bypass.py/bypass_dump.py) exists purely to stop Steam
#  from running the REAL EACLauncher.exe, because that's what loads EAC's
#  anti-tamper driver before the game starts — once that's running, frida
#  can't attach cleanly. If something on this machine (Controlled Folder
#  Access, a third-party AV's ransomware/folder shield) blocks renaming
#  inside the Steam library outright, admin rights included, there's a
#  simpler way to get the same result: skip Steam's "Play" button and
#  EACLauncher.exe entirely, and launch AnimalCompany.exe directly.
#  EAC's driver never loads because its loader (EACLauncher.exe) never
#  runs. bypass.js still applies (the game's own EACClientManager checks
#  still happen in-process and still need faking) - only the launcher-swap
#  step is skipped.
#
#  Uses frida's OWN spawn mode (-f / --no-pause) instead of launching the
#  exe ourselves and attaching after the fact: the game sets its own
#  process mitigation policy (blocks non-signed code from being injected)
#  very early in startup, independent of whether EAC's driver is running,
#  so attaching after an external launch is too late — frida has to spawn
#  the process itself, suspended, and inject before that policy gets set.
#
#  ZERO filesystem changes - nothing is renamed, nothing to restore, nothing
#  for an AV/CFA rule to catch. Requires Steam to be running and you logged
#  in (for steam_api64.dll's ticket check) - it just doesn't need you to
#  click Play in the Steam library.
# ============================================================================
import os
import sys
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


def spawn_and_inject():
    exe = p(GAME_EXE)
    bridge = os.path.join(SCRIPT_DIR, "ac_bridge.js")
    symbols = os.path.join(SCRIPT_DIR, "symbols.js")
    bypass = os.path.join(SCRIPT_DIR, "bypass.js")
    quest = os.path.join(SCRIPT_DIR, "quest.js")
    try:
        subprocess.Popen(
            [
                "cmd", "/c", "frida",
                "-f", exe,
                "--no-pause",
                "-l", bridge,
                "-l", symbols,
                "-l", bypass,
                "-l", quest,
                "&", "pause",
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            cwd=GAME_DIR,
        )
        return True
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Spawn failed: {e}")
        return False


def main():
    exe = p(GAME_EXE)
    if not os.path.exists(exe):
        print(f"{LPURPLE}   [x] {RESET}{exe} not found")
        print(f"{GRAY}       If repair.py says it's currently wearing a different name,{RESET}")
        print(f"{GRAY}       run repair.py first to put it back.{RESET}")
        return

    os.system("cls")
    print()
    print(f"{PURPLE}{BOLD}   Animal Company - direct launch (no renaming, frida spawn mode){RESET}")
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print()
    print(f"{WHITE}   Make sure Steam is running and you're logged in.{RESET}")
    print(f"{WHITE}   Close any AnimalCompany.exe that's already running first —{RESET}")
    print(f"{WHITE}   frida needs to start this one itself, suspended, to inject{RESET}")
    print(f"{WHITE}   before the game locks itself down.{RESET}")
    print()

    print(f"{LPURPLE}   [!] {RESET}Spawning {GAME_EXE} via frida...")
    if spawn_and_inject():
        print(f"{LPURPLE}   [+] {RESET}A frida console window opened — that's doing the actual")
        print(f"{GRAY}       launch. Watch that window; this one's done.{RESET}")


if __name__ == "__main__":
    if not ensure_admin():
        sys.exit(0)
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
