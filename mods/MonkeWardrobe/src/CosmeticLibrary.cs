using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using Object = UnityEngine.Object;

namespace MonkeWardrobe
{
    /// <summary>
    /// Loads cosmetic definitions from the Cosmetics folder and builds the objects that get attached to
    /// gorillas. Nothing outside that folder is ever read, whatever a definition or another player says.
    /// </summary>
    internal sealed class CosmeticLibrary
    {
        public const string ObjectPrefix = "MonkeWardrobe:";

        const int MaxFiles = 500;
        const int MaxParts = 64;
        const long MaxJsonBytes = 64 * 1024;
        const long MaxTextureBytes = 4 * 1024 * 1024;
        const long MaxBundleBytes = 64 * 1024 * 1024;
        const float MaxOffset = 2f;
        const float MaxScale = 3f;
        const int MaxNameLength = 40;

        readonly string rootWithSeparator;
        readonly Func<string> shaderOverride;
        readonly Func<bool> replaceBundleShaders;
        readonly Dictionary<string, CosmeticDefinition> byId = new Dictionary<string, CosmeticDefinition>(StringComparer.Ordinal);
        readonly Dictionary<CosmeticSlot, List<CosmeticDefinition>> bySlot = new Dictionary<CosmeticSlot, List<CosmeticDefinition>>();
        readonly Dictionary<string, GameObject> templates = new Dictionary<string, GameObject>(StringComparer.Ordinal);
        readonly Dictionary<string, Material> materials = new Dictionary<string, Material>(StringComparer.Ordinal);
        readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, AssetBundle> bundles = new Dictionary<string, AssetBundle>(StringComparer.OrdinalIgnoreCase);
        readonly List<Object> ownedObjects = new List<Object>();
        GameObject templateRoot;
        Shader shader;

        public CosmeticLibrary(string root, Func<string> shaderOverride, Func<bool> replaceBundleShaders)
        {
            Root = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            rootWithSeparator = Root + Path.DirectorySeparatorChar;
            this.shaderOverride = shaderOverride;
            this.replaceBundleShaders = replaceBundleShaders;
            foreach (CosmeticSlot slot in Slots.All)
                bySlot[slot] = new List<CosmeticDefinition>();
        }

        public string Root { get; }
        public int Count => byId.Count;
        public int SkippedFiles { get; private set; }

        /// <summary>Changes on every reload so rigs dressed from the previous files get rebuilt.</summary>
        public int Generation { get; private set; }

        public IReadOnlyList<CosmeticDefinition> InSlot(CosmeticSlot slot) => bySlot[slot];

        public bool TryGet(string id, out CosmeticDefinition definition)
        {
            definition = null;
            return id != null && byId.TryGetValue(id, out definition);
        }

        public string Describe() =>
            SkippedFiles == 0
                ? $"{Count} cosmetics loaded."
                : $"{Count} cosmetics loaded, {SkippedFiles} file(s) skipped (details in the BepInEx log).";

        public void Reload()
        {
            Unload();
            Directory.CreateDirectory(Root);

            string[] files = Directory.GetFiles(Root, "*.json", SearchOption.AllDirectories);
            Array.Sort(files, StringComparer.OrdinalIgnoreCase);
            if (files.Length > MaxFiles)
            {
                Plugin.Log.LogWarning($"Only the first {MaxFiles} of {files.Length} cosmetic files are loaded.");
                Array.Resize(ref files, MaxFiles);
            }

            foreach (string file in files)
            {
                try
                {
                    CosmeticDefinition definition = Parse(file);
                    if (byId.TryGetValue(definition.Id, out CosmeticDefinition existing))
                        throw new CosmeticFormatException($"id \"{definition.Id}\" is already used by {existing.SourceFile}");
                    byId.Add(definition.Id, definition);
                    bySlot[definition.Slot].Add(definition);
                }
                catch (Exception error)
                {
                    // One bad file must never stop the rest (or the plugin) from loading.
                    SkippedFiles++;
                    Plugin.Log.LogWarning($"Skipped {RelativeName(file)}: {error.Message}");
                }
            }

            foreach (List<CosmeticDefinition> list in bySlot.Values)
                list.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));
            Generation++;
            Plugin.Log.LogInfo($"{Describe()} Folder: {Root}");
        }

        /// <summary>A fresh copy of the cosmetic, parented to <paramref name="parent"/>, or null if it cannot be built.</summary>
        public GameObject Spawn(CosmeticDefinition definition, Transform parent)
        {
            GameObject template = GetTemplate(definition);
            if (template == null)
                return null;

            GameObject instance = Object.Instantiate(template, parent, false);
            instance.name = template.name;
            instance.transform.localPosition = definition.Position;
            instance.transform.localRotation = Quaternion.Euler(definition.Euler);
            instance.transform.localScale = definition.Scale;
            return instance;
        }

        // ---- Parsing ------------------------------------------------------------------------------

        CosmeticDefinition Parse(string file)
        {
            if (new FileInfo(file).Length > MaxJsonBytes)
                throw new CosmeticFormatException("file is larger than 64 KB");

            CosmeticFile raw;
            try
            {
                raw = JsonUtility.FromJson<CosmeticFile>(File.ReadAllText(file));
            }
            catch (ArgumentException error)
            {
                throw new CosmeticFormatException("not valid JSON (" + error.Message + ")");
            }
            if (raw == null)
                throw new CosmeticFormatException("file is empty");

            if (!Loadout.IsValidId(raw.id))
                throw new CosmeticFormatException($"\"id\" must be 1-{Loadout.MaxIdLength} characters using only a-z, 0-9, '_', '-' and '.'");
            if (!Slots.TryParse(raw.slot, out CosmeticSlot slot))
                throw new CosmeticFormatException($"\"slot\" must be one of: {Names.List<CosmeticSlot>()}");

            string folder = Path.GetDirectoryName(file);
            var definition = new CosmeticDefinition
            {
                Id = raw.id,
                Name = CleanText(raw.name, raw.id),
                Author = CleanText(raw.author, ""),
                Slot = slot,
                SourceFile = RelativeName(file),
                Position = ReadVector(raw.position, Vector3.zero, MaxOffset, "position"),
                Euler = ReadVector(raw.rotation, Vector3.zero, 360f, "rotation"),
                Scale = ReadVector(raw.scale, Vector3.one, MaxScale, "scale"),
            };

            if (!string.IsNullOrEmpty(raw.bundle))
            {
                definition.BundlePath = ResolveInside(folder, raw.bundle, MaxBundleBytes, "bundle");
                definition.PrefabName = raw.prefab;
                return definition;
            }

            if (raw.parts == null || raw.parts.Length == 0)
                throw new CosmeticFormatException("needs either a \"bundle\" or at least one entry in \"parts\"");
            if (raw.parts.Length > MaxParts)
                throw new CosmeticFormatException($"has more than {MaxParts} parts");
            foreach (PartFile part in raw.parts)
                definition.Parts.Add(ParsePart(part, folder));
            return definition;
        }

        PartDefinition ParsePart(PartFile raw, string folder)
        {
            if (raw == null)
                throw new CosmeticFormatException("a part is empty");
            if (!Names.TryParse(raw.shape, out PartShape shape))
                throw new CosmeticFormatException($"part \"shape\" must be one of: {Names.List<PartShape>()}");

            var part = new PartDefinition
            {
                Shape = shape,
                Pixelated = raw.pixelated,
                Thickness = raw.thickness,
                Position = ReadVector(raw.position, Vector3.zero, MaxOffset, "position"),
                Euler = ReadVector(raw.rotation, Vector3.zero, 360f, "rotation"),
                Scale = ReadVector(raw.scale, Vector3.one, MaxScale, "scale"),
            };

            if (!string.IsNullOrEmpty(raw.color) && !ColorUtility.TryParseHtmlString(raw.color, out part.Color))
                throw new CosmeticFormatException($"color \"{raw.color}\" is not a colour like \"#FFAA00\"");

            if (!string.IsNullOrEmpty(raw.texture))
            {
                string extension = Path.GetExtension(raw.texture).ToLowerInvariant();
                if (extension != ".png" && extension != ".jpg" && extension != ".jpeg")
                    throw new CosmeticFormatException("textures must be .png or .jpg files");
                part.TexturePath = ResolveInside(folder, raw.texture, MaxTextureBytes, "texture");
            }
            return part;
        }

        string ResolveInside(string folder, string relativePath, long maxBytes, string field)
        {
            string full;
            try
            {
                full = Path.GetFullPath(Path.Combine(folder, relativePath));
            }
            catch (Exception error) when (error is ArgumentException || error is NotSupportedException || error is PathTooLongException)
            {
                throw new CosmeticFormatException($"\"{field}\" is not a valid file name");
            }

            if (!full.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
                throw new CosmeticFormatException($"\"{field}\" must point to a file inside the Cosmetics folder");
            var info = new FileInfo(full);
            if (!info.Exists)
                throw new CosmeticFormatException($"\"{field}\" file {relativePath} does not exist");
            if (info.Length > maxBytes)
                throw new CosmeticFormatException($"\"{field}\" file {relativePath} is larger than {maxBytes / (1024 * 1024)} MB");
            return full;
        }

        static Vector3 ReadVector(float[] values, Vector3 fallback, float limit, string field)
        {
            if (values == null || values.Length == 0)
                return fallback;
            if (values.Length != 3)
                throw new CosmeticFormatException($"\"{field}\" needs exactly 3 numbers, like [0, 0.1, 0]");
            foreach (float value in values)
            {
                if (float.IsNaN(value) || float.IsInfinity(value))
                    throw new CosmeticFormatException($"\"{field}\" contains a number that is not finite");
            }
            return new Vector3(
                Mathf.Clamp(values[0], -limit, limit),
                Mathf.Clamp(values[1], -limit, limit),
                Mathf.Clamp(values[2], -limit, limit));
        }

        static string CleanText(string value, string fallback)
        {
            if (string.IsNullOrWhiteSpace(value))
                return fallback;
            string clean = new string(value.Where(c => !char.IsControl(c)).ToArray()).Trim();
            return clean.Length > MaxNameLength ? clean.Substring(0, MaxNameLength) : clean;
        }

        string RelativeName(string file) =>
            file.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase) ? file.Substring(rootWithSeparator.Length) : Path.GetFileName(file);

        // ---- Building ------------------------------------------------------------------------------

        GameObject GetTemplate(CosmeticDefinition definition)
        {
            // A cached null means "failed before": don't rebuild (and re-log) on every rig rescan.
            if (templates.TryGetValue(definition.Id, out GameObject cached))
                return cached;

            GameObject template = NewTemplate(definition.Id);
            try
            {
                if (definition.BundlePath != null)
                    FillFromBundle(definition, template);
                else
                    FillFromParts(definition, template);
            }
            catch (Exception error)
            {
                Plugin.Log.LogError($"Could not build cosmetic \"{definition.Id}\" from {definition.SourceFile}: {error.Message}");
                Object.Destroy(template);
                template = null;
            }
            templates[definition.Id] = template;
            return template;
        }

        /// <summary>
        /// Templates live under an inactive object, so Awake/OnEnable never run on anything loaded from a
        /// bundle before <see cref="Sanitizer"/> has stripped it.
        /// </summary>
        GameObject NewTemplate(string id)
        {
            if (templateRoot == null)
            {
                templateRoot = new GameObject(ObjectPrefix + "Templates");
                templateRoot.SetActive(false);
                Object.DontDestroyOnLoad(templateRoot);
            }
            var template = new GameObject(ObjectPrefix + id);
            template.transform.SetParent(templateRoot.transform, false);
            return template;
        }

        void FillFromParts(CosmeticDefinition definition, GameObject template)
        {
            foreach (PartDefinition part in definition.Parts)
            {
                GameObject piece = CreateShape(part);
                piece.transform.SetParent(template.transform, false);
                piece.transform.localPosition = part.Position;
                piece.transform.localRotation = Quaternion.Euler(part.Euler);
                piece.transform.localScale = part.Scale;

                Material material = MaterialFor(part.Color, part.TexturePath, part.Pixelated);
                if (material != null)
                    piece.GetComponent<MeshRenderer>().sharedMaterial = material;
            }
        }

        static GameObject CreateShape(PartDefinition part)
        {
            switch (part.Shape)
            {
                case PartShape.Cone:
                    return MeshObject("Cone", ProceduralMeshes.Cone);
                case PartShape.Torus:
                    return MeshObject("Torus", ProceduralMeshes.Torus(part.Thickness));
            }

            GameObject primitive = GameObject.CreatePrimitive((PrimitiveType)Enum.Parse(typeof(PrimitiveType), part.Shape.ToString()));
            Object.DestroyImmediate(primitive.GetComponent<Collider>());
            return primitive;
        }

        static GameObject MeshObject(string name, Mesh mesh)
        {
            var piece = new GameObject(name);
            piece.AddComponent<MeshFilter>().sharedMesh = mesh;
            piece.AddComponent<MeshRenderer>();
            return piece;
        }

        void FillFromBundle(CosmeticDefinition definition, GameObject template)
        {
            if (!bundles.TryGetValue(definition.BundlePath, out AssetBundle bundle))
                bundles[definition.BundlePath] = bundle = AssetBundle.LoadFromFile(definition.BundlePath);
            if (bundle == null)
                throw new CosmeticFormatException("the file is not a Unity AssetBundle, or was built with an incompatible Unity version");

            GameObject prefab = string.IsNullOrEmpty(definition.PrefabName)
                ? bundle.LoadAllAssets<GameObject>().FirstOrDefault()
                : bundle.LoadAsset<GameObject>(definition.PrefabName);
            if (prefab == null)
                throw new CosmeticFormatException(string.IsNullOrEmpty(definition.PrefabName)
                    ? "the bundle contains no prefab"
                    : $"the bundle has no prefab named \"{definition.PrefabName}\"");

            GameObject model = Object.Instantiate(prefab, template.transform, false);
            model.name = prefab.name;
            int removed = Sanitizer.Strip(model);
            if (removed > 0)
                Plugin.Log.LogInfo($"Removed {removed} non-visual component(s) from \"{definition.Id}\".");
            FixMaterials(model);
        }

        void FixMaterials(GameObject model)
        {
            bool replaceAll = replaceBundleShaders();
            foreach (Renderer renderer in model.GetComponentsInChildren<Renderer>(true))
            {
                Material[] shared = renderer.sharedMaterials;
                bool changed = false;
                for (int i = 0; i < shared.Length; i++)
                {
                    Material original = shared[i];
                    bool broken = original == null || original.shader == null || !original.shader.isSupported
                        || original.shader.name == "Hidden/InternalErrorShader";
                    if (!broken && !replaceAll)
                        continue;

                    Material replacement = NewMaterial(ReadColor(original), ReadTexture(original), pixelated: false);
                    if (replacement == null)
                        continue;
                    shared[i] = replacement;
                    changed = true;
                }
                if (changed)
                    renderer.sharedMaterials = shared;
            }
        }

        Material MaterialFor(Color color, string texturePath, bool pixelated)
        {
            string key = ColorUtility.ToHtmlStringRGBA(color) + "|" + texturePath + "|" + pixelated;
            if (materials.TryGetValue(key, out Material cached) && cached != null)
                return cached;

            Material material = NewMaterial(color, LoadTexture(texturePath, pixelated), pixelated);
            if (material != null)
                materials[key] = material;
            return material;
        }

        Material NewMaterial(Color color, Texture texture, bool pixelated)
        {
            Shader gameShader = ResolveShader();
            if (gameShader == null)
                return null;

            var material = new Material(gameShader) { name = ObjectPrefix + "Material" };
            Texture baseTexture = texture != null ? texture : Texture2D.whiteTexture;
            // The game shader and the stock Unity shaders name these differently; set whichever exist.
            foreach (string property in new[] { "_BaseColor", "_Color" })
            {
                if (material.HasProperty(property))
                    material.SetColor(property, color);
            }
            foreach (string property in new[] { "_BaseMap", "_MainTex" })
            {
                if (material.HasProperty(property))
                    material.SetTexture(property, baseTexture);
            }
            ownedObjects.Add(material);
            return material;
        }

        Shader ResolveShader()
        {
            if (shader != null)
                return shader;

            string preferred = shaderOverride();
            Shader found = FindShader(preferred) ?? FindShader("GorillaTag/UberShader") ?? RigBridge.FindLocalSkinShader()
                ?? FindShader("Universal Render Pipeline/Lit") ?? FindShader("Standard") ?? FindShader("Unlit/Color");
            if (found == null)
            {
                // Usually the local gorilla isn't spawned yet; the next rescan tries again.
                RigBridge.ReportOnce("shader", "No usable shader found yet for cosmetics.");
                return null;
            }

            if (!string.IsNullOrEmpty(preferred) && found.name != preferred)
                Plugin.Log.LogWarning($"Shader \"{preferred}\" from the config was not found.");
            Plugin.Log.LogInfo($"Cosmetics use the shader \"{found.name}\".");
            return shader = found;
        }

        static Shader FindShader(string name)
        {
            if (string.IsNullOrEmpty(name))
                return null;
            Shader found = Shader.Find(name);
            return found != null && found.isSupported ? found : null;
        }

        Texture2D LoadTexture(string path, bool pixelated)
        {
            if (path == null)
                return null;
            string key = path + "|" + pixelated;
            if (textures.TryGetValue(key, out Texture2D cached))
                return cached;

            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, !pixelated)
            {
                name = ObjectPrefix + Path.GetFileName(path),
                filterMode = pixelated ? FilterMode.Point : FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
            };
            if (!ImageConversion.LoadImage(texture, File.ReadAllBytes(path), true))
            {
                Plugin.Log.LogWarning($"Could not read the image {RelativeName(path)}.");
                Object.Destroy(texture);
                texture = null;
            }
            else
            {
                ownedObjects.Add(texture);
            }
            textures[key] = texture;
            return texture;
        }

        static Color ReadColor(Material material)
        {
            if (material == null)
                return Color.white;
            foreach (string property in new[] { "_BaseColor", "_Color" })
            {
                if (material.HasProperty(property))
                    return material.GetColor(property);
            }
            return Color.white;
        }

        static Texture ReadTexture(Material material)
        {
            if (material == null)
                return null;
            foreach (string property in new[] { "_BaseMap", "_MainTex" })
            {
                if (material.HasProperty(property) && material.GetTexture(property) != null)
                    return material.GetTexture(property);
            }
            return null;
        }

        void Unload()
        {
            foreach (GameObject template in templates.Values)
            {
                if (template != null)
                    Object.Destroy(template);
            }
            foreach (Object owned in ownedObjects)
            {
                if (owned != null)
                    Object.Destroy(owned);
            }
            foreach (AssetBundle bundle in bundles.Values)
            {
                if (bundle != null)
                    bundle.Unload(true);
            }

            templates.Clear();
            materials.Clear();
            textures.Clear();
            bundles.Clear();
            ownedObjects.Clear();
            byId.Clear();
            foreach (List<CosmeticDefinition> list in bySlot.Values)
                list.Clear();
            SkippedFiles = 0;
        }
    }
}
