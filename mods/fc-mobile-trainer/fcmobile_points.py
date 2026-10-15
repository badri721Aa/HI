#!/usr/bin/env python3
# Python / Frida / Android - EA Sports FC Mobile value trainer driver.
#
# Spawns the app on a USB-connected rooted device with frida-server already
# running (adb shell, as root: /data/local/tmp/frida-server &), attaches,
# loads fcmobile_scan.js, and gives you an interactive scan/filter/write/
# freeze console - the standard GameGuardian-style workflow:
#
#   1. Note the value on screen (e.g. current points balance).
#   2. scan <value> i32        - finds every matching address in memory
#   3. do something in-game that changes the value to a new known number
#   4. filter <new value>      - narrows candidates to the ones that changed
#   5. repeat 3-4 until candidates is a small/exact set
#   6. write 99999             - set it
#   7. freeze 99999            - keep rewriting it if the game fights back
#
# Requires: pip install frida frida-tools
#
# PACKAGE is FILL - FC Mobile kept FIFA Mobile's package id after the rename,
# unverified for your exact build/region. Confirm with:
#   adb shell pm list packages | grep -i ea
# and replace below if different.
#
# Engineering note: if this value is synced to EA's servers (very likely for
# an online economy with real-money packs), a pure memory write is cosmetic -
# it reverts on next sync, and EA runs server-side anti-cheat on live
# accounts. freeze() fights a single local re-read but not a server
# authoritative overwrite. Sticking a server-validated value needs
# intercepting/forging the API response instead (different, bigger job -
# cert-pinning bypass + protocol reversing), not this scan-and-patch trainer.
import os
import sys

PACKAGE = "com.ea.gp.fifamobile"  # FILL: verify via `adb shell pm list packages | grep -i ea`
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))


def main():
    import frida

    device = frida.get_usb_device(timeout=10)
    print("Device: %s" % device.name)

    print("Spawning %s..." % PACKAGE)
    pid = device.spawn([PACKAGE])
    session = device.attach(pid)
    with open(os.path.join(SCRIPT_DIR, "fcmobile_scan.js"), encoding="utf-8") as f:
        script = session.create_script(f.read())
    script.load()
    device.resume(pid)
    api = script.exports_sync

    print()
    print("Attached (pid=%d). Commands:" % pid)
    print("  scan <value> [type]   - type: i32 (default) | i64 | float | double")
    print("  filter <value>        - narrow candidates to ones now equal to this")
    print("  list                  - show current candidate addresses")
    print("  write <value>         - one-shot write to every candidate")
    print("  freeze <value> [ms]   - keep rewriting every candidate (default 500ms)")
    print("  unfreeze              - stop freezing")
    print("  type <i32|i64|float|double> - change default type for scan/filter/write")
    print("  quit")
    print()

    cur_type = "i32"
    while True:
        try:
            line = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not line:
            continue
        parts = line.split()
        cmd = parts[0].lower()

        if cmd == "scan" and len(parts) >= 2:
            cur_type = parts[2] if len(parts) > 2 else cur_type
            n = api.scan(parts[1], cur_type)
            print("%d candidates" % n)
        elif cmd == "filter" and len(parts) >= 2:
            n = api.filter(parts[1], cur_type)
            print("%d candidates remain" % n)
        elif cmd == "list":
            addrs = api.list()
            print("%d candidates: %s" % (len(addrs), addrs[:50]))
            if len(addrs) > 50:
                print("  ... +%d more" % (len(addrs) - 50))
        elif cmd == "write" and len(parts) >= 2:
            n = api.write(parts[1], cur_type)
            print("wrote %d addresses" % n)
        elif cmd == "freeze" and len(parts) >= 2:
            ms = int(parts[2]) if len(parts) > 2 else 500
            n = api.freeze(parts[1], cur_type, ms)
            print("freezing %d addresses at %s every %dms" % (n, parts[1], ms))
        elif cmd == "unfreeze":
            api.unfreeze()
            print("unfrozen")
        elif cmd == "type" and len(parts) >= 2:
            cur_type = parts[1]
            print("default type -> %s" % cur_type)
        elif cmd in ("quit", "exit"):
            break
        else:
            print("unrecognized: %r" % line)

    api.unfreeze()
    session.detach()


if __name__ == "__main__":
    main()
