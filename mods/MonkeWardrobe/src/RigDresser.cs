using System.Collections.Generic;
using Photon.Pun;
using UnityEngine;

namespace MonkeWardrobe
{
    /// <summary>
    /// Keeps the cosmetics on every gorilla in the scene matching what its player has equipped.
    /// Gorilla Tag recycles rig objects between players, so instead of reacting to join/leave events this
    /// re-checks every rig a couple of times a second and rebuilds only the ones whose wanted look changed.
    /// </summary>
    internal sealed class RigDresser : MonoBehaviour
    {
        const float ScanInterval = 0.5f;
        const string MirrorOnlyLayerName = "MirrorOnly";

        sealed class DressedRig
        {
            public string Signature;
            public readonly Transform[] Anchors = new Transform[Slots.All.Length];
        }

        readonly Dictionary<int, DressedRig> dressed = new Dictionary<int, DressedRig>();
        readonly HashSet<int> seen = new HashSet<int>();
        readonly List<int> gone = new List<int>();
        float nextScan;
        int mirrorOnlyLayer = int.MinValue;

        static Plugin Mod => Plugin.Instance;

        void Update()
        {
            if (Time.unscaledTime < nextScan)
                return;
            nextScan = Time.unscaledTime + ScanInterval;
            Reconcile();
        }

        void OnDestroy() => UndressAll();

        public void UndressAll()
        {
            foreach (DressedRig rig in dressed.Values)
                Undress(rig);
            dressed.Clear();
            nextScan = 0f;
        }

        public void ApplyFit(CosmeticSlot slot)
        {
            SlotFit fit = Mod.Calibration[slot];
            foreach (DressedRig rig in dressed.Values)
            {
                Transform anchor = rig.Anchors[(int)slot];
                if (anchor != null)
                    fit.ApplyTo(anchor);
            }
        }

        void Reconcile()
        {
            seen.Clear();
            foreach (Component rig in RigBridge.FindRigs())
            {
                if (rig == null)
                    continue;
                int key = rig.GetInstanceID();
                seen.Add(key);

                Loadout wanted = Wanted(rig, out bool isLocal);
                string signature = wanted == null || wanted.IsEmpty
                    ? ""
                    : $"{Mod.Library.Generation}|{(isLocal && Mod.HideOwnHeadCosmetics.Value ? "hide" : "show")}|{wanted.Encode()}";

                dressed.TryGetValue(key, out DressedRig current);
                if (current != null && current.Signature == signature)
                    continue;
                if (current != null)
                    Undress(current);

                if (signature.Length == 0)
                    dressed.Remove(key);
                else
                    dressed[key] = Dress(rig, wanted, isLocal, signature);
            }

            // Rigs that were destroyed or put back in the game's pool since the last scan.
            gone.Clear();
            foreach (int key in dressed.Keys)
            {
                if (!seen.Contains(key))
                    gone.Add(key);
            }
            foreach (int key in gone)
            {
                Undress(dressed[key]);
                dressed.Remove(key);
            }
        }

        Loadout Wanted(Component rig, out bool isLocal)
        {
            isLocal = RigBridge.IsLocalRig(rig);
            if (!Mod.Enabled.Value)
                return null;
            // You always see your own look; whether anyone else does is RoomSync's call.
            if (isLocal)
                return Mod.Loadout;
            if (!Mod.Sync.SharingAllowed)
                return null;

            // The game also keeps a hidden networked copy of your own gorilla; skip it.
            int actor = RigBridge.GetOwnerActorNumber(rig);
            if (actor <= 0 || (PhotonNetwork.LocalPlayer != null && actor == PhotonNetwork.LocalPlayer.ActorNumber))
                return null;
            return Mod.Sync.TryGetLoadout(actor, out Loadout loadout) ? loadout : null;
        }

        DressedRig Dress(Component rig, Loadout wanted, bool isLocal, string signature)
        {
            var result = new DressedRig { Signature = signature };
            foreach (CosmeticSlot slot in Slots.All)
            {
                // The definition must also be for this slot: another player can't put a hat on a hand.
                if (!Mod.Library.TryGet(wanted[slot], out CosmeticDefinition definition) || definition.Slot != slot)
                    continue;

                bool coversEyes = isLocal && Mod.HideOwnHeadCosmetics.Value && (slot == CosmeticSlot.Head || slot == CosmeticSlot.Face);
                int layer = -1;
                if (coversEyes)
                {
                    layer = MirrorOnlyLayer();
                    // Without the mirror-only layer the cosmetic would sit inside your VR view; skip it.
                    if (layer < 0)
                        continue;
                }

                Transform bone = RigBridge.FindAnchor(rig, slot);
                var anchor = new GameObject(CosmeticLibrary.ObjectPrefix + slot).transform;
                anchor.SetParent(bone, false);
                Mod.Calibration[slot].ApplyTo(anchor);

                if (Mod.Library.Spawn(definition, anchor) == null)
                {
                    Destroy(anchor.gameObject);
                    continue;
                }
                SetLayer(anchor, layer >= 0 ? layer : bone.gameObject.layer);
                result.Anchors[(int)slot] = anchor;
            }
            return result;
        }

        static void Undress(DressedRig rig)
        {
            foreach (Transform anchor in rig.Anchors)
            {
                if (anchor != null)
                    Destroy(anchor.gameObject);
            }
        }

        int MirrorOnlyLayer()
        {
            if (mirrorOnlyLayer == int.MinValue)
            {
                mirrorOnlyLayer = LayerMask.NameToLayer(MirrorOnlyLayerName);
                if (mirrorOnlyLayer < 0)
                    RigBridge.ReportOnce("layer", $"The \"{MirrorOnlyLayerName}\" layer is missing, so your own Head and Face cosmetics are hidden to keep them out of your view. Set HideOwnHeadCosmetics = false to show them anyway.");
            }
            return mirrorOnlyLayer;
        }

        static void SetLayer(Transform root, int layer)
        {
            root.gameObject.layer = layer;
            foreach (Transform child in root)
                SetLayer(child, layer);
        }
    }
}
