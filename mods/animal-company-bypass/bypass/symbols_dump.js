'use strict';
// ============================================================================
//  Animal Company - SYMBOLS DUMP
//  Regenerates a drop-in replacement for bypass/symbols.js from the LIVE game.
//  Reads the current GameAssembly.dll PE export directory, resolves every
//  canonical il2cpp_* name to its current obfuscated export (by name first,
//  then by the stable export ordinal), and writes a new symbols.js file:
//
//    (function () {
//        "use strict";
//        if (typeof Il2Cpp === "undefined" || !Il2Cpp) { return; }
//        var SYM = { "il2cpp_init": "KQQobkahLcB", ... };
//        var BRIDGE = { "il2cpp_init": "AhlmpndnbXA", ... };
//        ... refilter setter ...
//    })();
//
//  SELF-CONTAINED - intentionally does NOT load ac_bridge.js / symbols.js /
//  bypass.js (those CONSUME the symbol table; dumping must not depend on it).
//  Only module-header memory reads, never invokes il2cpp functions - safe.
//
//  Works via the plain frida CLI too:
//    frida -l symbols_dump.js EACLauncher
//
//  Output goes to the console, and (when globalThis.__SYMBOLS_OUT_FILE__ is set
//  BEFORE this script loads, see dump_symbols.py) to a .js file written from
//  inside the game via the Frida File API. Overwrite bypass/symbols.js with
//  that file when the game updates and the names change.
// ============================================================================

const BOOT_TIMEOUT_MS = 300000;

// ----------------------------------------------------------------------------
// output to a .js file, written from inside the game process (optional)
// ----------------------------------------------------------------------------
let _outHandle = null;
let _outPath = globalThis.__SYMBOLS_OUT_FILE__ || globalThis.__DUMP_OUT_FILE__ || null;
if (!_outPath) {
    _outPath = null;
}
function _openOutFile() {
    if (!_outPath) return false;
    if (_outHandle) return true;
    try {
        _outHandle = new File(_outPath, "w");
        _outHandle.flush();
        return true;
    } catch (e) {
        _outHandle = null;
        return false;
    }
}
function _closeOutFile() {
    if (!_outHandle) return;
    try { _outHandle.close(); } catch (e) {}
    _outHandle = null;
}
const _out = [];
const _origLog = (typeof console !== "undefined" && console.log) ? console.log.bind(console) : function () {};
function print(msg) {
    _out.push(String(msg));
    if (_out.length >= 1000) flush();
}
function flush() {
    if (_out.length) {
        const s = _out.join("\n");
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
        if (typeof send !== "undefined") {
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

// ----------------------------------------------------------------------------
// EMBEDDED REFERENCE MAPS.
//   __SYM    canonical -> Set B (current build, verified names) - used as the
//            name-first lookup and as fallback.
//   __BRIDGE canonical -> Set A (legacy bridge alias names) - kept verbatim in
//            the regenerated symbols.js so old ac_bridge.js aliases still
//            resolve.
//   __ORD    canonical -> export ordinal (stable across builds) - used to
//            recover the NEW obfuscated name for a canonical after a rename.
// ----------------------------------------------------------------------------
const __SYM = {
    "il2cpp_init": "KQQobkahLcB",
    "il2cpp_init_utf16": "HqKXkewqTfz",
    "il2cpp_shutdown": "RenqjBbcOOU",
    "il2cpp_set_config_dir": "LSMvitULyFr",
    "il2cpp_set_data_dir": "OQASc_pARjh",
    "il2cpp_set_temp_dir": "MDiYOZZCYXM",
    "il2cpp_set_commandline_arguments": "NHEGNYVJBjx",
    "il2cpp_set_commandline_arguments_utf16": "qeqdHCjpknI",
    "il2cpp_set_config_utf16": "uJyfzyXTlHl",
    "il2cpp_set_config": "oOI_EUcqZYj",
    "il2cpp_set_memory_callbacks": "HEpXvtbwNAP",
    "il2cpp_memory_pool_set_region_size": "yopnKyXqWcx",
    "il2cpp_memory_pool_get_region_size": "gbZsfqnOrui",
    "il2cpp_get_corlib": "eUPqbGVaXIY",
    "il2cpp_add_internal_call": "nEi_ftAVlXZ",
    "il2cpp_resolve_icall": "wRphLKlGyAK",
    "il2cpp_alloc": "zlbROoiarnm",
    "il2cpp_free": "kYLqUQDUlkF",
    "il2cpp_array_class_get": "YasSFVLtEvu",
    "il2cpp_array_length": "YnIqjPAeKMS",
    "il2cpp_array_get_byte_length": "mXZAasnVdFa",
    "il2cpp_array_new": "pgdSUYkWMJr",
    "il2cpp_array_new_specific": "UJvDVbN_IGy",
    "il2cpp_array_new_full": "PoomZEJIdR_",
    "il2cpp_bounded_array_class_get": "R_riMvyZSZn",
    "il2cpp_array_element_size": "_HwFZwIsNj_",
    "il2cpp_assembly_get_image": "_uaqbSnBXIa",
    "il2cpp_class_for_each": "QUZQwDuenGT",
    "il2cpp_class_enum_basetype": "_EvpdArAmnF",
    "il2cpp_class_is_inited": "AtS_MTSlSwd",
    "il2cpp_class_is_generic": "YEcIFRlDeGe",
    "il2cpp_class_is_inflated": "flVXyTHWACz",
    "il2cpp_class_is_assignable_from": "fIiyiwqBClg",
    "il2cpp_class_is_subclass_of": "OZMxZxTOhcn",
    "il2cpp_class_has_parent": "yEuFNrdSqCe",
    "il2cpp_class_from_il2cpp_type": "XaFepOIOZZc",
    "il2cpp_class_from_name": "nYeRoAQlLVk",
    "il2cpp_class_from_system_type": "UgYuZCiuHZE",
    "il2cpp_class_get_element_class": "UDbZbvxzblI",
    "il2cpp_class_get_events": "okrcwwrWSHY",
    "il2cpp_class_get_fields": "rOgtHbCJOHy",
    "il2cpp_class_get_nested_types": "QZIoMgVvjf_",
    "il2cpp_class_get_interfaces": "XFZFz_darUM",
    "il2cpp_class_get_properties": "NCvtXQhqgTL",
    "il2cpp_class_get_property_from_name": "k_DFJTckRvB",
    "il2cpp_class_get_field_from_name": "MPOHSfxIBNp",
    "il2cpp_class_get_methods": "TgisPILmYXu",
    "il2cpp_class_get_method_from_name": "RGutFUB_gvX",
    "il2cpp_class_get_name": "HbwEb_zoK_E",
    "il2cpp_type_get_name_chunked": "MtMfviaYRWo",
    "il2cpp_class_get_namespace": "QVzdiSaisXV",
    "il2cpp_class_get_parent": "NKxjgk_dOiY",
    "il2cpp_class_get_declaring_type": "WKn_tKspYDy",
    "il2cpp_class_instance_size": "fTBdTeJRpKu",
    "il2cpp_class_num_fields": "nx_PgGdNUKz",
    "il2cpp_class_is_valuetype": "gzFfF_XYXBu",
    "il2cpp_class_value_size": "pTNZxpZJzic",
    "il2cpp_class_is_blittable": "UggviuhnaNc",
    "il2cpp_class_get_flags": "pKz_mGx_oej",
    "il2cpp_class_is_abstract": "vHwyXOZKmqk",
    "il2cpp_class_is_interface": "LtQIujXiPQI",
    "il2cpp_class_array_element_size": "HfkZSFpBwVF",
    "il2cpp_class_from_type": "nTTXqbPqucV",
    "il2cpp_class_get_type": "cNgaIdXPQVp",
    "il2cpp_class_get_type_token": "MfPZtmYMVJn",
    "il2cpp_class_has_attribute": "xwXiFrhQjkH",
    "il2cpp_class_has_references": "LZYmAOcldok",
    "il2cpp_class_is_enum": "irRAPcuPmZd",
    "il2cpp_class_get_image": "vvMARHqAeKl",
    "il2cpp_class_get_assemblyname": "UpSR_YaJCtl",
    "il2cpp_class_get_rank": "ccP_DaAoAru",
    "il2cpp_class_get_data_size": "EYGoknksQKB",
    "il2cpp_class_get_static_field_data": "kDZkxxdBLRc",
    "il2cpp_stats_dump_to_file": "kGSJKKZhuwW",
    "il2cpp_stats_get_value": "EBgPcrpaNMo",
    "il2cpp_domain_get": "ewITDoKjSbY",
    "il2cpp_domain_assembly_open": "AGoNHOgrGZj",
    "il2cpp_domain_get_assemblies": "KAuvyGCWZal",
    "il2cpp_raise_exception": "YWVXZiZqqUP",
    "il2cpp_exception_from_name_msg": "kZYLXYDRUlK",
    "il2cpp_get_exception_argument_null": "mtQzxruDpFS",
    "il2cpp_format_exception": "VPxbmGVrieI",
    "il2cpp_format_stack_trace": "BSHBqixyVC_",
    "il2cpp_unhandled_exception": "kGnscLJFxWF",
    "il2cpp_native_stack_trace": "FAQEyNshWBV",
    "il2cpp_field_get_flags": "aIXtWVyRPQW",
    "il2cpp_field_get_from_reflection": "QkLqPJUzlhZ",
    "il2cpp_field_get_name": "glzjhAhskPN",
    "il2cpp_field_get_parent": "CRsxeDQDMrG",
    "il2cpp_field_get_object": "IwTOslvsHpi",
    "il2cpp_field_get_offset": "cnalSlCqicr",
    "il2cpp_field_get_type": "oaeqZmzMbDt",
    "il2cpp_field_get_value": "MFrLpulRfBU",
    "il2cpp_field_get_value_object": "bhgUuDWHJZR",
    "il2cpp_field_has_attribute": "jMGkxzAvRux",
    "il2cpp_field_set_value": "dU_MSYehzOV",
    "il2cpp_field_static_get_value": "ZZtRVbsIVYG",
    "il2cpp_field_static_set_value": "UevIyjTnuzl",
    "il2cpp_field_set_value_object": "wKDneXIwraq",
    "il2cpp_field_is_literal": "RJXGUUxQBLG",
    "il2cpp_gc_collect": "NAKEJPKirvl",
    "il2cpp_gc_collect_a_little": "aIXvAhf_yLH",
    "il2cpp_gc_start_incremental_collection": "Olgn_dzAreE",
    "il2cpp_gc_disable": "VbjzdjUCGWJ",
    "il2cpp_gc_enable": "qAcXxVcCPNu",
    "il2cpp_gc_is_disabled": "PDsRPUDxrjw",
    "il2cpp_gc_set_mode": "vdGUlFZsaHo",
    "il2cpp_gc_get_max_time_slice_ns": "ZMFQNIiOipD",
    "il2cpp_gc_set_max_time_slice_ns": "qgiMEBirTbD",
    "il2cpp_gc_is_incremental": "XIQyVRmCROd",
    "il2cpp_gc_get_used_size": "JFQDrhupaBF",
    "il2cpp_gc_get_heap_size": "pFqvtRzOERS",
    "il2cpp_gc_wbarrier_set_field": "ZUxEyxuYbPB",
    "il2cpp_gc_has_strict_wbarriers": "PjTEvhEtjoG",
    "il2cpp_gc_set_external_allocation_tracker": "EcgymmLfzzY",
    "il2cpp_gc_set_external_wbarrier_tracker": "OVpUxsCThhY",
    "il2cpp_gc_foreach_heap": "En_QnBAOPmL",
    "il2cpp_stop_gc_world": "YdNhBxnaoQh",
    "il2cpp_start_gc_world": "HjFuHFXlnwG",
    "il2cpp_gc_alloc_fixed": "ZMUitFtxhcQ",
    "il2cpp_gc_free_fixed": "Aqo_LosCYzF",
    "il2cpp_gchandle_new": "OsXzWDUIvIW",
    "il2cpp_gchandle_new_weakref": "OOzvTC_XbNd",
    "il2cpp_gchandle_get_target": "CrYrZpkeaaf",
    "il2cpp_gchandle_free": "jPWOeIVFGLS",
    "il2cpp_gchandle_foreach_get_target": "jVcLwsmctyv",
    "il2cpp_object_header_size": "LocFTyAFLoo",
    "il2cpp_array_object_header_size": "mZBrHXVqJME",
    "il2cpp_offset_of_array_length_in_array_object_header": "NVkURuXuDgR",
    "il2cpp_offset_of_array_bounds_in_array_object_header": "CBQxoBfCocx",
    "il2cpp_allocation_granularity": "KyKhsYbglYR",
    "il2cpp_unity_liveness_allocate_struct": "orfnYfFUOKN",
    "il2cpp_unity_liveness_calculation_from_root": "tdKgROncxND",
    "il2cpp_unity_liveness_calculation_from_statics": "YDEIUmHSeSs",
    "il2cpp_unity_liveness_finalize": "RltZcmgVyDa",
    "il2cpp_unity_liveness_free_struct": "GYwOvIYuVkt",
    "il2cpp_method_get_return_type": "aTFWVYLLxWn",
    "il2cpp_method_get_declaring_type": "DkcZQAIZI_s",
    "il2cpp_method_get_name": "RdKgQJfA_Fq",
    "il2cpp_method_get_from_reflection": "LqsOlPjAxRb",
    "il2cpp_method_get_object": "ZYXZxcrkrYB",
    "il2cpp_method_is_generic": "vKNzgNLPvXc",
    "il2cpp_method_is_inflated": "EQEYVVIabOE",
    "il2cpp_method_is_instance": "GvicpGfzItC",
    "il2cpp_method_get_param_count": "HNnargsOyMI",
    "il2cpp_method_get_param": "YOkFJacjdvD",
    "il2cpp_method_get_class": "AQpvtNhMywP",
    "il2cpp_method_has_attribute": "hXVXzkT_mFH",
    "il2cpp_method_get_flags": "vXQMAxPcioX",
    "il2cpp_method_get_token": "iUJ_WruDZvo",
    "il2cpp_method_get_param_name": "zYqibxkmhyQ",
    "il2cpp_property_get_flags": "xBZKrhODNqm",
    "il2cpp_property_get_get_method": "hiJheTlwyan",
    "il2cpp_property_get_set_method": "nqTbQHhXUxY",
    "il2cpp_property_get_name": "VMRnLeVZgFg",
    "il2cpp_property_get_parent": "hDREPRrrkUa",
    "il2cpp_object_get_class": "DYSSFTVys_a",
    "il2cpp_object_get_size": "tkYhNKvQzea",
    "il2cpp_object_get_virtual_method": "UQxqzJcOzGI",
    "il2cpp_object_new": "rvBzgPARXUp",
    "il2cpp_object_unbox": "usGeLgJXLXs",
    "il2cpp_value_box": "UXpYaFznhgg",
    "il2cpp_monitor_enter": "fCgrOeqKBOM",
    "il2cpp_monitor_try_enter": "yLGRpudYLBk",
    "il2cpp_monitor_exit": "zMdabSFMgua",
    "il2cpp_monitor_pulse": "XSkypOy_YfV",
    "il2cpp_monitor_pulse_all": "UWDGIMygvqE",
    "il2cpp_monitor_wait": "YLzLMHGWlVy",
    "il2cpp_monitor_try_wait": "PGHTxzaOLoL",
    "il2cpp_runtime_invoke": "zdhMZqJLmUg",
    "il2cpp_runtime_invoke_convert_args": "jhKCnWKQHVM",
    "il2cpp_runtime_class_init": "FWblMkQaNuJ",
    "il2cpp_runtime_object_init": "FounlxezYYj",
    "il2cpp_runtime_object_init_exception": "IQDCicMrAAh",
    "il2cpp_runtime_unhandled_exception_policy_set": "yeTYbBaRvhX",
    "il2cpp_string_length": "tzhsKMk_erj",
    "il2cpp_string_chars": "JbKXFKofDbk",
    "il2cpp_string_new": "HayoWStoOTy",
    "il2cpp_string_new_len": "TbXyWYRMSvr",
    "il2cpp_string_new_utf16": "ppAsBnWYob_",
    "il2cpp_string_new_wrapper": "uPXen_sQCpP",
    "il2cpp_string_intern": "pulQSbjdgGI",
    "il2cpp_string_is_interned": "SbYwzwrxQLE",
    "il2cpp_thread_current": "lKQVpyePKDk",
    "il2cpp_thread_attach": "YkLhnLonIZx",
    "il2cpp_thread_detach": "Rj_ORUfTKjy",
    "il2cpp_is_vm_thread": "liJGJwHegtr",
    "il2cpp_current_thread_walk_frame_stack": "_EZqFfVGPdv",
    "il2cpp_thread_walk_frame_stack": "JIm_rKHIojy",
    "il2cpp_current_thread_get_top_frame": "_dA_aBwYbzp",
    "il2cpp_thread_get_top_frame": "RwpqyZbVHrs",
    "il2cpp_current_thread_get_frame_at": "xJXtiGpXkXT",
    "il2cpp_thread_get_frame_at": "VVHpqqOJufn",
    "il2cpp_current_thread_get_stack_depth": "MvXKwcCFSEu",
    "il2cpp_thread_get_stack_depth": "RZWCWUquwMS",
    "il2cpp_override_stack_backtrace": "PIJvWxpPZcp",
    "il2cpp_type_get_object": "__aggEgsdVR",
    "il2cpp_type_get_type": "eSFdf_oAcwB",
    "il2cpp_type_get_class_or_element_class": "jq_ZCCwrxKF",
    "il2cpp_type_get_name": "MKrQf_BbDNm",
    "il2cpp_type_is_byref": "EpRDaYClGkl",
    "il2cpp_type_get_attrs": "pHxdxgwMdcA",
    "il2cpp_type_equals": "oQgGfpIk_Le",
    "il2cpp_type_get_assembly_qualified_name": "bJqsylwHDEZ",
    "il2cpp_type_get_reflection_name": "QuT_ZqaHeRr",
    "il2cpp_type_is_static": "vnsiHlJEMwe",
    "il2cpp_type_is_pointer_type": "DLCeNvnsSdb",
    "il2cpp_image_get_assembly": "oQuELENSelm",
    "il2cpp_image_get_name": "rCrwzAsBwWv",
    "il2cpp_image_get_filename": "vOIxvVNbrAm",
    "il2cpp_image_get_entry_point": "vJkLBOnXeAp",
    "il2cpp_image_get_class_count": "blKAcnmYlXB",
    "il2cpp_image_get_class": "ZEpVtNyyOCK",
    "il2cpp_capture_memory_snapshot": "qEnocNzysOD",
    "il2cpp_free_captured_memory_snapshot": "BNRtyQsRRxB",
    "il2cpp_set_find_plugin_callback": "NhTfN_TGsVc",
    "il2cpp_register_log_callback": "igOjhmfxSRP",
    "il2cpp_debugger_set_agent_options": "BGudxqjGPxv",
    "il2cpp_is_debugger_attached": "UjxoloeAr_l",
    "il2cpp_register_debugger_agent_transport": "RsTDRDmQChF",
    "il2cpp_debug_foreach_method": "tYtaR_wuIBG",
    "il2cpp_debug_get_method_info": "lSlzSWcZwDo",
    "il2cpp_unity_install_unitytls_interface": "JTsxuxPkKHY",
    "il2cpp_custom_attrs_from_class": "FYNAwziNHGw",
    "il2cpp_custom_attrs_from_method": "tQzmJTYLjqi",
    "il2cpp_custom_attrs_from_field": "KgGncDvQHBq",
    "il2cpp_custom_attrs_get_attr": "KwUHtQGnfjF",
    "il2cpp_custom_attrs_has_attr": "bVlbMepZwHc",
    "il2cpp_custom_attrs_construct": "UskivJNXhjm",
    "il2cpp_custom_attrs_free": "ApwGzuxX_Ay",
    "il2cpp_class_set_userdata": "EmdSjXwCQSu",
    "il2cpp_class_get_userdata_offset": "zASPdAUoGFZ",
    "il2cpp_set_default_thread_affinity": "wvEFDJGgLgG",
    "il2cpp_unity_set_android_network_up_state_func": "pQRyASQqVoh"
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
const __ORD = {
"il2cpp_init": 49,
    "il2cpp_init_utf16": 41,
    "il2cpp_shutdown": 95,
    "il2cpp_set_config_dir": 53,
    "il2cpp_set_data_dir": 72,
    "il2cpp_set_temp_dir": 58,
    "il2cpp_set_commandline_arguments": 67,
    "il2cpp_set_commandline_arguments_utf16": 213,
    "il2cpp_set_config_utf16": 224,
    "il2cpp_set_config": 197,
    "il2cpp_set_memory_callbacks": 35,
    "il2cpp_memory_pool_set_region_size": 245,
    "il2cpp_memory_pool_get_region_size": 164,
    "il2cpp_get_corlib": 158,
    "il2cpp_add_internal_call": 192,
    "il2cpp_resolve_icall": 237,
    "il2cpp_alloc": 251,
    "il2cpp_free": 182,
    "il2cpp_array_class_get": 130,
    "il2cpp_array_length": 133,
    "il2cpp_array_get_byte_length": 188,
    "il2cpp_array_new": 208,
    "il2cpp_array_new_specific": 104,
    "il2cpp_array_new_full": 81,
    "il2cpp_bounded_array_class_get": 91,
    "il2cpp_array_element_size": 142,
    "il2cpp_assembly_get_image": 145,
    "il2cpp_class_for_each": 82,
    "il2cpp_class_enum_basetype": 141,
    "il2cpp_class_is_inited": 5,
    "il2cpp_class_is_generic": 126,
    "il2cpp_class_is_inflated": 163,
    "il2cpp_class_is_assignable_from": 161,
    "il2cpp_class_is_subclass_of": 74,
    "il2cpp_class_has_parent": 242,
    "il2cpp_class_from_il2cpp_type": 124,
    "il2cpp_class_from_name": 194,
    "il2cpp_class_from_system_type": 109,
    "il2cpp_class_get_element_class": 103,
    "il2cpp_class_get_events": 201,
    "il2cpp_class_get_fields": 217,
    "il2cpp_class_get_nested_types": 84,
    "il2cpp_class_get_interfaces": 121,
    "il2cpp_class_get_properties": 66,
    "il2cpp_class_get_property_from_name": 184,
    "il2cpp_class_get_field_from_name": 61,
    "il2cpp_class_get_methods": 102,
    "il2cpp_class_get_method_from_name": 87,
    "il2cpp_class_get_name": 38,
    "il2cpp_type_get_name_chunked": 63,
    "il2cpp_class_get_namespace": 83,
    "il2cpp_class_get_parent": 68,
    "il2cpp_class_get_declaring_type": 119,
    "il2cpp_class_instance_size": 162,
    "il2cpp_class_num_fields": 196,
    "il2cpp_class_is_valuetype": 166,
    "il2cpp_class_value_size": 207,
    "il2cpp_class_is_blittable": 110,
    "il2cpp_class_get_flags": 205,
    "il2cpp_class_is_abstract": 227,
    "il2cpp_class_is_interface": 57,
    "il2cpp_class_array_element_size": 39,
    "il2cpp_class_from_type": 193,
    "il2cpp_class_get_type": 153,
    "il2cpp_class_get_type_token": 62,
    "il2cpp_class_has_attribute": 241,
    "il2cpp_class_has_references": 54,
    "il2cpp_class_is_enum": 172,
    "il2cpp_class_get_image": 235,
    "il2cpp_class_get_assemblyname": 112,
    "il2cpp_class_get_rank": 154,
    "il2cpp_class_get_data_size": 23,
    "il2cpp_class_get_static_field_data": 179,
    "il2cpp_stats_dump_to_file": 180,
    "il2cpp_stats_get_value": 21,
    "il2cpp_domain_get": 159,
    "il2cpp_domain_assembly_open": 1,
    "il2cpp_domain_get_assemblies": 48,
    "il2cpp_raise_exception": 129,
    "il2cpp_exception_from_name_msg": 183,
    "il2cpp_get_exception_argument_null": 191,
    "il2cpp_format_exception": 115,
    "il2cpp_format_stack_trace": 8,
    "il2cpp_unhandled_exception": 181,
    "il2cpp_native_stack_trace": 28,
    "il2cpp_field_get_flags": 146,
    "il2cpp_field_get_from_reflection": 85,
    "il2cpp_field_get_name": 165,
    "il2cpp_field_get_parent": 10,
    "il2cpp_field_get_object": 43,
    "il2cpp_field_get_offset": 155,
    "il2cpp_field_get_type": 200,
    "il2cpp_field_get_value": 59,
    "il2cpp_field_get_value_object": 151,
    "il2cpp_field_has_attribute": 174,
    "il2cpp_field_set_value": 156,
    "il2cpp_field_static_get_value": 139,
    "il2cpp_field_static_set_value": 108,
    "il2cpp_field_set_value_object": 236,
    "il2cpp_field_is_literal": 88,
    "il2cpp_gc_collect": 65,
    "il2cpp_gc_collect_a_little": 147,
    "il2cpp_gc_start_incremental_collection": 75,
    "il2cpp_gc_disable": 117,
    "il2cpp_gc_enable": 211,
    "il2cpp_gc_is_disabled": 77,
    "il2cpp_gc_set_mode": 233,
    "il2cpp_gc_get_max_time_slice_ns": 135,
    "il2cpp_gc_set_max_time_slice_ns": 214,
    "il2cpp_gc_is_incremental": 122,
    "il2cpp_gc_get_used_size": 44,
    "il2cpp_gc_get_heap_size": 203,
    "il2cpp_gc_wbarrier_set_field": 137,
    "il2cpp_gc_has_strict_wbarriers": 80,
    "il2cpp_gc_set_external_allocation_tracker": 24,
    "il2cpp_gc_set_external_wbarrier_tracker": 73,
    "il2cpp_gc_foreach_heap": 26,
    "il2cpp_stop_gc_world": 131,
    "il2cpp_start_gc_world": 40,
    "il2cpp_gc_alloc_fixed": 136,
    "il2cpp_gc_free_fixed": 4,
    "il2cpp_gchandle_new": 76,
    "il2cpp_gchandle_new_weakref": 71,
    "il2cpp_gchandle_get_target": 13,
    "il2cpp_gchandle_free": 175,
    "il2cpp_gchandle_foreach_get_target": 176,
    "il2cpp_object_header_size": 55,
    "il2cpp_array_object_header_size": 189,
    "il2cpp_offset_of_array_length_in_array_object_header": 69,
    "il2cpp_offset_of_array_bounds_in_array_object_header": 9,
    "il2cpp_allocation_granularity": 52,
    "il2cpp_unity_liveness_allocate_struct": 202,
    "il2cpp_unity_liveness_calculation_from_root": 221,
    "il2cpp_unity_liveness_calculation_from_statics": 125,
    "il2cpp_unity_liveness_finalize": 97,
    "il2cpp_unity_liveness_free_struct": 33,
    "il2cpp_method_get_return_type": 148,
    "il2cpp_method_get_declaring_type": 18,
    "il2cpp_method_get_name": 92,
    "il2cpp_method_get_from_reflection": 56,
    "il2cpp_method_get_object": 138,
    "il2cpp_method_is_generic": 230,
    "il2cpp_method_is_inflated": 22,
    "il2cpp_method_is_instance": 34,
    "il2cpp_method_get_param_count": 36,
    "il2cpp_method_get_param": 128,
    "il2cpp_method_get_class": 2,
    "il2cpp_method_has_attribute": 168,
    "il2cpp_method_get_flags": 232,
    "il2cpp_method_get_token": 170,
    "il2cpp_method_get_param_name": 249,
    "il2cpp_property_get_flags": 239,
    "il2cpp_property_get_get_method": 169,
    "il2cpp_property_get_set_method": 195,
    "il2cpp_property_get_name": 114,
    "il2cpp_property_get_parent": 167,
    "il2cpp_object_get_class": 17,
    "il2cpp_object_get_size": 222,
    "il2cpp_object_get_virtual_method": 105,
    "il2cpp_object_new": 218,
    "il2cpp_object_unbox": 226,
    "il2cpp_value_box": 107,
    "il2cpp_monitor_enter": 160,
    "il2cpp_monitor_try_enter": 243,
    "il2cpp_monitor_exit": 248,
    "il2cpp_monitor_pulse": 123,
    "il2cpp_monitor_pulse_all": 106,
    "il2cpp_monitor_wait": 127,
    "il2cpp_monitor_try_wait": 78,
    "il2cpp_runtime_invoke": 250,
    "il2cpp_runtime_invoke_convert_args": 177,
    "il2cpp_runtime_class_init": 29,
    "il2cpp_runtime_object_init": 32,
    "il2cpp_runtime_object_init_exception": 42,
    "il2cpp_runtime_unhandled_exception_policy_set": 244,
    "il2cpp_string_length": 223,
    "il2cpp_string_chars": 47,
    "il2cpp_string_new": 37,
    "il2cpp_string_new_len": 101,
    "il2cpp_string_new_utf16": 209,
    "il2cpp_string_new_wrapper": 225,
    "il2cpp_string_intern": 210,
    "il2cpp_string_is_interned": 100,
    "il2cpp_thread_current": 185,
    "il2cpp_thread_attach": 132,
    "il2cpp_thread_detach": 96,
    "il2cpp_is_vm_thread": 187,
    "il2cpp_current_thread_walk_frame_stack": 140,
    "il2cpp_thread_walk_frame_stack": 45,
    "il2cpp_current_thread_get_top_frame": 144,
    "il2cpp_thread_get_top_frame": 99,
    "il2cpp_current_thread_get_frame_at": 240,
    "il2cpp_thread_get_frame_at": 116,
    "il2cpp_current_thread_get_stack_depth": 64,
    "il2cpp_thread_get_stack_depth": 89,
    "il2cpp_override_stack_backtrace": 79,
    "il2cpp_type_get_object": 143,
    "il2cpp_type_get_type": 157,
    "il2cpp_type_get_class_or_element_class": 178,
    "il2cpp_type_get_name": 60,
    "il2cpp_type_is_byref": 27,
    "il2cpp_type_get_attrs": 204,
    "il2cpp_type_equals": 198,
    "il2cpp_type_get_assembly_qualified_name": 149,
    "il2cpp_type_get_reflection_name": 86,
    "il2cpp_type_is_static": 234,
    "il2cpp_type_is_pointer_type": 16,
    "il2cpp_image_get_assembly": 199,
    "il2cpp_image_get_name": 216,
    "il2cpp_image_get_filename": 231,
    "il2cpp_image_get_entry_point": 229,
    "il2cpp_image_get_class_count": 152,
    "il2cpp_image_get_class": 134,
    "il2cpp_capture_memory_snapshot": 212,
    "il2cpp_free_captured_memory_snapshot": 7,
    "il2cpp_set_find_plugin_callback": 70,
    "il2cpp_register_log_callback": 171,
    "il2cpp_debugger_set_agent_options": 6,
    "il2cpp_is_debugger_attached": 111,
    "il2cpp_register_debugger_agent_transport": 98,
    "il2cpp_debug_foreach_method": 220,
    "il2cpp_debug_get_method_info": 186,
    "il2cpp_unity_install_unitytls_interface": 46,
    "il2cpp_custom_attrs_from_class": 30,
    "il2cpp_custom_attrs_from_method": 219,
    "il2cpp_custom_attrs_from_field": 50,
    "il2cpp_custom_attrs_get_attr": 51,
    "il2cpp_custom_attrs_has_attr": 150,
    "il2cpp_custom_attrs_construct": 113,
    "il2cpp_custom_attrs_free": 3,
    "il2cpp_class_set_userdata": 25,
    "il2cpp_class_get_userdata_offset": 246,
    "il2cpp_set_default_thread_affinity": 238,
    "il2cpp_unity_set_android_network_up_state_func": 206,
};

// ----------------------------------------------------------------------------
// PE export-directory reader (ordinal-order, includes per-export address).
// Memory reads only - safe, never executes game code.
// In a loaded image an RVA is relative to the image base, so VA = base + rva
// (the section table's PointerToRawData is only meaningful when parsing a file).
// ----------------------------------------------------------------------------
function rvaToOffset(mod, rva) {
    try {
        if (rva > 0 && rva < mod.size) {
            return rva;
        }
    } catch (e) {}
    return null;
}

function readExports(mod) {
    const out = { byName: {}, byOrdinal: {}, list: [] };
    try {
        const base = mod.base;
        const dos = base.add(0x3c).readU32();
        const pe = base.add(dos);
        const magic = pe.add(24).readU16();
        const opt = pe.add(24);
        const dirOff = (magic === 0x20b) ? 112 : 96;
        const exportRVA = opt.add(dirOff).readU32();
        if (exportRVA === 0) return out;
        const edOff = rvaToOffset(mod, exportRVA);
        if (edOff === null) return out;
        const ed = base.add(edOff);
        const baseOrdinal = ed.add(16).readU32();
        const numFunctions = ed.add(20).readU32();
        const numNames = ed.add(24).readU32();
        const addrNamesOff = rvaToOffset(mod, ed.add(32).readU32());
        const addrOrdOff = rvaToOffset(mod, ed.add(36).readU32());
        const addrFuncsOff = rvaToOffset(mod, ed.add(28).readU32());
        if (addrNamesOff === null || addrOrdOff === null || addrFuncsOff === null) return out;
        const addrNames = base.add(addrNamesOff);
        const addrOrdinals = base.add(addrOrdOff);
        const addrFunctions = base.add(addrFuncsOff);
        for (let i = 0; i < numNames; i++) {
            let name = null;
            let fnRVA = 0;
            let ordinal = -1;
            try {
                const nameRVA = addrNames.add(i * 4).readU32();
                const nameOff = rvaToOffset(mod, nameRVA);
                name = (nameOff === null) ? null : base.add(nameOff).readUtf8String();
                ordinal = baseOrdinal + addrOrdinals.add(i * 2).readU16();
                if (ordinal >= 0 && ordinal < numFunctions) {
                    fnRVA = addrFunctions.add(ordinal * 4).readU32();
                }
            } catch (e) {}
            if (!name) continue;
            const entry = {
                ordinal: ordinal,
                name: name,
                address: (fnRVA ? base.add(fnRVA).toString() : "?"),
            };
            out.list.push(entry);
            out.byName[name] = entry;
            out.byOrdinal[ordinal] = entry;
        }
        out.list.sort(function (a, b) { return a.ordinal - b.ordinal; });
    } catch (e) {
        print("readExports ERR " + (e.message || e));
    }
    return out;
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
function runDump() {
    const mod = Process.findModuleByName("GameAssembly.dll");
    if (!mod) {
        print("GameAssembly.dll not found");
        return;
    }
    _openOutFile();
    const ex = readExports(mod);
    print("module=" + mod.name + " base=" + mod.base);
    print("live_exports=" + ex.list.length);

    // resolve canonical -> current obfuscated name
    // 1) name-first (embedded Set B still valid)
    // 2) ordinal fallback (game re-renamed, embedded __ORD knows the position)
    const resolved = {};
    const usedOrdinal = {};
    const stale = [];
    const seen = {};
    let ok = 0;
    for (const cn in __SYM) {
        let name = null;
        if (ex.byName[__SYM[cn]]) {
            name = __SYM[cn];
        } else if (__ORD[cn] !== undefined && ex.byOrdinal[__ORD[cn]]) {
            name = ex.byOrdinal[__ORD[cn]].name;
            usedOrdinal[cn] = true;
        }
        if (name) {
            resolved[cn] = name;
            ok++;
        } else {
            stale.push(cn);
        }
    }
    // update ordinal map from the live table
    const ord = {};
    for (const cn in resolved) {
        const e = ex.byName[resolved[cn]];
        ord[cn] = e ? e.ordinal : (__ORD[cn] !== undefined ? __ORD[cn] : -1);
    }

    print("resolved=" + ok + "/" + Object.keys(__SYM).length +
        (Object.keys(usedOrdinal).length ? " (via ordinal: " + Object.keys(usedOrdinal).length + ")" : ""));
    if (stale.length) {
        print("STALE_FOR_THIS_BUILD (" + stale.length + "): " + stale.join(","));
    }

    // ---------------- regenerate symbols.js ----------------
    const L = [];
    L.push("// Latest bridge (Set B, current build). Intercepts ANY Il2Cpp.$config.exports");
    L.push("// assignment (including bypass.js's stale Set A map) and rewrites every export");
    L.push("// to the current obfuscated name, so all 234 canonical names AND the old");
    L.push("// bridge-alias names (e.g. DgJvczsiGNm) resolve correctly.");
    L.push("// REGENERATED " + new Date().toISOString() + " from live GameAssembly.dll (" + ex.list.length + " exports)");
    L.push("(function () {");
    L.push("    \"use strict\";");
    L.push("    if (typeof Il2Cpp === \"undefined\" || !Il2Cpp) { return; }");
    L.push("    var SYM = {");
    for (const cn of Object.keys(__SYM)) {
        const obf = resolved[cn] !== undefined ? resolved[cn] : ("/* MISSING: " + __SYM[cn] + " */ ");
        L.push('        "' + cn + '": "' + obf + '",');
    }
    L.push("    };");
    L.push("    var BRIDGE = {");
    for (const cn of Object.keys(__BRIDGE)) {
        L.push('        "' + cn + '": "' + __BRIDGE[cn] + '",');
    }
    L.push("    };");
    L.push("    var aliasToCanonical = {};");
    L.push("    for (var cn in BRIDGE) { if (BRIDGE.hasOwnProperty(cn)) aliasToCanonical[BRIDGE[cn]] = cn; }");
    L.push("    function moduleFor() {");
    L.push("        try { return Il2Cpp.module || Process.findModuleByName(\"GameAssembly.dll\"); } catch (e) { return null; }");
    L.push("    }");
    L.push("    function makeResolver(obf) {");
    L.push("        return function () { var m = moduleFor(); return m ? m.findExportByName(obf) : null; };");
    L.push("    }");
    L.push("    Il2Cpp.$config = Il2Cpp.$config || {};");
    L.push("    var current = null;");
    L.push("    function refilter(assigned) {");
    L.push("        var entries = [];");
    L.push("        for (var k in assigned) { if (Object.prototype.hasOwnProperty.call(assigned, k)) entries.push([k, assigned[k]]); }");
    L.push("        for (var j = 0; j < entries.length; j++) {");
    L.push("            var key = entries[j][0], orig = entries[j][1];");
    L.push("            if (SYM[key]) { assigned[key] = makeResolver(SYM[key]); }");
    L.push("            else if (aliasToCanonical[key]) { assigned[key] = makeResolver(SYM[aliasToCanonical[key]]); }");
    L.push("            else { assigned[key] = orig; }");
    L.push("        }");
    L.push("        for (var cn in SYM) {");
    L.push("            if (SYM.hasOwnProperty(cn) && !Object.prototype.hasOwnProperty.call(assigned, cn)) assigned[cn] = makeResolver(SYM[cn]);");
    L.push("        }");
    L.push("        for (var al in aliasToCanonical) {");
    L.push("            if (aliasToCanonical.hasOwnProperty(al) && !Object.prototype.hasOwnProperty.call(assigned, al)) assigned[al] = makeResolver(SYM[aliasToCanonical[al]]);");
    L.push("        }");
    L.push("        current = assigned;");
    L.push("    }");
    L.push("    Object.defineProperty(Il2Cpp.$config, 'exports', {");
    L.push("        configurable: true,");
    L.push("        enumerable: true,");
    L.push("        get: function () { return current || (current = {}); },");
    L.push("        set: function (v) { refilter(v); },");
    L.push("    });");
    L.push("    Il2Cpp.$config.exports = {};");
    L.push("    var e = Il2Cpp.$config.exports;");
    L.push("    for (var c in SYM) { if (SYM.hasOwnProperty(c)) e[c] = makeResolver(SYM[c]); }");
    L.push("    for (var a in aliasToCanonical) { if (aliasToCanonical.hasOwnProperty(a)) e[a] = e[aliasToCanonical[a]]; }");
    L.push("})();");
    const out = L.join("\n") + "\n";

    // write file + console preview
    if (_outHandle) {
        _outHandle.write(out);
        _outHandle.flush();
    }
    // console preview: header + first entries (keeps frida output small)
    console.log("=== REGENERATED symbols.js ===");
    for (const cn of ["il2cpp_init", "il2cpp_get_corlib", "il2cpp_alloc", "il2cpp_thread_attach", "il2cpp_string_new", "il2cpp_domain_get"]) {
        if (resolved[cn] !== undefined) {
            console.log('    "' + cn + '": "' + resolved[cn] + '",' + (usedOrdinal[cn] ? "   // (via ordinal)" : ""));
        }
    }
    console.log("... total " + ok + " resolved / " + Object.keys(__SYM).length + " (set __SYMBOLS_OUT_FILE__ to write the full file)");
    console.log("=== SYMBOLS DUMP END ===");
    flush();
    _closeOutFile();
}

function boot() {
    const mod = Process.findModuleByName("GameAssembly.dll");
    if (mod) {
        try {
            runDump();
            return;
        } catch (e) {
            print("FATAL runDump: " + (e.message || e) + "\n" + (e.stack || ""));
            flush();
        }
    }
    if (Date.now() - (globalThis.__bootT0 || (globalThis.__bootT0 = Date.now())) > BOOT_TIMEOUT_MS) {
        print("SYMBOLS DUMP TIMEOUT: GameAssembly.dll never loaded");
        flush();
        return;
    }
    setTimeout(boot, 250);
}

try {
    boot();
} catch (e) {
    console.log("FATAL boot: " + (e.message || e) + "\n" + (e.stack || ""));
}
