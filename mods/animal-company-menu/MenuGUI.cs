// C# — IMGUI menu window, toggled with Plugin.MenuKey (default F1).
using UnityEngine;

namespace AnimalCompanyMenu
{
    public static class MenuGUI
    {
        public static bool Visible;
        private static Rect _window = new Rect(40f, 40f, 260f, 360f);

        public static void Draw()
        {
            if (!Visible) return;
            _window = GUI.Window(0x414E494D, _window, DrawWindow, "animal company — mod menu");
        }

        private static void DrawWindow(int id)
        {
            GUILayout.BeginVertical();

            GUILayout.Label("— player —");
            Features.GodMode = GUILayout.Toggle(Features.GodMode, "god mode");
            Features.InfiniteStamina = GUILayout.Toggle(Features.InfiniteStamina, "infinite stamina");
            Features.NoFallDamage = GUILayout.Toggle(Features.NoFallDamage, "no fall damage");

            Features.SpeedHack = GUILayout.Toggle(Features.SpeedHack, "speed hack");
            GUILayout.Label($"multiplier: {Features.SpeedMultiplier:0.0}x");
            Features.SpeedMultiplier = GUILayout.HorizontalSlider(Features.SpeedMultiplier, 1f, 6f);

            bool noclip = GUILayout.Toggle(Features.NoClip, "noclip (wasd + space/ctrl)");
            if (Features.NoClip && !noclip) Features.ExitNoClip();
            Features.NoClip = noclip;

            GUILayout.Space(8f);
            GUILayout.Label("— esp —");
            ESP.EnemyESP = GUILayout.Toggle(ESP.EnemyESP, "enemy esp");
            ESP.ItemESP = GUILayout.Toggle(ESP.ItemESP, "item esp");
            ESP.PlayerESP = GUILayout.Toggle(ESP.PlayerESP, "player esp");
            GUILayout.Label($"max distance: {ESP.MaxDistance:0}m");
            ESP.MaxDistance = GUILayout.HorizontalSlider(ESP.MaxDistance, 20f, 500f);

            GUILayout.Space(8f);
            GUILayout.Label($"toggle menu: {Plugin.MenuKey.Value}");

            GUILayout.EndVertical();
            GUI.DragWindow(new Rect(0f, 0f, 10000f, 24f));
        }
    }
}
