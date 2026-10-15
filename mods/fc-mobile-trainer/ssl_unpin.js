// JS / Frida / iOS (attach target: EA Sports FC Mobile process)
// Universal SSL pinning bypass - same technique family as SSL Kill Switch 2 /
// objection's "ios sslpinning disable". Needed to MITM the app's HTTPS
// traffic through mitmproxy (see mitm_addon.py) so currency/squad API
// responses can be inspected and rewritten - without this, the app refuses
// to trust mitmproxy's certificate and every request just fails.
//
// Covers the four places apps actually implement pinning: system trust
// evaluation (SecTrust), NSURLSession's auth challenge delegate, TrustKit
// (a common third-party pinning library), and BoringSSL's custom verify
// callback (used by apps with their own bundled networking stack, common in
// game clients using gRPC/QUIC instead of NSURLSession).
'use strict';

function log(msg) { console.log("[ssl_unpin] " + msg); }

// --- 1. SecTrustEvaluate / SecTrustEvaluateWithError -> force success ---
["SecTrustEvaluate", "SecTrustEvaluateWithError"].forEach(name => {
    const addr = Module.findExportByName("Security", name);
    if (!addr) return;
    Interceptor.attach(addr, {
        onLeave(retval) {
            if (name === "SecTrustEvaluate") {
                retval.replace(0); // errSecSuccess
            } else {
                retval.replace(1); // true
            }
        },
    });
    log(name + " hooked");
});

// --- 2. NSURLSession delegate auth challenge -> always useCredential ---
try {
    for (const className of Object.keys(ObjC.classes)) {
        const cls = ObjC.classes[className];
        const sel = "- URLSession:didReceiveChallenge:completionHandler:";
        if (cls[sel]) {
            try {
                Interceptor.attach(cls[sel].implementation, {
                    onEnter(args) {
                        const completionHandler = new ObjC.Block(args[4]);
                        const challenge = new ObjC.Object(args[3]);
                        const protectionSpace = challenge.protectionSpace();
                        const serverTrust = protectionSpace.serverTrust();
                        const credential = ObjC.classes.NSURLCredential.credentialForTrust_(serverTrust);
                        // NSURLSessionAuthChallengeUseCredential = 0
                        completionHandler.implementation(0, credential);
                    },
                    onLeave(retval) {
                        retval.replace(ptr(0)); // swallow original call
                    },
                });
                log("Hooked URLSession:didReceiveChallenge: on " + className);
            } catch (e) {}
        }
    }
} catch (e) {
    log("NSURLSession delegate sweep skipped: " + e);
}

// --- 3. TrustKit (common pinning library) -> force pin validation to pass ---
try {
    const TSKPinningValidator = ObjC.classes.TSKPinningValidator;
    if (TSKPinningValidator) {
        const sel = "- evaluateTrust:forHostname:";
        if (TSKPinningValidator[sel]) {
            Interceptor.attach(TSKPinningValidator[sel].implementation, {
                onLeave(retval) {
                    retval.replace(ptr(0)); // TSKTrustEvaluationSuccess == 0
                },
            });
            log("TrustKit evaluateTrust:forHostname: hooked");
        }
    }
} catch (e) {
    log("TrustKit hook skipped (not present): " + e);
}

// --- 4. BoringSSL custom verify (bundled networking stacks) ---
// FILL: this needs the actual export names from the app's bundled SSL lib,
// which vary by what it links (BoringSSL vs OpenSSL vs a renamed/static
// build). Dump exports first:
//   Process.enumerateModules().forEach(m => {
//     if (/ssl|boring|libcrypto/i.test(m.name)) console.log(m.name, m.base);
//   });
// then hook SSL_CTX_set_custom_verify / SSL_set_custom_verify to force the
// verify callback's result to ssl_verify_ok, and SSL_get_verify_result to
// return X509_V_OK (0), mirroring the pattern above.
function hookBoringSslIfPresent() {
    const candidates = Process.enumerateModules().filter(m => /ssl|boring|crypto/i.test(m.name));
    if (!candidates.length) {
        log("no bundled SSL module found - app likely uses system NSURLSession only");
        return;
    }
    for (const m of candidates) {
        log("bundled SSL-ish module present: " + m.name + " @ " + m.base +
            " - see FILL above to hook its verify callback");
    }
}
hookBoringSslIfPresent();

log("SSL pinning bypass installed");
