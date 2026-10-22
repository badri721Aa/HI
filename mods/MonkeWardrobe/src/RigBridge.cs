using System;
using System.Collections.Generic;
using System.Reflection;
using Photon.Pun;
using UnityEngine;
using Object = UnityEngine.Object;

namespace MonkeWardrobe
{
    /// <summary>
    /// Everything MonkeWardrobe knows about Gorilla Tag's own classes lives here, looked up by name at
    /// runtime instead of compiled against. When a game update renames something, this is the only file
    /// to fix, and until then the affected feature logs once and switches off instead of throwing.
    /// </summary>
    internal static class RigBridge
    {
        const BindingFlags InstanceMembers = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
        const BindingFlags StaticMembers = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;

        // Each path is tried in order; the first that yields a positive actor number wins.
        static readonly string[][] OwnerPaths =
        {
            new[] { "Creator", "ActorNumber" },
            new[] { "OwningNetPlayer", "ActorNumber" },
            new[] { "creator", "ActorNumber" },
        };

        // Preferred: VRRig's VRMap fields (head, leftHand, rightHand) expose the bone they drive as rigTarget.
        static readonly Dictionary<CosmeticSlot, string> RigMaps = new Dictionary<CosmeticSlot, string>
        {
            [CosmeticSlot.Head] = "head",
            [CosmeticSlot.Face] = "head",
            [CosmeticSlot.LeftHand] = "leftHand",
            [CosmeticSlot.RightHand] = "rightHand",
        };

        // Fallback (and the only option for Body): bone names in the gorilla model, searched breadth-first.
        static readonly Dictionary<CosmeticSlot, string[]> BoneNames = new Dictionary<CosmeticSlot, string[]>
        {
            [CosmeticSlot.Head] = new[] { "head" },
            [CosmeticSlot.Face] = new[] { "head" },
            [CosmeticSlot.Body] = new[] { "body", "chest", "spine" },
            [CosmeticSlot.LeftHand] = new[] { "hand.L", "hand_L", "LeftHand" },
            [CosmeticSlot.RightHand] = new[] { "hand.R", "hand_R", "RightHand" },
        };

        static readonly Dictionary<(Type, string, bool), MemberInfo> members = new Dictionary<(Type, string, bool), MemberInfo>();
        static readonly HashSet<string> reported = new HashSet<string>();
        static Type rigType;
        static Type taggerType;
        static bool typesResolved;

        public static Type RigType
        {
            get
            {
                ResolveTypes();
                return rigType;
            }
        }

        public static Component[] FindRigs()
        {
            if (RigType == null)
                return Array.Empty<Component>();

            Object[] found = Object.FindObjectsOfType(RigType);
            var rigs = new Component[found.Length];
            for (int i = 0; i < found.Length; i++)
                rigs[i] = found[i] as Component;
            return rigs;
        }

        /// <summary>The rig the local player sees themself as (in mirrors and when looking down).</summary>
        public static bool IsLocalRig(Component rig)
        {
            if (TryRead(rig, "isOfflineVRRig", out object flag) && flag is bool isOffline)
                return isOffline;

            object tagger = LocalTagger();
            if (TryRead(tagger, "offlineVRRig", out object offline))
                return ReferenceEquals(offline, rig);

            ReportOnce("local-rig", "Could not tell which gorilla is you (VRRig.isOfflineVRRig and GorillaTagger.offlineVRRig are both missing).");
            return false;
        }

        /// <summary>The Photon actor number of the player who owns <paramref name="rig"/>, or -1 when unknown.</summary>
        public static int GetOwnerActorNumber(Component rig)
        {
            foreach (string[] path in OwnerPaths)
            {
                if (TryReadPath(rig, path, out object value) && value is int actor && actor > 0)
                {
                    ReportOnce("owner:" + path[0], "Matching gorillas to players through VRRig." + string.Join(".", path) + ".", isError: false);
                    return actor;
                }
            }

            PhotonView view = rig.GetComponent<PhotonView>();
            if (view == null)
                view = rig.GetComponentInParent<PhotonView>();
            if (view != null && view.Owner != null)
            {
                ReportOnce("owner:view", "Matching gorillas to players through PhotonView.Owner.", isError: false);
                return view.Owner.ActorNumber;
            }
            return -1;
        }

        public static Transform FindAnchor(Component rig, CosmeticSlot slot)
        {
            if (RigMaps.TryGetValue(slot, out string map) && TryReadPath(rig, new[] { map, "rigTarget" }, out object target) && target is Transform mapped && mapped != null)
                return mapped;

            foreach (string name in BoneNames[slot])
            {
                Transform bone = FindBreadthFirst(rig.transform, name);
                if (bone != null)
                    return bone;
            }

            ReportOnce("bone:" + slot, $"No bone found for {slot}; those cosmetics attach to the gorilla's root. Use the Fit controls to move them.");
            return rig.transform;
        }

        /// <summary>The shader on the local gorilla's own skin: guaranteed to work with the game's render pipeline.</summary>
        public static Shader FindLocalSkinShader()
        {
            foreach (Component rig in FindRigs())
            {
                if (rig == null || !IsLocalRig(rig))
                    continue;
                foreach (SkinnedMeshRenderer skin in rig.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                {
                    if (skin.sharedMaterial != null && skin.sharedMaterial.shader != null)
                        return skin.sharedMaterial.shader;
                }
            }
            return null;
        }

        static void ResolveTypes()
        {
            if (typesResolved)
                return;
            typesResolved = true;
            rigType = FindType("VRRig");
            taggerType = FindType("GorillaTagger");
            if (rigType == null)
                ReportOnce("type:VRRig", "Gorilla Tag's VRRig class was not found. Cosmetics are disabled until MonkeWardrobe is updated for this game version.");
        }

        static Type FindType(string fullName)
        {
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type = assembly.GetType(fullName, false);
                if (type != null)
                    return type;
            }
            return null;
        }

        static object LocalTagger()
        {
            ResolveTypes();
            if (taggerType == null)
                return null;
            foreach (string name in new[] { "Instance", "instance", "_instance" })
            {
                if (TryReadStatic(taggerType, name, out object tagger) && tagger != null)
                    return tagger;
            }
            return null;
        }

        static Transform FindBreadthFirst(Transform root, string name)
        {
            var queue = new Queue<Transform>();
            queue.Enqueue(root);
            while (queue.Count > 0)
            {
                Transform current = queue.Dequeue();
                if (current != root && string.Equals(current.name, name, StringComparison.OrdinalIgnoreCase))
                    return current;
                foreach (Transform child in current)
                {
                    // Never descend into our own cosmetics: a pack could name a part "head".
                    if (!child.name.StartsWith(CosmeticLibrary.ObjectPrefix, StringComparison.Ordinal))
                        queue.Enqueue(child);
                }
            }
            return null;
        }

        static bool TryReadPath(object target, string[] path, out object value)
        {
            value = target;
            foreach (string name in path)
            {
                if (!TryRead(value, name, out value))
                    return false;
            }
            return value != null;
        }

        static bool TryRead(object target, string name, out object value)
        {
            value = null;
            if (target == null || (target is Object unityObject && unityObject == null))
                return false;
            return TryGet(Member(target.GetType(), name, isStatic: false), target, out value);
        }

        static bool TryReadStatic(Type type, string name, out object value) =>
            TryGet(Member(type, name, isStatic: true), null, out value);

        static bool TryGet(MemberInfo member, object target, out object value)
        {
            value = null;
            try
            {
                switch (member)
                {
                    case PropertyInfo property:
                        value = property.GetValue(target);
                        return true;
                    case FieldInfo field:
                        value = field.GetValue(target);
                        return true;
                }
            }
            catch (Exception)
            {
                // A getter that throws (e.g. while a rig is being recycled) counts as "not available right now".
            }
            return false;
        }

        static MemberInfo Member(Type type, string name, bool isStatic)
        {
            var key = (type, name, isStatic);
            if (members.TryGetValue(key, out MemberInfo found))
                return found;

            BindingFlags flags = isStatic ? StaticMembers : InstanceMembers;
            for (Type current = type; current != null && found == null; current = current.BaseType)
            {
                PropertyInfo property;
                try
                {
                    property = current.GetProperty(name, flags);
                }
                catch (AmbiguousMatchException)
                {
                    property = null;
                }

                if (property != null && property.GetIndexParameters().Length == 0 && property.CanRead)
                    found = property;
                else
                    found = current.GetField(name, flags);
            }
            members[key] = found;
            return found;
        }

        internal static void ReportOnce(string key, string message, bool isError = true)
        {
            if (!reported.Add(key))
                return;
            if (isError)
                Plugin.Log.LogWarning(message);
            else
                Plugin.Log.LogInfo(message);
        }
    }
}
