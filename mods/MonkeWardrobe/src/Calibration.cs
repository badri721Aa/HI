using System.Collections.Generic;
using System.Globalization;
using BepInEx.Configuration;
using UnityEngine;

namespace MonkeWardrobe
{
    /// <summary>How a slot's anchor sits on its bone. Applied on top of each cosmetic's own offset.</summary>
    internal struct SlotFit
    {
        public static readonly SlotFit Default = new SlotFit { Scale = 1f };

        public Vector3 Position;
        public Vector3 Euler;
        public float Scale;

        public void ApplyTo(Transform anchor)
        {
            anchor.localPosition = Position;
            anchor.localRotation = Quaternion.Euler(Euler);
            anchor.localScale = Vector3.one * Scale;
        }

        public SlotFit Clamped()
        {
            SlotFit fit = this;
            fit.Position = new Vector3(Mathf.Clamp(Position.x, -1f, 1f), Mathf.Clamp(Position.y, -1f, 1f), Mathf.Clamp(Position.z, -1f, 1f));
            fit.Euler = new Vector3(Mathf.Repeat(Euler.x, 360f), Mathf.Repeat(Euler.y, 360f), Mathf.Repeat(Euler.z, 360f));
            fit.Scale = Mathf.Clamp(Scale, 0.1f, 3f);
            return fit;
        }

        // "x,y,z|x,y,z|scale" with invariant numbers, so the config file reads the same in every locale.
        public override string ToString() =>
            string.Join("|", Join(Position), Join(Euler), Scale.ToString("0.###", CultureInfo.InvariantCulture));

        public static SlotFit Parse(string text)
        {
            string[] sections = (text ?? "").Split('|');
            if (sections.Length != 3 || !TryVector(sections[0], out Vector3 position) || !TryVector(sections[1], out Vector3 euler)
                || !float.TryParse(sections[2], NumberStyles.Float, CultureInfo.InvariantCulture, out float scale))
                return Default;
            return new SlotFit { Position = position, Euler = euler, Scale = scale }.Clamped();
        }

        static string Join(Vector3 v) =>
            string.Join(",", v.x.ToString("0.###", CultureInfo.InvariantCulture), v.y.ToString("0.###", CultureInfo.InvariantCulture), v.z.ToString("0.###", CultureInfo.InvariantCulture));

        static bool TryVector(string text, out Vector3 vector)
        {
            vector = default;
            string[] parts = text.Split(',');
            if (parts.Length != 3)
                return false;
            var values = new float[3];
            for (int i = 0; i < 3; i++)
            {
                if (!float.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out values[i]) || float.IsNaN(values[i]) || float.IsInfinity(values[i]))
                    return false;
            }
            vector = new Vector3(values[0], values[1], values[2]);
            return true;
        }
    }

    /// <summary>Per-slot fit, stored in the BepInEx config and adjustable from the in-game menu.</summary>
    internal sealed class Calibration
    {
        readonly Dictionary<CosmeticSlot, ConfigEntry<string>> entries = new Dictionary<CosmeticSlot, ConfigEntry<string>>();
        readonly SlotFit[] fits = new SlotFit[Slots.All.Length];

        public Calibration(ConfigFile config)
        {
            foreach (CosmeticSlot slot in Slots.All)
            {
                ConfigEntry<string> entry = config.Bind("Fit", slot.ToString(), SlotFit.Default.ToString(),
                    $"Moves every {slot} cosmetic: \"x,y,z | tilt,turn,roll | size\". Easiest to change with the in-game menu.");
                entries[slot] = entry;
                fits[(int)slot] = SlotFit.Parse(entry.Value);
            }
        }

        public SlotFit this[CosmeticSlot slot] => fits[(int)slot];

        public void Set(CosmeticSlot slot, SlotFit fit)
        {
            fit = fit.Clamped();
            fits[(int)slot] = fit;
            entries[slot].Value = fit.ToString();
        }
    }
}
