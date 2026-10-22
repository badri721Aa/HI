using System;
using UnityEngine;

namespace MonkeWardrobe
{
    /// <summary>Desktop window (IMGUI) for picking cosmetics and fitting them to the gorilla.</summary>
    internal sealed class WardrobeMenu : MonoBehaviour
    {
        const int WindowId = 0x4D57;
        const float PositionStep = 0.01f;
        const float AngleStep = 5f;
        const float ScaleStep = 0.05f;

        static readonly string[] SlotNames = Array.ConvertAll(Slots.All, slot => slot.ToString());

        bool open;
        Rect window = new Rect(40f, 40f, 430f, 0f);
        CosmeticSlot fitting = CosmeticSlot.Head;

        static Plugin Mod => Plugin.Instance;

        void OnGUI()
        {
            // Reading the key through IMGUI events works whichever input system the game has enabled.
            Event current = Event.current;
            if (current.type == EventType.KeyDown && current.keyCode == Mod.MenuKey.Value)
            {
                open = !open;
                current.Use();
            }
            if (open)
                window = GUILayout.Window(WindowId, window, DrawWindow, $"{Plugin.Name} {Plugin.Version}");
        }

        void DrawWindow(int id)
        {
            GUILayout.Label(Mod.Sync.Describe());
            GUILayout.Label(Mod.Library.Describe());
            bool enabled = GUILayout.Toggle(Mod.Enabled.Value, " Enabled");
            if (enabled != Mod.Enabled.Value)
                Mod.Enabled.Value = enabled;

            GUILayout.Space(8f);
            GUILayout.Label("Wardrobe");
            foreach (CosmeticSlot slot in Slots.All)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(slot.ToString(), GUILayout.Width(80f));
                if (GUILayout.Button("<", GUILayout.Width(28f)))
                    Mod.Cycle(slot, -1);
                GUILayout.Label(Mod.EquippedName(slot), GUILayout.Width(220f));
                if (GUILayout.Button(">", GUILayout.Width(28f)))
                    Mod.Cycle(slot, +1);
                GUILayout.EndHorizontal();
            }

            GUILayout.Space(8f);
            GUILayout.Label("Fit (moves this slot's cosmetics on every gorilla you see)");
            fitting = (CosmeticSlot)GUILayout.Toolbar((int)fitting, SlotNames);
            SlotFit fit = Mod.Calibration[fitting];
            bool changed = false;
            changed |= Nudge("Left / right", ref fit.Position.x, PositionStep);
            changed |= Nudge("Down / up", ref fit.Position.y, PositionStep);
            changed |= Nudge("Back / forward", ref fit.Position.z, PositionStep);
            changed |= Nudge("Tilt", ref fit.Euler.x, AngleStep);
            changed |= Nudge("Turn", ref fit.Euler.y, AngleStep);
            changed |= Nudge("Roll", ref fit.Euler.z, AngleStep);
            changed |= Nudge("Size", ref fit.Scale, ScaleStep);
            if (changed)
                Mod.SetFit(fitting, fit);

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Reset fit"))
                Mod.SetFit(fitting, SlotFit.Default);
            if (GUILayout.Button("Reload cosmetics"))
                Mod.ReloadLibrary();
            if (GUILayout.Button("Open folder"))
                Application.OpenURL(new Uri(Mod.Library.Root).AbsoluteUri);
            GUILayout.EndHorizontal();

            GUILayout.Label($"{Mod.MenuKey.Value} closes this window. In VR: hold the left stick down, then X = next cosmetic, Y = next slot.");
            GUI.DragWindow();
        }

        static bool Nudge(string label, ref float value, float step)
        {
            bool changed = false;
            GUILayout.BeginHorizontal();
            GUILayout.Label(label, GUILayout.Width(110f));
            if (GUILayout.Button("-", GUILayout.Width(28f)))
            {
                value -= step;
                changed = true;
            }
            GUILayout.Label(value.ToString("0.00"), GUILayout.Width(56f));
            if (GUILayout.Button("+", GUILayout.Width(28f)))
            {
                value += step;
                changed = true;
            }
            GUILayout.EndHorizontal();
            return changed;
        }
    }
}
