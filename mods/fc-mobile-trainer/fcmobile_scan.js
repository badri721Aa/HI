// JS / Frida / Android (attach target: EA Sports FC Mobile process)
// Generic process-memory value scanner + patcher + freezer - the same
// multi-pass "exact value -> search changed" technique GameGuardian/Cheat
// Engine implement natively. Works regardless of engine since it operates on
// raw memory, not managed-runtime reflection - no IL2CPP/engine knowledge
// needed, just the numeric value currently shown on screen (points, coins,
// energy, whatever stat you're pointed at).
//
// RPC surface (call from the Python driver via script.exports_sync):
//   scan(valueStr, type)    -> candidate count. type: 'i32'|'i64'|'float'|'double'
//   filter(valueStr, type)  -> narrows current candidates to those still == value
//   list()                  -> current candidate addresses (hex strings)
//   write(valueStr, type)   -> one-shot write to every candidate
//   freeze(valueStr, type, intervalMs) -> repeatedly rewrite every candidate
//   unfreeze()              -> stop freezing
'use strict';

let candidates = [];
let freezeTimer = null;

function parseVal(s, type) {
    if (type === 'float' || type === 'double') return parseFloat(s);
    return parseInt(s, 10);
}

function valueToBuffer(v, type) {
    let buf;
    switch (type) {
        case 'i32': buf = new ArrayBuffer(4); new DataView(buf).setInt32(0, v, true); break;
        case 'i64': buf = new ArrayBuffer(8); new DataView(buf).setBigInt64(0, BigInt(v), true); break;
        case 'float': buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, v, true); break;
        case 'double': buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, v, true); break;
        default: throw new Error('bad type: ' + type);
    }
    return new Uint8Array(buf);
}

function valueToPattern(v, type) {
    const bytes = valueToBuffer(v, type);
    return Array.from(bytes).map(b => ('0' + b.toString(16)).slice(-2)).join(' ');
}

function readVal(addr, type) {
    switch (type) {
        case 'i32': return addr.readS32();
        case 'i64': return addr.readS64().toNumber();
        case 'float': return addr.readFloat();
        case 'double': return addr.readDouble();
        default: throw new Error('bad type: ' + type);
    }
}

function writeVal(addr, v, type) {
    switch (type) {
        case 'i32': addr.writeS32(v); break;
        case 'i64': addr.writeS64(v); break;
        case 'float': addr.writeFloat(v); break;
        case 'double': addr.writeDouble(v); break;
        default: throw new Error('bad type: ' + type);
    }
}

function enumerateScanRanges() {
    // Writable ranges only, skip system/vendor libs - keeps the scan fast and
    // avoids matching framework/loader noise instead of the app's own heap.
    const ranges = [];
    for (const r of Process.enumerateRanges('rw-')) {
        const path = (r.file && r.file.path) || '';
        if (/\/(system|apex|vendor)\//.test(path)) continue;
        ranges.push(r);
    }
    return ranges;
}

rpc.exports = {
    scan(valueStr, type) {
        const v = parseVal(valueStr, type);
        const pattern = valueToPattern(v, type);
        const found = [];
        for (const range of enumerateScanRanges()) {
            try {
                for (const m of Memory.scanSync(range.base, range.size, pattern)) {
                    found.push(m.address.toString());
                }
            } catch (e) {
                // unmapped/protected range mid-scan - skip it, not fatal
            }
        }
        candidates = found;
        return candidates.length;
    },

    filter(valueStr, type) {
        const target = parseVal(valueStr, type);
        const next = [];
        for (const addrStr of candidates) {
            try {
                if (readVal(ptr(addrStr), type) === target) next.push(addrStr);
            } catch (e) {
                // address unmapped since last pass - drop it
            }
        }
        candidates = next;
        return candidates.length;
    },

    list() {
        return candidates;
    },

    write(valueStr, type) {
        const v = parseVal(valueStr, type);
        let n = 0;
        for (const addrStr of candidates) {
            try {
                writeVal(ptr(addrStr), v, type);
                n++;
            } catch (e) {}
        }
        return n;
    },

    freeze(valueStr, type, intervalMs) {
        const v = parseVal(valueStr, type);
        if (freezeTimer) clearInterval(freezeTimer);
        freezeTimer = setInterval(() => {
            for (const addrStr of candidates) {
                try { writeVal(ptr(addrStr), v, type); } catch (e) {}
            }
        }, intervalMs || 500);
        return candidates.length;
    },

    unfreeze() {
        if (freezeTimer) { clearInterval(freezeTimer); freezeTimer = null; }
    },
};
