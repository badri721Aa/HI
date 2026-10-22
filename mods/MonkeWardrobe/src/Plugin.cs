using System.Collections.Generic;
using System.IO;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using UnityEngine;

namespace MonkeWardrobe
{
    /// <summary>
    /// MonkeWardrobe: wear your own custom cosmetics, and see the ones other MonkeWardrobe players wear,
    /// in modded lobbies. It never touches the game's store, inventory or paid cosmetics.
    /// </summary>
    [BepInPlugin(Guid, Name, Version)]
    public sealed class Plugin : BaseUnityPlugin
    {
        public const string Guid = "com.monkewardrobe.gorillatag";
        public const string Name = "MonkeWardrobe";
        public const string Version = "1.0.0";

        internal static Plugin Instance { get; private set; }
        internal static ManualLogSource Log { get; private set; }

        internal ConfigEntry<bool> Enabled { get; private set; }
        internal ConfigEntry<KeyCode> MenuKey { get; private set; }
        internal ConfigEntry<bool> VrControls { get; private set; }
        internal ConfigEntry<bool> HideOwnHeadCosmetics { get; private set; }
        internal ConfigEntry<bool> AllowPrivateRooms { get; private set; }

        internal CosmeticLibrary Library { get; private set; }
        internal Loadout Loadout { get; private set; }
        internal Calibration Calibration { get; private set; }
        internal RoomSync Sync { get; private set; }
        internal RigDresser Dresser { get; private set; }

        ConfigEntry<string> equipped;

        void Awake()
        {
            Instance = this;
            Log = Logger;

            Enabled = Config.Bind("General", "Enabled", true, "Show and share cosmetics. Turning this off also removes yours from other players' view.");
            MenuKey = Config.Bind("General", "MenuKey", KeyCode.F6, "Keyboard key that opens the wardrobe window.");
            VrControls = Config.Bind("General", "VrControls", true, "Hold the left stick down: X = next cosmetic, Y = next slot.");
            HideOwnHeadCosmetics = Config.Bind("General", "HideOwnHeadCosmetics", true, "Show your own Head and Face cosmetics only in mirrors so they never block your view.");
            AllowPrivateRooms = Config.Bind("Sharing", "AllowPrivateRooms", false, "Also share cosmetics in private (code) rooms, not just modded game modes.");
            ConfigEntry<string> shader = Config.Bind("Advanced", "Shader", "", "Shader name for cosmetics. Leave empty to pick the game's own shader automatically.");
            ConfigEntry<bool> replaceBundleShaders = Config.Bind("Advanced", "ReplaceBundleShaders", false, "Swap every material in AssetBundle cosmetics to the game shader. Turn on if they show up pink.");
            equipped = Config.Bind("Wardrobe", "Equipped", "", "What you are wearing. Set from the in-game menu.");

            Loadout = Loadout.Decode(equipped.Value);
            Calibration = new Calibration(Config);
            string folder = Path.Combine(Path.GetDirectoryName(Info.Location) ?? Paths.PluginPath, "Cosmetics");
            Library = new CosmeticLibrary(folder, () => shader.Value, () => replaceBundleShaders.Value);
            Library.Reload();

            var host = new GameObject(Name);
            DontDestroyOnLoad(host);
            Sync = host.AddComponent<RoomSync>();
            Dresser = host.AddComponent<RigDresser>();
            host.AddComponent<WardrobeMenu>();
            host.AddComponent<VrInput>();

            Log.LogInfo($"{Name} {Version} ready. Press {MenuKey.Value} in game to open the wardrobe.");
        }

        internal void Equip(CosmeticSlot slot, string id)
        {
            Loadout[slot] = id;
            equipped.Value = Loadout.Encode();
        }

        /// <summary>Steps through the slot's cosmetics with "nothing" between the last and the first.</summary>
        internal void Cycle(CosmeticSlot slot, int step)
        {
            IReadOnlyList<CosmeticDefinition> options = Library.InSlot(slot);
            int current = -1;
            for (int i = 0; i < options.Count; i++)
            {
                if (options[i].Id == Loadout[slot])
                    current = i;
            }

            int ring = options.Count + 1;
            int next = ((current + 1 + step) % ring + ring) % ring - 1;
            Equip(slot, next < 0 ? null : options[next].Id);
        }

        internal string EquippedName(CosmeticSlot slot)
        {
            string id = Loadout[slot];
            if (id == null)
                return "(nothing)";
            return Library.TryGet(id, out CosmeticDefinition definition) ? definition.Name : id + " (file missing)";
        }

        internal void SetFit(CosmeticSlot slot, SlotFit fit)
        {
            Calibration.Set(slot, fit);
            Dresser.ApplyFit(slot);
        }

        internal void ReloadLibrary()
        {
            Dresser.UndressAll();
            Library.Reload();
        }
    }
}
