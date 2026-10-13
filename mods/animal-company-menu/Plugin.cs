// C# / BepInEx 5 (Mono) plugin — target: Animal Company (Unity)
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using HarmonyLib;
using UnityEngine;

namespace AnimalCompanyMenu
{
    [BepInPlugin(PluginGuid, PluginName, PluginVersion)]
    public class Plugin : BaseUnityPlugin
    {
        public const string PluginGuid = "kindmops.animalcompany.modmenu";
        public const string PluginName = "AnimalCompanyMenu";
        public const string PluginVersion = "1.0.0";

        public static ManualLogSource Log;
        public static ConfigEntry<KeyCode> MenuKey;

        private Harmony _harmony;

        private void Awake()
        {
            Log = Logger;
            MenuKey = Config.Bind("General", "MenuToggleKey", KeyCode.F1,
                "Key that opens/closes the mod menu.");

            _harmony = new Harmony(PluginGuid);
            _harmony.PatchAll(typeof(Patches));

            Log.LogInfo($"{PluginName} v{PluginVersion} loaded — press {MenuKey.Value} to open the menu.");
        }

        private void Update()
        {
            if (Input.GetKeyDown(MenuKey.Value))
                MenuGUI.Visible = !MenuGUI.Visible;

            Features.Tick();
        }

        private void OnGUI()
        {
            ESP.Draw();
            MenuGUI.Draw();
        }
    }
}
