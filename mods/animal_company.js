// ═══════════════════════════════════════════════════════════════
//  Animal Company — Full Mod Menu
//  Single-file architecture: edit here, everything updates
//  Uses frida-il2cpp-bridge with obfuscated export map
// ═══════════════════════════════════════════════════════════════

"use strict";

// ─────────────────────────────────────────────────────────────
//  CONFIG — edit this block only
// ─────────────────────────────────────────────────────────────
const CFG = {
  DISCORD_WEBHOOK: "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN",
  WEBHOOK_ENABLED: true,
  MOD_TAG: "[AC]",
  PACKAGE: "com.bigsnowbear.animalcompany",   // adjust if different
  DEBUG_DUMP: false,                           // set true first run to find class names
  MENU_SCALE: 1.0,
};

// ─────────────────────────────────────────────────────────────
//  SYMBOL MAP  (obfuscated il2cpp exports for this build)
// ─────────────────────────────────────────────────────────────
const SYM = {
  il2cpp_init:                        "yIwjkiyvpVU",
  il2cpp_init_utf16:                  "fBkGdQpGYRB",
  il2cpp_shutdown:                    "CfVkVfryGWk",
  il2cpp_get_corlib:                  "NALYFamTSGt",
  il2cpp_add_internal_call:           "vkE_lJJlSNf",
  il2cpp_resolve_icall:               "HoaWv_ASLvE",
  il2cpp_alloc:                       "fOjRSGQbIzJ",
  il2cpp_free:                        "iusVYbJfSrP",
  il2cpp_array_class_get:             "XhhXVNnRVLO",
  il2cpp_array_length:                "qsNChMPmfes",
  il2cpp_array_get_byte_length:       "LtRjdkb_ubi",
  il2cpp_array_new:                   "CaQyFnUnPsZ",
  il2cpp_array_new_specific:          "mmcXGaRmrqb",
  il2cpp_array_new_full:              "XvAkwrDjSJI",
  il2cpp_bounded_array_class_get:     "uikdsFCcAYr",
  il2cpp_array_element_size:          "c_SVjTaLTmZ",
  il2cpp_assembly_get_image:          "syzVvcPQQVL",
  il2cpp_class_for_each:              "qXNlqWHwjjw",
  il2cpp_class_from_name:             "TcbPTZr_xAg",
  il2cpp_class_from_system_type:      "NOTLL_rikYr",
  il2cpp_class_get_element_class:     "jzTEhyzbovM",
  il2cpp_class_get_events:            "NXOPZGxsKAK",
  il2cpp_class_get_fields:            "hhNAKrJsEzA",
  il2cpp_class_get_nested_types:      "TkbyFmdpWRu",
  il2cpp_class_get_interfaces:        "rGeUSxWWcid",
  il2cpp_class_get_properties:        "KKDgOcnXUDn",
  il2cpp_class_get_field_from_name:   "xulZhgwZJVU",
  il2cpp_class_get_methods:           "tYAPjpZKeir",
  il2cpp_class_get_method_from_name:  "yYEdHniCBcc",
  il2cpp_class_get_name:              "gsfHXCWPbeS",
  il2cpp_class_get_namespace:         "OFqHTaGRSPV",
  il2cpp_class_get_parent:            "dAuFHrb_ytt",
  il2cpp_class_get_declaring_type:    "pSPNyJKwJpq",
  il2cpp_class_instance_size:         "_qORughppWm",
  il2cpp_class_num_fields:            "MPzFgLdwHO_",
  il2cpp_class_is_valuetype:          "qFC_LQGafRg",
  il2cpp_class_value_size:            "pshMONxDbqI",
  il2cpp_class_get_flags:             "nIiWtLQEInE",
  il2cpp_class_is_abstract:           "YsAwKDZRBhl",
  il2cpp_class_is_interface:          "LuAGcENZvdH",
  il2cpp_class_array_element_size:    "BwFTioQHNeG",
  il2cpp_class_from_type:             "toges_kSMAk",
  il2cpp_class_get_type:              "TwndIPpwWbc",
  il2cpp_class_is_generic:            "yAYwrUBeP_t",
  il2cpp_class_is_inflated:           "NKsnTAnFZak",
  il2cpp_class_get_image:             "SgvLOT_iQgN",
  il2cpp_class_get_assemblyname:      "UKXghcfsZjk",
  il2cpp_class_get_static_field_data: "gCsMxgDhAlf",
  il2cpp_class_is_assignable_from:    "nVMtidLleIZ",
  il2cpp_class_is_subclass_of:        "dELBPwVQlht",
  il2cpp_class_has_parent:            "PWwojSrKJki",
  il2cpp_class_has_attribute:         "btBWEThVvWZ",
  il2cpp_class_is_enum:               "ciJPjQpeIOM",
  il2cpp_field_get_flags:             "IcQWVBayzqy",
  il2cpp_field_get_name:              "fqkMaOhhCaC",
  il2cpp_field_get_parent:            "cTdpWnEsyQQ",
  il2cpp_field_get_offset:            "ucuTsOCzyRy",
  il2cpp_field_get_type:              "bJzAWMfnWro",
  il2cpp_field_get_value:             "ttqcSMLIDHA",
  il2cpp_field_get_value_object:      "Liwcn_DqHUU",
  il2cpp_field_set_value:             "hTRyWPEiGhw",
  il2cpp_field_static_get_value:      "eRMtojunloe",
  il2cpp_field_static_set_value:      "bnpDTMtkKFC",
  il2cpp_field_set_value_object:      "zhsmGhoqOCO",
  il2cpp_field_is_literal:            "aVSwwitvnsD",
  il2cpp_gc_collect:                  "pNAnTYyjtQk",
  il2cpp_gc_disable:                  "iTROOvFWLyP",
  il2cpp_gc_enable:                   "HNDEVWMwQmG",
  il2cpp_gc_is_disabled:              "ZMqJeKlmrND",
  il2cpp_gc_get_heap_size:            "dFHIuNZWzhx",
  il2cpp_gc_get_used_size:            "ihQxbdbdMJ_",
  il2cpp_gchandle_new:                "aDYQiqQCdPh",
  il2cpp_gchandle_new_weakref:        "GzoEIsIYflu",
  il2cpp_gchandle_get_target:         "n_GdTGflrIW",
  il2cpp_gchandle_free:               "_aduCWroEpS",
  il2cpp_domain_get:                  "zhgb_frCSQd",
  il2cpp_domain_assembly_open:        "OIhjBIlHm_O",
  il2cpp_domain_get_assemblies:       "OVcLwtxlMAT",
  il2cpp_image_get_assembly:          "ZGucbuJqkTL",
  il2cpp_image_get_name:              "AHIMpwZOFZP",
  il2cpp_image_get_class_count:       "wiuLaEazpUa",
  il2cpp_image_get_class:             "WITrGvNbykD",
  il2cpp_method_get_name:             "wRNHrhDpycp",
  il2cpp_method_get_return_type:      "naJzXpKQuKd",
  il2cpp_method_get_declaring_type:   "EzMpbgxFO_x",
  il2cpp_method_get_param_count:      "kPCbdyIwDdM",
  il2cpp_method_get_param:            "mtMMzvYBCMb",
  il2cpp_method_get_flags:            "IUcHZkBBISQ",
  il2cpp_method_is_generic:           "chAWnpGBJqL",
  il2cpp_method_is_inflated:          "hzpvATVZJgw",
  il2cpp_method_is_instance:          "yHAsKTuvMXc",
  il2cpp_object_new:                  "ksESNsCkbvN",
  il2cpp_object_get_class:            "cNShSQPdinw",
  il2cpp_object_get_size:             "iOohxukUeDC",
  il2cpp_object_get_virtual_method:   "AghTDubtqRl",
  il2cpp_object_unbox:                "HAbAPnHeNwP",
  il2cpp_value_box:                   "ZPjbTkOyoNf",
  il2cpp_runtime_invoke:              "JjwFIWx_LQM",
  il2cpp_runtime_class_init:          "OTZdxmsSLyt",
  il2cpp_runtime_object_init:         "DKHLwayLGOj",
  il2cpp_string_length:               "fqGFPLTrOFz",
  il2cpp_string_chars:                "EcmLjsnInAx",
  il2cpp_string_new:                  "E_tvGXGYHBx",
  il2cpp_string_new_len:              "cUSNUaRBRtc",
  il2cpp_string_new_wrapper:          "KEeEhoUNwuZ",
  il2cpp_thread_current:              "sQNJmHXIRxJ",
  il2cpp_thread_attach:               "oOJEiudsLWz",
  il2cpp_thread_detach:               "ljbpn_Ijekq",
  il2cpp_monitor_enter:               "uONFHhEB_Oy",
  il2cpp_monitor_exit:                "kchJZMJnAQm",
  il2cpp_type_get_name:               "EnOIwrpxWlB",
  il2cpp_type_get_type:               "hTXRohaTzsG",
  il2cpp_type_equals:                 "_oGxCFJXoiY",
  il2cpp_type_get_class_or_element_class: "FcAiYuatpcD",
  il2cpp_custom_attrs_from_class:     "KVpp__XpzaR",
  il2cpp_custom_attrs_from_method:    "UHZRepoMKEu",
  il2cpp_is_debugger_attached:        "QTvlXkHjnXe",
};

// ─────────────────────────────────────────────────────────────
//  STATE — all cheat toggles live here
//  Changing a value here instantly changes behavior everywhere
// ─────────────────────────────────────────────────────────────
const STATE = {

  // ── Settings ──────────────────────────────────────────────
  settings: {
    selectCurrentItem:    false,
    names:                false,
    changeItemID:         0,
    changeMobID:          0,
    cycleVFX:             false,
    unlockAll:            false,
    giveDev:              false,
    unlockAllSkills:      false,
    setMasterClient:      false,
    logHeldItemModifiers: false,
    itemSpawnDelay:       100,
    mobSpawnDelay:        100,
    mobOrbitCount:        8,
    prefabSpawnDelay:     100,
    gunModDelay:          50,
    randomItemGunSpeed:   10,
    rapidFireSpeed:       5,
    authorityGunSpeed:    10,
    deleteBatchSize:      10,
    menuScale:            1.0,
  },

  // ── Movement ──────────────────────────────────────────────
  movement: {
    grapple:          false,
    fly:              false,
    wasdFly:          false,
    joystickFly:      false,
    joystickFlyV2:    false,
    joystickFlyV3:    false,
    flySpeed:         5.0,
    flyB:             false,
    noclip:           false,
    platforms:        false,
    longArms:         false,
    longerArms:       false,
    longererArms:     false,
    longerererArms:   false,
  },

  // ── Player ────────────────────────────────────────────────
  player: {
    dieRevive:        false,
    forceRagdoll:     false,
    noVelLT:          false,
    punchMod:         false,
    grabMod:          false,
    rigSpammer:       false,
    tpAllGun:         false,
    peeMod:           false,
    peeForce:         5.0,
    peeCooldown:      0.0,
    grabPlayer:       false,
    grabGun:          false,
    arenaESP:         false,
    giveItemGun:      false,
    stealFromHands:   false,
    invisible:        false,
    invincible:       false,
    infHealth:        false,
  },

  // ── Other Player ──────────────────────────────────────────
  otherPlayer: {
    loadingScreenAll: false,
    kickAll:          false,
    tpAllToMe:        false,
    attachEveryone:   false,
    squeakyEveryone:  false,
    orbitPlayers:     false,
    orbitAll:         false,
    flingPlayerGun:   false,
    flingAll:         false,
    tagAllStinky:     false,
    scaleAllPlus:     false,
    scaleAllMinus:    false,
    dragPlayer:       false,
    setSelfMoney:     0,
    payAllMoney:      false,
    spawnItemHand:    false,
    spawnMobHand:     false,
    spawnAllItemsHand: false,
    spawnAllMobsHand: false,
    rainbowMonsters:  false,
    rainbowPlayers:   false,
    upAll:            false,
    stunAll:          false,
    killAll:          false,
    killAllPlayers:   false,
    tpDeath:          false,
    tpItemsDeath:     false,
    teleportToLake:   false,
    teleportToMoon:   false,
    teleportToSewers: false,
    teleportToAboveWater: false,
    teleportToSpawn:  false,
    teleportToWaterTower: false,
  },

  // ── Item mods ─────────────────────────────────────────────
  items: {
    grenadeLauncherAutoFill: false,
    infSellValue:     false,
    jellyHeldItem:    false,
    randomizeHeldItem: false,
    rainbowRandomizeHeldItem: false,
    itemColourPicker: false,
    customHue:        0.0,
    customSaturation: 1.0,
    customScale:      1.0,
    rainbowHeldItem:  false,
    rainbowAllItems:  false,
    colorFix:         false,
    colorFixScale:    false,
    colorFixHueSat:   false,
    colorFixRainbow:  false,
    sizeBigFix:       false,
    sizeSmallFix:     false,
    colorYellowFix:   false,
    randomHeldItem:   false,
    randomAllItems:   false,
    duckHandNuke:     0,     // v1-v5, 0 = off
    spamRandomBag:    false,
    spamRandomQuiver: false,
    spamRandomGL:     false,
    spamFilledBag:    false,
    spamFilledQuiver: false,
    spamFilledGL:     false,
  },

  // ── Spawning ──────────────────────────────────────────────
  spawning: {
    goopSpam:         false,
    spawnItems:       false,
    randomHandDuper:  false,
    spawnItemsGrip:   false,
    spawnItemsGun:    false,
    randomItemGun:    false,
    randomizedItemLauncher: false,
    textItems:        false,
    drawMod:          false,
    rainbowAppleLine: false,
    rainbowSpawnItem: false,
    rainbowGripItem:  false,
    rainbowSelectedItemGun: false,
    pelicanCaseExplosion: false,
    snowballMinigun:  false,
    suitcaseMinigun:  false,
    stickyDynamiteMinigun: false,
    quiverGiveaway:   false,
    moddedQuiverSpawn: false,
    giveawayBags:     false,
    preloadSelectedIDQuiver: false,
    currentItemGiveawayQuiver: false,
    spawnOreQuiver:   false,
    quiverLauncher:   false,
    spawnMob:         false,
    mobTrigger:       false,
    spawnMobGun:      false,
    mobOrbit:         false,
    deleteAllItems:   false,
  },

  // ── Gun mods ──────────────────────────────────────────────
  guns: {
    soundGun:             false,
    ghostExceptTarget:    false,
    meteorRainGun:        false,
    meteorShootGun:       false,
    gravityGun:           false,
    basketballKidnap:     false,
    momKidnap:            false,
    rpgBounceGun:         false,
    kickGun:              false,
    thunderGun:           false,
    identityGun:          false,
    nukeGun:              false,
    copyVoiceGun:         false,
    quiverGun:            false,
    giveawayGun:          false,
    teleportMeGun:        false,
    rainbowPlayerGun:     false,
    instakillGun:         false,
    laserEyesRT:          false,
    spawnMomBossGun:      false,
    instaKillGun:         false,
    rainbowItemLauncher:  false,
    galaxyItemLauncher:   false,
    goldItemLauncher:     false,
    richGun:              false,
    insideOutGun:         false,
    voidGun:              false,
    ziplineGun:           false,
    whiteGun:             false,
    robotGun:             false,
    ragdollGunV2:         false,
    boxGun:               false,
    cameraGun:            false,
    lightningGun:         false,
    cageGun:              false,
    balloonAuthorityGun:  false,
    stealItemsGun:        false,
    bringItemGun:         false,
    despawnItemGun:       false,
    disableItemGravityGun: false,
    enableGravityAllItems: false,
    authorityGravityOnOff: false,
    authorityItemGravityStop: false,
    flingGun:             false,
    yeetBoardGun:         false,
    heavyItemGun:         false,
    zeroWeightGun:        false,
    buffGun:              false,
    maxSellGun:           false,
    tpAllGun2:            false,
    ammoPickupGun:        false,
    nutPickupGun:         false,
    nutSpam:              false,
    ammoSpam:             false,
    stunGun:              false,
    stinkyGun:            false,
  },

  // ── Misc ──────────────────────────────────────────────────
  misc: {
    rpcAuthBypass:        false,
    pvpKill:              false,
    safeZoneBypass:       false,
    multiShootMod:        false,
    stashDupe:            false,
    ejectDupeAmount:      1,
    sellingMachineDome:   false,
    christmasBoxDome:     false,
    vfxGun:               false,
    spawnVFXAtHand:       false,
    sfx:                  false,
    maxOutAllShredders:   false,
    shredderValue:        100,
    spawnShredders:       false,
  },

  // ── Whitelist ─────────────────────────────────────────────
  whitelist: {
    whitelistGun:         false,
    unwhitelistAll:       false,
    blacklistGun:         false,
    unblacklistEveryone:  false,
    kickWhitelisted:      false,
    whitelistFly:         false,
    whitelistPlayerOrbit: false,
    whitelistSellingMachine: false,
    whitelistOrbitTest:   false,
    wlPiss:               false,
    wlExactLeftHand:      false,
    wlLeftHand:           false,
    whitelistHandRPG:     false,
    whitelistHandFlare:   false,
    whitelistHandCar:     false,
    whitelistHandCrate:   false,
    whitelistHandSuitcase: false,
    whitelistHandBomb:    false,
    whitelistHandEgg:     false,
    whitelistHandBalloon: false,
    whitelistHandGiveaway: false,
    whitelistDisintegrate: false,
  },

  // ── Prefab ────────────────────────────────────────────────
  prefab: {
    changePrefab:               false,
    spawnPrefab:                false,
    prefabGrip:                 false,
    prefabGun:                  false,
    christmasBoxOrbitSelf:      false,
    sellingMachineOrbitSelf:    false,
    prefabOrbitSelfUp:          false,
    prefabOrbitSelfDown:        false,
    prefabSpiralUp:             false,
    prefabHaloOrbit:            false,
    movingSellingMachine:       false,
    holdAllMobs:                false,
    holdAllPrefabs:             false,
    selectedPrefabHandFollow:   false,
    selectedMobHandFollow:      false,
    christmasBoxHandFollow:     false,
    grabChristmasBox:           false,
    christmasBoxGripNoRotation: false,
    vehicleBuggyHandFollow:     false,
    sellingMachineHandFollow:   false,
    giantRockHandFollow:        false,
    rocketLauncher:             false,
    rocketDraw:                 false,
    rocketSpam:                 false,
    rocketSpamRolling:          false,
    boomspear:                  false,
    egg:                        false,
    cycleFlareDelay:            100,
    flare:                      false,
    grenadeProjectileLauncher:  false,
    robotDogRPG:                false,
    car:                        false,
  },

  // ── Themes ────────────────────────────────────────────────
  themes: {
    active: "default",
    customGunColor:   false,
    gunEffect:        false,
    gunHue:           0.0,
    gunSaturation:    1.0,
    gunBrightness:    1.0,
    gunOpacity:       1.0,
    dotFollowsBeam:   false,
    dotHue:           0.0,
  },

  // ── Sounds ────────────────────────────────────────────────
  sounds: {
    buttonSound:      false,
    menuOpenSound:    false,
    localPlay:        false,
    playMicSS:        false,
    stopSound:        false,
    refreshSoundFolder: false,
    customSoundPicker: null,
  },

  // ── Fire mods ─────────────────────────────────────────────
  fireMods: {
    infiniteAmmo:             false,
    rapidFireV2:              false,
    infiniteFlareGunAmmo:     false,
    infiniteWireframeGunAmmo: false,
    waterGunInfiniteAmmo:     false,
    infDamage:                false,
    noRecoil:                 false,
    noShotgunCooldown:        false,
    noRPGKnockback:           false,
  },

  // ── Item Tornado ──────────────────────────────────────────
  itemTornado: {
    tornado:          false,
    tornadoShape:     "tornado",
    tornadoSize:      1.0,
    tornadoRadius:    5.0,
    tornadoRadiusFromMe: false,
    spawnTornadoGun:  false,
    moveTornadoGun:   false,
    tornadoMoveSpeed: 5.0,
  },

  // ── Clone mods ────────────────────────────────────────────
  clones: {
    triggerCloneSpawn:  false,
    spawnClones:        false,
    cloneLine:          false,
    testClone:          false,
    cloneCircle:        false,
    rigPreset:          "default",
    rigFollow:          false,
    orbitClones:        false,
    cloneLineMode:      false,
    cloneGun:           false,
    voiceCloneGun:      false,
    clearClones:        false,
    invisible:          false,
    ragdoll:            false,
  },

  // ── Player Appearance ─────────────────────────────────────
  playerAppearance: {
    bodyScalePlus:    false,
    bodyScaleMinus:   false,
    giantMode:        false,  // 2.5x
    tinyMode:         false,  // 0.35x
    resetMyScale:     false,
  },

  // ── World / Environment ───────────────────────────────────
  world: {
    gravityNormal:    true,
    gravityLow:       false,  // 0.3x
    gravityMoon:      false,  // 0.16x
    gravityHeavy:     false,  // 2.5x
    fogOff:           false,
    fogHeavy:         false,
  },

  // ── UI / HUD ──────────────────────────────────────────────
  ui: {
    hideNametags:       false,
    mirrorCamToScreen:  false,
    rightHandedWatch:   false,
  },

  // ── Social / Multiplayer ──────────────────────────────────
  social: {
    playerColor:      false,
    voiceEffect:      false,
    voiceVolumePlus:  false,
    voiceVolumeMinus: false,
  },

  // ── Weapons / Tools ───────────────────────────────────────
  weapons: {
    jellyWobbleHeld:  false,
    invisibleWeapon:  false,
  },

  // ── Testing mods ──────────────────────────────────────────
  testing: {
    walkSim:          false,
    thirdPerson:      false,
    timeStop:         false,
    aimbot:           false,
    turretMode:       false,
    telekinesis:      false,
    dashForward:      false,
    rocketJump:       false,
    laserSight:       false,
    photoMode:        false,
    discoMode:        false,
    jellyWorld:       false,
    noDespawn:        false,
    bouncyWorld:      false,
    earthquake:       false,
    floorIsLava:      false,
    slowMoField:      false,
    itemTornado:      false,
    itemOrbitRing:    false,
    itemRain:         false,
    itemConveyor:     false,
    itemFountain:     false,
    itemSnake:        false,
    itemWall:         false,
    itemTower:        false,
    itemBridge:       false,
    itemLadder:       false,
    itemCircle:       false,
    itemSphere:       false,
    meteorShower:     false,
    itemBlackHole:    false,
    itemMitosis:      false,
    resetItemSizes:   false,
    antiGravBubble:   false,
    magnetBoots:      false,
    itemShield:       false,
    gatherAllItems:   false,
    cleanupNearby:    false,
    autoSellNearby:   false,
    autoGrabMagnet:   false,
    itemJuggler:      false,
    scaleByDistance:  false,
    itemSorter:       false,
    freezeAllItems:   false,
    unfreezeAllItems: false,
    itemNuke:         false,
    explosiveRounds:  false,
    freezeRounds:     false,
    blackHoleRounds:  false,
    stickyRounds:     false,
    duplicateRounds:  false,
    vfxRounds:        false,
    ricochetRounds:   false,
    soundRounds:      false,
    rainbowRounds:    false,
    teleportRounds:   false,
    tracerRounds:     false,
    paintGun:         false,
    shrinkRay:        false,
    growRay:          false,
    itemGun:          false,
    vacuumGun:        false,
    pushGun:          false,
    handCannon:       false,
    mobSpawnerGun:    false,
    mobArmy:          false,
    mobRain:          false,
    cageNearestPlayer: false,
    swapWithPlayer:   false,
    itemRoulette:     false,
    vfxTrail:         false,
    explosionTrail:   false,
    vfxRouletteGun:   false,
    instantMillionaire: false,
    launchPad:        false,
    chainExplosion:   false,
    confettiBurst:    false,
    proximityMine:    false,
    timedBomb:        false,
    rainbowGun:       false,
    customColourGun:  false,
    ghostGun:         false,
    invisibleGun:     false,
    giantGun:         false,
    tinyGun:          false,
    gunSpin:          false,
    gravityWell:      false,
    zeroGZone:        false,
    thirdPersonDistance: 5.0,
    thirdPersonHeight:   2.0,
    walkSimSpeed:     5.0,
  },

  // ── Mommy Milker ──────────────────────────────────────────
  momBoss: {
    spawnMomBoss:     false,
    spawnMomAtMe:     false,
    momResetGame:     false,
    momEasyMode:      false,
    momAlwaysWin:     false,
    momToyBlock:      false,
    momSimonSays:     false,
    momFloorSlap:     false,
    momBladeBall:     false,
    momSummonZombies: false,
    momSupplyBurst:   false,
    hordeOn:          false,
    momKillZombies:   false,
    momSuccess:       false,
    momDeath:         false,
    momBossToMe:      false,
  },

  // ── Blueprints ────────────────────────────────────────────
  blueprints: {
    blueprintDraw:        false,
    saveBlueprintDraw:    false,
    refreshBlueprints:    false,
    appleBlueprint:       false,
    spawnFirstSavedMachineBP: false,
    forceDeleteBlueprints: false,
    spawnNativeGoop:      false,
    blueprintCreative:    false,
    selectBPItemID:       0,
    bpAxis:               false,
    bpDetail:             false,
    forceSaveBlueprintItem: false,
    unlockAllBlueprintSlots: false,
    appleBlueprintGun:    false,
    stickBuild:           false,
    clearDrawnItemBP:     false,
    spawnAppleStickChild: false,
  },

  // ── Quiver chaos ──────────────────────────────────────────
  quiverChaos: {
    bounceGun:          false,
    colorStrobe:        false,
    screenShake:        false,
    voiceGlitch:        false,
    spinSpam:           false,
    gravityInvert:      false,
    slippery:           false,
    heavy:              false,
    acceleration:       false,
    sticky:             false,
    blind:              false,
    deaf:               false,
    lagSimulator:       false,
    blurVision:         false,
    invertControls:     false,
    renameSpam:         false,
    teamSwap:           false,
    modelFlicker:       false,
    scaleWobble:        false,
    voiceSpeed:         false,
    rainbowLaser:       false,
    buffRoulette:       false,
    statusEffect:       false,
    physicsExplosion:   false,
    ultimateChaos:      false,
    rotationChaos:      false,
    sizePulse:          false,
    velocityReverse:    false,
    audioPitch:         false,
    stutterTeleport:    false,
    wobbleWalk:         false,
    orbit:              false,
    gravityWave:        false,
    rainbowPulse:       false,
    scaleStrobe:        false,
    forceSpiral:        false,
    invertVision:       false,
    jellySpin:          false,
    audioDistortion:    false,
    positionWarp:       false,
    freezePulse:        false,
    forceVortex:        false,
    colorIntensity:     false,
    scaleChain:         false,
    stunPulse:          false,
    waveForce:          false,
    jellyIntensify:     false,
    screenFlicker:      false,
    teleportChain:      false,
    rotationSpeed:      false,
    forceKnockback:     false,
    jellyChaos:         false,
    colorShift:         false,
    doubleBounce:       false,
    darknessFade:       false,
    horizontalSpin:     false,
    verticalForce:      false,
    scaleRandomizer:    false,
    multiBuff:          false,
    statusCombo:        false,
    directionalPush:    false,
    extremeContrasts:   false,
    compoundShake:      false,
    diagonalSpin:       false,
    scaleExtreme:       false,
    voiceLayer:         false,
    burstForce:         false,
    megaStrobe:         false,
    chaosTeleport:      false,
    intensityModulator: false,
    paradox:            false,
    feedbackLoop:       false,
    supernova:          false,
    // mass/formation
    chaosRollAll:       false,
    dotArmageddon:      false,
    voidOrJackpot:      false,
    godRollMe:          false,
    blackholeDot:       false,
    mobTsunami:         false,
    richesOrRuin:       false,
    quantumPrison:      false,
    itemMeteorShower:   false,
    bossBlender:        false,
    lobbyToDot:         false,
    skyLadderAll:       false,
    circlePrisonMax:    false,
    spiralPrisonMax:    false,
    voidDropAll:        false,
    titanGodAll:        false,
    microAntAll:        false,
    jackpotMoneyAll:    false,
    buffRouletteMax:    false,
    voiceChaosMax:      false,
    killAllAtDot:       false,
    blenderStackAll:    false,
    // formations
    selectedHaloX24:    false,
    selectedTowerX18:   false,
    selectedWall5x5:    false,
    selectedTunnelX20:  false,
    selectedRainX30:    false,
    selectedShotgunX12: false,
    selectedCrossX17:   false,
    rocketFlower:       false,
    rocketTunnel:       false,
    buggyFortress:      false,
    machineCage:        false,
    christmasSpiral:    false,
    flareHelix:         false,
  },

  // ── Users ─────────────────────────────────────────────────
  users: {
    selectedUser:         null,
    kickSelected:         false,
    kickEveryoneOnce:     false,
    autoKickAll:          false,
    blockKickPlayer:      false,
    whitelistSelected:    false,
    unwhitelistSelected:  false,
    buffIDPlus:           false,
    buffIDMinus:          false,
    buffSelected:         false,
    buffEveryone:         false,
    shakeScreenSelected:  false,
    shakeScreenEveryone:  false,
    stunSelected:         false,
    stunEveryone:         false,
    sizePlusSelected:     false,
    sizeMinusSelected:    false,
    growSelected:         false,
    smallSelected:        false,
    resetSizeSelected:    false,
    growEveryone:         false,
    smallEveryone:        false,
    resetSizeEveryone:    false,
    muteSelected:         false,
    loudSelected:         false,
    muteEveryone:         false,
    loudEveryone:         false,
    savelobbyUsers:       false,
  },

  // ── VFX ───────────────────────────────────────────────────
  vfx: {
    enableSelectedVFXHoldSpam: false,
    vfxAimGun:          false,
    actionAimGun:       false,
    actionHoldSpam:     false,
    playSelectedVFXOnce: false,
    rpEarnGun:          false,
    vfxGun:             false,
    vfxGunV2:           false,
    allVFXGun:          false,
    vfxCycle:           false,
    worldVFXCycle:      false,
    worldVFXGun:        false,
    explosionCycle:     false,
    explosionGun:       false,
  },

  // ── Item colour ───────────────────────────────────────────
  itemColour: {
    pickerActive:       false,
    saturation:         1.0,
    scale:              1.0,
    applyToSpawn:       false,
    applyToHeld:        false,
    applyToDrawnBP:     false,
    drawnUsesScale:     false,
    resetColour:        false,
    resetScale:         false,
  },

  // ── RPC test mods ─────────────────────────────────────────
  rpcTest: {
    launchGun:          false,
    stunGun:            false,
    awardKillGun:       false,
    setRedTeamGun:      false,
    setBlueTeamGun:     false,
    hit50Gun:           false,
    hit1Gun:            false,
    tagStinkyGun:       false,
    teleportUpGun:      false,
    colorRedGun:        false,
    colorResetGun:      false,
    colorYellowGun:     false,
    colorGreenGun:      false,
    colorBlueGun:       false,
    colorPurpleGun:     false,
    colorPinkGun:       false,
    forceRagdollGun:    false,
    speedBuffGun:       false,
    jumpBuffGun:        false,
    noTeamGun:          false,
    scaleBigGun:        false,
    scaleNormalGun:     false,
    scaleTinyGun:       false,
    buffScaleBigGun:    false,
    muffleGun:          false,
    squeakyGun:         false,
    jellyGun:           false,
    radioactiveGun:     false,
    screenShakeGun:     false,
    screenShakeExtremeGun: false,
    hideGun:            false,
    showGun:            false,
    killGun:            false,
    reviveGun:          false,
    money100kGun:       false,
    money1mGun:         false,
  },

  // ── Custom Maps ───────────────────────────────────────────
  customMaps: {
    openMapsFileLocation: false,
    openMapImporter:      false,
    reloadMapList:        false,
  },

  // ── Anti-RPC ──────────────────────────────────────────────
  antiRPC: {
    kick: false,
  },

  // ── Text items ────────────────────────────────────────────
  textItems: {
    spawnV4Items:       false,
    discordHellOre:     false,
    moonyItems:         false,
    pornhubItems:       false,
    tuffItems:          false,
    moddedItem:         false,
    spawnV4IsTuff:      false,
  },

  // ── Debug / Dump ──────────────────────────────────────────
  debug: {
    dumpItemNames:      false,
    dumpPrefabNames:    false,
    dumpMobNames:       false,
    dumpVFXNames:       false,
    dumpAllNames:       false,
    dumpContainerMethods: false,
    dumpSpawnFXMethods: false,
    dumpLiveItems:      false,
    dumpLivePrefabs:    false,
    dumpAllClasses:     false,
    dumpAllLiveImages:  false,
    itemInspectorGun:   false,
    globalDump:         false,
    dumpToFilesFolder:  false,
    organizedDump:      false,
    inspectorGunV1:     false,
    inspectorGunV2:     false,
    dumpAllRPCs:        false,
    nuclearDumpAll:     false,
  },
};

// ─────────────────────────────────────────────────────────────
//  DISCORD WEBHOOK WATCHER
// ─────────────────────────────────────────────────────────────
const WEBHOOK = {
  send(title, description, color = 0x00ff99, fields = []) {
    if (!CFG.WEBHOOK_ENABLED) return;
    try {
      const body = JSON.stringify({
        embeds: [{
          title: `${CFG.MOD_TAG} ${title}`,
          description,
          color,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: `Animal Company Mod | PID ${Process.id}` },
        }]
      });
      const req = new XMLHttpRequest();
      req.open("POST", CFG.DISCORD_WEBHOOK, true);
      req.setRequestHeader("Content-Type", "application/json");
      req.send(body);
    } catch(e) {
      console.error(`[WEBHOOK] failed: ${e}`);
    }
  },

  modToggled(name, state) {
    this.send(
      "Cheat Toggle",
      `**${name}** → ${state ? "🟢 ON" : "🔴 OFF"}`,
      state ? 0x00ff99 : 0xff4444
    );
  },

  playerJoined(name, id) {
    this.send("Player Joined", `👤 **${name}** joined`, 0x5865f2, [
      { name: "Player ID", value: String(id), inline: true },
    ]);
  },

  playerLeft(name) {
    this.send("Player Left", `🚪 **${name}** left`, 0xffa500);
  },

  cheatUsed(cheat, detail) {
    this.send("Cheat Used", `⚡ ${cheat}\n${detail}`, 0xffd700);
  },

  sessionStart(version, pkg) {
    this.send("Session Started", `✅ Menu active\n**Game:** ${pkg}\n**Version:** ${version}`, 0x00ff99);
  },
};

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function tryHook(label, fn) {
  try {
    fn();
    console.log(`${CFG.MOD_TAG} ✓ ${label}`);
  } catch(e) {
    console.log(`${CFG.MOD_TAG} ✗ ${label}: ${e.message}`);
  }
}

function getClass(assemblyName, className) {
  return Il2Cpp.domain
    .assembly(assemblyName)
    .image.class(className);
}

function getMethod(assemblyName, className, methodName, argCount = -1) {
  const klass = getClass(assemblyName, className);
  return argCount >= 0
    ? klass.method(methodName, argCount)
    : klass.method(methodName);
}

// ─────────────────────────────────────────────────────────────
//  APPLY SYMBOL MAP  (must run before Il2Cpp.perform)
// ─────────────────────────────────────────────────────────────
Il2Cpp.$config.exports = Object.fromEntries(
  Object.entries(SYM).map(([k, v]) => [k, () => Il2Cpp.module.findExportByName(v)])
);

// ─────────────────────────────────────────────────────────────
//  DEBUG DUMP  (set CFG.DEBUG_DUMP = true first run)
// ─────────────────────────────────────────────────────────────
function runDump() {
  if (!CFG.DEBUG_DUMP) return;
  console.log(`${CFG.MOD_TAG} ═══ FULL DUMP START ═══`);
  for (const assembly of Il2Cpp.domain.assemblies) {
    console.log(`[ASM] ${assembly.name}`);
    for (const klass of assembly.image.classes) {
      console.log(`  [CLS] ${klass.fullName}`);
      for (const method of klass.methods) {
        console.log(`    [MTH] ${method.name}(${method.parameters.map(p => p.type.name).join(", ")}) @ 0x${method.relativeVirtualAddress.toString(16)}`);
      }
      for (const field of klass.fields) {
        console.log(`    [FLD] ${field.type.name} ${field.name} @ +0x${field.offset.toString(16)}`);
      }
    }
  }
  console.log(`${CFG.MOD_TAG} ═══ FULL DUMP END ═══`);
}

// ─────────────────────────────────────────────────────────────
//  HOOKS
// ─────────────────────────────────────────────────────────────

function installMovementHooks() {

  // Fly / noclip — hook CharacterController or rigidbody move
  tryHook("fly/noclip", () => {
    const klass = getClass("Assembly-CSharp", "PlayerMovement"); // adjust from dump
    const update = klass.method("Update");
    update.implementation = function() {
      if (STATE.movement.fly || STATE.movement.wasdFly) {
        const rb = this.field("rb")?.value;
        if (rb) rb.field("velocity")?.set([0, STATE.movement.flySpeed, 0]);
      }
      if (STATE.movement.noclip) {
        const cc = this.field("characterController")?.value;
        if (cc) cc.method("Move").invoke(Il2Cpp.valueType([0, 0.01, 0]));
      }
      return this.method("Update").invoke();
    };
  });

}

function installPlayerHooks() {

  // Invincible / inf health
  tryHook("invincible/infHealth", () => {
    const klass = getClass("Assembly-CSharp", "PlayerHealth"); // adjust
    const takeDamage = klass.method("TakeDamage");
    takeDamage.implementation = function(dmg, attacker) {
      if (STATE.player.invincible || STATE.player.infHealth) {
        WEBHOOK.cheatUsed("Invincible", `Blocked ${dmg} dmg`);
        return;
      }
      return this.method("TakeDamage").invoke(dmg, attacker);
    };
  });

  // Invisible
  tryHook("invisible", () => {
    const klass = getClass("Assembly-CSharp", "PlayerVisuals"); // adjust
    const setVisible = klass.method("SetVisible");
    setVisible.implementation = function(v) {
      if (STATE.player.invisible) return;
      return this.method("SetVisible").invoke(v);
    };
  });

}

function installGunHooks() {

  // Rapid fire / inf ammo
  tryHook("rapidFire/infAmmo", () => {
    const klass = getClass("Assembly-CSharp", "Gun"); // adjust
    const shoot = klass.method("Shoot");
    shoot.implementation = function() {
      if (STATE.fireMods.infiniteAmmo) {
        this.field("ammo")?.set(9999);
      }
      if (STATE.fireMods.noRecoil) {
        this.field("recoilForce")?.set(0.0);
      }
      const result = this.method("Shoot").invoke();
      if (STATE.fireMods.rapidFireV2) {
        this.field("shootCooldown")?.set(0.0);
      }
      return result;
    };
  });

  // No RPG knockback
  tryHook("noRPGKnockback", () => {
    const klass = getClass("Assembly-CSharp", "RPGLauncher"); // adjust
    const applyKnockback = klass.method("ApplyKnockback");
    applyKnockback.implementation = function(...args) {
      if (STATE.fireMods.noRPGKnockback) return;
      return this.method("ApplyKnockback").invoke(...args);
    };
  });

}

function installWorldHooks() {

  // Gravity
  tryHook("gravity", () => {
    const Physics = getClass("UnityEngine.PhysicsModule", "Physics"); // adjust
    const gravField = Physics.field("gravity");
    // poll gravity state every 500ms
    setInterval(() => {
      if (STATE.world.gravityLow)   gravField.value = [0, -9.81 * 0.3, 0];
      else if (STATE.world.gravityMoon)  gravField.value = [0, -9.81 * 0.16, 0];
      else if (STATE.world.gravityHeavy) gravField.value = [0, -9.81 * 2.5, 0];
      else if (STATE.world.gravityNormal) gravField.value = [0, -9.81, 0];
    }, 500);
  });

}

function installNetworkWatcher() {

  // Watch player joins
  tryHook("player join watcher", () => {
    const klass = getClass("Assembly-CSharp", "NetworkManager"); // adjust
    const onJoin = klass.method("OnPlayerJoined");
    onJoin.implementation = function(player) {
      const name = player?.field("playerName")?.value?.toString() ?? "Unknown";
      const id   = player?.field("playerID")?.value ?? -1;
      WEBHOOK.playerJoined(name, id);
      console.log(`${CFG.MOD_TAG} JOIN: ${name} (${id})`);
      return this.method("OnPlayerJoined").invoke(player);
    };
  });

  // Watch player leaves
  tryHook("player leave watcher", () => {
    const klass = getClass("Assembly-CSharp", "NetworkManager"); // adjust
    const onLeave = klass.method("OnPlayerLeft");
    onLeave.implementation = function(player) {
      const name = player?.field("playerName")?.value?.toString() ?? "Unknown";
      WEBHOOK.playerLeft(name);
      console.log(`${CFG.MOD_TAG} LEAVE: ${name}`);
      return this.method("OnPlayerLeft").invoke(player);
    };
  });

}

function installOtherPlayerHooks() {

  tryHook("killAll", () => {
    // Triggered via RPC when STATE.otherPlayer.killAll is toggled
    const klass = getClass("Assembly-CSharp", "PlayerHealth"); // adjust
    const killMethod = klass.method("Die");
    // Export callable for RPC use
    MODS.killAll = function() {
      // iterate live players
      const PlayerManager = getClass("Assembly-CSharp", "PlayerManager"); // adjust
      const players = PlayerManager.field("players")?.value;
      if (!players) return;
      for (const p of players) {
        tryHook("kill player", () => p.method("Die").invoke());
      }
      WEBHOOK.cheatUsed("Kill All", "Killed all players");
    };
  });

  tryHook("tpAllToMe", () => {
    MODS.tpAllToMe = function() {
      const selfPos = Il2Cpp.domain
        .assembly("Assembly-CSharp")
        .image.class("PlayerManager") // adjust
        .method("GetSelfPosition")?.invoke();
      if (!selfPos) return;
      const players = getClass("Assembly-CSharp", "PlayerManager")
        .field("players")?.value;
      for (const p of players ?? []) {
        p.method("Teleport")?.invoke(selfPos);
      }
      WEBHOOK.cheatUsed("TP All To Me", "Teleported everyone");
    };
  });

}

function installItemHooks() {

  tryHook("infSellValue", () => {
    const klass = getClass("Assembly-CSharp", "Item"); // adjust
    const getSellValue = klass.method("get_SellValue");
    getSellValue.implementation = function() {
      if (STATE.items.infSellValue) return 999999;
      return this.method("get_SellValue").invoke();
    };
  });

}

function installMiscHooks() {

  tryHook("rpcAuthBypass", () => {
    const klass = getClass("Assembly-CSharp", "RPCManager"); // adjust
    const validateRPC = klass.method("ValidateRPC");
    validateRPC.implementation = function(rpc, sender) {
      if (STATE.misc.rpcAuthBypass) return true;
      return this.method("ValidateRPC").invoke(rpc, sender);
    };
  });

  tryHook("safeZoneBypass", () => {
    const klass = getClass("Assembly-CSharp", "SafeZone"); // adjust
    const isInSafeZone = klass.method("IsInSafeZone");
    isInSafeZone.implementation = function() {
      if (STATE.misc.safeZoneBypass) return false;
      return this.method("IsInSafeZone").invoke();
    };
  });

}

function installBodyScaleHooks() {

  tryHook("playerScale", () => {
    const klass = getClass("Assembly-CSharp", "PlayerAppearance"); // adjust
    const setScale = klass.method("SetScale");
    setScale.implementation = function(s) {
      if (STATE.playerAppearance.giantMode)  s = 2.5;
      else if (STATE.playerAppearance.tinyMode) s = 0.35;
      return this.method("SetScale").invoke(s);
    };
  });

}

function installChaosHooks() {

  // Quiver fuckery — chainable chaos effects via ammo state
  tryHook("quiverChaos", () => {
    const klass = getClass("Assembly-CSharp", "QuiverAmmo"); // adjust
    const applyEffect = klass.method("ApplyEffect");
    applyEffect.implementation = function(target) {
      const c = STATE.quiverChaos;
      if (c.bounceGun)       this.method("ApplyBounce")?.invoke(target);
      if (c.colorStrobe)     this.method("ApplyColorStrobe")?.invoke(target);
      if (c.screenShake)     this.method("ApplyScreenShake")?.invoke(target);
      if (c.gravityInvert)   this.method("ApplyGravityInvert")?.invoke(target);
      if (c.spinSpam)        this.method("ApplySpinSpam")?.invoke(target);
      if (c.slippery)        this.method("ApplySlippery")?.invoke(target);
      if (c.teleportChain)   this.method("ApplyTeleportChain")?.invoke(target);
      if (c.supernova)       this.method("ApplySupernova")?.invoke(target);
      if (c.ultimateChaos)   this.method("ApplyUltimateChaos")?.invoke(target);
      return this.method("ApplyEffect").invoke(target);
    };
  });

}

// ─────────────────────────────────────────────────────────────
//  MOD CALLABLE REGISTRY  (call mods from RPC or remote)
// ─────────────────────────────────────────────────────────────
const MODS = {};

// ─────────────────────────────────────────────────────────────
//  RPC INTERFACE  (control from terminal or external client)
// ─────────────────────────────────────────────────────────────
function setupRPC() {

  // Toggle a boolean cheat: {"type":"toggle","category":"fireMods","key":"infiniteAmmo"}
  recv("toggle", msg => {
    const cat = STATE[msg.category];
    if (cat && msg.key in cat && typeof cat[msg.key] === "boolean") {
      cat[msg.key] = !cat[msg.key];
      const val = cat[msg.key];
      WEBHOOK.modToggled(`${msg.category}.${msg.key}`, val);
      console.log(`${CFG.MOD_TAG} ${msg.category}.${msg.key} = ${val}`);
      send({ type: "toggled", category: msg.category, key: msg.key, value: val });
    }
    recv("toggle", arguments.callee);
  });

  // Set a numeric value: {"type":"set","category":"movement","key":"flySpeed","value":10}
  recv("set", msg => {
    const cat = STATE[msg.category];
    if (cat && msg.key in cat) {
      cat[msg.key] = msg.value;
      console.log(`${CFG.MOD_TAG} SET ${msg.category}.${msg.key} = ${msg.value}`);
      send({ type: "set", category: msg.category, key: msg.key, value: msg.value });
    }
    recv("set", arguments.callee);
  });

  // Call a named mod action: {"type":"call","mod":"killAll"}
  recv("call", msg => {
    if (MODS[msg.mod]) {
      MODS[msg.mod](msg.args || {});
      console.log(`${CFG.MOD_TAG} CALLED ${msg.mod}`);
      send({ type: "called", mod: msg.mod });
    }
    recv("call", arguments.callee);
  });

  // Dump full state: {"type":"getState"}
  recv("getState", () => {
    send({ type: "state", state: STATE, cfg: CFG });
    recv("getState", arguments.callee);
  });

  // Batch toggle many mods at once: {"type":"batch","ops":[{"category":"fireMods","key":"infiniteAmmo","value":true},...]}
  recv("batch", msg => {
    for (const op of (msg.ops || [])) {
      const cat = STATE[op.category];
      if (cat && op.key in cat) cat[op.key] = op.value;
    }
    send({ type: "batchDone", count: msg.ops?.length });
    recv("batch", arguments.callee);
  });

}

// ─────────────────────────────────────────────────────────────
//  ENTRY POINT
// ─────────────────────────────────────────────────────────────
Il2Cpp.perform(() => {

  WEBHOOK.sessionStart(Il2Cpp.application.version, Il2Cpp.application.identifier);
  console.log(`${CFG.MOD_TAG} ══ Mod Menu Active ══`);
  console.log(`${CFG.MOD_TAG} Game: ${Il2Cpp.application.identifier} v${Il2Cpp.application.version}`);

  runDump();

  installNetworkWatcher();
  installMovementHooks();
  installPlayerHooks();
  installGunHooks();
  installWorldHooks();
  installOtherPlayerHooks();
  installItemHooks();
  installMiscHooks();
  installBodyScaleHooks();
  installChaosHooks();

  setupRPC();

  console.log(`${CFG.MOD_TAG} All hooks installed. RPC ready.`);
  console.log(`${CFG.MOD_TAG} Send {"type":"getState"} to see full mod state.`);

});
