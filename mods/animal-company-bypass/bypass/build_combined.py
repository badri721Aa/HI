import os
import sys
import subprocess
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
SCRIPTS = ["ac_bridge.js", "dump_all.js"]
COMBINED_RAW = os.path.join(SCRIPT_DIR, "combined.raw.js")
COMBINED_MIN = os.path.join(SCRIPT_DIR, "combined.min.js")


def build():
    parts = []
    for name in SCRIPTS:
        with open(os.path.join(SCRIPT_DIR, name), "r", encoding="utf-8", errors="replace") as f:
            parts.append("// ===== %s =====\n%s" % (name, f.read()))
    src = "\n".join(parts)
    with open(COMBINED_RAW, "w", encoding="utf-8") as f:
        f.write(src)
    print("raw combined size:", len(src), "bytes")

    # syntax check the raw combined
    rc = subprocess.run(["node", "--check", COMBINED_RAW], capture_output=True)
    if rc.returncode != 0:
        print("node --check FAILED on raw combined:")
        print(rc.stderr.decode("utf-8", "replace"))
        return False

    try:
        r = subprocess.run(
            ["npx", "--yes", "terser", COMBINED_RAW, "-c", "-m", "--comments", "false", "-o", COMBINED_MIN],
            capture_output=True,
        )
        if r.returncode != 0:
            print("terser FAILED:", r.stderr.decode("utf-8", "replace"))
            return False
    except FileNotFoundError:
        print("terser (npx) not available; copying raw as min")
        with open(COMBINED_MIN, "w", encoding="utf-8") as dst:
            dst.write(src)
        return True

    size = os.path.getsize(COMBINED_MIN)
    print("minified combined size:", size, "bytes")
    if size < 218000:
        print("OK - under the ~218KB proven ceiling")
    else:
        print("WARNING - still above 218KB; may time out loading into the game")
    return True


if __name__ == "__main__":
    sys.exit(0 if build() else 1)
