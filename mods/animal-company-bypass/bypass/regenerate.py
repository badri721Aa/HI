#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================================
#  Animal Company - symbol bridge REGENERATOR (offline, deterministic)
#
#  Rebuilds symbols.js (SYM map) and ac_bridge.js (Il2Cpp.exports getters)
#  for the CURRENT installed build, WITHOUT needing the game running:
#
#    1. Reads the canonical il2cpp_* order (234 names) from bridge_dump.js
#       `__SYM` keys, and the ac_bridge.js getter layout from `__SIG`.
#    2. Reads the CURRENT obfuscated names from UnityPlayer.dll's unrolled
#       GetProcAddress bootstrap at RVA 0x773240 (pattern:
#       `lea rdx,[rip+name]; call 0x12995a0; mov [rip+slot],rax`).
#       That bootstrap walks the game's obfuscated export names in the exact
#       canonical order, so canonical[i] == bootstrap[i].
#    3. Regenerates symbols.js (SYM = canonical->current, BRIDGE kept) and
#       ac_bridge.js (exports getters using __SIG layout + current names).
#    4. Optionally validates every recovered name against a live full-dump
#       text file (the authoritative export table of the running build).
#
#  The BRIDGE (Set A) aliases are historical and stable - they are kept as-is.
#
#  Requires: capstone (`pip install capstone`)
# ============================================================================
import io
import json
import os
import re
import struct
import sys
from datetime import datetime, timezone

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))

# Defaults assume this script lives inside the bypass/ folder, and the
# companion mod-menu project (if any) sits next to it as ../vtm-menu. Override
# any of these from the CLI:
#   regenerate.py [bypass_dir] [menu_dir] [unityplayer_dll] [live_dump_txt]
BYPASS = SCRIPT_DIR
MENU = os.path.join(SCRIPT_DIR, "..", "vtm-menu")
UNITYPLAYER = r"E:\SteamLibrary\steamapps\common\Animal Company\UnityPlayer.dll"
LIVE_DUMP = os.path.join(SCRIPT_DIR, "..", "dump", "live_full_dump.txt")

if len(sys.argv) > 1 and sys.argv[1]:
    BYPASS = sys.argv[1].rstrip("\\/")
if len(sys.argv) > 2 and sys.argv[2]:
    MENU = sys.argv[2].rstrip("\\/")
if len(sys.argv) > 3 and sys.argv[3]:
    UNITYPLAYER = sys.argv[3]
if len(sys.argv) > 4 and sys.argv[4]:
    LIVE_DUMP = sys.argv[4]

BOOT_LO = 0x773240
BOOT_HI = 0x779000
CALL_TARGET = "0x12995a0"

# ---------------------------------------------------------------------------
# 1. Extract current obfuscated names from the UnityPlayer.dll bootstrap.
# ---------------------------------------------------------------------------
def rva2off(d, pe, sections, rva):
    for name, vaddr, vsz, roff, rsz in sections:
        if vaddr <= rva < vaddr + max(vsz, rsz):
            return roff + (rva - vaddr)
    return None

def extract_bootstrap_names():
    from capstone import Cs, CS_ARCH_X86, CS_MODE_64
    d = open(UNITYPLAYER, "rb").read()
    pe = struct.unpack_from("<I", d, 0x3C)[0]
    sec_off = pe + 24 + 240
    sections = []
    for i in range(8):
        off = sec_off + i * 40
        name = d[off:off + 8].rstrip(b"\0").decode("ascii", "replace")
        vsz, vaddr, rsz, roff = struct.unpack_from("<IIII", d, off + 8)
        sections.append((name, vaddr, vsz, roff, rsz))

    def cstr_at(rva):
        off = rva2off(d, pe, sections, rva)
        if off is None:
            return None
        end = d.find(b"\0", off, off + 64)
        if end == -1:
            return None
        try:
            return d[off:end].decode("ascii")
        except Exception:
            return None

    md = Cs(CS_ARCH_X86, CS_MODE_64)
    md.detail = False
    so = rva2off(d, pe, sections, BOOT_LO)
    code = d[so:so + (BOOT_HI - BOOT_LO)]
    insns = list(md.disasm(code, BOOT_LO))

    entries = []
    for i, insn in enumerate(insns):
        if insn.mnemonic == "lea" and insn.op_str.startswith("rdx, ") and "rip +" in insn.op_str:
            disp = int(insn.op_str.split("rip + 0x")[1].split("]")[0], 16)
            str_rva = insn.address + insn.size + disp
            j = None
            for jj in range(i + 1, min(i + 5, len(insns))):
                if insns[jj].mnemonic == "call" and insns[jj].op_str == CALL_TARGET:
                    j = jj
                    break
            if j is None:
                continue
            k = None
            for kk in range(j + 1, min(j + 4, len(insns))):
                if insns[kk].mnemonic == "mov" and insns[kk].op_str.startswith("qword ptr [rip + ") and insns[kk].op_str.endswith("rax"):
                    k = kk
                    break
            if k is None:
                continue
            s = cstr_at(str_rva)
            if s:
                entries.append(s)
    if len(entries) != len(set(entries)):
        dup = [n for n in entries if entries.count(n) > 1]
        raise SystemExit("bootstrap has duplicate names: %s" % sorted(set(dup)))
    return entries

# ---------------------------------------------------------------------------
# 2. Parse bridge_dump.js reference maps (canonical order + getter layout).
# ---------------------------------------------------------------------------
def to_json(js):
    js = re.sub(r"(\bgetter|\bretType|\bargTypes|\bexportName)\s*:", r'"\1":', js)
    js = js.replace("'", '"')
    js = re.sub(r",\s*([}\]])", r"\1", js)
    return json.loads(js)

def js_obj(src, name):
    m = re.search(r"(?:const|var)\s+" + re.escape(name) + r"\s*=\s*\{", src)
    if not m:
        raise SystemExit("no %s in bridge_dump.js" % name)
    start = m.end() - 1
    i, depth = start, 0
    while i < len(src):
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    return to_json(src[start:i + 1])

def load_bridge_refs():
    bd = open(os.path.join(BYPASS, "bridge_dump.js"), encoding="utf-8-sig", errors="replace").read()
    canonical = list(js_obj(bd, "__SYM").keys())
    sig = js_obj(bd, "__SIG")
    return canonical, sig

# ---------------------------------------------------------------------------
# 3. Parse existing symbols.js (BRIDGE map + tail template).
# ---------------------------------------------------------------------------
def load_symbols_template():
    p = os.path.join(BYPASS, "symbols.js")
    src = open(p, encoding="utf-8-sig", errors="replace").read()
    b = re.search(r"var BRIDGE = \{", src)
    if not b:
        raise SystemExit("no BRIDGE in symbols.js")
    tail = src[b.start():]
    return src, tail

def build_symbols(canonical, names, tail):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    head = (
        "// Latest bridge (Set B, current build). Intercepts ANY Il2Cpp.$config.exports\n"
        "// assignment (including bypass.js's stale Set A map) and rewrites every export\n"
        "// to the current obfuscated name, so all 234 canonical names AND the old\n"
        "// bridge-alias names (e.g. DgJvczsiGNm) resolve correctly.\n"
        "// REGENERATED %s from UnityPlayer.dll GetProcAddress bootstrap (234 names)\n" % now
    )
    body = "".join('        "%s": "%s",\n' % (c, names[c]) for c in canonical)
    return head + "(function () {\n    \"use strict\";\n    if (typeof Il2Cpp === \"undefined\" || !Il2Cpp) { return; }\n    var SYM = {\n" + body + "    };\n    " + tail.lstrip("\ufeff")

# ---------------------------------------------------------------------------
# 4. Rebuild ac_bridge.js exports block from __SIG + current names.
# ---------------------------------------------------------------------------
def build_exports_block(canonical, names, sig):
    L = []
    for cn in sig:
        sigent = sig[cn]
        obf = names.get(cn, sigent.get("exportName") or cn)
        note = "" if obf != cn else " // CModule/kept"
        args = ", ".join('"%s"' % a for a in sigent["argTypes"])
        L.append('        get %s() {' % sigent["getter"])
        L.append('            return r("%s", "%s", [%s]);%s' % (obf, sigent["retType"], args, note))
        L.append("        },")
    return ("    Il2Cpp.exports = {\n"
            + "\n".join(L)
            + "\n    };")

def patch_ac_bridge(exports_block, target=None):
    target = target or BYPASS
    p = os.path.join(target, "ac_bridge.js")
    src = open(p, encoding="utf-8-sig", errors="replace").read().lstrip("\ufeff")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    header = "// Generated by the symbol-bridge regenerator: patched 234/234 exports (regenerated %s from UnityPlayer.dll bootstrap, 234 names)" % now
    # replace the original first-line header (keeps BOM/line layout identical)
    nl = src.find("\n")
    src = header + src[nl:]
    m = re.search(r"Il2Cpp\.exports = \{", src)
    if not m:
        raise SystemExit("no Il2Cpp.exports assignment in ac_bridge.js")
    line_start = src.rfind("\n", 0, m.start()) + 1
    i = src.index("{", m.start())
    depth, j = 0, i
    while j < len(src):
        c = src[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    end = j + 1  # closing '}' of the object literal
    while end < len(src) and src[end] in " \t\n":
        end += 1
    if end < len(src) and src[end] == ";":
        end += 1
    out = src[:line_start] + exports_block + ";" + src[end:]
    open(p, "w", encoding="utf-8-sig").write(out)

# ---------------------------------------------------------------------------
# 5. Optional validation against the live export dump.
# ---------------------------------------------------------------------------
def validate_live(names):
    if not os.path.exists(LIVE_DUMP):
        print("WARN: no live dump at %s - skipping validation" % LIVE_DUMP)
        return None
    live_names = set()
    for l in open(LIVE_DUMP, encoding="utf-8-sig", errors="replace").read().splitlines():
        p = l.split("|")
        if len(p) >= 2 and p[1].strip():
            live_names.add(p[1].strip())
    missing = [n for n in names.values() if n not in live_names]
    print("live-dump validation: %d/%d names present, missing=%s" % (len(names) - len(missing), len(names), missing))
    return missing

def main():
    print("[1/5] extracting bootstrap names from UnityPlayer.dll ...")
    bootstrap = extract_bootstrap_names()
    print("      bootstrap entries:", len(bootstrap))

    canonical, sig = load_bridge_refs()
    print("      canonical names   :", len(canonical))
    print("      __SIG getters     :", len(sig))

    if len(bootstrap) != len(canonical):
        raise SystemExit("count mismatch: bootstrap=%d canonical=%d" % (len(bootstrap), len(canonical)))

    names = dict(zip(canonical, bootstrap))

    print("[2/5] validating against live export dump ...")
    validate_live(names)

    print("[3/5] regenerating symbols.js ...")
    _, tail = load_symbols_template()
    symbols_out = build_symbols(canonical, names, tail)
    targets = [t for t in (BYPASS, MENU) if os.path.isdir(t)]
    for target in targets:
        open(os.path.join(target, "symbols.js"), "w", encoding="utf-8-sig").write(symbols_out)
        print("      symbols.js written -> %s (%d SYM entries)" % (target, len(names)))

    print("[4/5] regenerating ac_bridge.js exports block ...")
    block = build_exports_block(canonical, names, sig)
    for target in targets:
        patch_ac_bridge(block, target)
        print("      ac_bridge.js exports block written -> %s (%d getters)" % (target, len(sig)))

    with open(os.path.join(BYPASS, "current_sym.json"), "w", encoding="utf-8") as f:
        json.dump(names, f, indent=1)
    print("[5/5] saved current_sym.json (%d entries)" % len(names))

    sample = {c: names[c] for c in ["il2cpp_init", "il2cpp_get_corlib", "il2cpp_alloc", "il2cpp_string_new", "il2cpp_domain_get"]}
    print("sample:", json.dumps(sample))
    print("DONE - restart the game or reload via Frida to apply.")

if __name__ == "__main__":
    main()
