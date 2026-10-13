'use strict';
// ============================================================================
//  Animal Company - FULL DUMP
//  Dumps ALL stuff from the game: assemblies, classes, members, the live
//  App state tree, the scene, loaded assets and the item database.
//
//  Load this AFTER ac_bridge.js + symbols.js + bypass.js
//  (see dump_all.py for a one-click launcher)
//
//  Works via the frida CLI too:
//    frida -l ac_bridge.js -l symbols.js -l bypass.js -l quest.js -l dump_all.js EACLauncher
//
//  The dump is written to a txt file in the ..\dump\ folder directly from
//  inside the game (Frida File API), so no host-side capture is required.
// ============================================================================

const BOOT_TIMEOUT_MS = 300000;
const STATE_TIMEOUT_MS = 180000;

const _LIVE = !!(globalThis.__DUMP_LIVE__);
const CFG = {
    // Full metadata dump of ALL assemblies in the classic C# format
    // (like the old AnimalCompany_full_dump_24466180.cs): every class with
    // fields + offsets and methods + RVAs. Pure metadata - safe, never
    // touches live objects, so it cannot crash the game.
    legacyClassDump: true,
    // Rich per-class detail (FLAGS / PARENT CHAIN / INTERFACES) for the
    // AnimalCompany / SpatialSys assemblies only. Optional.
    richClassDump: false,
    // Compact class-name list for assemblies not covered by legacyClassDump.
    classListOtherAssemblies: false,
    // Live dumps OPT-IN (default OFF, or on via --live): walking live objects
    // (gc.choose, get_state(), get_name(), ...) is what crashed the game
    // mid-dump in earlier runs. Static reads below are always safe.
    liveStateTree: _LIVE,           // walk App.get_state() and print every live value
    liveScene: _LIVE,               // GameObjects + live MonoBehaviour instances
    liveAssets: _LIVE,              // loaded textures / audio / meshes / materials
    itemDatabase: true,             // PrefabGenerator prefab dictionary (item ids) - static read only
    staticFields: true,             // static field values of key game classes
    maxStateDepth: 10,
    maxObjectWalkDepth: 6,
    maxArrayElems: 12,
    maxInstancesPerClass: 40,
    maxFieldsPerInstance: 100,
    maxGameObjects: 5000,
    maxAssetsPerKind: 400,
    maxStaticsClasses: 80,
    maxDictEntries: 20000,
};

// ----------------------------------------------------------------------------
// output to a txt file, written from inside the game process (optional)
//   Only active when globalThis.__DUMP_OUT_FILE__ is set BEFORE this script
//   loads. When unset, output goes to the console/frida messages only
//   (dump_all.py captures those host-side into the dump folder itself).
// ----------------------------------------------------------------------------
let _outHandle = null;
let _outPath = globalThis.__DUMP_OUT_FILE__ || null;
function _openOutFile() {
    if (!_outPath) return false;
    if (_outHandle) return true;
    try {
        _outHandle = new File(_outPath, "w");
        _outHandle.write("=== ANIMAL COMPANY FULL DUMP ===\n");
        _outHandle.write("out_file=" + _outPath + "\n");
        _outHandle.write("capture_started=" + new Date().toISOString() + "\n");
        _outHandle.flush();
        return true;
    } catch (e) {
        _outHandle = null;
        return false;
    }
}
function _closeOutFile() {
    if (!_outHandle) return;
    try {
        _outHandle.write("capture_ended=" + new Date().toISOString() + "\n");
        _outHandle.write("=== CAPTURE END ===\n");
        _outHandle.flush();
    } catch (e) {}
    try { _outHandle.close(); } catch (e) {}
    _outHandle = null;
}

// ----------------------------------------------------------------------------
// output helpers (line buffering keeps frida messages small)
//   console.log is teed into the dump txt file as well
// ----------------------------------------------------------------------------
const _out = [];
const _origLog = (typeof console !== "undefined" && console.log) ? console.log.bind(console) : function () {};
function print(msg) {
    _out.push(msg);
    if (_out.length >= 1000) flush();
}
function flush() {
    if (_out.length) {
        const s = _out.join("\n");
        try {
            if (_outHandle) { _outHandle.write(s + "\n"); _outHandle.flush(); }
        } catch (e) {}
        try { _origLog(s); } catch (e) {}
        _out.length = 0;
    }
}
try {
    console.log = function () {
        let s;
        try {
            s = Array.prototype.map.call(arguments, function (a) {
                if (a === null || a === undefined) return String(a);
                if (typeof a === "object" && a.value !== undefined) return String(a.value);
                return String(a);
            }).join("\n");
        } catch (e) { s = String(arguments[0]); }
        try {
            if (_outHandle) { _outHandle.write(s + "\n"); _outHandle.flush(); }
        } catch (e) {}
        if (typeof send !== "undefined") {
            // 'send' messages reach the host's on_message handler reliably
            // (frida-python does NOT forward console.log 'log' messages there)
            try {
                for (let _i = 0; _i < s.length; _i += 32000) {
                    send(s.slice(_i, _i + 32000));
                }
            } catch (e) {}
        } else {
            try { _origLog.apply(console, arguments); } catch (e) {}
        }
    };
} catch (e) {}
_openOutFile();

// ----------------------------------------------------------------------------
// AUTO-RESOLVED EXPORTS - no external symbols.js / bypass.js needed.
// The obfuscated export names are randomized per game build, so we embed the
// current build's verified map (Set B) here and install it into
// Il2Cpp.$config.exports at load time. This runs AFTER bypass.js in the
// combined bundle, so it supersedes any stale config bypass.js installed.
// When the game updates again, regenerate this map (see symbols.js) and the
// runtime check below will tell you exactly which names went stale.
// ----------------------------------------------------------------------------
// Regenerated for the 2026-09-11 build (see current_sym.json)
const __SYM = {
    "il2cpp_init": "JJEgJpeGwmN",
    "il2cpp_init_utf16": "vjQ_RvxOypt",
    "il2cpp_shutdown": "U_WlTfCIUQq",
    "il2cpp_set_config_dir": "HoKyJKRnCxi",
    "il2cpp_set_data_dir": "W_NaHkHkHpy",
    "il2cpp_set_temp_dir": "vTBFrnVEkcC",
    "il2cpp_set_commandline_arguments": "qephylTOwPS",
    "il2cpp_set_commandline_arguments_utf16": "qTYlxhXnKUP",
    "il2cpp_set_config_utf16": "jLyQvfQpxJb",
    "il2cpp_set_config": "TwgrTZMFmfz",
    "il2cpp_set_memory_callbacks": "ZOhDhkksCvI",
    "il2cpp_memory_pool_set_region_size": "xkjDCjSQJxH",
    "il2cpp_memory_pool_get_region_size": "vEsZacKsEjc",
    "il2cpp_get_corlib": "uvhfmZnmXHu",
    "il2cpp_add_internal_call": "dqjTAFolAot",
    "il2cpp_resolve_icall": "BHROQyEOYRD",
    "il2cpp_alloc": "NqvAGUzPthM",
    "il2cpp_free": "ryNmPXfbFsh",
    "il2cpp_array_class_get": "ZLidBWdMxSO",
    "il2cpp_array_length": "HncWrMhIQMV",
    "il2cpp_array_get_byte_length": "EQYvTXWwF_e",
    "il2cpp_array_new": "PsJDduRwXqV",
    "il2cpp_array_new_specific": "ZXNnImDHCzx",
    "il2cpp_array_new_full": "sBVodjigllz",
    "il2cpp_bounded_array_class_get": "HupmCeUKYpM",
    "il2cpp_array_element_size": "JFMGBFR_FWI",
    "il2cpp_assembly_get_image": "MG__yTQaPQm",
    "il2cpp_class_for_each": "ZqWiTmOTSJW",
    "il2cpp_class_enum_basetype": "PnUKmqk_LQP",
    "il2cpp_class_is_inited": "dIcUgnjxInR",
    "il2cpp_class_is_generic": "ReyTWXKOrmi",
    "il2cpp_class_is_inflated": "FUhepbGdtYM",
    "il2cpp_class_is_assignable_from": "ZBOdrcVUPWF",
    "il2cpp_class_is_subclass_of": "qxmxqzrTgpf",
    "il2cpp_class_has_parent": "NfHKVTZUOZd",
    "il2cpp_class_from_il2cpp_type": "apvIGGR_xxl",
    "il2cpp_class_from_name": "zHeZkkUVqvS",
    "il2cpp_class_from_system_type": "BOGOnGOYfrX",
    "il2cpp_class_get_element_class": "aCuVkhVgUar",
    "il2cpp_class_get_events": "TyASLmbYIh_",
    "il2cpp_class_get_fields": "lWjNKUciuDP",
    "il2cpp_class_get_nested_types": "Sd_AiaaPxMC",
    "il2cpp_class_get_interfaces": "QGyisLroBkJ",
    "il2cpp_class_get_properties": "MugbAAaqTYM",
    "il2cpp_class_get_property_from_name": "CRlNYS_BIHZ",
    "il2cpp_class_get_field_from_name": "_VlewrkOHpG",
    "il2cpp_class_get_methods": "leHAnDMvJEh",
    "il2cpp_class_get_method_from_name": "_gQleSejtJl",
    "il2cpp_class_get_name": "auztDspoxol",
    "il2cpp_type_get_name_chunked": "eXHhRZtxhJi",
    "il2cpp_class_get_namespace": "JTcjUYpFgbi",
    "il2cpp_class_get_parent": "mgiVvnwVmqu",
    "il2cpp_class_get_declaring_type": "jkbbckvBywM",
    "il2cpp_class_instance_size": "NamMQVpnqpN",
    "il2cpp_class_num_fields": "iwNvmjSkqKl",
    "il2cpp_class_is_valuetype": "IzNWBBU_ijV",
    "il2cpp_class_value_size": "RvRsdnOQICu",
    "il2cpp_class_is_blittable": "UbmvnomFEfs",
    "il2cpp_class_get_flags": "QtTvQLtCPet",
    "il2cpp_class_is_abstract": "hruRpRwZlOL",
    "il2cpp_class_is_interface": "IdlMJIQhAwM",
    "il2cpp_class_array_element_size": "lFLPehgqyDg",
    "il2cpp_class_from_type": "uoRqeNkwaXp",
    "il2cpp_class_get_type": "BXqhYAZnjGS",
    "il2cpp_class_get_type_token": "ayvdLMXZSDz",
    "il2cpp_class_has_attribute": "YVLCdClniIc",
    "il2cpp_class_has_references": "TbFqQyXQjuK",
    "il2cpp_class_is_enum": "pFa_SMfQYBZ",
    "il2cpp_class_get_image": "RXJoIKVTTSS",
    "il2cpp_class_get_assemblyname": "ztMRyNfwRII",
    "il2cpp_class_get_rank": "WPdKfniqiUM",
    "il2cpp_class_get_data_size": "syZYikbganH",
    "il2cpp_class_get_static_field_data": "LtCdZykmsco",
    "il2cpp_stats_dump_to_file": "JkVciCwpUXx",
    "il2cpp_stats_get_value": "IsNnE_IgjYv",
    "il2cpp_domain_get": "cRxVcuAJdNH",
    "il2cpp_domain_assembly_open": "XMfTHQtofHa",
    "il2cpp_domain_get_assemblies": "wBEJfpeifbx",
    "il2cpp_raise_exception": "VlcvsSgglHI",
    "il2cpp_exception_from_name_msg": "itfnvJkouPJ",
    "il2cpp_get_exception_argument_null": "lLHjwRNgOzU",
    "il2cpp_format_exception": "DboaAFRoEsa",
    "il2cpp_format_stack_trace": "VxpMZPWQdPg",
    "il2cpp_unhandled_exception": "cmHFYazbbae",
    "il2cpp_native_stack_trace": "xyjovrwtFHG",
    "il2cpp_field_get_flags": "M_zlCsQyaqt",
    "il2cpp_field_get_from_reflection": "NJkCpzuTMXv",
    "il2cpp_field_get_name": "kXOlUNrdyxD",
    "il2cpp_field_get_parent": "UtcFYeUDfaP",
    "il2cpp_field_get_object": "cLMKsMIb_DG",
    "il2cpp_field_get_offset": "BplPwuXLbF_",
    "il2cpp_field_get_type": "SHMaYzlOjqp",
    "il2cpp_field_get_value": "IvbdwDjogZh",
    "il2cpp_field_get_value_object": "xlxnDaNaNOl",
    "il2cpp_field_has_attribute": "CUuRrg_AOLf",
    "il2cpp_field_set_value": "YJHlUKXoOxE",
    "il2cpp_field_static_get_value": "XsTMylemlOJ",
    "il2cpp_field_static_set_value": "KkdEAClbtcw",
    "il2cpp_field_set_value_object": "yoftYrqVmgD",
    "il2cpp_field_is_literal": "cHiOjdXtlOT",
    "il2cpp_gc_collect": "RogMBMgtCUC",
    "il2cpp_gc_collect_a_little": "oFOBGqMoaPR",
    "il2cpp_gc_start_incremental_collection": "UQMxAyolitA",
    "il2cpp_gc_disable": "dMyNCAUpkde",
    "il2cpp_gc_enable": "wpUkgbVloFN",
    "il2cpp_gc_is_disabled": "ZEpAlGvvZom",
    "il2cpp_gc_set_mode": "WxyYkuDChTr",
    "il2cpp_gc_get_max_time_slice_ns": "hbRdneLhCNj",
    "il2cpp_gc_set_max_time_slice_ns": "oAlXWZZDEBS",
    "il2cpp_gc_is_incremental": "HqvbMhoryBt",
    "il2cpp_gc_get_used_size": "ZNl_pqGmwbS",
    "il2cpp_gc_get_heap_size": "UhsfSpcBj_K",
    "il2cpp_gc_wbarrier_set_field": "GCOUZJn_GjH",
    "il2cpp_gc_has_strict_wbarriers": "vGBbxcmDISs",
    "il2cpp_gc_set_external_allocation_tracker": "XKtQFwJGufp",
    "il2cpp_gc_set_external_wbarrier_tracker": "fI_ORZforVx",
    "il2cpp_gc_foreach_heap": "CqUnOgWtdIh",
    "il2cpp_stop_gc_world": "AkxtqpVzGIZ",
    "il2cpp_start_gc_world": "kkreYVhOEsc",
    "il2cpp_gc_alloc_fixed": "SOoG_AoyQLe",
    "il2cpp_gc_free_fixed": "XtByZqpKGdo",
    "il2cpp_gchandle_new": "CpciNLUZdcw",
    "il2cpp_gchandle_new_weakref": "fOpbbkBkIxA",
    "il2cpp_gchandle_get_target": "YFOlvkJm_VO",
    "il2cpp_gchandle_free": "LvXmaaTLlTp",
    "il2cpp_gchandle_foreach_get_target": "GJRsolLWsYb",
    "il2cpp_object_header_size": "brgGEWOJUwt",
    "il2cpp_array_object_header_size": "Q_akivFUQJA",
    "il2cpp_offset_of_array_length_in_array_object_header": "UbJSeVXoWDX",
    "il2cpp_offset_of_array_bounds_in_array_object_header": "SeAiwTPNlkk",
    "il2cpp_allocation_granularity": "VoyzwJevN_x",
    "il2cpp_unity_liveness_allocate_struct": "ixnokTRXcbf",
    "il2cpp_unity_liveness_calculation_from_root": "EnIRCDMLFKY",
    "il2cpp_unity_liveness_calculation_from_statics": "lMoNmgyeGX_",
    "il2cpp_unity_liveness_finalize": "_lLopPcRYUT",
    "il2cpp_unity_liveness_free_struct": "FRnusUHLwlk",
    "il2cpp_method_get_return_type": "lqPaYYOdUVv",
    "il2cpp_method_get_declaring_type": "OLHXgoGiCmd",
    "il2cpp_method_get_name": "_RbidWOtgcb",
    "il2cpp_method_get_from_reflection": "CnhkPKNnQmm",
    "il2cpp_method_get_object": "xapTFiOsgKO",
    "il2cpp_method_is_generic": "paJclrvHrgd",
    "il2cpp_method_is_inflated": "jHsKxcylXua",
    "il2cpp_method_is_instance": "NEyZenVyNbX",
    "il2cpp_method_get_param_count": "KKiZHVxwCSC",
    "il2cpp_method_get_param": "TsTtqnNKtWo",
    "il2cpp_method_get_class": "WpsOMomOeCh",
    "il2cpp_method_has_attribute": "LqkKqUPATUs",
    "il2cpp_method_get_flags": "ytU_leDjikG",
    "il2cpp_method_get_token": "_tTzfdpHVqs",
    "il2cpp_method_get_param_name": "TQqXRfLZiDJ",
    "il2cpp_property_get_flags": "fKVXBrMNNqX",
    "il2cpp_property_get_get_method": "KOUlkROwYaI",
    "il2cpp_property_get_set_method": "ZjhqWzYbRbO",
    "il2cpp_property_get_name": "spIJcqvWkXJ",
    "il2cpp_property_get_parent": "sKbpvbzFOmI",
    "il2cpp_object_get_class": "flkCECdOFJO",
    "il2cpp_object_get_size": "qQfDLCSGZzK",
    "il2cpp_object_get_virtual_method": "sqOwjmT_fND",
    "il2cpp_object_new": "eadXAsMxSts",
    "il2cpp_object_unbox": "sfzgMPzcBft",
    "il2cpp_value_box": "xoEjyLkakyE",
    "il2cpp_monitor_enter": "bcYFLXuxwOd",
    "il2cpp_monitor_try_enter": "beGdmyFnHTB",
    "il2cpp_monitor_exit": "tsFOETVyLOV",
    "il2cpp_monitor_pulse": "STqjBfCCnFE",
    "il2cpp_monitor_pulse_all": "lwysFQukELk",
    "il2cpp_monitor_wait": "qwTXhgTmKsw",
    "il2cpp_monitor_try_wait": "HSGFPmYlGLE",
    "il2cpp_runtime_invoke": "HOXEhFFXXIR",
    "il2cpp_runtime_invoke_convert_args": "BN_bBcAecwt",
    "il2cpp_runtime_class_init": "XoKRBTJnlOv",
    "il2cpp_runtime_object_init": "iBiGfTTKVqP",
    "il2cpp_runtime_object_init_exception": "FgwkogYVwYl",
    "il2cpp_runtime_unhandled_exception_policy_set": "BxkYOvTIldK",
    "il2cpp_string_length": "CrnZKHAYzWh",
    "il2cpp_string_chars": "AfcEHYhFJrU",
    "il2cpp_string_new": "yXcEtjrftbG",
    "il2cpp_string_new_len": "p_kKWRgvEAg",
    "il2cpp_string_new_utf16": "QLgbxMYZBsQ",
    "il2cpp_string_new_wrapper": "X_ALuAk_EBC",
    "il2cpp_string_intern": "UgpfTbbAfiV",
    "il2cpp_string_is_interned": "yuRbVHmtFWz",
    "il2cpp_thread_current": "mgzoBEzfOCC",
    "il2cpp_thread_attach": "EfFyXFaVysk",
    "il2cpp_thread_detach": "LmlQnILNABt",
    "il2cpp_is_vm_thread": "PopWfHKqDpW",
    "il2cpp_current_thread_walk_frame_stack": "eKfcwfRLXBO",
    "il2cpp_thread_walk_frame_stack": "LAozWCktDHk",
    "il2cpp_current_thread_get_top_frame": "G_ZkkPSewlz",
    "il2cpp_thread_get_top_frame": "JiYpdmRjBDi",
    "il2cpp_current_thread_get_frame_at": "zdTyfueWo_t",
    "il2cpp_thread_get_frame_at": "eMrQzZOgQqY",
    "il2cpp_current_thread_get_stack_depth": "vNRABYyZaOh",
    "il2cpp_thread_get_stack_depth": "XebwqeynDYU",
    "il2cpp_override_stack_backtrace": "PQCjWWCorLh",
    "il2cpp_type_get_object": "geiXJUUbhrB",
    "il2cpp_type_get_type": "bEpblKbBdSq",
    "il2cpp_type_get_class_or_element_class": "TyDunBEozpG",
    "il2cpp_type_get_name": "smvSftfLPRw",
    "il2cpp_type_is_byref": "OhZjfuvNHX_",
    "il2cpp_type_get_attrs": "DisonQZlMqI",
    "il2cpp_type_equals": "CyakgzHPsmz",
    "il2cpp_type_get_assembly_qualified_name": "zIPZOUnjNrp",
    "il2cpp_type_get_reflection_name": "IPVknKKcXQV",
    "il2cpp_type_is_static": "cMxyJMifwEx",
    "il2cpp_type_is_pointer_type": "xOnAKGPJuUs",
    "il2cpp_image_get_assembly": "nh_WANbtTAR",
    "il2cpp_image_get_name": "cwprPenOETq",
    "il2cpp_image_get_filename": "KHIUvyDwanA",
    "il2cpp_image_get_entry_point": "aJfdBzxnQ_O",
    "il2cpp_image_get_class_count": "DZwIGhHXrAO",
    "il2cpp_image_get_class": "bTMWUXLifTd",
    "il2cpp_capture_memory_snapshot": "nAGPi_tDWqI",
    "il2cpp_free_captured_memory_snapshot": "dnpUIfuoiwp",
    "il2cpp_set_find_plugin_callback": "ONdEhEsEBOe",
    "il2cpp_register_log_callback": "RHawgxDEhpH",
    "il2cpp_debugger_set_agent_options": "dMqZNqGayxG",
    "il2cpp_is_debugger_attached": "fgsCfdIaCnS",
    "il2cpp_register_debugger_agent_transport": "oBkttPLworX",
    "il2cpp_debug_foreach_method": "wx_uOnjBavO",
    "il2cpp_debug_get_method_info": "ztZDApArhxA",
    "il2cpp_unity_install_unitytls_interface": "hOELAiWeKph",
    "il2cpp_custom_attrs_from_class": "ExLOvZEtBJZ",
    "il2cpp_custom_attrs_from_method": "DohFMkXCvuo",
    "il2cpp_custom_attrs_from_field": "VHnZvWgfMHP",
    "il2cpp_custom_attrs_get_attr": "iXxwD_ALpQ_",
    "il2cpp_custom_attrs_has_attr": "oSVPaHntJsC",
    "il2cpp_custom_attrs_construct": "KrSaCib_DzB",
    "il2cpp_custom_attrs_free": "trWpvLCIPY_",
    "il2cpp_class_set_userdata": "FgpLWHfYATF",
    "il2cpp_class_get_userdata_offset": "DJgZtxPAoLj",
    "il2cpp_set_default_thread_affinity": "gzThhESJhkR",
    "il2cpp_unity_set_android_network_up_state_func": "iPLc_yhdLNv",
};
const __BRIDGE = {
    "il2cpp_init": "AhlmpndnbXA",
    "il2cpp_init_utf16": "AoQgoyRtnYs",
    "il2cpp_shutdown": "BJBbnvHvZgX",
    "il2cpp_set_config_dir": "BUFyOSOnlCd",
    "il2cpp_set_data_dir": "BoFyQjKCpvX",
    "il2cpp_set_temp_dir": "CCIaqnoGj_N",
    "il2cpp_set_commandline_arguments": "CODUhEeUQXQ",
    "il2cpp_set_commandline_arguments_utf16": "CUjkkJPLCIo",
    "il2cpp_set_config_utf16": "CymQINhZOwa",
    "il2cpp_set_config": "DDdffyZimae",
    "il2cpp_set_memory_callbacks": "DaSnZNIuaLL",
    "il2cpp_memory_pool_set_region_size": "DaUumydemcw",
    "il2cpp_memory_pool_get_region_size": "DfVt_Tthxqk",
    "il2cpp_get_corlib": "DgJvczsiGNm",
    "il2cpp_add_internal_call": "DyqLHZfPQla",
    "il2cpp_resolve_icall": "EYkYWbHZ_WS",
    "il2cpp_alloc": "EuDUjNGabdV",
    "il2cpp_free": "FNklFpqoKgr",
    "il2cpp_array_class_get": "FSGlGSnTNV_",
    "il2cpp_array_length": "FYpimHiGNld",
    "il2cpp_array_get_byte_length": "Fp_ZSReosMq",
    "il2cpp_array_new": "FrHaEFUuWqM",
    "il2cpp_array_new_specific": "FunmGQLwhxr",
    "il2cpp_array_new_full": "GMQtkHIOpxY",
    "il2cpp_bounded_array_class_get": "GXDJQBeOLBu",
    "il2cpp_array_element_size": "G_FXUcpNHsV",
    "il2cpp_assembly_get_image": "GckqBHdiLzN",
    "il2cpp_class_for_each": "GiyAxvEikoR",
    "il2cpp_class_enum_basetype": "GjFUMUriaQX",
    "il2cpp_class_is_inited": "GpdqRIalDbV",
    "il2cpp_class_is_generic": "HBttXCyyGHg",
    "il2cpp_class_is_inflated": "HPeUxeldkRW",
    "il2cpp_class_is_assignable_from": "HPoWQITgPXq",
    "il2cpp_class_is_subclass_of": "HdStRfKgHjm",
    "il2cpp_class_has_parent": "HfHgjOMVNzV",
    "il2cpp_class_from_il2cpp_type": "Hi_EuMmSYwX",
    "il2cpp_class_from_name": "HncVkoyfoYP",
    "il2cpp_class_from_system_type": "HxYPyYVftyR",
    "il2cpp_class_get_element_class": "ISaXhaZAFqF",
    "il2cpp_class_get_events": "IYHXRnqBbDM",
    "il2cpp_class_get_fields": "IZEMVTjux_g",
    "il2cpp_class_get_nested_types": "IcxAKicUGxN",
    "il2cpp_class_get_interfaces": "ImJJQdOJDFq",
    "il2cpp_class_get_properties": "IqlQPvFOLEB",
    "il2cpp_class_get_property_from_name": "JPzCRrcoPRD",
    "il2cpp_class_get_field_from_name": "JcXWvhsbLv_",
    "il2cpp_class_get_methods": "JkybSqyTUmd",
    "il2cpp_class_get_method_from_name": "JnH_RMfaGnu",
    "il2cpp_class_get_name": "JwldHrB_fih",
    "il2cpp_type_get_name_chunked": "KUVMJbdTTQu",
    "il2cpp_class_get_namespace": "KZpKmBzlIRy",
    "il2cpp_class_get_parent": "KguWigZCcGl",
    "il2cpp_class_get_declaring_type": "KhIFgmDkGXw",
    "il2cpp_class_instance_size": "KkCezRfKYcB",
    "il2cpp_class_num_fields": "LGtaKOTC_BI",
    "il2cpp_class_is_valuetype": "LtWhdOCeLLJ",
    "il2cpp_class_value_size": "MBgXrSXYnfk",
    "il2cpp_class_is_blittable": "MGuEQTFMDyH",
    "il2cpp_class_get_flags": "MjOFCeeqyYe",
    "il2cpp_class_is_abstract": "MroijyvnRSk",
    "il2cpp_class_is_interface": "NKRPDhzgmTM",
    "il2cpp_class_array_element_size": "NKSAJdb_xHd",
    "il2cpp_class_from_type": "NSufGCeoXqJ",
    "il2cpp_class_get_type": "NVhjaP_fKbm",
    "il2cpp_class_get_type_token": "NovRQgEkrcK",
    "il2cpp_class_has_attribute": "OAXccttAoUl",
    "il2cpp_class_has_references": "OIurEMVQtrO",
    "il2cpp_class_is_enum": "OMWKyiUmIQO",
    "il2cpp_class_get_image": "OOWUitUDyyS",
    "il2cpp_class_get_assemblyname": "PHpquahYkAy",
    "il2cpp_class_get_rank": "PSYsGExrjiv",
    "il2cpp_class_get_data_size": "PoVTbq_pzLF",
    "il2cpp_class_get_static_field_data": "Prki_fWoNNZ",
    "il2cpp_stats_dump_to_file": "QAUCOktuKaF",
    "il2cpp_stats_get_value": "QVIOTpcfQrF",
    "il2cpp_domain_get": "Q_VDhlFjFCj",
    "il2cpp_domain_assembly_open": "QjtnVsXlyZE",
    "il2cpp_domain_get_assemblies": "RFnEOeZmnW_",
    "il2cpp_raise_exception": "RieNEqQJpTT",
    "il2cpp_exception_from_name_msg": "RmPGuUzhMvj",
    "il2cpp_get_exception_argument_null": "RvNDNqWtJoa",
    "il2cpp_format_exception": "SBwXfbOJGfd",
    "il2cpp_format_stack_trace": "SLRgvWzPNXJ",
    "il2cpp_unhandled_exception": "SgNhzdPIDQm",
    "il2cpp_native_stack_trace": "SyXYCjiavZD",
    "il2cpp_field_get_flags": "TJrfAlWOrUu",
    "il2cpp_field_get_from_reflection": "TyfsfLvTLsH",
    "il2cpp_field_get_name": "UJOfUdMSuck",
    "il2cpp_field_get_parent": "UMPLtsmWZAA",
    "il2cpp_field_get_object": "UOsMNJPvCmN",
    "il2cpp_field_get_offset": "UWCDqiZsClT",
    "il2cpp_field_get_type": "UczhzuaadzZ",
    "il2cpp_field_get_value": "UeZDfbWqqDK",
    "il2cpp_field_get_value_object": "VPEWGPKBOfx",
    "il2cpp_field_has_attribute": "VUaDloXhvZI",
    "il2cpp_field_set_value": "VowpTEFMzaw",
    "il2cpp_field_static_get_value": "WniWswJ_QtP",
    "il2cpp_field_static_set_value": "WtvtoKaBhyN",
    "il2cpp_field_set_value_object": "XCQCUBUkgly",
    "il2cpp_field_is_literal": "XIijwRwwNPP",
    "il2cpp_gc_collect": "XVhBukdDbJH",
    "il2cpp_gc_collect_a_little": "XarDwnrKall",
    "il2cpp_gc_start_incremental_collection": "XqcoKXTTkIo",
    "il2cpp_gc_disable": "XsABHDiKbZy",
    "il2cpp_gc_enable": "XtpZzIhWknI",
    "il2cpp_gc_is_disabled": "YFJgcBFseoU",
    "il2cpp_gc_set_mode": "YNDutsvLnoP",
    "il2cpp_gc_get_max_time_slice_ns": "YRGq_SyOBUy",
    "il2cpp_gc_set_max_time_slice_ns": "YaytexgrnQT",
    "il2cpp_gc_is_incremental": "YmNxbYzFkcD",
    "il2cpp_gc_get_used_size": "ZQgzSqVlS_w",
    "il2cpp_gc_get_heap_size": "ZX_JApfzIRF",
    "il2cpp_gc_wbarrier_set_field": "ZrYsLlwIqiv",
    "il2cpp_gc_has_strict_wbarriers": "ZvlAQMGxYRX",
    "il2cpp_gc_set_external_allocation_tracker": "_JdDqobUIWT",
    "il2cpp_gc_set_external_wbarrier_tracker": "_PHWOdsZPHD",
    "il2cpp_gc_foreach_heap": "_XuBbrqvsfm",
    "il2cpp_stop_gc_world": "_oKBuHNjTxG",
    "il2cpp_start_gc_world": "_qvESwFSEav",
    "il2cpp_gc_alloc_fixed": "aOeXtqcpl_I",
    "il2cpp_gc_free_fixed": "aiBQWjSstnV",
    "il2cpp_gchandle_new": "ajIUEvepvjz",
    "il2cpp_gchandle_new_weakref": "ajTSuqjVlpB",
    "il2cpp_gchandle_get_target": "apSBvxNsYhL",
    "il2cpp_gchandle_free": "asmSrJwFwBx",
    "il2cpp_gchandle_foreach_get_target": "bDkcNMzZJpa",
    "il2cpp_object_header_size": "bLJDEdKmBcS",
    "il2cpp_array_object_header_size": "bXPQayDOAen",
    "il2cpp_offset_of_array_length_in_array_object_header": "botIOVynBEM",
    "il2cpp_offset_of_array_bounds_in_array_object_header": "bqbvtpiMCrf",
    "il2cpp_allocation_granularity": "bqjTMWijrcM",
    "il2cpp_unity_liveness_allocate_struct": "byAFR__PYxx",
    "il2cpp_unity_liveness_calculation_from_root": "cEURkfudHRC",
    "il2cpp_unity_liveness_calculation_from_statics": "cGcMJbaysCu",
    "il2cpp_unity_liveness_finalize": "cOAXqtybgqb",
    "il2cpp_unity_liveness_free_struct": "cOmVxXkRTmw",
    "il2cpp_method_get_return_type": "cQElersVflm",
    "il2cpp_method_get_declaring_type": "c_ENXAigcQo",
    "il2cpp_method_get_name": "cqSRpvcBNyh",
    "il2cpp_method_get_from_reflection": "csbMrKBOhLw",
    "il2cpp_method_get_object": "cxOwMoHE_NE",
    "il2cpp_method_is_generic": "dDRvakZxKeE",
    "il2cpp_method_is_inflated": "djqmjSZDrRG",
    "il2cpp_method_is_instance": "dpnDIhLomrU",
    "il2cpp_method_get_param_count": "dvgfu__Ymzy",
    "il2cpp_method_get_param": "eWLpasiKrfN",
    "il2cpp_method_get_class": "edvcOJegUaz",
    "il2cpp_method_has_attribute": "ejvRBUdJWdV",
    "il2cpp_method_get_flags": "ekAEvsmxMSk",
    "il2cpp_method_get_token": "evYGsSaW_yZ",
    "il2cpp_method_get_param_name": "fKcQGrASvfv",
    "il2cpp_property_get_flags": "fbfnwAXtxDe",
    "il2cpp_property_get_get_method": "fsWDWrgEkfB",
    "il2cpp_property_get_set_method": "fxZiqksFvvY",
    "il2cpp_property_get_name": "fyWKQ_UqCAX",
    "il2cpp_property_get_parent": "gKyVrJjHWXK",
    "il2cpp_object_get_class": "gjuWjQiEcTU",
    "il2cpp_object_get_size": "gmfUpxekuBJ",
    "il2cpp_object_get_virtual_method": "gtCbvPQTCky",
    "il2cpp_object_new": "hCQSyU_smRt",
    "il2cpp_object_unbox": "hHXvT_eGjYw",
    "il2cpp_value_box": "hUHSWWziuaN",
    "il2cpp_monitor_enter": "hXZxEynVolm",
    "il2cpp_monitor_try_enter": "iFnFsknMdtk",
    "il2cpp_monitor_exit": "iIHbGVaahZe",
    "il2cpp_monitor_pulse": "iJftufNyHsV",
    "il2cpp_monitor_pulse_all": "iaFmiMOFhzT",
    "il2cpp_monitor_wait": "ildNJreQEoi",
    "il2cpp_monitor_try_wait": "jPoaRLOXzvg",
    "il2cpp_runtime_invoke": "jQgdRxMcVBj",
    "il2cpp_runtime_invoke_convert_args": "kV_EKdQBOnU",
    "il2cpp_runtime_class_init": "kWsGbmJTXJp",
    "il2cpp_runtime_object_init": "k_yxRJcPJlV",
    "il2cpp_runtime_object_init_exception": "kbInJVMFTbM",
    "il2cpp_runtime_unhandled_exception_policy_set": "kcSXRIhyxpx",
    "il2cpp_string_length": "kqiClkdSggM",
    "il2cpp_string_chars": "krjnpsSNCdU",
    "il2cpp_string_new": "kwKtPwrsCDY",
    "il2cpp_string_new_len": "lGIBsOcEiZD",
    "il2cpp_string_new_utf16": "lIRPuZ_yVIJ",
    "il2cpp_string_new_wrapper": "lXDIxuAjzEy",
    "il2cpp_string_intern": "lcNLnKyDtjn",
    "il2cpp_string_is_interned": "lfxRstYCaro",
    "il2cpp_thread_current": "mQmAoWuTmoa",
    "il2cpp_thread_attach": "mcEfeZIEXFZ",
    "il2cpp_thread_detach": "mxFqQwvRKXn",
    "il2cpp_is_vm_thread": "nJGsXpKiqwP",
    "il2cpp_current_thread_walk_frame_stack": "nJtGOKskAMJ",
    "il2cpp_thread_walk_frame_stack": "nOMcITnINJd",
    "il2cpp_current_thread_get_top_frame": "nXXfFAhRwyA",
    "il2cpp_thread_get_top_frame": "n_PGCLzXOCR",
    "il2cpp_current_thread_get_frame_at": "naIN_HRvVLG",
    "il2cpp_thread_get_frame_at": "nhBeoHQWnTl",
    "il2cpp_current_thread_get_stack_depth": "nmFtKNpSHgS",
    "il2cpp_thread_get_stack_depth": "npmCfJxNrXA",
    "il2cpp_override_stack_backtrace": "oDIbrJMdoNd",
    "il2cpp_type_get_object": "oTBIW_MrETO",
    "il2cpp_type_get_type": "oVwHkWpESMf",
    "il2cpp_type_get_class_or_element_class": "oZDQtNtsdZT",
    "il2cpp_type_get_name": "obAXZEaZTCl",
    "il2cpp_type_is_byref": "obuKspbnchR",
    "il2cpp_type_get_attrs": "pUkujxxDGaP",
    "il2cpp_type_equals": "peHCUzFuk_D",
    "il2cpp_type_get_assembly_qualified_name": "pphXyulfyir",
    "il2cpp_type_get_reflection_name": "qArnlAJWEnK",
    "il2cpp_type_is_static": "qRbwXoFMFyH",
    "il2cpp_type_is_pointer_type": "qaIBsBPQADN",
    "il2cpp_image_get_assembly": "qcQSPrdmWsR",
    "il2cpp_image_get_name": "qzMvtyblLCJ",
    "il2cpp_image_get_filename": "rKDDrz_CLgL",
    "il2cpp_image_get_entry_point": "rNGM_ODIdRY",
    "il2cpp_image_get_class_count": "rOuxTIXTtXD",
    "il2cpp_image_get_class": "rbzOFUDDQre",
    "il2cpp_capture_memory_snapshot": "rkTUDnAePRy",
    "il2cpp_free_captured_memory_snapshot": "rnBRuysFGvG",
    "il2cpp_set_find_plugin_callback": "sSbArZiFFbk",
    "il2cpp_register_log_callback": "sfufgjybJYq",
    "il2cpp_debugger_set_agent_options": "snyPEajAWhc",
    "il2cpp_is_debugger_attached": "srBMFXGFgOL",
    "il2cpp_register_debugger_agent_transport": "tGeBJKTMUsS",
    "il2cpp_debug_foreach_method": "tQZwFachSst",
    "il2cpp_debug_get_method_info": "toRkmTJjlOQ",
    "il2cpp_unity_install_unitytls_interface": "tpifJnXGpWt",
    "il2cpp_custom_attrs_from_class": "uhwYHEBAsn_",
    "il2cpp_custom_attrs_from_method": "umBZKZnIJHZ",
    "il2cpp_custom_attrs_from_field": "uqXebEnpdFP",
    "il2cpp_custom_attrs_get_attr": "vQaXPiiJbcR",
    "il2cpp_custom_attrs_has_attr": "vQsaHALEWlO",
    "il2cpp_custom_attrs_construct": "vXsnqzzDpGM",
    "il2cpp_custom_attrs_free": "wavEbpRu_kc",
    "il2cpp_class_set_userdata": "xFlxVgUFrIc",
    "il2cpp_class_get_userdata_offset": "xNFCtL_yUpD",
    "il2cpp_set_default_thread_affinity": "xek_HSADwGX",
    "il2cpp_unity_set_android_network_up_state_func": "xtIcD_PNfaZ"
};
function __installExports() {
    try {
        if (typeof Il2Cpp === "undefined" || !Il2Cpp) return;
        Il2Cpp.$config = Il2Cpp.$config || {};
        const mod = () => (Il2Cpp.module || Process.findModuleByName("GameAssembly.dll"));
        const exports = (Il2Cpp.$config.exports = {});
        const live = new Set();
        try {
            const m = mod();
            if (m && m.enumerateExports) for (const e of m.enumerateExports()) live.add(e.name);
        } catch (e) {}
        let ok = 0;
        const bad = [];
        for (const cn in __SYM) {
            const obf = __SYM[cn];
            exports[cn] = () => { const mm = mod(); return mm ? mm.findExportByName(obf) : null; };
            if (live.has(obf)) ok++; else bad.push(cn);
        }
        for (const cn in __BRIDGE) {
            if (exports[cn]) exports[__BRIDGE[cn]] = exports[cn];
        }
        if (bad.length) {
            console.log("[__SYM] " + ok + "/" + Object.keys(__SYM).length + " exports live - STALE for this build, missing: " + bad.join(","));
        } else {
            console.log("[__SYM] all " + ok + " exports resolved for current build");
        }
    } catch (e) {
        console.log("[__SYM] install ERR " + (e.message || e));
    }
}
__installExports();

// ----------------------------------------------------------------------------
// reflection helpers
// ----------------------------------------------------------------------------
function cname(k) {
    try { return k.namespace ? k.namespace + "." + k.name : k.name; } catch (e) {}
    try { return k.name; } catch (e2) {}
    return "?";
}

function findClass(needle) {
    const want = needle.toLowerCase();
    try {
        for (const asm of Il2Cpp.domain.assemblies) {
            for (const k of asm.image.classes) {
                try {
                    if (cname(k).toLowerCase() === want) return k;
                } catch (e) {}
            }
        }
    } catch (e) {}
    return null;
}

function findClassesLike(needle) {
    const want = needle.toLowerCase();
    const out = [];
    try {
        for (const asm of Il2Cpp.domain.assemblies) {
            for (const k of asm.image.classes) {
                try {
                    if (cname(k).toLowerCase().indexOf(want) !== -1) out.push(k);
                } catch (e) {}
            }
        }
    } catch (e) {}
    return out;
}

function enumMemberName(enumClass, num) {
    try {
        for (const f of enumClass.fields) {
            if (f.isStatic) {
                try { if (Number(f.value) === Number(num)) return f.name; } catch (e) {}
            }
        }
    } catch (e) {}
    return String(num);
}

// ----------------------------------------------------------------------------
// value stringifier (never throws)
// ----------------------------------------------------------------------------
function strOf(v) {
    try {
        if (v === null || v === undefined) return "null";
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (typeof v === "string") return JSON.stringify(v);
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "function") return "<fn>";
        if (v instanceof Il2Cpp.String) return JSON.stringify(v.content);
        if (v instanceof Il2Cpp.Array) {
            let len = 0;
            try { len = v.length; } catch (e) {}
            if (len > 0 && len <= CFG.maxArrayElems) {
                const parts = [];
                for (let i = 0; i < len; i++) {
                    try { parts.push(strOf(v.get(i))); } catch (e) { parts.push("?"); }
                }
                return cname(v.class) + "[" + len + "] = {" + parts.join(", ") + "}";
            }
            return cname(v.class) + "[" + len + "]";
        }
        if (v instanceof Il2Cpp.ValueType) {
            try {
                const cls = v.type.class;
                const fieldParts = [];
                let count = 0;
                for (const f of cls.fields) {
                    if (f.isStatic) continue;
                    if (count >= 8) break;
                    try { fieldParts.push(f.name + "=" + strOf(v.tryField(f.name).value)); } catch (e) {}
                    count++;
                }
                if (fieldParts.length) return cname(cls) + "{" + fieldParts.join(", ") + "}";
                return cname(cls);
            } catch (e) {
                return cname(v.type.class);
            }
        }
        if (v instanceof Il2Cpp.Object) {
            if (v.isNull()) return "null";
            let c;
            try { c = cname(v.class); } catch (e) { return "?"; }
            if (c === "System.String") {
                try { return JSON.stringify(v.method("ToString").invoke().content); } catch (e) { return "String"; }
            }
            if (v.class.isEnum) {
                try { return enumMemberName(v.class, Number(v.tryField("value__").value)); } catch (e) { return c; }
            }
            if (c.indexOf("UnityEngine.") === 0) {
                try {
                    const nm = v.method("get_name").invoke();
                    if (nm) return c + "(" + (nm instanceof Il2Cpp.String ? nm.content : String(nm)) + ")";
                } catch (e) {}
                return c;
            }
            return c;
        }
        return String(v);
    } catch (e) {
        return "?";
    }
}

// ----------------------------------------------------------------------------
// live field printing (memory reads only, never invokes methods)
// ----------------------------------------------------------------------------
const SKIP_FIELDS = {
    parentStateObject: true,
    root: true,
    _childStateProperties: true,
    _childStatePropertyInfoCache: true,
    _jsonStateStack: true,
};

function isEngineField(k) {
    try { return k.namespace && k.namespace.indexOf("UnityEngine") === 0; } catch (e) { return false; }
}

function printLiveFields(obj, indent, cap) {
    let n = 0;
    try {
        for (const k of obj.class.hierarchy()) {
            if (isEngineField(k)) continue;
            for (const f of k.fields) {
                if (f.isStatic) continue;
                if (n >= cap) { print(indent + "... (field cap " + cap + ")"); return; }
                n++;
                let v;
                try { v = f.bind(obj).value; } catch (e) {
                    print(indent + f.name + " : " + f.type.name + " = <read error>");
                    continue;
                }
                let vs = strOf(v);
                if (f.type.class && f.type.class.isEnum) {
                    try { vs = enumMemberName(f.type.class, Number(v)); } catch (e) {}
                }
                print(indent + f.name + " : " + f.type.name + " = " + vs);
            }
        }
    } catch (e) {}
}

// ----------------------------------------------------------------------------
// class metadata dump (=== name === / PARENT CHAIN / FIELD / METHOD)
// ----------------------------------------------------------------------------
function dumpClassFull(k) {
    const buf = [];
    let full;
    try { full = k.fullName; } catch (e) { full = "?"; }
    buf.push("=== " + full + " ===");
    try {
        const flags = [];
        if (k.isInterface) flags.push("interface");
        if (k.isEnum) flags.push("enum");
        if (k.isValueType && !k.isEnum) flags.push("struct");
        if (k.isAbstract) flags.push("abstract");
        if (k.isGeneric) flags.push("generic");
        if (k.isInflated) flags.push("inflated");
        if (flags.length) buf.push("FLAGS: " + flags.join(","));
    } catch (e) {}
    try {
        const chain = [];
        let p = k, depth = 0;
        while (p && !p.isNull() && depth++ < 12) { chain.push(cname(p)); p = p.parent; }
        buf.push("PARENT CHAIN: " + chain.join(" -> "));
    } catch (e) { buf.push("PARENT ERR " + e.message); }
    try {
        const ifs = k.interfaces;
        if (ifs.length) {
            const names = [];
            for (const i of ifs) { try { names.push(i.fullName); } catch (e) { names.push("?"); } }
            buf.push("INTERFACES: " + names.join(", "));
        }
    } catch (e) {}
    if (k.isEnum) {
        try {
            for (const f of k.fields) {
                if (f.isStatic) {
                    try { buf.push("ENUM " + f.name + " = " + String(f.value)); } catch (e) {}
                }
            }
        } catch (e) {}
    }
    try {
        for (const f of k.fields) {
            let t;
            try { t = f.type.name; } catch (e) { t = "?"; }
            let fg = "";
            if (f.isStatic) fg += "static ";
            if (f.isLiteral) fg += "literal ";
            buf.push("FIELD " + fg + f.name + " : " + t);
        }
    } catch (e) { buf.push("fields ERR " + e.message); }
    try {
        for (const m of k.methods) {
            let r;
            try { r = m.returnType.name; } catch (e) { r = "?"; }
            const ps = [];
            try { for (const p of m.parameters) { let pt; try { pt = p.type.name; } catch (e2) { pt = "?"; } ps.push(pt + " " + p.name); } } catch (e3) {}
            buf.push("METHOD " + (m.isStatic ? "static " : "") + r + " " + m.name + "(" + ps.join(", ") + ")");
        }
    } catch (e) { buf.push("methods ERR " + e.message); }
    print(buf.join("\n"));
    try {
        const nc = k.nestedClasses;
        if (nc.length) print("NESTED " + cname(k) + " -> " + nc.length);
    } catch (e) {}
}

function dumpAssemblyClasses(asm, full) {
    let classes;
    try { classes = asm.image.classes; } catch (e) { print("### ASSEMBLY " + asm.name + " : classes ERR " + e.message); return; }
    const sorted = Array.from(classes);
    sorted.sort((a, b) => { try { return a.fullName.localeCompare(b.fullName); } catch (e) { return 0; } });
    print("### ASSEMBLY " + asm.name + " : " + sorted.length + " classes");
    for (const k of sorted) {
        if (full) {
            dumpClassFull(k);
        } else {
            try { print("CLASS " + k.fullName); } catch (e) {}
        }
    }
}

// ----------------------------------------------------------------------------
// legacy C# metadata dump (matches the old AnimalCompany_full_dump_*.cs)
//   // <assembly>
//   class Name : Base
//   {
//       FieldType fieldName; // 0x10
//       static ReturnType methodName(params); // 0x00698100
//   }
// Pure metadata reads only - never touches live objects.
// ----------------------------------------------------------------------------
function legacyFieldLine(f) {
    let s = "";
    try {
        if (f.isThreadStatic) s += "[ThreadStatic] ";
        if (f.isStatic) s += "static ";
        s += f.type.name + " " + f.name;
        if (f.isLiteral) {
            try {
                let v = f.value;
                if (f.type.class && f.type.class.isEnum) {
                    try { v = Il2Cpp.read(f.value.handle, f.type.class.baseType); } catch (e) {}
                }
                s += " = " + String(v);
            } catch (e) { s += " = ?"; }
        } else {
            s += ";";
            if (!f.isThreadStatic) {
                try { s += " // 0x" + f.offset.toString(16); } catch (e) {}
            }
        }
    } catch (e) { return ""; }
    return s;
}

function legacyMethodLine(m) {
    const ps = [];
    try {
        for (const p of m.parameters) {
            let pt;
            try { pt = p.type.name; } catch (e) { pt = "?"; }
            ps.push(pt + " " + p.name);
        }
    } catch (e) {}
    let g = "";
    try {
        if (m.generics.length > 0) g = "<" + m.generics.map(_ => { try { return _.type.name; } catch (e2) { return "?"; } }).join(",") + ">";
    } catch (e) {}
    let r = "?";
    try { r = m.returnType.name; } catch (e) {}
    let rva = "";
    try {
        if (!m.virtualAddress.isNull()) {
            const h = m.relativeVirtualAddress.toString(16).replace(/^0x/i, "");
            rva = " // 0x" + h.padStart(8, "0");
        }
    } catch (e) {}
    return (m.isStatic ? "static " : "") + r + " " + m.name + g + "(" + ps.join(", ") + ");" + rva;
}

function dumpClassLegacy(k) {
    let asmName = "?";
    try { asmName = k.image.assembly.name; } catch (e) {}
    let parent = "";
    try { parent = k.parent && !k.parent.isNull() ? cname(k.parent) : ""; } catch (e) {}
    let full = "?";
    try { full = k.fullName; } catch (e) {}
    const buf = ["// " + asmName, "class " + full + " : " + parent, "{"];
    try {
        for (const f of k.fields) {
            const line = legacyFieldLine(f);
            if (line) buf.push("    " + line);
        }
    } catch (e) {}
    try {
        for (const m of k.methods) {
            const line = legacyMethodLine(m);
            if (line) buf.push("    " + line);
        }
    } catch (e) {}
    buf.push("}", "");
    print(buf.join("\n"));
}

function dumpAssemblyLegacy(asm) {
    let classes;
    try { classes = asm.image.classes; } catch (e) { print("### ASSEMBLY " + asm.name + " : classes ERR " + e.message); return; }
    const sorted = Array.from(classes);
    sorted.sort((a, b) => { try { return a.fullName.localeCompare(b.fullName); } catch (e) { return 0; } });
    print("### ASSEMBLY " + asm.name + " : " + sorted.length + " classes");
    for (const k of sorted) {
        try { dumpClassLegacy(k); } catch (e) {}
    }
}

// ----------------------------------------------------------------------------
// generic System.Collections.Generic.Dictionary walker (raw memory)
// ----------------------------------------------------------------------------
function dumpDictionary(dict, label, indent) {
    if (!(dict instanceof Il2Cpp.Object) || dict.isNull()) {
        print(indent + label + " : <null>");
        return;
    }
    let entriesF = null, countF = null;
    try {
        for (const k of dict.class.hierarchy()) {
            try { entriesF = entriesF || k.tryField("_entries") || k.tryField("entries"); } catch (e) {}
            try { countF = countF || k.tryField("_count") || k.tryField("count"); } catch (e) {}
        }
    } catch (e) {}
    if (!entriesF) {
        print(indent + label + " : " + cname(dict.class) + " (no readable _entries, raw fields below)");
        printLiveFields(dict, indent + "  ", 30);
        return;
    }
    let arr;
    try { arr = entriesF.bind(dict).value; } catch (e) { print(indent + label + " : entries read error"); return; }
    if (!(arr instanceof Il2Cpp.Array) || arr.isNull()) {
        print(indent + label + " : " + cname(dict.class) + " (entries empty)");
        return;
    }
    let entryCls = null;
    try { entryCls = arr.elementType.class; } catch (e) {}
    if (!entryCls) {
        print(indent + label + " : cannot resolve entry type");
        return;
    }
    const keyF = entryCls.tryField("key");
    const valF = entryCls.tryField("value");
    const hashF = entryCls.tryField("hashCode") || entryCls.tryField("hash");
    let shown = 0, skipped = 0;
    print(indent + label + " : " + cname(dict.class) + "  entries=" + arr.length + "  key=" + (keyF ? keyF.type.name : "?") + "  value=" + (valF ? valF.type.name : "?"));
    for (let i = 0; i < arr.length && shown < CFG.maxDictEntries; i++) {
        try {
            const e = arr.elements.get(i);
            if (!(e instanceof Il2Cpp.ValueType)) continue;
            if (hashF) {
                try { if (Number(e.tryField(hashF.name).value) === -1) { skipped++; continue; } } catch (e2) {}
            }
            let key = keyF ? e.tryField(keyF.name).value : undefined;
            let val = valF ? e.tryField(valF.name).value : undefined;
            if (key === undefined && val === undefined) { skipped++; continue; }
            let keyStr = strOf(key);
            if (keyF && keyF.type.class && keyF.type.class.isEnum) {
                try { keyStr = enumMemberName(keyF.type.class, Number(key)); } catch (e2) {}
            }
            let valStr = strOf(val);
            if (valF && valF.type.class && valF.type.class.isEnum) {
                try { valStr = enumMemberName(valF.type.class, Number(val)); } catch (e2) {}
            }
            print(indent + "  KEY " + keyStr + "  =>  " + valStr);
            shown++;
        } catch (e) {}
    }
    print(indent + "  (" + shown + " entries shown, " + skipped + " free slots skipped)");
}

// ----------------------------------------------------------------------------
// IEnumerable helper
// ----------------------------------------------------------------------------
function enumerate(obj) {
    const out = [];
    try {
        const eo = obj.method("GetEnumerator").invoke();
        if (!eo || eo.isNull()) return out;
        for (let i = 0; i < 200000; i++) {
            const ok = eo.method("MoveNext").invoke();
            if (!ok) break;
            out.push(eo.method("get_Current").invoke());
        }
    } catch (e) {}
    return out;
}

// ----------------------------------------------------------------------------
// App singleton
// ----------------------------------------------------------------------------
function getApp() {
    try {
        const appCls = findClass("AnimalCompany.App");
        if (appCls) {
            try {
                const f = appCls.tryField("_instance");
                if (f && f.isStatic) {
                    const v = f.value;
                    if (v instanceof Il2Cpp.Object && !v.isNull()) return v;
                }
            } catch (e) {}
            try {
                const arr = Il2Cpp.gc.choose(appCls);
                if (arr && arr.length) return arr[0];
            } catch (e) {}
        }
    } catch (e) {}
    return null;
}

// ----------------------------------------------------------------------------
// live state tree walker
// ----------------------------------------------------------------------------
const _stateSeen = new Set();
let _stateLines = 0;
const MAX_STATE_LINES = 400000;

function isWalkableClass(c) {
    if (/^SpatialSys\.ObservableState\./.test(c)) return true;
    if (/^UnityEngine\./.test(c)) return false;
    if (/AnimalCompany\..*UI/i.test(c)) return false;
    if (c.indexOf("AnimalCompany.") === 0) return true;
    return /(StatePrimitive|StateDictionary|StateList|StateObject)/.test(c);
}

function stateChildren(obj) {
    try {
        const eo = obj.method("get_childStateObjects").invoke();
        if (!eo || eo.isNull()) return null;
        return enumerate(eo);
    } catch (e) {
        return null;
    }
}

function walkState(obj, path, depth) {
    if (!obj || obj.isNull()) return;
    if (_stateLines >= MAX_STATE_LINES) return;
    if (depth > CFG.maxStateDepth) return;
    const key = obj.handle.toString();
    if (_stateSeen.has(key)) return;
    _stateSeen.add(key);
    let clsName;
    try { clsName = cname(obj.class); } catch (e) { clsName = "?"; }
    const indent = "  ".repeat(depth);
    let stName = path;
    try {
        const s = obj.method("get_stateName").invoke();
        if (s instanceof Il2Cpp.String && s.content && s.content.length) stName = s.content;
    } catch (e) {}
    _stateLines++;
    const label = indent + "[" + stName + "] " + clsName + " @" + obj.handle.toString();
    if (/StatePrimitive/.test(clsName)) {
        try {
            const v = obj.method("get_value").invoke();
            print(label + " = " + strOf(v));
        } catch (e) {
            print(label);
        }
        return;
    }
    print(label);
    let n = 0;
    try {
        for (const k of obj.class.hierarchy()) {
            if (isEngineField(k)) continue;
            for (const f of k.fields) {
                if (f.isStatic) continue;
                if (n >= 150) break;
                if (SKIP_FIELDS[f.name]) continue;
                let v;
                try { v = f.bind(obj).value; } catch (e) { continue; }
                n++;
                let vs = strOf(v);
                if (f.type.class && f.type.class.isEnum) {
                    try { vs = enumMemberName(f.type.class, Number(v)); } catch (e) {}
                }
                if (v instanceof Il2Cpp.Object && !v.isNull() && depth < CFG.maxObjectWalkDepth && isWalkableClass(cname(v.class))) {
                    print(indent + "  " + f.name + " : " + f.type.name + " -> " + cname(v.class) + " @" + v.handle.toString());
                    _stateLines++;
                    walkState(v, stName + "." + f.name, depth + 1);
                } else {
                    print(indent + "  " + f.name + " : " + f.type.name + " = " + vs);
                    _stateLines++;
                }
            }
        }
    } catch (e) {}
    const kids = stateChildren(obj);
    if (kids && kids.length) {
        for (let i = 0; i < kids.length; i++) {
            const kid = kids[i];
            if (!kid || kid.isNull()) continue;
            walkState(kid, stName + "/" + i, depth + 1);
        }
    }
}

// ----------------------------------------------------------------------------
// scene dump
// ----------------------------------------------------------------------------
function dumpScene() {
    print("=== SCENE DUMP ===");
    const GameObject = findClass("UnityEngine.GameObject");
    const MonoBehaviour = findClass("UnityEngine.MonoBehaviour");
    if (GameObject) {
        try {
            const gos = Il2Cpp.gc.choose(GameObject);
            print("GameObjects on managed heap: " + gos.length);
            let shown = 0;
            for (const go of gos) {
                if (shown >= CFG.maxGameObjects) { print("... capped at " + CFG.maxGameObjects); break; }
                if (go.isNull()) continue;
                let name = "?", active = "?", tag = "?";
                try { const n = go.method("get_name").invoke(); name = n instanceof Il2Cpp.String ? n.content : String(n); } catch (e) {}
                try { active = String(go.method("get_activeSelf").invoke()); } catch (e) {}
                try { const t = go.method("get_tag").invoke(); tag = t instanceof Il2Cpp.String ? t.content : String(t); } catch (e) {}
                let path = "";
                try {
                    const t = go.method("get_transform").invoke();
                    const parts = [];
                    let cur = t;
                    for (let d = 0; d < 64; d++) {
                        const nm = cur.method("get_name").invoke();
                        parts.push(nm instanceof Il2Cpp.String ? nm.content : String(nm));
                        const p = cur.method("get_parent").invoke();
                        if (!p || p.isNull()) break;
                        cur = p;
                    }
                    path = parts.reverse().join("/");
                } catch (e) {}
                print("GO " + go.handle.toString() + " " + (path || name) + " [active=" + active + ", tag=" + tag + "]");
                shown++;
            }
        } catch (e) {
            print("GameObject dump ERR " + e.message);
        }
    } else {
        print("UnityEngine.GameObject class not found");
    }
    if (MonoBehaviour) {
        let mbClasses = [];
        try {
            for (const asm of Il2Cpp.domain.assemblies) {
                if (!/animalcompany|spatialsys/i.test(asm.name)) continue;
                for (const k of asm.image.classes) {
                    try { if (k.isSubclassOf(MonoBehaviour, true) || k.fullName === "UnityEngine.MonoBehaviour") mbClasses.push(k); } catch (e) {}
                }
            }
        } catch (e) {}
        print("MonoBehaviour-derived classes in game assemblies: " + mbClasses.length);
        for (const k of mbClasses) {
            let insts = [];
            try { insts = Il2Cpp.gc.choose(k); } catch (e) {}
            if (!insts.length) continue;
            print("--- " + cname(k) + " : " + insts.length + " live instance(s)");
            const limit = Math.min(insts.length, CFG.maxInstancesPerClass);
            for (let i = 0; i < limit; i++) {
                const o = insts[i];
                if (o.isNull()) continue;
                let goName = "?";
                try {
                    const g = o.method("get_gameObject").invoke();
                    if (g && !g.isNull()) {
                        const n = g.method("get_name").invoke();
                        goName = n instanceof Il2Cpp.String ? n.content : String(n);
                    }
                } catch (e) {}
                print("  [" + i + "] " + o.handle.toString() + "  GameObject=" + goName);
                printLiveFields(o, "      ", CFG.maxFieldsPerInstance);
            }
            if (insts.length > limit) print("  ... +" + (insts.length - limit) + " more");
        }
    } else {
        print("UnityEngine.MonoBehaviour class not found");
    }
}

// ----------------------------------------------------------------------------
// asset dump
// ----------------------------------------------------------------------------
function dumpAssets() {
    print("=== LOADED ASSETS ===");
    const Texture2D = findClass("UnityEngine.Texture2D");
    if (Texture2D) {
        try {
            const list = Il2Cpp.gc.choose(Texture2D);
            print("Texture2D: " + list.length);
            let n = 0;
            for (const t of list) {
                if (n >= CFG.maxAssetsPerKind) break;
                if (t.isNull()) continue;
                let nm = "?", w = "?", h = "?", fmt = "?";
                try { const s = t.method("get_name").invoke(); nm = s instanceof Il2Cpp.String ? s.content : String(s); } catch (e) {}
                try { w = String(t.method("get_width").invoke()); } catch (e) {}
                try { h = String(t.method("get_height").invoke()); } catch (e) {}
                try { fmt = String(t.method("get_graphicsFormat").invoke()); } catch (e) {}
                print("  TEX " + t.handle.toString() + " " + nm + " " + w + "x" + h + " fmt=" + fmt);
                n++;
            }
            if (list.length > n) print("  ... +" + (list.length - n) + " more");
        } catch (e) { print("Texture2D ERR " + e.message); }
    }
    const AudioClip = findClass("UnityEngine.AudioClip");
    if (AudioClip) {
        try {
            const list = Il2Cpp.gc.choose(AudioClip);
            print("AudioClip: " + list.length);
            let n = 0;
            for (const a of list) {
                if (n >= CFG.maxAssetsPerKind) break;
                if (a.isNull()) continue;
                let nm = "?", len = "?", channels = "?", freq = "?";
                try { const s = a.method("get_name").invoke(); nm = s instanceof Il2Cpp.String ? s.content : String(s); } catch (e) {}
                try { len = String(a.method("get_length").invoke()); } catch (e) {}
                try { channels = String(a.method("get_channels").invoke()); } catch (e) {}
                try { freq = String(a.method("get_frequency").invoke()); } catch (e) {}
                print("  AUD " + a.handle.toString() + " " + nm + " len=" + len + "s ch=" + channels + " hz=" + freq);
                n++;
            }
            if (list.length > n) print("  ... +" + (list.length - n) + " more");
        } catch (e) { print("AudioClip ERR " + e.message); }
    }
    const Mesh = findClass("UnityEngine.Mesh");
    if (Mesh) {
        try {
            const list = Il2Cpp.gc.choose(Mesh);
            print("Mesh: " + list.length);
            let n = 0;
            for (const m of list) {
                if (n >= CFG.maxAssetsPerKind) break;
                if (m.isNull()) continue;
                let nm = "?", verts = "?", subs = "?", tris = "?";
                try { const s = m.method("get_name").invoke(); nm = s instanceof Il2Cpp.String ? s.content : String(s); } catch (e) {}
                try { verts = String(m.method("get_vertexCount").invoke()); } catch (e) {}
                try { subs = String(m.method("get_subMeshCount").invoke()); } catch (e) {}
                try { tris = String(m.method("get_triangles").invoke().length); } catch (e) {}
                print("  MESH " + m.handle.toString() + " " + nm + " verts=" + verts + " subMeshes=" + subs + " tris=" + tris);
                n++;
            }
            if (list.length > n) print("  ... +" + (list.length - n) + " more");
        } catch (e) { print("Mesh ERR " + e.message); }
    }
    const Material = findClass("UnityEngine.Material");
    if (Material) {
        try {
            const list = Il2Cpp.gc.choose(Material);
            print("Material: " + list.length);
            let n = 0;
            for (const m of list) {
                if (n >= CFG.maxAssetsPerKind) break;
                if (m.isNull()) continue;
                let nm = "?", shader = "?";
                try { const s = m.method("get_name").invoke(); nm = s instanceof Il2Cpp.String ? s.content : String(s); } catch (e) {}
                try {
                    const sh = m.method("get_shader").invoke();
                    if (sh && !sh.isNull()) {
                        const sn = sh.method("get_name").invoke();
                        shader = sn instanceof Il2Cpp.String ? sn.content : String(sn);
                    }
                } catch (e) {}
                print("  MAT " + m.handle.toString() + " " + nm + " shader=" + shader);
                n++;
            }
            if (list.length > n) print("  ... +" + (list.length - n) + " more");
        } catch (e) { print("Material ERR " + e.message); }
    }
}

// ----------------------------------------------------------------------------
// item database dump (PrefabGenerator prefab dictionary)
// ----------------------------------------------------------------------------
function dumpItemDatabase() {
    print("=== ITEM DATABASE ===");
    const pg = findClass("AnimalCompany.PrefabGenerator");
    if (!pg) { print("AnimalCompany.PrefabGenerator not found"); return; }
    let inst = null;
    try {
        const f = pg.tryField("_instance");
        if (f && f.isStatic) {
            const v = f.value;
            if (v instanceof Il2Cpp.Object && !v.isNull()) inst = v;
        }
    } catch (e) {}
    if (!inst) {
        try {
            const arr = Il2Cpp.gc.choose(pg);
            if (arr && arr.length) inst = arr[0];
        } catch (e) {}
    }
    if (!inst) {
        print("PrefabGenerator instance not available yet (need to be in a lobby)");
        return;
    }
    print("PrefabGenerator instance @" + inst.handle.toString());
    printLiveFields(inst, "  ", 60);
    try {
        const dict = inst.tryField("_prefabDictionary").value;
        dumpDictionary(dict, "_prefabDictionary", "  ");
    } catch (e) {
        print("  _prefabDictionary read ERR " + e.message);
    }
    print("--- classes matching 'Prefab' ---");
    for (const k of findClassesLike("prefab")) { try { print("CLASS " + cname(k)); } catch (e) {} }
}

// ----------------------------------------------------------------------------
// statics dump
// ----------------------------------------------------------------------------
function dumpStatics() {
    print("=== KEY STATIC FIELDS ===");
    const WANT = /(App$|AppState$|PrefabGenerator|Instance$|Singleton|ItemMods|LootTables|UpgradesData|SkillTree|EventsState|ProductsState|PedestalsState|AvatarItems)/;
    let done = 0;
    try {
        for (const asm of Il2Cpp.domain.assemblies) {
            if (!/animalcompany/i.test(asm.name)) continue;
            for (const k of asm.image.classes) {
                if (done >= CFG.maxStaticsClasses) break;
                let full;
                try { full = k.fullName; } catch (e) { continue; }
                if (!WANT.test(full)) continue;
                const statics = [];
                try {
                    for (const f of k.fields) {
                        if (!f.isStatic || f.isLiteral) continue;
                        statics.push(f);
                    }
                } catch (e) {}
                if (!statics.length) continue;
                print("### " + full);
                for (const f of statics) {
                    let v;
                    try { v = f.value; } catch (e) { print("  static " + f.name + " : " + f.type.name + " = <read error>"); continue; }
                    let vs = strOf(v);
                    if (f.type.class && f.type.class.isEnum) {
                        try { vs = enumMemberName(f.type.class, Number(v)); } catch (e) {}
                    }
                    print("  static " + f.name + " : " + f.type.name + " = " + vs);
                }
                done++;
            }
            if (done >= CFG.maxStaticsClasses) break;
        }
    } catch (e) {
        print("statics ERR " + e.message);
    }
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
function runDump() {
    print("=== ANIMAL COMPANY FULL DUMP ===");
    if (_outPath) print("out_file=" + _outPath);
    print("time=" + new Date().toISOString());
    try { print("identifier=" + Il2Cpp.application.identifier); } catch (e) {}
    try { print("version=" + Il2Cpp.application.version); } catch (e) {}
    try { print("unityVersion=" + Il2Cpp.unityVersion); } catch (e) {}
    try { print("module=" + Il2Cpp.module.name + " base=" + Il2Cpp.module.base.toString()); } catch (e) {}
    flush();

    let asms = [];
    try { asms = Il2Cpp.domain.assemblies; } catch (e) { print("FATAL: cannot read assemblies: " + e.message); flush(); return; }
    print("=== ASSEMBLIES (" + asms.length + ") ===");
    for (const asm of asms) {
        let n = 0;
        try { n = asm.image.classes.length; } catch (e) {}
        try { print("ASM " + asm.name + "  classes=" + n); } catch (e) {}
    }
    flush();

    if (CFG.legacyClassDump) {
        print("=== FULL CLASS DUMP (all assemblies, legacy C# format) ===");
        for (const asm of asms) {
            try { dumpAssemblyLegacy(asm); } catch (e) { print("dump asm " + asm.name + " ERR " + e.message); }
        }
        flush();
    }

    if (CFG.richClassDump) {
        for (const asm of asms) {
            if (/animalcompany|spatialsys/i.test(asm.name)) {
                try { dumpAssemblyClasses(asm, true); } catch (e) { print("dump asm " + asm.name + " ERR " + e.message); }
            }
        }
        flush();
    }

    if (CFG.classListOtherAssemblies) {
        print("=== OTHER ASSEMBLIES (class list) ===");
        for (const asm of asms) {
            if (/animalcompany|spatialsys/i.test(asm.name)) continue;
            try { dumpAssemblyClasses(asm, false); } catch (e) {}
        }
        flush();
    }

    if (CFG.staticFields) { try { dumpStatics(); } catch (e) { print("statics ERR " + e.message); } flush(); }

    if (CFG.liveStateTree) {
        print("=== LIVE APP STATE ===");
        let app = null;
        const started = Date.now();
        while (!app && Date.now() - started < STATE_TIMEOUT_MS) {
            app = getApp();
            if (!app) {
                print("... waiting for AnimalCompany.App (not in a lobby yet?)");
                flush();
                const waitEnd = Date.now() + 5000;
                while (Date.now() < waitEnd) { Thread.sleep(0.1); }
            }
        }
        if (!app) {
            print("App never became available within " + (STATE_TIMEOUT_MS / 1000) + "s - re-run once you're in a lobby");
        } else {
            print("App @" + app.handle.toString());
            printLiveFields(app, "  ", CFG.maxFieldsPerInstance);
            let state;
            try { state = app.method("get_state").invoke(); } catch (e) { state = null; print("get_state ERR " + e.message); }
            if (state && !state.isNull()) {
                print("--- AppState tree (live values) ---");
                try { walkState(state, "state", 0); } catch (e) { print("state walk ERR " + e.message); }
                print("--- end state tree (" + _stateSeen.size + " objects, " + _stateLines + " lines) ---");
            }
        }
        flush();
    }

    if (CFG.liveScene) { try { dumpScene(); } catch (e) { print("scene ERR " + e.message); } flush(); }
    if (CFG.liveAssets) { try { dumpAssets(); } catch (e) { print("assets ERR " + e.message); } flush(); }
    if (CFG.itemDatabase) { try { dumpItemDatabase(); } catch (e) { print("itemDB ERR " + e.message); } flush(); }

    print("=== DUMP END ===");
    flush();
    _closeOutFile();
}

function boot() {
    try {
        if (typeof Il2Cpp !== "undefined" && Il2Cpp.domain && Il2Cpp.domain.assemblies) {
            Il2Cpp.perform(() => {
                try {
                    runDump();
                } catch (e) {
                    console.log("FATAL runDump: " + e.message + "\n" + e.stack);
                }
            });
            return;
        }
    } catch (e) {}
    if (Date.now() - (globalThis.__bootT0 || (globalThis.__bootT0 = Date.now())) > BOOT_TIMEOUT_MS) {
        console.log("DUMP TIMEOUT: Il2Cpp never became available");
        return;
    }
    setTimeout(boot, 250);
}

try {
    boot();
} catch (e) {
    console.log("FATAL boot: " + e.message + "\n" + e.stack);
}
