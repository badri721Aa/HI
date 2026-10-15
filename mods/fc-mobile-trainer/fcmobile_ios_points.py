#!/usr/bin/env python3
# Python / Frida / iOS - EA Sports FC Mobile value trainer driver (iOS port).
#
# Identical workflow to fcmobile_points.py (the Android version) - Frida's
# JS API (Process.enumerateRanges/Memory.scanSync/NativePointer read/write)
# is the same cross-platform, so fcmobile_scan.js is reused unmodified. This
# driver just connects over usbmuxd instead of adb, loads jb_bypass.js and
# ssl_unpin.js first (so the app doesn't refuse to run or refuse mitmproxy's
# cert), then the scanner.
#
# Requires: a jailbroken iPhone with frida-server installed (via Sileo/Cydia,
# package "re.frida.server" from the Frida repo), USB-connected, usbmuxd
# running on this machine (comes with libimobiledevice / iTunes).
# pip install frida frida-tools
#
# BUNDLE_ID is FILL - confirm with:
#   frida-ps -Uai | grep -i "fc\|fifa\|ea sports"
# (lists installed apps with their bundle identifiers over USB)
import os
import sys

BUNDLE_ID = "com.ea.gp.fifamobile"  # FILL: confirm via `frida-ps -Uai`
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))


def load(session, filename):
    with open(os.path.join(SCRIPT_DIR, filename), encoding="utf-8") as f:
        script = session.create_script(f.read())
    script.load()
    return script


def main():
    import frida

    device = frida.get_usb_device(timeout=10)
    print("Device: %s" % device.name)

    print("Spawning %s..." % BUNDLE_ID)
    pid = device.spawn([BUNDLE_ID])
    session = device.attach(pid)

    # Order matters: jailbreak + SSL bypass need to be in place before the
    # app's own startup code runs its checks, so load them before resuming.
    load(session, "jb_bypass.js")
    load(session, "ssl_unpin.js")
    scan_script = load(session, "fcmobile_scan.js")

    device.resume(pid)
    api = scan_script.exports_sync

    print()
    print("Attached (pid=%d). If you're also running mitm_addon.py, make sure" % pid)
    print("this device's Wi-Fi proxy points at that machine:8080 and mitmproxy's")
    print("CA cert is installed+trusted on the device (Settings > General > About >")
    print("Certificate Trust Settings) - ssl_unpin.js alone doesn't install the cert.")
    print()
    print("Commands:")
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
