using System;
using UnityEngine;
using Object = UnityEngine.Object;

namespace MonkeWardrobe
{
    /// <summary>
    /// Reduces a cosmetic to things that only draw. Colliders, rigidbodies, audio, lights, cameras and
    /// every script are removed, so a cosmetic can never touch tagging, hand physics or anyone's game.
    /// </summary>
    internal static class Sanitizer
    {
        static readonly Type[] Allowed =
        {
            typeof(Transform),
            typeof(MeshFilter),
            typeof(MeshRenderer),
            typeof(SkinnedMeshRenderer),
            typeof(ParticleSystem),
            typeof(ParticleSystemRenderer),
            typeof(TrailRenderer),
            typeof(LineRenderer),
            typeof(LODGroup),
            typeof(Animator),
            typeof(Animation),
        };

        /// <summary>Returns how many components were removed.</summary>
        public static int Strip(GameObject root)
        {
            int removed = 0;
            // Dependents go before what they depend on (joints and scripts, then colliders, then
            // rigidbodies); otherwise Unity refuses the removal.
            for (int pass = 0; pass <= 3; pass++)
            {
                foreach (Component component in root.GetComponentsInChildren<Component>(true))
                {
                    // Null means a missing script: it has no code to run, so it can stay.
                    if (component == null || IsAllowed(component) || Priority(component) > pass)
                        continue;
                    Object.DestroyImmediate(component);
                    if (component == null)
                        removed++;
                }
            }
            return removed;
        }

        static bool IsAllowed(Component component)
        {
            Type type = component.GetType();
            foreach (Type allowed in Allowed)
            {
                if (allowed.IsAssignableFrom(type))
                    return true;
            }
            return false;
        }

        static int Priority(Component component)
        {
            switch (component)
            {
                case MonoBehaviour _:
                case Joint _:
                    return 0;
                case Collider _:
                    return 1;
                case Rigidbody _:
                    return 2;
                default:
                    return 3;
            }
        }
    }
}
