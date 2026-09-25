"""
Build script — produces SteamKitManager.exe via PyInstaller.
Run: python build.py
"""
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ENTRY = os.path.join(HERE, "src", "main.py")
DIST = os.path.join(HERE, "dist")
ICON = os.path.join(HERE, "assets", "icon.ico")

def main():
    # install pyinstaller if missing
    try:
        import PyInstaller
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--windowed",
        "--name", "SteamKitManager",
        "--distpath", DIST,
        "--workpath", os.path.join(HERE, "build_tmp"),
        "--specpath", os.path.join(HERE, "build_tmp"),
    ]
    if os.path.exists(ICON):
        cmd += ["--icon", ICON]

    cmd.append(ENTRY)
    print("Building exe...")
    subprocess.check_call(cmd)
    print(f"\nDone! Output: {os.path.join(DIST, 'SteamKitManager.exe')}")

if __name__ == "__main__":
    main()
