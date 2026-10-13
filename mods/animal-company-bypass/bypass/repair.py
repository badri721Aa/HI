#!/usr/bin/env python3
# ============================================================================
#  Animal Company - FOLDER REPAIR
#  Inspects the game folder's current state (independent of what any prior
#  run thinks happened) and puts AnimalCompany.exe/_Data and
#  EACLauncher.exe/_Data back under their real names. Never deletes anything
#  - every operation here is a rename, and it refuses to guess when a state
#  is ambiguous rather than risk making it worse.
#
#  Run this whenever bypass.py/bypass_dump.py/dump_all.py exits with files
#  left in a half-swapped state (a "Setup failed" or "Restore failed" that
#  didn't fully recover).
# ============================================================================
import os
import sys
import time

GAME_DIR = r"E:\SteamLibrary\steamapps\common\Animal Company"
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))

GAME_EXE = "AnimalCompany.exe"
GAME_DATA = "AnimalCompany_Data"
EAC_EXE = "EACLauncher.exe"
EAC_DATA = "EACLauncher_Data"
EAC_EXE_BAK = "EACLauncher.exe.syte_bak"
EAC_DATA_BAK = "EACLauncher_Data.syte_bak"


def ensure_admin():
    """Relaunch elevated via UAC if not already admin."""
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


def rename_retry(src, dst, tries=10, delay=0.75):
    """Retries on WinError 32 (sharing violation) AND WinError 5 (access
    denied) - on folders specifically, WinError 5 has repeatedly turned out
    to be a transient lock too (Search Indexer / AV scanning inside a large
    _Data folder), not a true permission denial, since it happens even
    elevated. Give it a real chance to clear before giving up."""
    last = None
    for attempt in range(tries):
        try:
            os.rename(src, dst)
            print("    renamed: %s -> %s" % (os.path.basename(src), os.path.basename(dst)))
            return True
        except OSError as e:
            last = e
            if getattr(e, "winerror", None) not in (5, 32) or attempt == tries - 1:
                print("    FAILED: %s -> %s  (%s)" % (os.path.basename(src), os.path.basename(dst), e))
                return False
            time.sleep(delay)
    return False


def repair_pair(label, real_name, eac_name, eac_bak_name):
    """real_name/eac_name/eac_bak_name are the three possible names one
    file-or-folder can currently be wearing. Resolves to: real_name = the
    actual game's, eac_name = the actual EAC launcher's, eac_bak_name =
    gone (folded back into eac_name)."""
    real = os.path.exists(p(real_name))
    eac = os.path.exists(p(eac_name))
    bak = os.path.exists(p(eac_bak_name))

    print("  %s: %s=%s  %s=%s  %s=%s" % (
        label, real_name, real, eac_name, eac, eac_bak_name, bak))

    if real and eac and not bak:
        print("    clean - nothing to do")
        return True

    if real and not eac and bak:
        # game is fine, real EAC launcher just needs unparking
        return rename_retry(p(eac_bak_name), p(eac_name))

    if not real and eac and bak:
        # mid-swap: eac_name is wearing the game's identity
        ok = rename_retry(p(eac_name), p(real_name))
        ok = rename_retry(p(eac_bak_name), p(eac_name)) and ok
        return ok

    if not real and eac and not bak:
        # eac_name is almost certainly the real game left over from an
        # incomplete prior restore (the genuine EAC file/folder would have
        # been parked as *.syte_bak before this name was ever reused) -
        # recover it back to its real name.
        print("    %s missing, %s present with no backup - assuming %s" %
              (real_name, eac_name, eac_name))
        print("    actually holds the game data, recovering it as %s" % real_name)
        return rename_retry(p(eac_name), p(real_name))

    if real and eac and bak:
        print("    AMBIGUOUS: all three names exist - not touching this,")
        print("    check by hand which one is the real game vs EAC launcher")
        return False

    if not real and not eac:
        print("    NEITHER %s nor %s exists - something else is wrong here," % (real_name, eac_name))
        print("    not touching it. Check Steam (verify game files) first.")
        return False

    print("    unrecognized combination - not touching it")
    return False


def main():
    if not os.path.isdir(GAME_DIR):
        print("Game dir not found: %s" % GAME_DIR)
        return
    print("Scanning %s\n" % GAME_DIR)
    exe_ok = repair_pair("exe ", GAME_EXE, EAC_EXE, EAC_EXE_BAK)
    data_ok = repair_pair("data", GAME_DATA, EAC_DATA, EAC_DATA_BAK)
    print()
    if exe_ok and data_ok:
        print("Done - AnimalCompany.exe/_Data and EACLauncher.exe/_Data should both be")
        print("under their real names now. Let Steam verify game files once before")
        print("running bypass.py/bypass_dump.py/dump_all.py again.")
    else:
        print("Could not fully resolve - see above. Don't run the bypass scripts")
        print("again until this folder is back to a clean state (both exes and")
        print("both _Data folders present under their real names, no *.syte_bak).")


if __name__ == "__main__":
    if not ensure_admin():
        sys.exit(0)
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
    input("\nPress Enter to exit...")
