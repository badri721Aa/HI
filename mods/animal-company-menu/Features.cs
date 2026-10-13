// C# — toggle state + the cheats that don't need a Harmony patch (noclip is pure
// transform override, so it's driven from Plugin.Update instead of a patch).
using UnityEngine;

namespace AnimalCompanyMenu
{
    public static class Features
    {
        public static bool GodMode;
        public static bool InfiniteStamina;
        public static bool NoFallDamage;

        public static bool SpeedHack;
        public static float SpeedMultiplier = 2.5f;
        public static float BaseMoveSpeed = 4.6f; // overwritten from the real field once the player spawns, see Patches.OnPlayerStart

        public static bool NoClip;
        public static float NoClipSpeed = 12f;

        public static void Tick()
        {
            if (NoClip) TickNoClip();
        }

        private static void TickNoClip()
        {
            Transform t = Patches.LocalPlayerTransform;
            if (t == null) return;

            if (Patches.LocalPlayerRigidbody != null)
                Patches.LocalPlayerRigidbody.isKinematic = true; // stop physics overriding the manual move below

            Vector3 move = Vector3.zero;
            if (Input.GetKey(KeyCode.W)) move += t.forward;
            if (Input.GetKey(KeyCode.S)) move -= t.forward;
            if (Input.GetKey(KeyCode.A)) move -= t.right;
            if (Input.GetKey(KeyCode.D)) move += t.right;
            if (Input.GetKey(KeyCode.Space)) move += Vector3.up;
            if (Input.GetKey(KeyCode.LeftControl)) move -= Vector3.up;

            if (move.sqrMagnitude > 0f)
                t.position += move.normalized * NoClipSpeed * Time.deltaTime;
        }

        public static void ExitNoClip()
        {
            if (Patches.LocalPlayerRigidbody != null)
                Patches.LocalPlayerRigidbody.isKinematic = false;
        }
    }
}
