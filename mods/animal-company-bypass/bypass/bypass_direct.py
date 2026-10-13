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
#  runs, so frida attaches the same as it would after a successful swap.
#  bypass.js still applies (the game's own EACClientManager checks still
#  happen in-process and still need faking) - only the launcher-swap step
#  is skipped.
#
#  ZERO filesystem changes - nothing is renamed, nothing to restore, nothing
#  for an AV/CFA rule to catch. Requires Steam to be running and you logged
#  in (for steam_api64.dll's ticket check) - it just doesn't need you to
#  click Play in the Steam library.
#
#  If the game refuses to start this way (some titles hard-require being
#  launched through Steam's own sequence), fall back to getting the AV/CFA
#  exception sorted and use bypass.py instead.
# ============================================================================
import os
import sys
import time
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


try:
    import psutil
except ImportError:
    print("Installing psutil...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
    import psutil


def p(name):
    return os.path.join(GAME_DIR, name)


def wait_for_unity_ready(pid, timeout=120):
    try:
        proc = psutil.Process(pid)
    except Exception:
        return
    start = time.time()
    while time.time() - start < timeout:
        try:
            if not proc.is_running():
                print(f"{LPURPLE}   [x] {RESET}Process exited before Unity finished loading")
                return
            maps = proc.memory_maps()
            names = " ".join((m.path or "").lower() for m in maps)
            if "gameassembly.dll" in names or "unityplayer.dll" in names:
                print(f"{LPURPLE}   [+] {RESET}Unity runtime loaded")
                return
        except Exception:
            pass
        time.sleep(1)
    print(f"{LPURPLE}   [!] {RESET}Timed out waiting for Unity - injecting anyway")


def inject_frida():
    bridge = os.path.join(SCRIPT_DIR, "ac_bridge.js")
    symbols = os.path.join(SCRIPT_DIR, "symbols.js")
    bypass = os.path.join(SCRIPT_DIR, "bypass.js")
    quest = os.path.join(SCRIPT_DIR, "quest.js")
    try:
        print(f"{LPURPLE}   [!] {RESET}Injecting bypass into {GAME_EXE}...")
        subprocess.Popen(
            [
                "cmd", "/c", "frida",
                "-l", bridge,
                "-l", symbols,
                "-l", bypass,
                "-l", quest,
                GAME_EXE,
                "&", "pause",
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            cwd=SCRIPT_DIR,
        )
        return True
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Injection failed: {e}")
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
    print(f"{PURPLE}{BOLD}   Animal Company - direct launch (no renaming){RESET}")
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print()
    print(f"{WHITE}   Make sure Steam is running and you're logged in first.{RESET}")
    print()

    print(f"{LPURPLE}   [!] {RESET}Launching {GAME_EXE} directly...")
    try:
        proc = subprocess.Popen([exe], cwd=GAME_DIR)
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Launch failed: {e}")
        return

    print(f"{LPURPLE}   [+] {RESET}Launched (pid={proc.pid}). Waiting for Unity to finish loading...")
    wait_for_unity_ready(proc.pid)
    time.sleep(1)
    if inject_frida():
        print()
        print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
        print(f"{WHITE}{BOLD}                    BYPASSED{RESET}")
        print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
        print()
    print(f"{GRAY}   Waiting for the game to close...{RESET}")
    try:
        proc.wait()
    except KeyboardInterrupt:
        pass
    print(f"{GRAY}   Game closed.{RESET}")


if __name__ == "__main__":
    if not ensure_admin():
        sys.exit(0)
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
