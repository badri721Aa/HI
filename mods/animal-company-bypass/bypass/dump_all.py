import os
import sys
import time
import atexit
import argparse
import subprocess
import datetime
import tempfile

try:
    import psutil
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
    import psutil

GAME_DIR = r"E:\SteamLibrary\steamapps\common\Animal Company"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))

GAME_EXE = "AnimalCompany.exe"
GAME_DATA = "AnimalCompany_Data"
EAC_EXE = "EACLauncher.exe"
EAC_DATA = "EACLauncher_Data"
EAC_EXE_BAK = "EACLauncher.exe.syte_bak"
EAC_DATA_BAK = "EACLauncher_Data.syte_bak"

# After setup, Steam launches EACLauncher.exe which is actually the game (no EAC)
INJECT_PROCESS = EAC_EXE

DUMP_DIR = os.path.join(SCRIPT_DIR, "dump")
OUT_FILE = os.path.join(DUMP_DIR, "dump_all_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".txt")

# The dump runs as ONE minified combined script (like the frida CLI bundles
# multiple -l files), so ac_bridge's Il2Cpp is visible to the rest AND the
# payload stays small enough to load into the game without timing out.
COMBINED_MIN = os.path.join(SCRIPT_DIR, "combined.min.js")
DUMP_SCRIPTS = [
    "ac_bridge.js",
    "dump_all.js",
]

# The agent writes the txt file itself (Frida File API) when this global is set.
# The wrapper is loaded first so dump_all.js sees it in the shared context.
WRAPPER = os.path.join(tempfile.gettempdir(), "ac_dump_outfile.js")

# The default dump is a SAFE full metadata dump (all classes, fields, methods,
# offsets, RVAs) that never touches live objects - it cannot crash the game.
# Live state/scene/asset dumps are opt-in via --live (they read live objects
# and can crash the game mid-dump, like the old runs did).
LIVE_DUMPS = False

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


def spin_msg(msg, duration=1.0):
    frames = ["/", "-", "\\", "|"]
    end_time = time.time() + duration
    i = 0
    while time.time() < end_time:
        c = frames[i % 4]
        sys.stdout.write("\r\033[2K%s   [%s]%s %s" % (GRAY, c, RESET, msg))
        sys.stdout.flush()
        time.sleep(0.15)
        i += 1
    sys.stdout.write("\r\033[2K")
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
        print("%s   [x] %sGame dir not found:" % (LPURPLE, RESET))
        print("%s       %s%s" % (GRAY, GAME_DIR, RESET))
        return False

    if is_already_swapped():
        _swapped = True
        print("%s   [+] %sAlready in no-EAC mode (will restore on exit)" % (LPURPLE, RESET))
        return True

    if not os.path.exists(p(GAME_EXE)):
        print("%s   [x] %s%s not found" % (LPURPLE, RESET, GAME_EXE))
        return False

    try:
        spin_msg("Parking real EAC launcher...")
        if os.path.exists(p(EAC_EXE)) and not os.path.exists(p(EAC_EXE_BAK)):
            os.rename(p(EAC_EXE), p(EAC_EXE_BAK))
        if os.path.exists(p(EAC_DATA)) and not os.path.exists(p(EAC_DATA_BAK)):
            os.rename(p(EAC_DATA), p(EAC_DATA_BAK))
        print("%s   [+] %sEAC launcher parked as *.syte_bak" % (LPURPLE, RESET))

        spin_msg("Switching game to EACLauncher name...")
        os.rename(p(GAME_EXE), p(EAC_EXE))
        if os.path.exists(p(GAME_DATA)):
            os.rename(p(GAME_DATA), p(EAC_DATA))
        print("%s   [+] %sGame temporarily named as EACLauncher (no EAC)" % (LPURPLE, RESET))

        _swapped = True
        return True
    except Exception as e:
        print("%s   [x] %sSetup failed: %s" % (LPURPLE, RESET, e))
        print("%s       Run this script as Administrator%s" % (GRAY, RESET))
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
            print("%s   [+] %sGame files restored" % (LPURPLE, RESET))
        _swapped = False
    except Exception as e:
        print("%s   [x] %sRestore failed: %s" % (LPURPLE, RESET, e))
        print("%s       Manually rename EACLauncher.exe -> AnimalCompany.exe%s" % (GRAY, RESET))


def ensure_combined_min():
    """Rebuild combined.min.js if missing or older than any source script."""
    if os.path.exists(COMBINED_MIN):
        min_mtime = os.path.getmtime(COMBINED_MIN)
        for name in DUMP_SCRIPTS:
            src_path = os.path.join(SCRIPT_DIR, name)
            if os.path.exists(src_path) and os.path.getmtime(src_path) > min_mtime:
                break
        else:
            return
    try:
        import build_combined
        build_combined.build()
    except Exception as e:
        print("%s   [!] %sCould not rebuild combined.min.js: %s" % (LPURPLE, RESET, e))


def write_wrapper():
    """Small script loaded FIRST so dump_all.js sees __DUMP_OUT_FILE__,
    which tells it where to write the dump txt file."""
    path = os.path.abspath(OUT_FILE).replace("\\", "/")
    content = 'globalThis.__DUMP_OUT_FILE__ = %s;\n' % __import__("json").dumps(path)
    if LIVE_DUMPS:
        content += "globalThis.__DUMP_LIVE__ = true;\n"
    with open(WRAPPER, "w", encoding="utf-8") as f:
        f.write(content)


def wait_for_unity_ready(pid, timeout=120):
    """Wait until the Unity runtime (GameAssembly.dll) is loaded so the frida
    CLI's script load isn't starved during the game's heavy startup phase."""
    try:
        proc = psutil.Process(pid)
    except Exception:
        return
    start = time.time()
    while time.time() - start < timeout:
        try:
            if not proc.is_running():
                return
            maps = proc.memory_maps()
            names = " ".join((m.path or "").lower() for m in maps)
            if "gameassembly.dll" in names or "unityplayer.dll" in names:
                print("%s   [+] %sUnity runtime loaded - injecting now" % (LPURPLE, RESET))
                return
        except Exception:
            pass
        print("%s   [!] %sWaiting for Unity to finish loading..." % (LPURPLE, RESET))
        time.sleep(1)
    print("%s   [!] %sTimed out waiting for Unity modules - injecting anyway" % (LPURPLE, RESET))


def inject_frida():
    """Launch the frida CLI in its own console (same mechanism as bypass.py).
    The agent writes the dump txt file itself via Frida's File API."""
    try:
        args = [
            "cmd",
            "/c",
            "frida",
            "-l", WRAPPER,
            "-l", COMBINED_MIN,
            INJECT_PROCESS,
            "&",
            "pause",
        ]
        subprocess.Popen(args, creationflags=subprocess.CREATE_NEW_CONSOLE, cwd=SCRIPT_DIR)
        return True
    except Exception as e:
        print("%s   [x] %sInjection failed: %s" % (LPURPLE, RESET, e))
        return False


def get_process_pid(name):
    for proc in psutil.process_iter(["name", "pid"]):
        try:
            if proc.info["name"] and proc.info["name"].lower() == name.lower():
                return proc.info["pid"]
        except Exception:
            pass
    return None


def main():
    global LIVE_DUMPS
    parser = argparse.ArgumentParser(description="Animal Company full dump (no-EAC).")
    parser.add_argument("--live", action="store_true",
                        help="Also dump LIVE state tree / scene / assets. WARNING: reading live "
                             "objects is what crashed the game in earlier runs; the default dump "
                             "is pure metadata and is safe.")
    args = parser.parse_args()
    LIVE_DUMPS = args.live

    try:
        kernel32 = __import__("ctypes").windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass

    atexit.register(restore_game_files)

    os.system("cls")
    print()
    print("%s%s            ███████ ██    ██ ████████ ███████ %s" % (DPURPLE, BOLD, RESET))
    print("%s%s            ██       ██  ██     ██    ██      %s" % (DPURPLE, BOLD, RESET))
    print("%s%s            ███████   ████      ██    █████   %s" % (PURPLE, BOLD, RESET))
    print("%s%s                 ██    ██       ██    ██      %s" % (PURPLE, BOLD, RESET))
    print("%s%s            ███████    ██       ██    ███████ %s" % (LPURPLE, BOLD, RESET))
    print()
    print("%s   ────────────────────────────────────────────────────%s" % (GRAY, RESET))
    print()
    print("%s               Complete EAC Bypass%s" % (LPURPLE, RESET))
    print("%s%s              + FULL GAME DUMP%s" % (WHITE, BOLD, RESET))
    print("%s   ────────────────────────────────────────────────────%s" % (GRAY, RESET))
    print()

    if not setup_no_eac():
        print()
        print("%s   [x] %sCould not set up no-EAC launch" % (LPURPLE, RESET))
        return

    os.makedirs(DUMP_DIR, exist_ok=True)
    ensure_combined_min()
    if not os.path.exists(COMBINED_MIN):
        print()
        print("%s   [x] %sNo combined.min.js and could not build one — likely missing" % (LPURPLE, RESET))
        print("%s       ac_bridge.js next to this script. Frida has nothing to inject," % GRAY)
        print("%s       so nothing will be dumped even though this script looks like it ran.%s" % (GRAY, RESET))
        restore_game_files()
        return
    write_wrapper()

    print()
    print("%s   ────────────────────────────────────────────────────%s" % (GRAY, RESET))
    print("%s%s        Looking For EACLauncher (game)...%s" % (WHITE, BOLD, RESET))
    print("%s   ────────────────────────────────────────────────────%s" % (GRAY, RESET))
    print()
    print("%s   Launch Animal Company from Steam%s" % (WHITE, RESET))
    print("%s   (Steam starts EACLauncher = game, EAC is parked)%s" % (GRAY, RESET))
    print()
    print("%s   The dump runs automatically once Unity is loaded.%s" % (LPURPLE, RESET))
    if LIVE_DUMPS:
        print("%s   [--live] LIVE state/scene/asset dumps ENABLED (may crash the game)%s" % (LPURPLE, RESET))
    else:
        print("%s   Default = safe full metadata dump. Add --live for live dumps.%s" % (GRAY, RESET))
    print("%s   Dump txt files go to:%s" % (GRAY, RESET))
    print("%s       %s%s" % (GRAY, os.path.abspath(DUMP_DIR), RESET))
    print()
    print("%s   A frida console window opens with live output - you can close it anytime.%s" % (GRAY, RESET))
    print("%s   Keep this window open - files restore when you close it%s" % (GRAY, RESET))
    print()

    injected = False
    try:
        while True:
            if not injected:
                pid = get_process_pid(EAC_EXE)
                if pid:
                    print("%s   [!] %sGame detected (pid=%d). Waiting for Unity..." % (LPURPLE, RESET, pid))
                    wait_for_unity_ready(pid)
                    time.sleep(2)
                    if inject_frida():
                        injected = True
                        print("%s   [+] %sFrida injected! Dump is running..." % (LPURPLE, RESET))
                        print("%s       %s%s" % (GRAY, os.path.abspath(OUT_FILE), RESET))
            if injected and not is_process_running(EAC_EXE):
                print("%s   Game closed. Finalizing...%s" % (DPURPLE, RESET))
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print()
        print("%s   Exiting...%s" % (DPURPLE, RESET))
        print()
    finally:
        print("%s   [+] %sDump written to:" % (LPURPLE, RESET))
        print("%s       %s%s" % (GRAY, os.path.abspath(OUT_FILE), RESET))
        restore_game_files()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
