// C# / Harmony patches into Animal Company's Assembly-CSharp.dll.
//
// ASSUMPTION (stated once, confirm via dnSpy): Animal Company follows the same class
// layout as Lethal-Company-style co-op scavenge/horror games — a per-player
// MonoBehaviour (PlayerControllerB) with a move-speed field and a TakeDamage/stamina
// drain method, an enemy base class (EnemyAI), and a grabbable item base class
// (GrabbableObject). Every line below marked FILL needs the real name swapped in —
// see README "Dumping the real names" for the exact dnSpy search terms.
using System.Collections.Generic;
using HarmonyLib;
using UnityEngine;

namespace AnimalCompanyMenu
{
    public static class Patches
    {
        public static Transform LocalPlayerTransform;
        public static Rigidbody LocalPlayerRigidbody;

        public static readonly List<Component> AllEnemies = new List<Component>();
        public static readonly List<Component> AllItems = new List<Component>();
        public static readonly List<Component> AllPlayers = new List<Component>();

        // FILL: real player type is likely PlayerControllerB or PlayerController.
        // dnSpy: search types for a MonoBehaviour whose FixedUpdate reads
        // Input.GetAxis("Horizontal"/"Vertical") and calls CharacterController.Move or
        // Rigidbody.MovePosition — that's it. Rename every PlayerControllerB below.
        [HarmonyPatch(typeof(PlayerControllerB), "Start")]
        [HarmonyPostfix]
        static void OnPlayerStart(PlayerControllerB __instance)
        {
            // FILL: swap for whatever actually marks "this is my local player"
            // (isLocalPlayer / IsOwner / photonView.IsMine / NetworkObject.IsOwner).
            if (!__instance.IsOwner) return;

            LocalPlayerTransform = __instance.transform;
            LocalPlayerRigidbody = __instance.GetComponent<Rigidbody>();
            Features.BaseMoveSpeed = __instance.moveSpeed; // FILL: real field name for walk speed
        }

        [HarmonyPatch(typeof(PlayerControllerB), "Update")]
        [HarmonyPostfix]
        static void TrackAllPlayers(PlayerControllerB __instance)
        {
            if (!AllPlayers.Contains(__instance))
                AllPlayers.Add(__instance);
        }

        // FILL: real damage entry point — search for TakeDamage(int)/TakeDamage(float)
        // or DamagePlayer(...) called from enemy attack code.
        [HarmonyPatch(typeof(PlayerControllerB), "TakeDamage")]
        [HarmonyPrefix]
        static bool BlockDamage() => !Features.GodMode; // returning false skips the original call entirely

        // FILL: real stamina drain, usually ticked every FixedUpdate while sprinting.
        [HarmonyPatch(typeof(PlayerControllerB), "DrainStamina")]
        [HarmonyPrefix]
        static bool BlockStaminaDrain() => !Features.InfiniteStamina;

        // FILL: real speed field, applied right before the move call each FixedUpdate.
        [HarmonyPatch(typeof(PlayerControllerB), "FixedUpdate")]
        [HarmonyPrefix]
        static void ApplySpeedHack(PlayerControllerB __instance)
        {
            if (Features.SpeedHack)
                __instance.moveSpeed = Features.BaseMoveSpeed * Features.SpeedMultiplier;
        }

        // FILL: real fall-damage check — usually a landed/OnCollisionEnter callback.
        [HarmonyPatch(typeof(PlayerControllerB), "FallDamage")]
        [HarmonyPrefix]
        static bool BlockFallDamage() => !Features.NoFallDamage;

        // FILL: real enemy base class (commonly EnemyAI). Patching Start/OnDestroy keeps
        // the ESP list current without rescanning the scene every frame.
        [HarmonyPatch(typeof(EnemyAI), "Start")]
        [HarmonyPostfix]
        static void OnEnemySpawned(EnemyAI __instance) => AllEnemies.Add(__instance);

        [HarmonyPatch(typeof(EnemyAI), "OnDestroy")]
        [HarmonyPostfix]
        static void OnEnemyDespawned(EnemyAI __instance) => AllEnemies.Remove(__instance);

        // FILL: real item/loot base class (commonly GrabbableObject).
        [HarmonyPatch(typeof(GrabbableObject), "Start")]
        [HarmonyPostfix]
        static void OnItemSpawned(GrabbableObject __instance) => AllItems.Add(__instance);

        [HarmonyPatch(typeof(GrabbableObject), "OnDestroy")]
        [HarmonyPostfix]
        static void OnItemDespawned(GrabbableObject __instance) => AllItems.Remove(__instance);
    }
}
