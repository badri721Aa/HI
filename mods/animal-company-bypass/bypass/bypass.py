import os
import sys
import time
import atexit
import subprocess

GAME_DIR = r"E:\SteamLibrary\steamapps\common\Animal Company"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))


def ensure_admin():
    """Relaunch elevated via UAC if not already admin. Renaming files inside
    the Steam library can hit WinError 5 (access denied) on a non-elevated
    process depending on how that drive/folder's ACLs are set up — this
    sidesteps having to remember to open an admin terminal every time."""
    import ctypes
    try:
        if ctypes.windll.shell32.IsUserAnAdmin():
            return True
    except Exception:
        return True  # can't tell (not Windows?) - just proceed as-is
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

GAME_EXE = "AnimalCompany.exe"
GAME_DATA = "AnimalCompany_Data"
EAC_EXE = "EACLauncher.exe"
EAC_DATA = "EACLauncher_Data"
EAC_EXE_BAK = "EACLauncher.exe.syte_bak"
EAC_DATA_BAK = "EACLauncher_Data.syte_bak"

# Steam launches EACLauncher.exe which is actually the game (no EAC running)
RENAME_FILES = True

# After setup, Steam launches the game process we must inject
INJECT_PROCESS = EAC_EXE if RENAME_FILES else GAME_EXE

PURPLE = "\033[38;5;242m"
LPURPLE = "\033[38;5;250m"
DPURPLE = "\033[38;5;236m"
WHITE = "\033[97m"
GRAY = "\033[90m"
RESET = "\033[0m"
BOLD = "\033[1m"

_swapped = False

def p(path_name):
    return os.path.join(GAME_DIR, path_name)

def rename_retry(src, dst, tries=10, delay=0.75):
    """os.rename, retrying on WinError 32 (sharing violation) and WinError 5
    (access denied). On a folder, WinError 5 has turned out to be transient
    too - Search Indexer or AV holding a handle open inside it - since it
    still happens even running elevated, which rules out a real ACL denial
    in most cases. Both almost always clear within a few seconds."""
    last = None
    for attempt in range(tries):
        try:
            os.rename(src, dst)
            return
        except OSError as e:
            last = e
            if getattr(e, "winerror", None) not in (5, 32) or attempt == tries - 1:
                raise
            time.sleep(delay)
    if last:
        raise last

def spin_msg(msg, duration=1.0):
    frames = ["/", "-", "\\", "|"]
    end_time = time.time() + duration
    i = 0
    while time.time() < end_time:
        c = frames[i % 4]
        sys.stdout.write(f"\r\033[2K{GRAY}   [{c}]{RESET} {msg}")
        sys.stdout.flush()
        time.sleep(0.15)
        i += 1
    sys.stdout.write(f"\r\033[2K")
    sys.stdout.flush()

def is_process_running(name):
    for proc in psutil.process_iter(["name"]):
        try:
            if proc.info["name"] and proc.info["name"].lower() == name.lower():
                return True
        except Exception:
            pass
    return False

def is_already_swapped():
    # Game exe is gone and EACLauncher.exe is present as the stand-in
    return (not os.path.exists(p(GAME_EXE))) and os.path.exists(p(EAC_EXE))

def setup_no_eac():
    """Temporarily swap game <-> EACLauncher so Steam boots the game without EAC.
    Original EAC files are kept as *.syte_bak and restored on exit."""
    global _swapped

    if not os.path.isdir(GAME_DIR):
        print(f"{LPURPLE}   [x] {RESET}Game dir not found:")
        print(f"{GRAY}       {GAME_DIR}{RESET}")
        return False

    if is_already_swapped():
        _swapped = True
        print(f"{LPURPLE}   [+] {RESET}Already in no-EAC mode (will restore on exit)")
        return True

    if not os.path.exists(p(GAME_EXE)):
        print(f"{LPURPLE}   [x] {RESET}{GAME_EXE} not found")
        return False

    try:
        spin_msg("Parking real EAC launcher...")
        if os.path.exists(p(EAC_EXE)) and not os.path.exists(p(EAC_EXE_BAK)):
            rename_retry(p(EAC_EXE), p(EAC_EXE_BAK))
        if os.path.exists(p(EAC_DATA)) and not os.path.exists(p(EAC_DATA_BAK)):
            rename_retry(p(EAC_DATA), p(EAC_DATA_BAK))
        print(f"{LPURPLE}   [+] {RESET}EAC launcher parked as *.syte_bak")

        spin_msg("Switching game to EACLauncher name...")
        rename_retry(p(GAME_EXE), p(EAC_EXE))
        if os.path.exists(p(GAME_DATA)):
            rename_retry(p(GAME_DATA), p(EAC_DATA))
        print(f"{LPURPLE}   [+] {RESET}Game temporarily named as EACLauncher (no EAC)")

        _swapped = True
        return True
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Setup failed: {e}")
        if getattr(e, "winerror", None) in (5, 32):
            print(f"{GRAY}       File/folder is locked by another process — close Animal Company/")
            print(f"{GRAY}       Steam (check Task Manager for AnimalCompany.exe/EACLauncher.exe),")
            print(f"{GRAY}       let Steam finish verifying, let your AV finish scanning, and check")
            print(f"{GRAY}       Controlled Folder Access isn't blocking this folder — even{RESET}")
            print(f"{GRAY}       elevated, this kind of lock won't clear on its own.{RESET}")
            print(f"{GRAY}       If files are left half-renamed after this, run repair.py.{RESET}")
        else:
            print(f"{GRAY}       Try running this script as Administrator{RESET}")
        restore_game_files()
        return False

def restore_game_files():
    """Put AnimalCompany.exe / _Data back and restore real EAC files."""
    global _swapped
    try:
        if os.path.exists(p(EAC_EXE)) and not os.path.exists(p(GAME_EXE)):
            os.rename(p(EAC_EXE), p(GAME_EXE))
        if os.path.exists(p(EAC_DATA)) and not os.path.exists(p(GAME_DATA)):
            os.rename(p(EAC_DATA), p(GAME_DATA))
        if os.path.exists(p(EAC_EXE_BAK)) and not os.path.exists(p(EAC_EXE)):
            os.rename(p(EAC_EXE_BAK), p(EAC_EXE))
        if os.path.exists(p(EAC_DATA_BAK)) and not os.path.exists(p(EAC_DATA)):
            os.rename(p(EAC_DATA_BAK), p(EAC_DATA))
        if _swapped:
            print(f"{LPURPLE}   [+] {RESET}Game files restored")
        _swapped = False
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Restore failed: {e}")
        print(f"{GRAY}       Manually rename EACLauncher.exe -> AnimalCompany.exe{RESET}")

def inject_frida():
    bridge = os.path.join(SCRIPT_DIR, "ac_bridge.js")
    symbols = os.path.join(SCRIPT_DIR, "symbols.js")
    bypass = os.path.join(SCRIPT_DIR, "bypass.js")
    quest = os.path.join(SCRIPT_DIR, "quest.js")
    try:
        print(f"{LPURPLE}   [!] {RESET}Game detected! Injecting bypass...")
        print()
        subprocess.Popen(
            [
                "cmd",
                "/c",
                "frida",
                "-l",
                bridge,
                "-l",
                symbols,
                "-l",
                bypass,
                "-l",
                quest,
                INJECT_PROCESS,
                "&",
                "pause",
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            cwd=SCRIPT_DIR,
        )
        return True
    except Exception as e:
        print(f"{LPURPLE}   [x] {RESET}Injection failed: {e}")
        return False

def main():
    try:
        kernel32 = __import__("ctypes").windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass

    atexit.register(restore_game_files)

    os.system("cls")
    print()
    print(f"{DPURPLE}{BOLD}            ███████ ██    ██ ████████ ███████ {RESET}")
    print(f"{DPURPLE}{BOLD}            ██       ██  ██     ██    ██      {RESET}")
    print(f"{PURPLE}{BOLD}            ███████   ████      ██    █████   {RESET}")
    print(f"{PURPLE}{BOLD}                 ██    ██       ██    ██      {RESET}")
    print(f"{LPURPLE}{BOLD}            ███████    ██       ██    ███████ {RESET}")
    print()
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print()
    print(f"{LPURPLE}               Complete EAC Bypass{RESET}")
    print(f"{GRAY}                   discord.gg/syte{RESET}")
    print()
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print()

    if not setup_no_eac():
        print()
        print(f"{LPURPLE}   [x] {RESET}Could not set up no-EAC launch")
        return

    print()
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print(f"{WHITE}{BOLD}        Looking For {INJECT_PROCESS} (game)...{RESET}")
    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
    print()
    print(f"{WHITE}   Launch Animal Company from Steam{RESET}")
    print(f"{GRAY}   (Steam starts EACLauncher = game, EAC is parked){RESET}")
    print()
    print(f"{GRAY}   Keep this window open — files restore when you close it{RESET}")
    print()

    injected = False
    try:
        while True:
            if not injected and is_process_running(INJECT_PROCESS):
                time.sleep(1.5)
                if inject_frida():
                    injected = True
                    print(f"{LPURPLE}   [+] {RESET}Bypass injected!")
                    print()
                    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
                    print(f"{WHITE}{BOLD}                    BYPASSED{RESET}")
                    print(f"{GRAY}   ────────────────────────────────────────────────────{RESET}")
                    print()
                    print(f"{GRAY}   Waiting for game to close...{RESET}")
                    print()
            if injected and not is_process_running(INJECT_PROCESS):
                print(f"{DPURPLE}   Game closed. Restoring files...{RESET}")
                print()
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print()
        print(f"{DPURPLE}   Exiting...{RESET}")
        print()
    finally:
        restore_game_files()

if __name__ == "__main__":
    if not ensure_admin():
        sys.exit(0)  # relaunched elevated in a new window; this instance is done
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
