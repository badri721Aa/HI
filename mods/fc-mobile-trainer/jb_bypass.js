// JS / Frida / iOS (attach target: EA Sports FC Mobile process)
// Jailbreak-detection bypass. Hooks the standard check families apps use to
// refuse to run on a jailbroken device: filesystem probes for jailbreak
// paths/apps, fork() sandbox-escape checks, suspicious dylib/image name
// checks, and the writability test on normally read-only partitions.
// Defeats the CLIENT's own local jailbreak check - has no effect on
// server-side device/account risk scoring, which is a separate system this
// can't see or touch (see README "what this does and doesn't do").
'use strict';

const JB_PATHS = [
    "/Applications/Cydia.app", "/Applications/Sileo.app", "/Applications/Zebra.app",
    "/Applications/FakeCarrier.app", "/Applications/Icy.app", "/Applications/IntelliScreen.app",
    "/Applications/MxTube.app", "/Applications/RockApp.app", "/Applications/SBSettings.app",
    "/Applications/WinterBoard.app", "/Applications/blackra1n.app",
    "/Library/MobileSubstrate/MobileSubstrate.dylib", "/Library/MobileSubstrate/DynamicLibraries",
    "/bin/bash", "/bin/sh", "/usr/sbin/sshd", "/usr/libexec/sftp-server", "/usr/bin/ssh",
    "/etc/apt", "/private/var/lib/apt", "/private/var/lib/cydia", "/private/var/stash",
    "/private/var/tmp/cydia.log", "/var/cache/apt", "/var/lib/apt", "/var/lib/cydia",
    "/usr/libexec/cydia", "/private/var/mobile/Library/SBSettings/Themes",
    "/Library/MobileSubstrate/CydiaSubstrate.dylib",
];

const JB_URL_SCHEMES = ["cydia://", "sileo://", "zbra://", "undecimus://"];

const JB_IMAGE_SUBSTRINGS = [
    "MobileSubstrate", "Substitute", "substrate", "SubstrateLoader", "CydiaSubstrate",
    "libhooker", "SSLKillSwitch", "FridaGadget", "frida-agent",
];

function log(msg) { console.log("[jb_bypass] " + msg); }

// --- filesystem probes: stat/lstat/access/fopen on jailbreak paths ---
function hookPathCheck(name, pathArgIndex) {
    const addr = Module.findExportByName(null, name);
    if (!addr) return;
    Interceptor.attach(addr, {
        onEnter(args) {
            try {
                this.path = args[pathArgIndex].readUtf8String();
                this.isJbPath = this.path && JB_PATHS.some(p => this.path.indexOf(p) !== -1);
            } catch (e) { this.isJbPath = false; }
        },
        onLeave(retval) {
            if (this.isJbPath) {
                // Pretend the path doesn't exist / isn't accessible.
                retval.replace(ptr(-1));
            }
        },
    });
}
["stat", "lstat", "stat64", "lstat64", "access"].forEach(n => hookPathCheck(n, 0));
hookPathCheck("fopen", 0);

// --- fork(): JB checks often probe that fork() succeeds (sandboxed apps
// can't fork on a non-jailbroken device) - force it to look sandboxed.
const forkAddr = Module.findExportByName(null, "fork");
if (forkAddr) {
    Interceptor.replace(forkAddr, new NativeCallback(() => {
        log("fork() called by JB check - returning -1 (sandboxed)");
        return -1;
    }, "int", []));
}

// --- canWriteToSystemPath-style checks: fopen(path, "w")/"wb" on a
// read-only partition path succeeding is itself a JB signal. Already
// covered by the fopen hook above for known paths; also block the generic
// "write a file to / and delete it" pattern some checks use.
["/private/jb_test.txt", "/jb_test.txt"].forEach(p => JB_PATHS.push(p));

// --- URL scheme checks: canOpenURL(cydia://...) ---
try {
    const UIApplication = ObjC.classes.UIApplication;
    const orig = UIApplication["- canOpenURL:"];
    if (orig) {
        Interceptor.attach(orig.implementation, {
            onEnter(args) {
                try {
                    const url = new ObjC.Object(args[2]).absoluteString().toString();
                    this.isJbScheme = JB_URL_SCHEMES.some(s => url.indexOf(s) === 0);
                } catch (e) { this.isJbScheme = false; }
            },
            onLeave(retval) {
                if (this.isJbScheme) retval.replace(ptr(0)); // NO
            },
        });
    }
} catch (e) {
    log("UIApplication hook skipped: " + e);
}

// --- loaded-image enumeration checks for substrate/frida dylibs ---
try {
    const origGetImageName = Module.findExportByName(null, "_dyld_get_image_name");
    if (origGetImageName) {
        Interceptor.attach(origGetImageName, {
            onLeave(retval) {
                try {
                    const name = retval.readUtf8String();
                    if (name && JB_IMAGE_SUBSTRINGS.some(s => name.indexOf(s) !== -1)) {
                        // Can't un-load the image or hide it from this API cleanly
                        // without breaking the loader; log so you know which
                        // check is probing for what, and see README for the
                        // gadget-based injection option that avoids this
                        // surface entirely instead of patching around it.
                        log("JB-suspicious image name read via dyld: " + name);
                    }
                } catch (e) {}
            },
        });
    }
} catch (e) {}

log("jailbreak-detection bypass installed");
