using System.Collections.Generic;
using UnityEngine;

namespace MonkeWardrobe
{
    /// <summary>Raw mesh data, kept separate from UnityEngine.Mesh so the geometry can be checked outside the game.</summary>
    internal sealed class MeshData
    {
        public readonly List<Vector3> Vertices = new List<Vector3>();
        public readonly List<Vector3> Normals = new List<Vector3>();
        public readonly List<Vector2> Uvs = new List<Vector2>();
        public readonly List<int> Triangles = new List<int>();

        public Mesh ToMesh(string name)
        {
            var mesh = new Mesh { name = name };
            mesh.SetVertices(Vertices);
            mesh.SetNormals(Normals);
            mesh.SetUVs(0, Uvs);
            mesh.SetTriangles(Triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }
    }

    /// <summary>
    /// Shapes Unity has no primitive for, sized to be 1 unit across like the built-in cube and sphere,
    /// so "scale" in a cosmetic file reads the same for every shape. Triangles wind clockwise seen
    /// from outside (Unity's front face).
    /// </summary>
    internal static class ProceduralMeshes
    {
        const int Segments = 32;
        const int TubeSegments = 12;

        static Mesh cone;
        static readonly Dictionary<int, Mesh> tori = new Dictionary<int, Mesh>();

        /// <summary>Base of radius 0.5 centred on the origin, tip at y = 1.</summary>
        public static Mesh Cone => cone != null ? cone : cone = BuildCone().ToMesh("MonkeWardrobe.Cone");

        /// <summary>Ring of radius 0.5 lying flat in the XZ plane; <paramref name="thickness"/> is the tube radius.</summary>
        public static Mesh Torus(float thickness)
        {
            thickness = thickness <= 0f ? 0.1f : Mathf.Clamp(thickness, 0.01f, 0.5f);
            int key = Mathf.RoundToInt(thickness * 100f);
            if (!tori.TryGetValue(key, out Mesh mesh) || mesh == null)
                tori[key] = mesh = BuildTorus(key / 100f).ToMesh("MonkeWardrobe.Torus");
            return mesh;
        }

        public static MeshData BuildCone()
        {
            var data = new MeshData();
            const float radius = 0.5f;
            const float height = 1f;
            // Side normals tilt up by the slope of the cone: perpendicular to the surface line.
            float slope = radius / height;

            for (int i = 0; i < Segments; i++)
            {
                float a0 = i * Mathf.PI * 2f / Segments;
                float a1 = (i + 1) * Mathf.PI * 2f / Segments;
                float mid = (a0 + a1) * 0.5f;
                int start = data.Vertices.Count;

                // One tip vertex per segment so each facet gets its own tip normal and UV.
                data.Vertices.Add(new Vector3(Mathf.Cos(a0) * radius, 0f, Mathf.Sin(a0) * radius));
                data.Vertices.Add(new Vector3(0f, height, 0f));
                data.Vertices.Add(new Vector3(Mathf.Cos(a1) * radius, 0f, Mathf.Sin(a1) * radius));
                data.Normals.Add(new Vector3(Mathf.Cos(a0), slope, Mathf.Sin(a0)).normalized);
                data.Normals.Add(new Vector3(Mathf.Cos(mid), slope, Mathf.Sin(mid)).normalized);
                data.Normals.Add(new Vector3(Mathf.Cos(a1), slope, Mathf.Sin(a1)).normalized);
                data.Uvs.Add(new Vector2((float)i / Segments, 0f));
                data.Uvs.Add(new Vector2((i + 0.5f) / Segments, 1f));
                data.Uvs.Add(new Vector2((float)(i + 1) / Segments, 0f));
                data.Triangles.AddRange(new[] { start, start + 1, start + 2 });
            }

            int centre = data.Vertices.Count;
            data.Vertices.Add(Vector3.zero);
            data.Normals.Add(Vector3.down);
            data.Uvs.Add(new Vector2(0.5f, 0.5f));
            for (int i = 0; i <= Segments; i++)
            {
                float a = i * Mathf.PI * 2f / Segments;
                data.Vertices.Add(new Vector3(Mathf.Cos(a) * radius, 0f, Mathf.Sin(a) * radius));
                data.Normals.Add(Vector3.down);
                data.Uvs.Add(new Vector2(0.5f + Mathf.Cos(a) * 0.5f, 0.5f + Mathf.Sin(a) * 0.5f));
                if (i > 0)
                    data.Triangles.AddRange(new[] { centre, centre + i, centre + i + 1 });
            }
            return data;
        }

        public static MeshData BuildTorus(float tubeRadius)
        {
            var data = new MeshData();
            const float ringRadius = 0.5f;
            int columns = TubeSegments + 1;

            for (int i = 0; i <= Segments; i++)
            {
                float u = i * Mathf.PI * 2f / Segments;
                var centre = new Vector3(Mathf.Cos(u) * ringRadius, 0f, Mathf.Sin(u) * ringRadius);
                for (int j = 0; j <= TubeSegments; j++)
                {
                    float v = j * Mathf.PI * 2f / TubeSegments;
                    var normal = new Vector3(Mathf.Cos(v) * Mathf.Cos(u), Mathf.Sin(v), Mathf.Cos(v) * Mathf.Sin(u));
                    data.Vertices.Add(centre + normal * tubeRadius);
                    data.Normals.Add(normal);
                    data.Uvs.Add(new Vector2((float)i / Segments, (float)j / TubeSegments));
                }
            }

            for (int i = 0; i < Segments; i++)
            {
                for (int j = 0; j < TubeSegments; j++)
                {
                    int a = i * columns + j;
                    int b = (i + 1) * columns + j;
                    int c = a + 1;
                    int d = b + 1;
                    data.Triangles.AddRange(new[] { a, c, b, b, c, d });
                }
            }
            return data;
        }
    }
}
