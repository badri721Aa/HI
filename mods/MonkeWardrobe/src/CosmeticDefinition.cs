using System;
using System.Collections.Generic;
using UnityEngine;

namespace MonkeWardrobe
{
    // ---- JSON shape -------------------------------------------------------------------------------
    // JsonUtility maps public fields 1:1 to JSON keys, hence the lower-case names. Missing keys keep
    // their defaults (null / 0 / false); CosmeticLibrary validates everything before it is used.
    // CS0649 ("never assigned") is expected: JsonUtility assigns these fields through reflection.
#pragma warning disable CS0649

    [Serializable]
    internal sealed class CosmeticFile
    {
        public string id;
        public string name;
        public string author;
        public string slot;
        public float[] position;
        public float[] rotation;
        public float[] scale;
        public string bundle;
        public string prefab;
        public PartFile[] parts;
    }

    [Serializable]
    internal sealed class PartFile
    {
        public string shape;
        public string color;
        public string texture;
        public bool pixelated;
        public float thickness;
        public float[] position;
        public float[] rotation;
        public float[] scale;
    }

#pragma warning restore CS0649

    // ---- Validated runtime model ------------------------------------------------------------------

    internal enum PartShape
    {
        Cube,
        Sphere,
        Capsule,
        Cylinder,
        Quad,
        Cone,
        Torus,
    }

    internal sealed class PartDefinition
    {
        public PartShape Shape;
        public Color Color = Color.white;
        public string TexturePath;
        public bool Pixelated;
        public float Thickness;
        public Vector3 Position;
        public Vector3 Euler;
        public Vector3 Scale = Vector3.one;
    }

    internal sealed class CosmeticDefinition
    {
        public string Id;
        public string Name;
        public string Author;
        public CosmeticSlot Slot;
        public string SourceFile;
        public Vector3 Position;
        public Vector3 Euler;
        public Vector3 Scale = Vector3.one;

        /// <summary>Set for AssetBundle cosmetics; null for cosmetics built from <see cref="Parts"/>.</summary>
        public string BundlePath;
        public string PrefabName;
        public readonly List<PartDefinition> Parts = new List<PartDefinition>();
    }

    internal sealed class CosmeticFormatException : Exception
    {
        public CosmeticFormatException(string message) : base(message) { }
    }
}
