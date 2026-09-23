//@ts-nocheck
// Animal Company — Full Mod Menu
// Single-file: edit here, everything updates.

declare const Il2Cpp: any;
declare const XRNode: any;
declare var Vector3: any;
declare var Time: any;
declare var NULL2: any;
declare function getInstance(): any;
declare function getGTPlayer(): any;
declare function getTransform(obj: any): any;
declare function getComponent(obj: any, type: any): any;
declare function safeField(obj: any, field: string): any;
declare function Destroy(obj: any): void;
declare var GBOClass: any;
declare var NetPlayer: any;
declare var console: any;

// ─── DISCORD WEBHOOK ────────────────────────────────────────────────────────
const WEBHOOK_URL = "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN";
const WEBHOOK_ENABLED = true;

function sendWebhook(title: string, desc: string, color: number = 0x00ff88) {
    if (!WEBHOOK_ENABLED || !WEBHOOK_URL || WEBHOOK_URL.includes("YOUR_ID")) return;
    try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", WEBHOOK_URL, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify({
            embeds: [{
                title,
                description: desc,
                color,
                timestamp: new Date().toISOString(),
                footer: { text: "Animal Company Mod Menu" }
            }]
        }));
    } catch(_) {}
}

// ─── OBFUSCATED SYMBOL MAP (build 25376285) ──────────────────────────────────
Il2Cpp.$config.exports = {
    il2cpp_init:                        () => Il2Cpp.module.findExportByName("yIwjkiyvpVU"),
    il2cpp_init_utf16:                  () => Il2Cpp.module.findExportByName("fBkGdQpGYRB"),
    il2cpp_shutdown:                    () => Il2Cpp.module.findExportByName("CfVkVfryGWk"),
    il2cpp_get_corlib:                  () => Il2Cpp.module.findExportByName("NALYFamTSGt"),
    il2cpp_add_internal_call:           () => Il2Cpp.module.findExportByName("vkE_lJJlSNf"),
    il2cpp_resolve_icall:               () => Il2Cpp.module.findExportByName("HoaWv_ASLvE"),
    il2cpp_alloc:                       () => Il2Cpp.module.findExportByName("fOjRSGQbIzJ"),
    il2cpp_free:                        () => Il2Cpp.module.findExportByName("iusVYbJfSrP"),
    il2cpp_array_class_get:             () => Il2Cpp.module.findExportByName("XhhXVNnRVLO"),
    il2cpp_array_length:                () => Il2Cpp.module.findExportByName("qsNChMPmfes"),
    il2cpp_array_get_byte_length:       () => Il2Cpp.module.findExportByName("LtRjdkb_ubi"),
    il2cpp_array_new:                   () => Il2Cpp.module.findExportByName("CaQyFnUnPsZ"),
    il2cpp_array_new_specific:          () => Il2Cpp.module.findExportByName("mmcXGaRmrqb"),
    il2cpp_array_new_full:              () => Il2Cpp.module.findExportByName("XvAkwrDjSJI"),
    il2cpp_bounded_array_class_get:     () => Il2Cpp.module.findExportByName("uikdsFCcAYr"),
    il2cpp_array_element_size:          () => Il2Cpp.module.findExportByName("c_SVjTaLTmZ"),
    il2cpp_assembly_get_image:          () => Il2Cpp.module.findExportByName("syzVvcPQQVL"),
    il2cpp_class_for_each:              () => Il2Cpp.module.findExportByName("qXNlqWHwjjw"),
    il2cpp_class_from_name:             () => Il2Cpp.module.findExportByName("TcbPTZr_xAg"),
    il2cpp_class_from_system_type:      () => Il2Cpp.module.findExportByName("NOTLL_rikYr"),
    il2cpp_class_get_element_class:     () => Il2Cpp.module.findExportByName("jzTEhyzbovM"),
    il2cpp_class_get_events:            () => Il2Cpp.module.findExportByName("NXOPZGxsKAK"),
    il2cpp_class_get_fields:            () => Il2Cpp.module.findExportByName("hhNAKrJsEzA"),
    il2cpp_class_get_nested_types:      () => Il2Cpp.module.findExportByName("TkbyFmdpWRu"),
    il2cpp_class_get_interfaces:        () => Il2Cpp.module.findExportByName("rGeUSxWWcid"),
    il2cpp_class_get_properties:        () => Il2Cpp.module.findExportByName("KKDgOcnXUDn"),
    il2cpp_class_get_field_from_name:   () => Il2Cpp.module.findExportByName("xulZhgwZJVU"),
    il2cpp_class_get_methods:           () => Il2Cpp.module.findExportByName("tYAPjpZKeir"),
    il2cpp_class_get_method_from_name:  () => Il2Cpp.module.findExportByName("yYEdHniCBcc"),
    il2cpp_class_get_name:              () => Il2Cpp.module.findExportByName("gsfHXCWPbeS"),
    il2cpp_class_get_namespace:         () => Il2Cpp.module.findExportByName("OFqHTaGRSPV"),
    il2cpp_class_get_parent:            () => Il2Cpp.module.findExportByName("dAuFHrb_ytt"),
    il2cpp_class_get_declaring_type:    () => Il2Cpp.module.findExportByName("pSPNyJKwJpq"),
    il2cpp_class_instance_size:         () => Il2Cpp.module.findExportByName("_qORughppWm"),
    il2cpp_class_num_fields:            () => Il2Cpp.module.findExportByName("MPzFgLdwHO_"),
    il2cpp_class_is_valuetype:          () => Il2Cpp.module.findExportByName("qFC_LQGafRg"),
    il2cpp_class_value_size:            () => Il2Cpp.module.findExportByName("pshMONxDbqI"),
    il2cpp_class_get_flags:             () => Il2Cpp.module.findExportByName("nIiWtLQEInE"),
    il2cpp_class_is_abstract:           () => Il2Cpp.module.findExportByName("YsAwKDZRBhl"),
    il2cpp_class_is_interface:          () => Il2Cpp.module.findExportByName("LuAGcENZvdH"),
    il2cpp_class_array_element_size:    () => Il2Cpp.module.findExportByName("BwFTioQHNeG"),
    il2cpp_class_from_type:             () => Il2Cpp.module.findExportByName("toges_kSMAk"),
    il2cpp_class_get_type:              () => Il2Cpp.module.findExportByName("TwndIPpwWbc"),
    il2cpp_class_is_generic:            () => Il2Cpp.module.findExportByName("yAYwrUBeP_t"),
    il2cpp_class_is_inflated:           () => Il2Cpp.module.findExportByName("NKsnTAnFZak"),
    il2cpp_class_get_image:             () => Il2Cpp.module.findExportByName("SgvLOT_iQgN"),
    il2cpp_class_get_assemblyname:      () => Il2Cpp.module.findExportByName("UKXghcfsZjk"),
    il2cpp_class_get_static_field_data: () => Il2Cpp.module.findExportByName("gCsMxgDhAlf"),
    il2cpp_class_is_assignable_from:    () => Il2Cpp.module.findExportByName("nVMtidLleIZ"),
    il2cpp_class_is_subclass_of:        () => Il2Cpp.module.findExportByName("dELBPwVQlht"),
    il2cpp_class_has_parent:            () => Il2Cpp.module.findExportByName("PWwojSrKJki"),
    il2cpp_class_has_attribute:         () => Il2Cpp.module.findExportByName("btBWEThVvWZ"),
    il2cpp_class_is_enum:               () => Il2Cpp.module.findExportByName("ciJPjQpeIOM"),
    il2cpp_field_get_flags:             () => Il2Cpp.module.findExportByName("IcQWVBayzqy"),
    il2cpp_field_get_name:              () => Il2Cpp.module.findExportByName("fqkMaOhhCaC"),
    il2cpp_field_get_parent:            () => Il2Cpp.module.findExportByName("cTdpWnEsyQQ"),
    il2cpp_field_get_offset:            () => Il2Cpp.module.findExportByName("ucuTsOCzyRy"),
    il2cpp_field_get_type:              () => Il2Cpp.module.findExportByName("bJzAWMfnWro"),
    il2cpp_field_get_value:             () => Il2Cpp.module.findExportByName("ttqcSMLIDHA"),
    il2cpp_field_get_value_object:      () => Il2Cpp.module.findExportByName("Liwcn_DqHUU"),
    il2cpp_field_set_value:             () => Il2Cpp.module.findExportByName("hTRyWPEiGhw"),
    il2cpp_field_static_get_value:      () => Il2Cpp.module.findExportByName("eRMtojunloe"),
    il2cpp_field_static_set_value:      () => Il2Cpp.module.findExportByName("bnpDTMtkKFC"),
    il2cpp_field_set_value_object:      () => Il2Cpp.module.findExportByName("zhsmGhoqOCO"),
    il2cpp_field_is_literal:            () => Il2Cpp.module.findExportByName("aVSwwitvnsD"),
    il2cpp_gc_collect:                  () => Il2Cpp.module.findExportByName("pNAnTYyjtQk"),
    il2cpp_gc_disable:                  () => Il2Cpp.module.findExportByName("iTROOvFWLyP"),
    il2cpp_gc_enable:                   () => Il2Cpp.module.findExportByName("HNDEVWMwQmG"),
    il2cpp_gc_is_disabled:              () => Il2Cpp.module.findExportByName("ZMqJeKlmrND"),
    il2cpp_gc_get_heap_size:            () => Il2Cpp.module.findExportByName("dFHIuNZWzhx"),
    il2cpp_gc_get_used_size:            () => Il2Cpp.module.findExportByName("ihQxbdbdMJ_"),
    il2cpp_gchandle_new:                () => Il2Cpp.module.findExportByName("aDYQiqQCdPh"),
    il2cpp_gchandle_new_weakref:        () => Il2Cpp.module.findExportByName("GzoEIsIYflu"),
    il2cpp_gchandle_get_target:         () => Il2Cpp.module.findExportByName("n_GdTGflrIW"),
    il2cpp_gchandle_free:               () => Il2Cpp.module.findExportByName("_aduCWroEpS"),
    il2cpp_domain_get:                  () => Il2Cpp.module.findExportByName("zhgb_frCSQd"),
    il2cpp_domain_get_assemblies:       () => Il2Cpp.module.findExportByName("IkxBqNUwJNm"),
    il2cpp_domain_assembly_open:        () => Il2Cpp.module.findExportByName("BLHpZgJiVAj"),
    il2cpp_image_get_class:             () => Il2Cpp.module.findExportByName("pJFbkfEiqPu"),
    il2cpp_image_get_class_count:       () => Il2Cpp.module.findExportByName("GirXlmUBjrV"),
    il2cpp_image_get_filename:          () => Il2Cpp.module.findExportByName("SyEbEaFUASz"),
    il2cpp_image_get_name:              () => Il2Cpp.module.findExportByName("lQyHinMJNhF"),
    il2cpp_method_get_class:            () => Il2Cpp.module.findExportByName("dIgAtEGhkOH"),
    il2cpp_method_get_declaring_type:   () => Il2Cpp.module.findExportByName("dIgAtEGhkOH"),
    il2cpp_method_get_name:             () => Il2Cpp.module.findExportByName("KkbMJEalJJy"),
    il2cpp_method_get_object:           () => Il2Cpp.module.findExportByName("yVhHMdAEDpP"),
    il2cpp_method_get_param_count:      () => Il2Cpp.module.findExportByName("tUFoIHFGaeI"),
    il2cpp_method_get_param:            () => Il2Cpp.module.findExportByName("sMMCkBMBFDO"),
    il2cpp_method_get_return_type:      () => Il2Cpp.module.findExportByName("bPNwAlKwmsc"),
    il2cpp_method_is_generic:           () => Il2Cpp.module.findExportByName("oBrJHxcFQiH"),
    il2cpp_method_is_inflated:          () => Il2Cpp.module.findExportByName("IYqZhafRmXi"),
    il2cpp_method_is_instance:          () => Il2Cpp.module.findExportByName("rcqJzKyMoHm"),
    il2cpp_object_get_class:            () => Il2Cpp.module.findExportByName("uflTKfBdJbF"),
    il2cpp_object_get_size:             () => Il2Cpp.module.findExportByName("qmtKhpkXtFD"),
    il2cpp_object_get_virtual_method:   () => Il2Cpp.module.findExportByName("LPdLYqcNLpe"),
    il2cpp_object_new:                  () => Il2Cpp.module.findExportByName("XuMVxVHwqbG"),
    il2cpp_object_unbox:                () => Il2Cpp.module.findExportByName("xFrRKtAzPVD"),
    il2cpp_value_box:                   () => Il2Cpp.module.findExportByName("MCQdgCMfEYp"),
    il2cpp_monitor_enter:               () => Il2Cpp.module.findExportByName("GsEcOtQHnnt"),
    il2cpp_monitor_try_enter:           () => Il2Cpp.module.findExportByName("tqfLWzIgMkV"),
    il2cpp_monitor_exit:                () => Il2Cpp.module.findExportByName("qcIbFanKCqx"),
    il2cpp_monitor_pulse:               () => Il2Cpp.module.findExportByName("aDnKBhGFfQv"),
    il2cpp_monitor_pulse_all:           () => Il2Cpp.module.findExportByName("tWmGAtKFfij"),
    il2cpp_monitor_wait:                () => Il2Cpp.module.findExportByName("oLjfFnnUZst"),
    il2cpp_monitor_try_wait:            () => Il2Cpp.module.findExportByName("wDMNGDkxvej"),
    il2cpp_runtime_invoke:              () => Il2Cpp.module.findExportByName("QdFKlZIfJWt"),
    il2cpp_runtime_invoke_convert_args: () => Il2Cpp.module.findExportByName("gYLNeMcHbij"),
    il2cpp_runtime_class_init:          () => Il2Cpp.module.findExportByName("qqVRkSWcRAq"),
    il2cpp_runtime_object_init:         () => Il2Cpp.module.findExportByName("iFICOFlMkXF"),
    il2cpp_runtime_object_init_exception:()=> Il2Cpp.module.findExportByName("ARSuAzOcFHy"),
    il2cpp_string_new:                  () => Il2Cpp.module.findExportByName("iXlnTkMJFiE"),
    il2cpp_string_new_len:              () => Il2Cpp.module.findExportByName("EoFgRjwLqGG"),
    il2cpp_string_new_utf16:            () => Il2Cpp.module.findExportByName("mhQTFTwdTEg"),
    il2cpp_string_new_wrapper:          () => Il2Cpp.module.findExportByName("XdgCZCwQkfU"),
    il2cpp_string_chars:                () => Il2Cpp.module.findExportByName("TmNrJOqJHGX"),
    il2cpp_string_length:               () => Il2Cpp.module.findExportByName("LLXWlFRpTJu"),
    il2cpp_type_get_object:             () => Il2Cpp.module.findExportByName("bnNPstmJjZI"),
    il2cpp_type_get_type:               () => Il2Cpp.module.findExportByName("dDiXbJdYqiS"),
    il2cpp_type_get_class_or_element_class: () => Il2Cpp.module.findExportByName("yioklEqnWSD"),
    il2cpp_type_is_byref:               () => Il2Cpp.module.findExportByName("FnYbhfZNVtl"),
    il2cpp_type_get_attrs:              () => Il2Cpp.module.findExportByName("HMlkXJnIIqA"),
    il2cpp_type_equals:                 () => Il2Cpp.module.findExportByName("kJsZyVJimMl"),
    il2cpp_type_get_name:               () => Il2Cpp.module.findExportByName("UvvfzBJCfex"),
    il2cpp_type_is_pointer_type:        () => Il2Cpp.module.findExportByName("FZhNcMGRqLI"),
    il2cpp_thread_current:              () => Il2Cpp.module.findExportByName("CLthNvjqiVN"),
    il2cpp_thread_attach:               () => Il2Cpp.module.findExportByName("qEFUSiqxbCO"),
    il2cpp_thread_detach:               () => Il2Cpp.module.findExportByName("JOTcPZhbTaV"),
    il2cpp_thread_get_all_attached_threads: () => Il2Cpp.module.findExportByName("TSUVsHCDKWP"),
    il2cpp_is_vm_thread:                () => Il2Cpp.module.findExportByName("bsqIyYRiHbC"),
    il2cpp_current_thread_walk_frame_stack: () => Il2Cpp.module.findExportByName("SKRDolzSqHj"),
    il2cpp_thread_walk_frame_stack:     () => Il2Cpp.module.findExportByName("eRdKGrFwxIm"),
    il2cpp_current_thread_get_top_frame:() => Il2Cpp.module.findExportByName("uOFlnVGNHOq"),
    il2cpp_thread_get_top_frame:        () => Il2Cpp.module.findExportByName("ZhvYnrSJgFf"),
    il2cpp_current_thread_get_frame_at: () => Il2Cpp.module.findExportByName("TFPEzQoSXJm"),
    il2cpp_thread_get_frame_at:         () => Il2Cpp.module.findExportByName("WEdNnARePZy"),
    il2cpp_current_thread_get_stack_depth: () => Il2Cpp.module.findExportByName("GiHEsOhfLNT"),
    il2cpp_thread_get_stack_depth:      () => Il2Cpp.module.findExportByName("UdNkzMifbfT"),
    il2cpp_override_stack_backtrace:    () => Il2Cpp.module.findExportByName("SFTJylcRmGQ"),
    il2cpp_profiler_install:            () => Il2Cpp.module.findExportByName("EbHKMqoFpVD"),
    il2cpp_profiler_set_events:         () => Il2Cpp.module.findExportByName("lhDPVEqPVvS"),
    il2cpp_profiler_install_enter_leave:() => Il2Cpp.module.findExportByName("ZhWexHRxKOc"),
    il2cpp_profiler_install_allocation:  () => Il2Cpp.module.findExportByName("iZNQGOTOvyb"),
    il2cpp_profiler_install_gc:         () => Il2Cpp.module.findExportByName("EvaSHouyiRE"),
    il2cpp_profiler_install_fileio:     () => Il2Cpp.module.findExportByName("LHRsExlDkex"),
    il2cpp_profiler_install_thread:     () => Il2Cpp.module.findExportByName("LJdxHiWlPGr"),
    il2cpp_class_get_image:             () => Il2Cpp.module.findExportByName("SgvLOT_iQgN"),
};

// ─── FLAT STATE VARIABLES ────────────────────────────────────────────────────
var prevRightGrab: boolean = false;
var prevLeftGrab: boolean = false;
var prevLeftTrigger: boolean = false;
var prevRightTrigger: boolean = false;

// VR input state
let leftGrab = false, rightGrab = false;
let leftTrigger = false, rightTrigger = false;
let leftStickX = 0.0, leftStickY = 0.0;
let rightStickX = 0.0, rightStickY = 0.0;
let leftGrabHeld = false, rightGrabHeld = false;

// PC mode
let _pcMode = false;
let _pcFlyEnabled = false;
let _pcMenuOpen = false;
let _pcYaw = 0.0, _pcPitch = 0.0;

// Menu state
let menuOpen = false;
let menuPage = 0;
let menuSubPage = 0;
let menuIndex = 0;
let menuNeedsRebuild = false;
let menuName: string = "Mod Menu";

// Notifications
let currentNotification: string = "";
let notifactionResetTime: number = 0;
let buttonNotifications: boolean = true;

// Theme
let bgColor = [0.05, 0.05, 0.08, 1.0];
let textColor = [1.0, 1.0, 1.0, 1.0];
let buttonColor = [0.1, 0.1, 0.18, 1.0];
let buttonPressedColor = [0.2, 0.2, 0.4, 1.0];
let themeIndex = 0;

// ── Movement ─────────────────────────────────────────────────────────────────
let flyEnabled = false;
let flySpeed = 10.0;
let flySpeedMult = 1.0;
let noClipEnabled = false;
let speedBoostEnabled = false;
let speedBoostMult = 3.0;
let superJumpEnabled = false;
let superJumpForce = 15.0;
let highJumpEnabled = false;
let bhopEnabled = false;
let freezeEnabled = false;
let tpToGroundEnabled = false;
let fastClimbEnabled = false;
let climbSpeed = 3.0;
let vehicleBoostEnabled = false;
let vehicleBoostMult = 3.0;
let lowGravityEnabled = false;
let gravityMult = 0.3;
let diveEnabled = false;
let slideEnabled = false;
let rocketJumpEnabled = false;
let teleportEnabled = false;
let waypoint: any = null;
let checkpointPos: any = null;
let launchPowerEnabled = false;
let launchPower = 20.0;
let sprintEnabled = false;
let sprintMult = 2.0;
let longJumpEnabled = false;
let platformSurfEnabled = false;
let walkOnWaterEnabled = false;

// ── Player Mods ──────────────────────────────────────────────────────────────
let godModeEnabled = false;
let infHealthEnabled = false;
let healthVal = 2000;
let infStaminaEnabled = false;
let infOxygenEnabled = false;
let infHungerEnabled = false;
let infThirstEnabled = false;
let antiBan = false;
let antiKick = false;
let antiRpcBlock = false;
let rpcProtectionEnabled = true;
let blockRPCEnabled = false;
let scaleEnabled = false;
let scaleVal = 1.0;
let bigHeadEnabled = false;
let headScaleVal = 3.0;
let hueEnabled = false;
let hueVal = 0.0;
let satVal = 1.0;
let fakeDieEnabled = false;
let respawnEnabled = false;
let invisEnabled = false;
let noFallDamageEnabled = false;
let invincibleEnabled = false;
let superPunchEnabled = false;
let punchForce = 25.0;
let highPunchPower = false;
let ragdollEnabled = false;
let stealthEnabled = false;
let jellyVal = 0.0;
let jellywowes = 5.0;
let lightEnabled = false;
let checkpointSet = false;
let unlockAllEnabled = false;
let devModeEnabled = false;
let localPlayerIdCache: any = null;

// ── Items & Spawning ──────────────────────────────────────────────────────────
let itemSpawnEnabled = false;
let itemIndex = 0;
let prefabListIndex = 0;
let currentItemIndex = 0;
let currentWorldPrefabIndex = 0;
let stashDupeEnabled = false;
let itemGunEnabled = false;
let itemGunDelay = 0;
let randomAllItemsEnabled = false;
let randomAllItemsDelay = 0;
let itemOrbitEnabled = false;
let prefabOrbitCount = 3;
let spawnAtTargetEnabled = false;
let spawnTarget: any = null;
let autoSpawnEnabled = false;
let autoSpawnDelay = 0;
let stackSpawnEnabled = false;
let stackSpawnCount = 10;
let spawnRadius = 2.0;
let itemRainEnabled = false;
let itemRainDelay = 0;
let prefabGunEnabled = false;
let worldPrefabGunEnabled = false;
let huespawner = 0.0, saturationspawner = 0.0, sizespawner = 0.0, jellyspawner = 0.0;

// ── Weapons ───────────────────────────────────────────────────────────────────
let infAmmoEnabled = false;
let noReloadEnabled = false;
let fullAutoEnabled = false;
let rapidFireEnabled = false;
let laserAccuracyEnabled = false;
let noBulletDropEnabled = false;
let explosiveBulletsEnabled = false;
let multiShotEnabled = false;
let multiShotCount = 5;
let bulletSpeedMult = 3.0;
let meleeRangeEnabled = false;
let meleeRangeMult = 3.0;
let meleeSpeedEnabled = false;
let meleeSpeedMult = 2.0;
let oneHitKillEnabled = false;
let aimBotEnabled = false;
let silentAimEnabled = false;
let throughWallsEnabled = false;
let itemGrabRangeEnabled = false;
let grabRangeMult = 5.0;
let autoPickupEnabled = false;
let throwForceEnabled = false;
let throwForceMult = 5.0;
let noDropEnabled = false;
let holdAllItemsEnabled = false;
let dualWieldEnabled = false;
let weaponModsEnabled = false;

// ── Mobs ──────────────────────────────────────────────────────────────────────
let mobIndex = 0;
let mobGunEnabled = false;
let mobGunDelay = 0;
let mobGunDelay2 = 0;
let mobSpawnButtonLatched = false;
let persistentMobsEnabled = false;
let mobForceStayEnabled = false;
let acMobValidatorBypassEnabled = false;
let acBeforeMobSpawnDelegate: any = null;
let acBeforeMobSpawnDelegateClass: any = null;
let acNetworkObjectSpawnDelegateRef: any = null;
let spawnedPersistentMobs: any[] = [];
let persistentMobEntries: any[] = [];
let mobSpawnAsyncBroken = false;
let mobAuraEnabled = false;
let mobAuraDelay = 0;
let mobAuraMobIndex = 0;
let mobKillAllEnabled = false;
let mobFreezeEnabled = false;
let mobTameEnabled = false;
let mobSpeedEnabled = false;
let mobSpeedMult = 2.0;
let bossSpawnEnabled = false;
let hordeEnabled = false;
let hordeSize = 10;
let mobRainEnabled = false;
let mobRainDelay = 0;

// ── Economy ───────────────────────────────────────────────────────────────────
let fakeRpEnabled = false;
let fakeCoinEnabled = false;
let fakeRpAmount = 100;
let fakeCoinAmount = 100;
let coinGunEnabled = false;
let rpGunEnabled = false;
let autoSellEnabled = false;
let shopHackEnabled = false;
let freeShopEnabled = false;
let moneyMultEnabled = false;
let moneyMult = 2.0;
let walletHackEnabled = false;
let walletVal = 99999;
let collectAllMoneyEnabled = false;
let autoPickupCoinsEnabled = false;
let expMultEnabled = false;
let expMult = 2.0;

const fakeEarnSfxIds = { rp: 609, coin: 485, nut: 485, xp: 485 };

// ── Players / Social ──────────────────────────────────────────────────────────
let playerListEnabled = false;
let teleportToPlayerEnabled = false;
let teleportTargetIndex = 0;
let orbitPlayerEnabled = false;
let orbitTarget: any = null;
let orbitRadius = 3.0;
let followPlayerEnabled = false;
let followTarget: any = null;
let followDist = 2.0;
let kickGunEnabled = false;
let kickGunTarget: any = null;
let banGunEnabled = false;
let cloneEnabled = false;
let cloneCount = 3;
let ghostEnabled = false;
let ghostFollowEnabled = false;
let ghostFollowIndex = 0;
let rpGunTargetIndex = -1;
let coinGunTargetIndex = -1;
let stinkyGunEnabled = false;
let colorGunEnabled = false;
let scaleGunEnabled = false;
let jellyGunEnabled = false;
let tagGunEnabled = false;
let tagGunDelay = 0.0;
let idGunEnabled = false;
let idGunDelay = 0.0;
let splashGunEnabled = false;
let splashDelay = 0.0;
let lagGunEnabled = false;
let lagGunDelay = 0.0;
let yeetEnabled = false;
let yeetForce = 20.0;
let grabPlayerEnabled = false;
let attachPlayerEnabled = false;
let forcePlatformEnabled = false;
let forceColorEnabled = false;
let forceColorR = 1.0, forceColorG = 0.0, forceColorB = 0.0;
let broadcastEnabled = false;
let broadcastMsg = "";
let spamChatEnabled = false;
let spamMsg = "";
let spamDelay = 0;
let voiceSpamEnabled = false;
let platformLeft: any = null, platformRight: any = null;
let movementPlatformLeft: any = null, movementPlatformRight: any = null;

// Whitelist
let whitelist: string[] = [];
let whitelistEnabled: boolean = true;
let whitelistTarget: any = null;
let wlPissTarget: any = null;
let wlRpgTarget: any = null;

// ── Visual / Rendering ────────────────────────────────────────────────────────
let espEnabled = false;
let espBoxes = false;
let espNames = false;
let espDistance = false;
let espHealth = false;
let wireframeEnabled = false;
let fullBrightEnabled = false;
let fullBrightObject: any = null;
let nightVisionEnabled = false;
let fovEnabled = false;
let fovVal = 90.0;
let antialiasingEnabled = false;
let ambientColorEnabled = false;
let ambR = 1.0, ambG = 1.0, ambB = 1.0;
let skyboxEnabled = false;
let skyboxIndex = 0;
let fogEnabled = false;
let fogDensity = 0.01;
let fogColorR = 0.5, fogColorG = 0.5, fogColorB = 0.5;
let lineVisualizerEnabled = false;
let visualizer: any[] = [];
let handTextObj: any = null;
let handTextEnabled = false;
let handTextStr = "hi";
let sphereEnabled = false;
let mylittleSphere: any = null;
let lineRenderHolder: any = null;
let isLineRenderQueued = false;
let linePool: any[] = [];

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioSpamEnabled = false;
let audioManager: any = null;
let muteSoundEnabled = false;
let pitchEnabled = false;
let pitchVal = 1.0;
let echoEnabled = false;
let reverbEnabled = false;
let distortionEnabled = false;
let boomboxSpamEnabled = false;
let customTrackEnabled = false;
let micFilterEnabled = false;

// ── World / Map ────────────────────────────────────────────────────────────────
let timeScaleEnabled = false;
let timeScaleVal = 1.0;
let weatherEnabled = false;
let weatherIndex = 0;
let teleportHubEnabled = false;
let mapHackEnabled = false;
let radarEnabled = false;
let unlockDoorsEnabled = false;
let destroyPropsEnabled = false;
let spawnBonfireEnabled = false;
let triggerBossEnabled = false;
let activateAllTerminalsEnabled = false;
let propScanEnabled = false;
let roomSizeEnabled = false;
let infiniteRegionEnabled = false;

// ── Networking ─────────────────────────────────────────────────────────────────
let networkSpamEnabled = false;
let packetSpamEnabled = false;
let sessionCrashEnabled = false;
let masterServerEnabled = false;
let lagEnabled = false;
let lagDelay = 0;
let disconnectAllEnabled = false;
let hostMigrationEnabled = false;
let fakeHostEnabled = false;
let ghostModeEnabled = false;
let roomJoinAttempted = false;
let waitingForRoom = false;
let roomCheckInterval: any = null;

// ── Anti-cheat / Protection ────────────────────────────────────────────────────
let banHookInstalled = false;
let kickHookInstalled = false;
let banPublicHookInstalled = false;
let kickPublicHookInstalled = false;
let originalBanPrivateMethod: any = null;
let originalBanPublicMethod: any = null;
let originalKickPublicMethod: any = null;
let originalRPCKickMethod: any = null;
let antiRpcBlockHooksInstalled = false;
let _origRPCHooks: any = {};
let _origRPCBackup: any = {};
let _selfRPCBypass: boolean = false;
let rpcBlockedCount: number = 0;
let _localPlayerId: any = null;
let antiGoopfishEnabled = false;
let antiGoopfishRadius = 3.0;
let antiGoopfishDelay = 0;
let antiGoopfishScanDelay = 0;

// ── Dupe / Stash ───────────────────────────────────────────────────────────────
const ejectDupeValues = [1, 2, 5, 10, 25, 64, 100, 128];
let dupeIndex = 0;
let stashDupeDelay = 0;
let dupeRigEnabled = false;
let dupeRigCount = 3;
let dupeOrbitEnabled = false;

// ── Ghost / Follower ──────────────────────────────────────────────────────────
let isGhostFollowingActive = false;
let currentPlayerIndex = 0;
let lastSwitchTime = 0;
let netPlayers: any[] = [];
let cachedGhostPos = { head: null, leftHand: null, rightHand: null };
let closePosition: any = null;

// ── Misc ──────────────────────────────────────────────────────────────────────
let breakingGame = false;
let lastTime = 0.0;
let time = 0.0;
let oldSlide: any = null;
let rumbleEnabled = false;
let rumbleLoopRunning = false;
let followObject: any = null;
let walkPos: any = null;
let walkNormal: any = null;
let checkpoint: any = null;
let lvT: any = null, rvT: any = null;
let righthand = false;
let menuCollision = false;
let LPrev: any, RPrev: any, LVel: any, RVel: any, AvgVel: any;

// ─── ITEM / PREFAB LISTS ──────────────────────────────────────────────────────
const itemIDs = [
"item_ac_cola","item_alien_cube","item_alienblaster","item_alphablade","item_ampbattery",
"item_ampbattery_mega","item_animal_bot_gorilla","item_animal_bot_kitten","item_animal_bot_shark",
"item_animal_bot_shepherd","item_animal_bot_trex","item_anti_gravity_grenade","item_apescalibur",
"item_apple","item_arena_pistol","item_arena_shotgun","item_arrow","item_arrow_bomb",
"item_arrow_heart","item_arrow_lightbulb","item_arrow_teleport","item_axe","item_axe_blood",
"item_backpack","item_backpack_black","item_backpack_dragon","item_backpack_fish",
"item_backpack_frog","item_backpack_gold","item_backpack_green","item_backpack_large_base",
"item_backpack_large_basketball","item_backpack_large_clover","item_backpack_monkey",
"item_backpack_pink","item_backpack_realistic","item_backpack_small_base","item_backpack_space",
"item_backpack_white","item_backpack_with_flashlight","item_balloon","item_balloon_heart",
"item_balloon_smiley","item_bamboo_fishing_rod","item_banana","item_banana_chips",
"item_baseball_bat","item_basic_fishing_rod","item_beans","item_big_cup","item_bighead_larva",
"item_black_morph_axe","item_bloodlust_vial","item_blox_cube","item_blox_moon","item_blox_sphere",
"item_blox_star","item_blox_triangle","item_blue_morph_sais","item_boombox","item_boombox_fishing",
"item_boombox_neon","item_boomerang","item_box_fan","item_brain_chunk","item_brainslug_blue",
"item_brainslug_green","item_brainslug_pink","item_broccoli_grenade","item_broccoli_shrink_grenade",
"item_broom","item_bubble_gun","item_bubble_staff","item_burrito","item_butcherpipe",
"item_butchersword","item_c4_explosive","item_calculator","item_canopycard_fishinglake",
"item_canopycard_hell","item_canopycard_momboss","item_canopycard_shadowboss",
"item_canopycard_station_1","item_canopycard_station_2","item_canopycard_station_3",
"item_cardboard_box","item_carrot","item_chakra","item_clapper","item_cluster_grenade",
"item_cola","item_cola_large","item_company_ration","item_company_ration_heal","item_crate",
"item_crossbow","item_crossbow_heart","item_crowbar","item_crowbar_gold","item_cube_frame",
"item_cubetrident","item_d20","item_deadmans_draw","item_demon_sword","item_disc",
"item_disposable_camera","item_dna_vial","item_dragons_claw","item_drill","item_drill_fists",
"item_drill_galaxy","item_drill_neon","item_dwarven_hammer","item_dynamite","item_dynamite_cube",
"item_easter_egg","item_egg","item_energy_axe","item_energy_sword_dual","item_energy_sword_green",
"item_energy_sword_red","item_eraser","item_film_reel","item_finger_board","item_fish_anglerfish",
"item_fish_big_shark","item_fish_boomfish","item_fish_boot","item_fish_carp","item_fish_chewna",
"item_fish_cowfish","item_fish_crappie","item_fish_dragonfish","item_fish_fishsword",
"item_fish_ghost_sword","item_fish_gold_fish","item_fish_hydracarp","item_fish_irontusk",
"item_fish_magma_carp","item_fish_nebula_fish","item_fish_pufferfish","item_fish_rainbow_trout",
"item_fish_salmon","item_fish_salmonster","item_fish_seahorse","item_fish_tuna",
"item_fish_yellowcake","item_flamethrower","item_flamethrower_skull","item_flaregun",
"item_flashbang","item_flashlight","item_flashlight_galaxy","item_flashlight_mega",
"item_football","item_four_leaf_clover","item_four_leaf_clover_gold","item_four_leaf_radar",
"item_friend_launcher","item_frying_pan","item_fungi_blue","item_fungi_red","item_gameboy",
"item_glitched_banana","item_glowing_fishing_rod","item_glowstick","item_goldbar","item_goldcoin",
"item_goop","item_goopfish","item_grappling_hook","item_great_sword","item_great_sword_galaxy",
"item_grenade","item_grenade_gold","item_grenade_launcher","item_grimstaff",
"item_guided_boomerang","item_hammer_candy_cane","item_harddrive","item_hatchet",
"item_heart_chunk","item_heart_gun","item_hermes_staff","item_hh_key","item_hookshot",
"item_hookshot_galaxy","item_hookshot_gold","item_hookshot_sword","item_hot_cocoa",
"item_hoverboard","item_hoverboard_pink","item_hoverboard_sky","item_hoverpad",
"item_hoverpad_galaxy","item_hydra","item_impulse_grenade","item_jetpack","item_joystick",
"item_katana_big","item_katana_medium","item_keycard","item_lance","item_landmine",
"item_landmine_bee","item_large_banana","item_lava_fishing_rod","item_love_grenade",
"item_mage_pirate_sword","item_mannequin_arm_left","item_mannequin_arm_right",
"item_mannequin_head","item_mannequin_leg_left","item_mannequin_torso","item_megaphone",
"item_metal_ball","item_metal_plate","item_metal_rod","item_mining_laser",
"item_mining_laser_orange","item_module_blast_1","item_module_boost_1","item_module_gun_1",
"item_module_hull_1","item_module_laser_1","item_module_minigun_1","item_moneygun",
"item_moonrock","item_moonrock_cheesy","item_mug","item_needle","item_nut","item_ogre_hands",
"item_omega_blade","item_orange","item_ore_copper_l","item_ore_copper_m","item_ore_copper_s",
"item_ore_gold_l","item_ore_gold_m","item_ore_gold_s","item_ore_silver_l","item_ore_silver_m",
"item_ore_silver_s","item_painters_tape","item_painting_canvas","item_pickaxe",
"item_pickaxe_cube","item_pickaxe_realistic","item_pickaxe_spacedwarf","item_pinata_bat",
"item_pineapple","item_pipe","item_pistol_dragon","item_plank","item_plate_round","item_plunger",
"item_pogostick","item_police_baton","item_popcorn","item_portable_safe_zone",
"item_portable_teleporter","item_prismatic_anomaly","item_prop_scanner","item_pumpkin_bomb",
"item_pumpkinjack","item_pyramidal_anomaly","item_quest_vhs_forest","item_quest_vhs_hell",
"item_quest_vhs_moon","item_quest_vhs_mountain","item_quiver","item_quiver_heart",
"item_radiation_gun","item_radioactive_broccoli","item_radioactive_fishing_rod",
"item_rare_card","item_red_morph_sword","item_remote_controller","item_repair_wrench",
"item_revolver","item_revolver_gold","item_ring_buoy","item_ringmaster_staff","item_robo_dino",
"item_robo_monke","item_rope","item_rpg","item_rpg_ammo","item_rpg_cny","item_rpg_easter",
"item_rpg_shoe","item_rpg_spear","item_rubberducky","item_ruby","item_saddle",
"item_salmoncannon","item_sawblade","item_sawblade_launcher","item_scanner","item_scissors",
"item_server_pad","item_shadowboss_key","item_shield","item_shield_bones","item_shield_galaxy",
"item_shield_police","item_shield_spartan","item_shotgun","item_shotgun_ammo","item_shotgun_gold",
"item_shotgun_sawed","item_shovel","item_shredder","item_shrinking_broccoli","item_skipole",
"item_skishoe","item_snowball","item_snowboard","item_snowboard_galaxy","item_soccer_ball",
"item_spear_spartan","item_special_fishing_rod","item_stake","item_stapler","item_stash_grenade",
"item_steel_beam","item_steelchair","item_stellarsword_blue","item_stellarsword_gold",
"item_stick_bone","item_sticker_dispenser","item_sticky_dynamite","item_sticky_dynamite_gold",
"item_stinky_cheese","item_stopwatch","item_tablet","item_tapedispenser","item_tele_grenade",
"item_tele_pearl","item_teleport_dagger","item_teleport_gun","item_teleport_gun_galaxy",
"item_theremin","item_timebomb","item_toilet_paper","item_toilet_paper_mega",
"item_tomato","item_train_whistle","item_trampoline","item_treestick","item_tripwire_explosive",
"item_trophy","item_turkey_leg","item_turkey_whole","item_ukulele","item_ukulele_gold",
"item_umbrella","item_umbrella_clover","item_unidentified","item_upsidedown_loot",
"item_uranium_chunk_l","item_viking_hammer","item_viking_hammer_twilight","item_vuvuzela",
"item_war_fan","item_water_balloon_blue","item_water_balloon_red","item_water_gun_blue",
"item_water_gun_red","item_water_massive_super_soaker","item_wireframe_cube","item_wireframe_gun",
"item_wood_log","item_wood_pallet","item_wooden_stool","item_wyrmpiercer",
"item_yellow_morph_dagger","item_zipline_gun","item_zombie_meat"
];

const prefabIDs: string[] = [
"AlienCube_Spawner","AnglerController","AnglerMadController","AnomalySpawner",
"ArmstrongController","ArmstrongControllerSpace","ArmstrongMadController","BansheeController",
"BarrelBeansDynamic","BarrelExplodingDynamic","BarrelOilDynamic","Basketball","BigBanana",
"BigHeadController","BigSharkController","BlobController","BombController","BomberController",
"BomberFlashbangController","BomberMadController","BonfireController","ChickenController",
"CutieController","CystController","DiggableGrave","DummyPlayerTarget","DummyTarget",
"Duplicator","EasterEgg_LocalSpawner","EdenZombieController","EvilEyeController",
"EvilEyePinataController","EvilEyePinataLargeController","ExplosiveEgg","ExplosiveEggClustered",
"FakeGorillaController","FlareGunProjectile","FlyingSwarmController","ForestMobController",
"FuelCanisterNetObject","FuelCanisterSpawner","GenericWorldItemSpawner","GiantController",
"GiantRockObject","GiantRockObject_Fire","GlitchedGorillaController","GrabbedGhostHandL",
"GrabbedGhostHandR","GreenscreenNET","GrenadeProjectile","HellAltar","HordeMobController",
"HordeMobLobbyHandler","InflatedBalloon","InflatedHeartBalloon","InflatedSmileyBalloon",
"LakePineapple_Spawner","Landmine","LankyController","LaserMirror","LaserSink","LaserSource",
"LootLantern","MarshmallowBunny","Mausoleum_01","MetaCameraControls","MimicController",
"MimicSpawner_Base","MomToyBlockObject","MoonRaceController","MountainKey_Spawner",
"MovieTheater","MurderBunnyController","MurderRabbitController","NervousNellieController",
"Net","NetLootSpawnGroup","NetMobSpawnGroup","NetPlayer","NetSpectator","NextBotController",
"NextBotStaticController","OreSpawnManager","PhantomController","Podium","PuppetController",
"RaceTrack_Circle","RamEventNet","RedGreenController","RedGreenMadController",
"RegionStreamer","remote_controller_receiver","RiggedPlank","RingmasterController",
"RoboMonkeController","RobotDogController","RobotDogRPG","RPGRocket","RPGRocketEgg",
"RPGRocketShoe","RPGRocketSpear","ScaffoldTrap","SegwayController","ShadowBossController",
"ShadowController","SharkScareTriggerObject","SkinwalkerController","SkiRaceController",
"SlimeyController","SmileyController","SmileyController_Floating","Snail_Spawner",
"SoccerFieldManager","SpawnableZipline","SpiderCaveController","SpiderController",
"TeleportationManager","ThunderController","TomatoSpawn","TubeMonster","UFO_Easy",
"UFO_Hard","UFO_Medium","Vehicle_Buggy","Vehicle_Spacebike_B","Vehicle_Spaceship_1",
"Vehicle_Spaceship_2","Vehicle_Spaceship_3","Vehicle_Spaceship_4","Vehicle_Spaceship_5",
"Vending_Machine_AC_Cola","VHSQuests_VHSSpawner","WireframeGun_Spawner",
"YangWormController","YinWormController"
];

const mobIDs: { name: string; id: number }[] = [
    { name: "Angler",             id: 1  }, { name: "AnglerMad",          id: 2  },
    { name: "Armstrong",          id: 3  }, { name: "ArmstrongMad",       id: 4  },
    { name: "Banshee",            id: 5  }, { name: "Bomb",               id: 6  },
    { name: "Bomber",             id: 7  }, { name: "BomberFlashbang",    id: 8  },
    { name: "BomberMad",          id: 9  }, { name: "Chicken",            id: 10 },
    { name: "Cyst",               id: 11 }, { name: "FakeGorilla",        id: 12 },
    { name: "BigHead",            id: 13 }, { name: "RedGreen",           id: 14 },
    { name: "Phantom",            id: 15 }, { name: "EvilEye",            id: 16 },
    { name: "GiantThrower",       id: 17 }, { name: "RedGreenMad",        id: 18 },
    { name: "Spider",             id: 19 }, { name: "FlyingSwarm",        id: 20 },
    { name: "NextBot",            id: 21 }, { name: "Segway",             id: 22 },
    { name: "NextBotStatic",      id: 23 }, { name: "EvilEyePinata",      id: 24 },
    { name: "EvilEyePinataLarge", id: 25 }, { name: "Lanky",              id: 26 },
    { name: "Blob",               id: 27 }, { name: "Cutie",              id: 28 },
    { name: "SpiderCave",         id: 29 }, { name: "ForestMob",          id: 30 },
    { name: "Mimic",              id: 31 }, { name: "GraveyardBoss",      id: 32 },
    { name: "Ringmaster",         id: 33 }, { name: "Puppet",             id: 34 },
    { name: "PolypMass",          id: 35 }, { name: "RobotDog",           id: 36 },
    { name: "Shadow",             id: 37 }, { name: "Heart",              id: 38 },
    { name: "Slimey",             id: 39 }, { name: "ShadowBoss",         id: 40 },
    { name: "BigShark",           id: 41 }, { name: "EdenZombie",         id: 42 },
    { name: "Skinwalker",         id: 43 }, { name: "YinWorm",            id: 44 },
    { name: "YangWorm",           id: 45 }, { name: "ArmstrongSpace",     id: 46 },
    { name: "Smiley",             id: 47 }, { name: "MurderBunny",        id: 48 },
    { name: "MurderRabbit",       id: 49 }, { name: "SlimeyFloat",        id: 51 }
];

const acMobIdByName: Record<string, number> = {
    Unidentified:0,Angler:1,AnglerController:1,AnglerMad:2,AnglerMadController:2,
    Armstrong:3,ArmstrongController:3,ArmstrongMad:4,ArmstrongMadController:4,
    Banshee:5,BansheeController:5,Bomb:6,BombController:6,Bomber:7,BomberController:7,
    BomberFlashbang:8,BomberFlashbangController:8,BomberMad:9,BomberMadController:9,
    Chicken:10,ChickenController:10,Cyst:11,CystController:11,FakeGorilla:12,
    FakeGorillaController:12,BigHead:13,BigHeadController:13,RedGreen:14,RedGreenController:14,
    Phantom:15,PhantomController:15,EvilEye:16,EvilEyeController:16,GiantThrower:17,
    GiantThrowerController:17,RedGreenMad:18,RedGreenMadController:18,Spider:19,
    SpiderController:19,FlyingSwarm:20,FlyingSwarmController:20,NextBot:21,NextBotController:21,
    Segway:22,SegwayController:22,NextBotStatic:23,NextBotStaticController:23,
    EvilEyePinata:24,EvilEyePinataController:24,EvilEyePinataLarge:25,
    EvilEyePinataLargeController:25,Lanky:26,LankyController:26,Blob:27,BlobController:27,
    Cutie:28,CutieController:28,SpiderCave:29,SpiderCaveController:29,ForestMob:30,
    ForestMobController:30,Mimic:31,MimicController:31,GraveyardBoss:32,
    GraveyardBossController:32,Ringmaster:33,RingmasterController:33,Puppet:34,
    PuppetController:34,PolypMass:35,PolypMassController:35,RobotDog:36,
    RobotDogController:36,Shadow:37,ShadowController:37,Heart:38,HeartMobController:38,
    Slimey:39,SlimeyController:39,ShadowBoss:40,ShadowBossController:40,BigShark:41,
    BigSharkController:41,EdenZombie:42,EdenZombieController:42,Skinwalker:43,
    SkinwalkerController:43,YinWorm:44,YinWormController:44,YangWorm:45,
    YangWormController:45,ArmstrongSpace:46,Smiley:47
};

const acMobNameById: Record<number, string> = {
    0:"Unidentified",1:"Angler",2:"AnglerMad",3:"Armstrong",4:"ArmstrongMad",
    5:"Banshee",6:"Bomb",7:"Bomber",8:"BomberFlashbang",9:"BomberMad",
    10:"Chicken",11:"Cyst",12:"FakeGorilla",13:"BigHead",14:"RedGreen",
    15:"Phantom",16:"EvilEye",17:"GiantThrower",18:"RedGreenMad",19:"Spider",
    20:"FlyingSwarm",21:"NextBot",22:"Segway",23:"NextBotStatic",24:"EvilEyePinata",
    25:"EvilEyePinataLarge",26:"Lanky",27:"Blob",28:"Cutie",29:"SpiderCave",
    30:"ForestMob",31:"Mimic",32:"GraveyardBoss",33:"Ringmaster",34:"Puppet",
    35:"PolypMass",36:"RobotDog",37:"Shadow",38:"Heart",39:"Slimey",
    40:"ShadowBoss",41:"BigShark",42:"EdenZombie",43:"Skinwalker",44:"YinWorm",
    45:"YangWorm",46:"ArmstrongSpace",47:"Smiley"
};

// ─── MAIN BODY ────────────────────────────────────────────────────────────────
((() => {
setTimeout(() => Il2Cpp.perform(() => {

    // ── Assembly images ──────────────────────────────────────────────────────
    const AssemblyCSharp = Il2Cpp.domain.assembly("AnimalCompany").image;
    const UnityEngineCore = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
    const UnityEnginePhysics = Il2Cpp.domain.assembly("UnityEngine.PhysicsModule").image;
    const UnityEngineUIModule = Il2Cpp.domain.assembly("UnityEngine.UIModule").image;
    const UnityEngineUI = Il2Cpp.domain.assembly("UnityEngine.UI").image;
    const UnityEngineTextRendering = Il2Cpp.domain.assembly("UnityEngine.TextRenderingModule").image;
    const UnityTextMeshPro = Il2Cpp.domain.assembly("Unity.TextMeshPro").image;
    const UnityEngineXR = Il2Cpp.domain.assembly("UnityEngine.XRModule").image;
    const UnityEngineAudio = Il2Cpp.domain.assembly("UnityEngine.AudioModule").image;
    const PhotonFusionNetworking = Il2Cpp.domain.assembly("Fusion.Runtime").image;
    const PhotonFusionNetworkingRealtime = Il2Cpp.domain.assembly("Fusion.Realtime").image;

    // ── Core game classes ─────────────────────────────────────────────────────
    const GTPlayerClass = AssemblyCSharp.class("AnimalCompany.GorillaLocomotion");
    const PCClass = AssemblyCSharp.class("AnimalCompany.PlayerController");
    const NetPlayerClass = AssemblyCSharp.class("AnimalCompany.NetPlayer");
    const PrefabGen = AssemblyCSharp.class("AnimalCompany.PrefabGenerator");
    const NManager = AssemblyCSharp.class("AnimalCompany.NetworkManager");
    const GBOClass = AssemblyCSharp.class("AnimalCompany.GrabbableObject");
    const GBIClass = AssemblyCSharp.class("AnimalCompany.GrabbableItem");
    const SFXManager = AssemblyCSharp.class("AnimalCompany.SFXManager");
    const PickupManager = AssemblyCSharp.class("AnimalCompany.PickupManager");

    // ── Unity classes ─────────────────────────────────────────────────────────
    const GameObject = UnityEngineCore.class("UnityEngine.GameObject");
    const UnityObject = UnityEngineCore.class("UnityEngine.Object");
    const SystemObject = Il2Cpp.corlib.class("System.Object");
    const NULL = Il2Cpp.reference(SystemObject.alloc());
    const Vector3 = UnityEngineCore.class("UnityEngine.Vector3");
    const Vector2 = UnityEngineCore.class("UnityEngine.Vector2");
    const Quaternion = UnityEngineCore.class("UnityEngine.Quaternion");
    const Time = UnityEngineCore.class("UnityEngine.Time");
    const Resources = UnityEngineCore.class("UnityEngine.Resources");
    const Material = UnityEngineCore.class("UnityEngine.Material");
    const Renderer = UnityEngineCore.class("UnityEngine.Renderer");
    const Shader = UnityEngineCore.class("UnityEngine.Shader");
    const Color = UnityEngineCore.class("UnityEngine.Color");
    const Light = UnityEngineCore.class("UnityEngine.Light");
    const LineRenderer = UnityEngineCore.class("UnityEngine.LineRenderer");
    const RectTransform = UnityEngineCore.class("UnityEngine.RectTransform");
    const PlayerPrefs = UnityEngineCore.class("UnityEngine.PlayerPrefs");
    const AudioSource = UnityEngineAudio.class("UnityEngine.AudioSource");
    const Rigidbody = UnityEnginePhysics.class("UnityEngine.Rigidbody");
    const Physics = UnityEnginePhysics.class("UnityEngine.Physics");
    const Collider = UnityEnginePhysics.class("UnityEngine.Collider");
    const Canvas = UnityEngineUIModule.class("UnityEngine.Canvas");
    const Text = UnityEngineUI.class("UnityEngine.UI.Text");
    const Font = UnityEngineTextRendering.class("UnityEngine.Font");
    const TextMeshPro = UnityTextMeshPro.class("TMPro.TextMeshPro");
    const InputDevices = UnityEngineXR.class("UnityEngine.XR.InputDevices");
    const CommonUsages = UnityEngineXR.class("UnityEngine.XR.CommonUsages");
    const NetworkObjectClass = PhotonFusionNetworking.class("Fusion.NetworkObject");
    const UberShader = Shader.method("Find").invoke(Il2Cpp.string("Universal Render Pipeline/Unlit"));
    const TextShader = Shader.method("Find").invoke(Il2Cpp.string("UI/Default"));
    const zeroVector = Vector3.field("zeroVector").value;
    const oneVector = Vector3.field("oneVector").value;
    const identityQuaternion = Quaternion.field("identityQuaternion").value;
    const arial = Resources.method("GetBuiltinResource", 1).inflate(Font).invoke(Il2Cpp.string("Arial.ttf"));

    // ── Helper: get local player (always fresh) ───────────────────────────────
    const getGTPlayer = () => {
        try {
            const f = GTPlayerClass.fields.find((x: any) => x.name.includes("Instance"));
            const inst = f ? f.value : null;
            return (inst && !inst.isNull()) ? inst : null;
        } catch(_) { return null; }
    };
    const getInstance = getGTPlayer;

    const safeField = (obj: any, name: string) => {
        try {
            if (!obj || obj.isNull()) return null;
            const v = obj.field(name).value;
            if (typeof v === "number" || typeof v === "boolean") return v;
            return (v && !v.isNull?.()) ? v : null;
        } catch(_) { return null; }
    };
    const getTransform = (obj: any) => {
        try { return obj.method("get_transform").invoke(); } catch(_) { return null; }
    };
    const getComponent = (obj: any, type: any) => {
        try { return obj.method("GetComponent", 1).inflate(type).invoke(); } catch(_) { return null; }
    };
    const safeInvoke = (obj: any, method: string, ...args: any[]) => {
        try { if (!obj || obj.isNull()) return null; return obj.method(method).invoke(...args); } catch(_) { return null; }
    };
    const Destroy = (obj: any) => {
        try { UnityObject.method("Destroy", 1).invoke(obj); } catch(_) {}
    };

    // ── Player identity helpers ───────────────────────────────────────────────
    function normalizePlayerToken(value: any): string {
        try {
            if (value == null) return "";
            if (typeof value === "string") return value.trim();
            if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
            if (value.content != null) return String(value.content).trim();
            return String(value).trim();
        } catch(_) { return ""; }
    }
    function normalizeWhitelistToken(value: any): string {
        return normalizePlayerToken(value).toLowerCase();
    }
    function getPlayerIdentityInfo(p: any): any {
        const aliases: string[] = [];
        const push = (v: any) => {
            const t = normalizePlayerToken(v);
            if (!t || t === "?" || aliases.includes(t)) return;
            aliases.push(t);
        };
        try { push(p.method("get_playerId").invoke()); } catch(_) {}
        try { push(p.field("_playerId").value); } catch(_) {}
        try { push(p.method("get_displayName").invoke()); } catch(_) {}
        try { push(p.field("_displayName").value); } catch(_) {}
        try { push(p.field("_userID").value); } catch(_) {}
        try { push(p.method("get_name").invoke()); } catch(_) {}
        const key = aliases[0] ?? "?";
        const label = aliases.length > 1 ? aliases[1] : key;
        return { key, label, aliases: aliases.length > 0 ? aliases : ["?"] };
    }
    function getPlayerName(p: any): string { return getPlayerIdentityInfo(p).label; }
    function whitelistHasPlayer(p: any): boolean {
        try {
            const info = getPlayerIdentityInfo(p);
            const real = info.aliases.filter((a: string) => a && a !== "?");
            if (real.length === 0) return false;
            return real.some((a: string) => whitelist.includes(normalizeWhitelistToken(a)));
        } catch(_) { return false; }
    }
    function whitelistAddPlayer(p: any): string {
        const info = getPlayerIdentityInfo(p);
        for (const a of info.aliases) {
            const t = normalizeWhitelistToken(a);
            if (t && t !== "?" && !whitelist.includes(t)) whitelist.push(t);
        }
        return info.label;
    }

    // ── isMine helper ─────────────────────────────────────────────────────────
    function isMine(self: any): boolean {
        const getters = ["get_IsMine","get_isMine","IsMine","get_HasInputAuthority","get_hasInputAuthority"];
        const fields  = ["_isMine","isMine","_hasInputAuthority","hasInputAuthority"];
        for (const g of getters) { try { const v = self.method(g).invoke(); if (v != null) return !!v; } catch(_) {} }
        for (const f of fields)  { try { const v = self.field(f).value;    if (v != null) return !!v; } catch(_) {} }
        return false;
    }
    function getLocalPlayer() { return getGTPlayer(); }

    // ── Vector helpers ────────────────────────────────────────────────────────
    function readVec3(vec: any): number[] {
        try {
            if (!vec) return [0,0,0];
            if (Array.isArray(vec)) return vec;
            return [vec.field("x").value, vec.field("y").value, vec.field("z").value];
        } catch(_) { return [0,0,0]; }
    }
    function normalizeSpawnPos(pos: any): any {
        if (Array.isArray(pos)) return pos;
        if (!pos) return [0,0,0];
        try { return readVec3(pos); } catch(_) { return [0,0,0]; }
    }
    function getLocalPos(): any {
        try {
            const p = getGTPlayer();
            if (!p) return zeroVector;
            return getTransform(p).method("get_position").invoke();
        } catch(_) { return zeroVector; }
    }

    // ── Notification helper ───────────────────────────────────────────────────
    function sendNotification(msg: string, isError: boolean = false, dur: number = 3) {
        if (!buttonNotifications) return;
        currentNotification = msg;
        notifactionResetTime = time + dur;
        console.log("[Notif] " + msg);
    }

    // ── acAnimalCompanyImage helper ───────────────────────────────────────────
    function acAnimalCompanyImage() { return AssemblyCSharp; }

    // ── Spawn source helper ───────────────────────────────────────────────────
    let _itemSpawnSourceCache: any = null;
    function getItemSpawnSourceDefault(): any {
        if (_itemSpawnSourceCache !== null) return _itemSpawnSourceCache;
        try {
            const cls = AssemblyCSharp.class("AnimalCompany.ItemSpawnSource");
            for (const n of ["None","Unknown","Debug","Spawned","Shop","Chest","Gift","Default"]) {
                try { _itemSpawnSourceCache = cls.field(n).value; return _itemSpawnSourceCache; } catch(_) {}
            }
        } catch(_) {}
        _itemSpawnSourceCache = 0;
        return _itemSpawnSourceCache;
    }
    let _spawnNullDelegateCache: any = undefined;
    function getSpawnNullDelegate(): any {
        if (_spawnNullDelegateCache === undefined) {
            try { _spawnNullDelegateCache = Il2Cpp.reference(SystemObject.alloc()); } catch(_) { _spawnNullDelegateCache = NULL; }
        }
        return _spawnNullDelegateCache;
    }

    // ── Core spawn functions ──────────────────────────────────────────────────
    function spawnItemAsync(itemID: string, pos: any = null): void {
        try {
            const spawnPos = pos || zeroVector;
            const src = getItemSpawnSourceDefault();
            try {
                PrefabGen.method("SpawnItemAsync", 5)
                    .overload("System.String","UnityEngine.Vector3","UnityEngine.Quaternion","Fusion.NetworkObjectSpawnDelegate","AnimalCompany.ItemSpawnSource")
                    .invoke(Il2Cpp.string(itemID), spawnPos, identityQuaternion, NULL, src);
                return;
            } catch(_) {}
            try {
                PrefabGen.method("SpawnItem", 5)
                    .overload("System.String","UnityEngine.Vector3","UnityEngine.Quaternion","Fusion.NetworkRunner.OnBeforeSpawned","AnimalCompany.ItemSpawnSource")
                    .invoke(Il2Cpp.string(itemID), spawnPos, identityQuaternion, getSpawnNullDelegate(), src);
            } catch(_) {}
        } catch(e) { console.error("[Spawn]", e); }
    }

    function spawnItem(itemID: string, pos: any = null): void { spawnItemAsync(itemID, pos || getLocalPos()); }
    function spawnPrefab(prefabName: string, pos: any = null): void { spawnItemAsync(prefabName, pos || getLocalPos()); }

    // ── Mob spawn helpers ─────────────────────────────────────────────────────
    const acGetMobEnumField = (name: string): any => {
        try { return AssemblyCSharp.class("AnimalCompany.MobID").field(name).value; } catch(_) { return null; }
    };
    const acResolveMobID = (mobId: any): any => {
        if (typeof mobId === "number") {
            const n = acMobNameById[mobId | 0];
            return n ? acGetMobEnumField(n) : null;
        }
        const raw = String(mobId ?? "").replace(/^mob_prefab\//, "");
        const trimmed = raw.replace(/_?Controller$/, "");
        for (const c of [raw, trimmed]) {
            const v = acGetMobEnumField(c);
            if (v !== null) return v;
        }
        return null;
    };
    const acEnableMobValidatorBypass = () => {
        if (acMobValidatorBypassEnabled) return;
        try {
            AssemblyCSharp.class("AnimalCompany.MobSpawnValidator").method("IsMobAllowed", 1).implementation = () => true;
            acMobValidatorBypassEnabled = true;
        } catch(e) { console.error("[MobValidatorBypass]", e); }
    };
    function spawnMob(nameOrId: string | number, pos: any = null): void {
        try {
            acEnableMobValidatorBypass();
            const name = typeof nameOrId === "number" ? (acMobNameById[nameOrId] || "Angler") : nameOrId;
            const resolved = acResolveMobID(nameOrId);
            if (resolved !== null) {
                try {
                    PrefabGen.method("SpawnMob", 4).invoke(resolved, pos || getLocalPos(), identityQuaternion, NULL);
                    return;
                } catch(_) {}
            }
            spawnItemAsync("mob_prefab/" + name, pos || getLocalPos());
        } catch(e) { console.error("[SpawnMob]", e); }
    }
    function stabilizeMobInstance(mob: any, pos: any): void {
        try {
            if (!mob || mob.isNull?.()) return;
            const t = getTransform(mob);
            if (t) t.method("set_position").invoke(normalizeSpawnPos(pos));
        } catch(_) {}
    }

    // ── VR Controller Input ───────────────────────────────────────────────────
    function readVRInput(): void {
        try {
            const XRNode_LeftHand = 4, XRNode_RightHand = 5;
            const leftDevices: any[] = [];
            const rightDevices: any[] = [];
            try {
                InputDevices.method("GetDevicesAtXRNode", 2).invoke(XRNode_LeftHand, leftDevices);
                InputDevices.method("GetDevicesAtXRNode", 2).invoke(XRNode_RightHand, rightDevices);
            } catch(_) {}
            const readBool = (devices: any[], usage: any): boolean => {
                for (const d of devices) {
                    try {
                        const outRef = Il2Cpp.reference(false);
                        const ok = d.method("TryGetFeatureValue").overload("UnityEngine.XR.InputFeatureUsage`1<System.Boolean>", "System.Boolean&").invoke(usage, outRef);
                        if (ok) return outRef.value;
                    } catch(_) {}
                }
                return false;
            };
            const readFloat = (devices: any[], usage: any): number => {
                for (const d of devices) {
                    try {
                        const outRef = Il2Cpp.reference(0.0);
                        const ok = d.method("TryGetFeatureValue").overload("UnityEngine.XR.InputFeatureUsage`1<System.Single>", "System.Single&").invoke(usage, outRef);
                        if (ok) return outRef.value;
                    } catch(_) {}
                }
                return 0.0;
            };
            const gripUsage = CommonUsages.field("gripButton").value;
            const trigUsage = CommonUsages.field("triggerButton").value;
            const stickUsage = CommonUsages.field("primary2DAxis").value;
            prevLeftGrab = leftGrab;
            prevRightGrab = rightGrab;
            prevLeftTrigger = leftTrigger;
            prevRightTrigger = rightTrigger;
            leftGrab = readBool(leftDevices, gripUsage);
            rightGrab = readBool(rightDevices, gripUsage);
            leftTrigger = readBool(leftDevices, trigUsage);
            rightTrigger = readBool(rightDevices, trigUsage);
            leftGrabHeld = leftGrab;
            rightGrabHeld = rightGrab;
        } catch(_) {}
    }

    // ── Wallet / Economy helpers ──────────────────────────────────────────────
    function getUserWallet(): any {
        try {
            const app = AssemblyCSharp.class("AnimalCompany.App").method("get_state").invoke();
            if (!app || app.isNull?.()) return null;
            const user = app.method("get_user").invoke();
            if (!user || user.isNull?.()) return null;
            return user.method("get_wallet").invoke();
        } catch(_) { return null; }
    }
    function addFakeRp(amount: number): void {
        try {
            const w = getUserWallet();
            if (!w) return;
            const sfxMgr = SFXManager.field("_instance")?.value ?? SFXManager.method("get_instance")?.invoke();
            for (let i = 0; i < Math.min(amount, 100); i++) {
                try { sfxMgr?.method("PlayRandomSFX").invoke(fakeEarnSfxIds.rp); } catch(_) {}
            }
            try { w.method("AddRP").invoke(amount); } catch(_) {}
        } catch(_) {}
    }
    function addFakeCoin(amount: number): void {
        try {
            const w = getUserWallet();
            if (!w) return;
            try { w.method("AddCoins").invoke(amount); } catch(_) {}
            try { w.method("AddCoin").invoke(amount); } catch(_) {}
            try { w.method("AddGold").invoke(amount); } catch(_) {}
        } catch(_) {}
    }

    // ── UnlockAll ─────────────────────────────────────────────────────────────
    function UnlockAll(): void {
        try {
            const AppClass = AssemblyCSharp.class("AnimalCompany.App");
            const appState = AppClass.method("get_state").invoke();
            const netSessionStateClass = AssemblyCSharp.class("AnimalCompany.UserState");
            const netSessionStateClass2 = AssemblyCSharp.class("AnimalCompany.UserInventoryState");
            const user = AssemblyCSharp.class("AnimalCompany.AppState").method("get_user").bind(appState).invoke();
            const inv = netSessionStateClass.method("get_inventory").bind(user).invoke();
            const isDev = netSessionStateClass.method("get_isDeveloper").bind(user).invoke();
            const devAll = netSessionStateClass2.method("get_devOwnAllAvatarItemsOverride").bind(inv).invoke();
            isDev.method("set_value").invoke(true);
            devAll.method("set_value").invoke(true);
            sendNotification("All items unlocked!");
        } catch(e) { console.error("[UnlockAll]", e); }
    }

    // ── RPC Protection ────────────────────────────────────────────────────────
    function backupOriginalRPCs(): void {
        try {
            const cls = acAnimalCompanyImage().class("AnimalCompany.NetPlayer");
            if (!cls) return;
            const rpcNames = ["RPC_Teleport","RPC_TeleportTo","RPC_SetPosition","RPC_MoveTo","RPC_AddForce",
                "RPC_DoPlayerDie","RPC_Kill","RPC_Die","RPC_PlayerHit","RPC_PlayerStun",
                "RPC_SetJellyEffect","RPC_SetColorHSV","RPC_ApplyBuff","RPC_TagAsStinky",
                "RPC_AddPlayerMoney","RPC_SetTeam","RPC_SetHide","RPC_KillPlayer","RPC_ForceKill"];
            for (const n of rpcNames) {
                try { const m = cls.method(n); if (m && !_origRPCBackup[n]) _origRPCBackup[n] = m.implementation; } catch(_) {}
            }
        } catch(_) {}
    }

    function installRPCProtection(): void {
        try {
            const cls = acAnimalCompanyImage().class("AnimalCompany.NetPlayer");
            if (!cls) return;
            const teleportRPCs = ["RPC_Teleport","RPC_TeleportTo","RPC_SetPosition","RPC_MoveTo","RPC_AddForce","RPC_TeleportPlayer","RPC_ForceTeleport","RPC_Warp","RPC_Move"];
            const killRPCs = ["RPC_DoPlayerDie","RPC_Kill","RPC_Die","RPC_KillPlayer","RPC_ForceKill","RPC_Execute","RPC_Death","RPC_Slay","RPC_PlayerHit","RPC_TakeDamage","RPC_PlayerStun","RPC_Stun","RPC_Freeze"];
            const miscRPCs = ["RPC_SetColorHSV","RPC_SetJellyEffect","RPC_ApplyBuff","RPC_TagAsStinky","RPC_SetTeam","RPC_SetHide","RPC_AddPlayerMoney","RPC_SetScale"];
            const blockIfMine = (m: any) => {
                if (!m) return;
                m.implementation = function() {
                    if (_selfRPCBypass) { try { return m.bind(this).invoke(...arguments); } catch(_) {} return; }
                    if (isMine(this)) return;
                    try { return m.bind(this).invoke(...arguments); } catch(_) {}
                };
            };
            for (const n of [...teleportRPCs, ...killRPCs, ...miscRPCs]) {
                try { const m = cls.method(n); blockIfMine(m); } catch(_) {}
            }
            // Block kick
            try {
                const rpcCls = acAnimalCompanyImage().class("AnimalCompany.NetSessionRPCs");
                if (rpcCls) {
                    const km = rpcCls.method("RPC_KickPlayer");
                    if (km) km.implementation = function() {
                        if ((rpcProtectionEnabled || blockRPCEnabled) && !_selfRPCBypass) return;
                        try { return km.bind(this).invoke(...arguments); } catch(_) {}
                    };
                }
            } catch(_) {}
            console.log("[RPC Protection] Active");
            sendNotification("RPC Protection ON", false);
        } catch(e) { console.error("[RPC Protection]", e); }
    }

    function restoreOriginalRPCs(): void {
        try {
            const cls = acAnimalCompanyImage().class("AnimalCompany.NetPlayer");
            if (!cls) return;
            for (const [n, impl] of Object.entries(_origRPCBackup)) {
                try { const m = cls.method(n); if (m && impl) m.implementation = impl; } catch(_) {}
            }
        } catch(_) {}
    }

    // ── Session join event (webhook) ──────────────────────────────────────────
    try {
        const NManagerClass = AssemblyCSharp.class("AnimalCompany.NetworkManager");
        const onJoinMethod = NManagerClass.method("OnPlayerJoined") ?? NManagerClass.method("OnJoinedRoom");
        if (onJoinMethod) {
            const origJoin = onJoinMethod.implementation;
            onJoinMethod.implementation = function(args: any) {
                try {
                    let playerName = "Unknown";
                    try { playerName = getPlayerName(args[0]); } catch(_) {}
                    sendWebhook("Player Joined", `**${playerName}** joined the session`, 0x00ff00);
                } catch(_) {}
                if (origJoin) try { return origJoin.call(this, args); } catch(_) {}
                try { return onJoinMethod.bind(this).invoke(...args); } catch(_) {}
            };
        }
    } catch(_) {}
    try {
        const sessionClass = AssemblyCSharp.class("AnimalCompany.NetSessionManager") ??
                             AssemblyCSharp.class("AnimalCompany.SessionManager");
        if (sessionClass) {
            const startMethod = sessionClass.method("StartSession") ?? sessionClass.method("OnSessionStarted");
            if (startMethod) {
                const origStart = startMethod.implementation;
                startMethod.implementation = function(args: any) {
                    sendWebhook("Session Started", "A new session has started", 0x0088ff);
                    if (origStart) try { return origStart.call(this, args); } catch(_) {}
                    try { return startMethod.bind(this).invoke(...args); } catch(_) {}
                };
            }
        }
    } catch(_) {}

    // Init
    backupOriginalRPCs();
    installRPCProtection();
    sendWebhook("Mod Menu", "Mod menu injected and running", 0xff8800);
    console.log("[ModMenu] Loaded successfully");

    // ── Main Update loop ──────────────────────────────────────────────────────
    function acUpdate(): void {
        try {
            time = Number(Time.method("get_time").invoke?.() ?? 0);
            readVRInput();
            const gtp = getGTPlayer();
            if (!gtp) return;
            const rb = safeField(gtp, "_playerRigidBody");
            const tf = getTransform(gtp);

            // ── Fly ──────────────────────────────────────────────────────────
            if (flyEnabled && tf) {
                try {
                    const pos = readVec3(tf.method("get_position").invoke());
                    const fwd = readVec3(tf.method("get_forward").invoke());
                    const speed = flySpeed * flySpeedMult;
                    let newX = pos[0], newY = pos[1], newZ = pos[2];
                    if (leftGrab)   { newY += speed * 0.016; }
                    if (rightGrab)  { newY -= speed * 0.016; }
                    if (leftTrigger){ newX += fwd[0]*speed*0.016; newZ += fwd[2]*speed*0.016; }
                    tf.method("set_position").invoke([newX, newY, newZ]);
                    if (rb) try { rb.method("set_velocity").invoke([0,0,0]); } catch(_) {}
                } catch(_) {}
            }

            // ── No Clip ──────────────────────────────────────────────────────
            if (noClipEnabled) {
                try {
                    const col = safeField(gtp, "_playerCollider") ?? safeField(gtp, "bodyCollider");
                    if (col) col.method("set_enabled").invoke(false);
                } catch(_) {}
            }

            // ── Speed boost ──────────────────────────────────────────────────
            if (speedBoostEnabled && rb) {
                try {
                    const vel = readVec3(rb.method("get_velocity").invoke());
                    const mag = Math.sqrt(vel[0]*vel[0]+vel[1]*vel[1]+vel[2]*vel[2]);
                    if (mag > 0.1) {
                        const s = speedBoostMult;
                        rb.method("set_velocity").invoke([vel[0]*s, vel[1], vel[2]*s]);
                    }
                } catch(_) {}
            }

            // ── Infinite Health ───────────────────────────────────────────────
            if (infHealthEnabled || godModeEnabled) {
                try {
                    const hp = safeField(gtp, "_health") ?? safeField(gtp, "health");
                    if (hp !== null && typeof hp === "number" && hp < 1900) {
                        gtp.field("_health").value = healthVal;
                    }
                } catch(_) {}
                try {
                    const hpCls = AssemblyCSharp.class("AnimalCompany.Health");
                    const hpInst = safeField(gtp, "_healthComponent") ?? safeField(gtp, "healthComponent");
                    if (hpInst) {
                        try { hpInst.field("_health").value = healthVal; } catch(_) {}
                        try { hpInst.field("_maxHealth").value = healthVal; } catch(_) {}
                    }
                } catch(_) {}
            }

            // ── Super Jump ───────────────────────────────────────────────────
            if (superJumpEnabled && rb) {
                try {
                    const isGrounded = safeField(gtp, "_isGrounded") ?? safeField(gtp, "isGrounded");
                    if (isGrounded) {
                        const vel = readVec3(rb.method("get_velocity").invoke());
                        if (vel[1] > 0.1) {
                            rb.method("set_velocity").invoke([vel[0], superJumpForce, vel[2]]);
                        }
                    }
                } catch(_) {}
            }

            // ── Low Gravity ──────────────────────────────────────────────────
            if (lowGravityEnabled) {
                try { Physics.field("gravity").value = [0, -9.81 * gravityMult, 0]; } catch(_) {}
            }

            // ── Scale ────────────────────────────────────────────────────────
            if (scaleEnabled && tf) {
                try { tf.method("set_localScale").invoke([scaleVal, scaleVal, scaleVal]); } catch(_) {}
            }

            // ── Item Gun ─────────────────────────────────────────────────────
            if (itemGunEnabled) {
                itemGunDelay--;
                if (itemGunDelay <= 0 && (leftTrigger || rightTrigger)) {
                    itemGunDelay = 15;
                    const id = itemIDs[currentItemIndex % itemIDs.length];
                    spawnItem(id, getLocalPos());
                }
            }

            // ── Random All Items ──────────────────────────────────────────────
            if (randomAllItemsEnabled) {
                randomAllItemsDelay--;
                if (randomAllItemsDelay <= 0) {
                    randomAllItemsDelay = 8;
                    const id = itemIDs[Math.floor(Math.random() * itemIDs.length)];
                    spawnItem(id, getLocalPos());
                }
            }

            // ── Prefab Gun ───────────────────────────────────────────────────
            if (prefabGunEnabled) {
                if ((leftTrigger && !prevLeftTrigger) || (rightTrigger && !prevRightTrigger)) {
                    const id = prefabIDs[prefabListIndex % prefabIDs.length];
                    spawnPrefab(id, getLocalPos());
                }
            }

            // ── Mob Gun ──────────────────────────────────────────────────────
            if (mobGunEnabled) {
                mobGunDelay--;
                if (mobGunDelay <= 0 && (leftTrigger || rightTrigger)) {
                    mobGunDelay = 20;
                    spawnMob(mobIDs[mobIndex % mobIDs.length].id, getLocalPos());
                }
            }

            // ── Mob Aura ──────────────────────────────────────────────────────
            if (mobAuraEnabled) {
                mobAuraDelay--;
                if (mobAuraDelay <= 0) {
                    mobAuraDelay = 30;
                    spawnMob(mobIDs[mobAuraMobIndex % mobIDs.length].id, getLocalPos());
                }
            }

            // ── Coin Gun / RP Gun ────────────────────────────────────────────
            if (coinGunEnabled && (leftTrigger || rightTrigger)) {
                addFakeCoin(fakeCoinAmount);
            }
            if (rpGunEnabled && (leftTrigger || rightTrigger)) {
                addFakeRp(fakeRpAmount);
            }

            // ── Fake RP / Coin toggle ────────────────────────────────────────
            if (fakeRpEnabled)   { addFakeRp(fakeRpAmount); fakeRpEnabled = false; }
            if (fakeCoinEnabled) { addFakeCoin(fakeCoinAmount); fakeCoinEnabled = false; }

            // ── Full bright / Light ───────────────────────────────────────────
            if (lightEnabled) {
                if (!fullBrightObject) {
                    try {
                        fullBrightObject = GameObject.method("CreatePrimitive").invoke(3);
                        const lightComp = fullBrightObject.method("AddComponent", 1).inflate(Light).invoke();
                        lightComp.field("range").value = 1000;
                        lightComp.field("intensity").value = 8;
                        const lightTf = getTransform(fullBrightObject);
                        if (tf && lightTf) {
                            const p = readVec3(tf.method("get_position").invoke());
                            lightTf.method("set_position").invoke(p);
                        }
                    } catch(_) {}
                } else if (tf) {
                    try {
                        const p = readVec3(tf.method("get_position").invoke());
                        getTransform(fullBrightObject)?.method("set_position").invoke(p);
                    } catch(_) {}
                }
            } else if (fullBrightObject) {
                try { Destroy(fullBrightObject); fullBrightObject = null; } catch(_) {}
            }

            // ── Hue / Color ───────────────────────────────────────────────────
            if (hueEnabled) {
                hueVal = (hueVal + 0.005) % 1.0;
                try {
                    NetPlayerClass.method("RPC_SetColorHSV")?.invoke?.(); // local only stub
                    const np = safeField(gtp, "_netPlayer") ?? safeField(gtp, "netPlayer");
                    if (np) np.method("RPC_SetColorHSV")?.invoke?.(hueVal, satVal, 1.0);
                } catch(_) {}
            }

            // ── Notification reset ────────────────────────────────────────────
            if (currentNotification && time > notifactionResetTime) currentNotification = "";

        } catch(e) { console.error("[Update]", e); }
    }

    // Hook into FixedUpdate or LateUpdate on PlayerController
    try {
        const updateTarget = PCClass.method("Update") ?? PCClass.method("LateUpdate") ?? GTPlayerClass.method("Update");
        if (updateTarget) {
            const origUpdate = updateTarget.implementation;
            updateTarget.implementation = function(args: any) {
                try { acUpdate(); } catch(_) {}
                if (origUpdate) try { return origUpdate.call(this, args); } catch(_) {}
                try { return updateTarget.bind(this).invoke(); } catch(_) {}
            };
        }
    } catch(_) {
        // Fallback: setInterval
        setInterval(() => { try { Il2Cpp.perform(() => { acUpdate(); }); } catch(_) {} }, 16);
    }

    // ── RPC interface (Frida rpc.exports) ────────────────────────────────────
    rpc.exports = {
        // Movement
        setFly(v: boolean)            { flyEnabled = v; sendNotification("Fly: " + v); },
        setFlySpeed(v: number)        { flySpeed = v; },
        setNoclip(v: boolean)         { noClipEnabled = v; sendNotification("NoClip: " + v); },
        setSpeedBoost(v: boolean)     { speedBoostEnabled = v; speedBoostMult = 3.0; sendNotification("Speed: " + v); },
        setSpeedMult(v: number)       { speedBoostMult = v; },
        setSuperJump(v: boolean)      { superJumpEnabled = v; sendNotification("SuperJump: " + v); },
        setSuperJumpForce(v: number)  { superJumpForce = v; },
        setLowGravity(v: boolean)     { lowGravityEnabled = v; if (!v) try { Physics.field("gravity").value = [0,-9.81,0]; } catch(_) {} },
        setGravityMult(v: number)     { gravityMult = v; },
        setFreeze(v: boolean)         { freezeEnabled = v; },
        setFastClimb(v: boolean)      { fastClimbEnabled = v; },
        setClimbSpeed(v: number)      { climbSpeed = v; },
        setBhop(v: boolean)           { bhopEnabled = v; },
        setHighJump(v: boolean)       { highJumpEnabled = v; },
        setLaunchPower(v: number)     { launchPower = v; },
        setDive(v: boolean)           { diveEnabled = v; },
        setRocketJump(v: boolean)     { rocketJumpEnabled = v; },
        setVehicleBoost(v: boolean)   { vehicleBoostEnabled = v; },

        // Player
        setGodMode(v: boolean)        { godModeEnabled = v; infHealthEnabled = v; sendNotification("GodMode: " + v); },
        setInfHealth(v: boolean)      { infHealthEnabled = v; },
        setHealth(v: number)          { healthVal = v; },
        setAntiBan(v: boolean)        { antiBan = v; sendNotification("AntiBan: " + v); },
        setAntiKick(v: boolean)       { antiKick = v; sendNotification("AntiKick: " + v); },
        setRpcProtection(v: boolean)  { rpcProtectionEnabled = v; if (v) installRPCProtection(); else restoreOriginalRPCs(); },
        setScale(v: number)           { scaleEnabled = true; scaleVal = v; },
        setScaleEnabled(v: boolean)   { scaleEnabled = v; },
        setHue(v: boolean)            { hueEnabled = v; },
        setHueVal(v: number)          { hueVal = v; },
        setSatVal(v: number)          { satVal = v; },
        setSuperPunch(v: boolean)     { superPunchEnabled = v; punchForce = 25.0; },
        setPunchForce(v: number)      { punchForce = v; },
        setInvis(v: boolean)          { invisEnabled = v; },
        setNoFallDmg(v: boolean)      { noFallDamageEnabled = v; },
        setUnlockAll()                { UnlockAll(); },
        setJelly(v: number)           { jellyVal = v; },
        setLight(v: boolean)          { lightEnabled = v; },

        // Items
        spawnItem(id: string)         { spawnItem(id); sendWebhook("Spawn", "Spawned: " + id, 0xffaa00); },
        spawnPrefab(id: string)       { spawnPrefab(id); },
        spawnMob(id: any)             { spawnMob(id); },
        setItemGun(v: boolean)        { itemGunEnabled = v; sendNotification("ItemGun: " + v); },
        setItemIndex(v: number)       { currentItemIndex = v; },
        setPrefabGun(v: boolean)      { prefabGunEnabled = v; },
        setPrefabIndex(v: number)     { prefabListIndex = v; },
        setMobGun(v: boolean)         { mobGunEnabled = v; sendNotification("MobGun: " + v); },
        setMobIndex(v: number)        { mobIndex = v; },
        setMobAura(v: boolean)        { mobAuraEnabled = v; },
        setRandomItems(v: boolean)    { randomAllItemsEnabled = v; sendNotification("RandomItems: " + v); },
        setStashDupe(v: boolean)      { stashDupeEnabled = v; },
        setItemRain(v: boolean)       { itemRainEnabled = v; },

        // Economy
        addRp(v: number)              { fakeRpEnabled = true; fakeRpAmount = v; },
        addCoin(v: number)            { fakeCoinEnabled = true; fakeCoinAmount = v; },
        setCoinGun(v: boolean)        { coinGunEnabled = v; sendNotification("CoinGun: " + v); },
        setRpGun(v: boolean)          { rpGunEnabled = v; sendNotification("RpGun: " + v); },
        setCoinAmount(v: number)      { fakeCoinAmount = v; },
        setRpAmount(v: number)        { fakeRpAmount = v; },
        setWalletHack(v: boolean)     { walletHackEnabled = v; },
        setWalletVal(v: number)       { walletVal = v; },

        // Weapons
        setInfAmmo(v: boolean)        { infAmmoEnabled = v; sendNotification("InfAmmo: " + v); },
        setNoReload(v: boolean)       { noReloadEnabled = v; },
        setFullAuto(v: boolean)       { fullAutoEnabled = v; },
        setRapidFire(v: boolean)      { rapidFireEnabled = v; },
        setExplosiveBullets(v: boolean){ explosiveBulletsEnabled = v; },
        setMultiShot(v: boolean)      { multiShotEnabled = v; },
        setMultiShotCount(v: number)  { multiShotCount = v; },
        setOneHitKill(v: boolean)     { oneHitKillEnabled = v; },
        setAimBot(v: boolean)         { aimBotEnabled = v; },
        setGrabRange(v: number)       { grabRangeMult = v; itemGrabRangeEnabled = true; },
        setThrowForce(v: number)      { throwForceMult = v; throwForceEnabled = true; },

        // Players
        kickPlayer(id: string)        {
            try {
                _selfRPCBypass = true;
                const rpcCls = acAnimalCompanyImage().class("AnimalCompany.NetSessionRPCs");
                rpcCls?.method("RPC_KickPlayer")?.invoke?.(Il2Cpp.string(id));
                sendWebhook("Kick", "Kicked player: " + id, 0xff4444);
            } catch(_) {} finally { _selfRPCBypass = false; }
        },
        setYeet(v: boolean)           { yeetEnabled = v; },
        setYeetForce(v: number)       { yeetForce = v; },
        setOrbitPlayer(v: boolean)    { orbitPlayerEnabled = v; },
        setFollowPlayer(v: boolean)   { followPlayerEnabled = v; },
        setTagGun(v: boolean)         { tagGunEnabled = v; },
        setStinkyGun(v: boolean)      { stinkyGunEnabled = v; },
        setColorGun(v: boolean)       { colorGunEnabled = v; },
        setScaleGun(v: boolean)       { scaleGunEnabled = v; },
        setJellyGun(v: boolean)       { jellyGunEnabled = v; },
        setChatSpam(v: boolean, msg: string) { spamChatEnabled = v; spamMsg = msg; },
        setBroadcast(v: boolean, msg: string) { broadcastEnabled = v; broadcastMsg = msg; },
        setWhitelistEnabled(v: boolean)  { whitelistEnabled = v; },
        addToWhitelist(name: string)     { whitelist.push(normalizeWhitelistToken(name)); },
        clearWhitelist()                 { whitelist = []; },

        // Visual
        setEsp(v: boolean)            { espEnabled = v; },
        setFullBright(v: boolean)     { fullBrightEnabled = v; },
        setNightVision(v: boolean)    { nightVisionEnabled = v; },
        setFov(v: number)             { fovEnabled = true; fovVal = v; },
        setWireframe(v: boolean)      { wireframeEnabled = v; },
        setHandText(v: boolean, t: string) { handTextEnabled = v; handTextStr = t; },
        setAmbientColor(r: number, g: number, b: number) { ambientColorEnabled = true; ambR = r; ambG = g; ambB = b; },
        setFog(v: boolean, density: number) { fogEnabled = v; fogDensity = density; },
        setTimeScale(v: number)       { timeScaleEnabled = true; timeScaleVal = v; try { Time.field("timeScale").value = v; } catch(_) {} },

        // Audio
        setMute(v: boolean)           { muteSoundEnabled = v; },
        setAudioSpam(v: boolean)      { audioSpamEnabled = v; },

        // World
        setWeather(v: boolean, idx: number) { weatherEnabled = v; weatherIndex = idx; },
        setUnlockDoors(v: boolean)    { unlockDoorsEnabled = v; },
        setDestroyProps(v: boolean)   { destroyPropsEnabled = v; },
        setRpcBlock(v: boolean)       { blockRPCEnabled = v; if (v) installRPCProtection(); },
        setAntiGoopfish(v: boolean)   { antiGoopfishEnabled = v; },
        setAntiGoopfishRadius(v: number) { antiGoopfishRadius = v; },

        // Network
        setNetworkSpam(v: boolean)    { networkSpamEnabled = v; },
        setGhostMode(v: boolean)      { ghostModeEnabled = v; },
        setLag(v: boolean, ms: number){ lagEnabled = v; lagDelay = ms; },

        // Misc
        setButtonNotifications(v: boolean) { buttonNotifications = v; },
        setWebhook(url: string)       { (WEBHOOK_URL as any) = url; },
        sendWebhookMsg(title: string, msg: string) { sendWebhook(title, msg, 0xffffff); },
        setRumble(v: boolean)         { rumbleEnabled = v; },
        getItemList()                 { return itemIDs; },
        getPrefabList()               { return prefabIDs; },
        getMobList()                  { return mobIDs.map(m => m.name); },
        resetAll() {
            flyEnabled = false; noClipEnabled = false; speedBoostEnabled = false;
            superJumpEnabled = false; godModeEnabled = false; infHealthEnabled = false;
            scaleEnabled = false; hueEnabled = false; itemGunEnabled = false;
            mobGunEnabled = false; coinGunEnabled = false; rpGunEnabled = false;
            antiGoopfishEnabled = false; randomAllItemsEnabled = false;
            blockRPCEnabled = false; prefabGunEnabled = false;
            sendNotification("All mods reset");
        }
    };

    console.log("[ModMenu] RPC exports registered");

}), 0);
})());
