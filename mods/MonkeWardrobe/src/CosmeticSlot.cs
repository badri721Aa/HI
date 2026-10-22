using System;

namespace MonkeWardrobe
{
    /// <summary>Where on the gorilla a cosmetic is worn. A loadout holds at most one cosmetic per slot.</summary>
    public enum CosmeticSlot
    {
        Head,
        Face,
        Body,
        LeftHand,
        RightHand,
    }

    internal static class Slots
    {
        public static readonly CosmeticSlot[] All = (CosmeticSlot[])Enum.GetValues(typeof(CosmeticSlot));

        /// <summary>
        /// Exact, case-insensitive name match. Enum.TryParse is deliberately avoided: it also accepts
        /// numbers and comma-separated flag lists, which we never want from a JSON file or another player.
        /// </summary>
        public static bool TryParse(string value, out CosmeticSlot slot) => Names.TryParse(value, out slot);
    }

    internal static class Names
    {
        public static bool TryParse<T>(string value, out T result) where T : struct, Enum
        {
            result = default;
            if (string.IsNullOrEmpty(value))
                return false;

            foreach (T candidate in (T[])Enum.GetValues(typeof(T)))
            {
                if (string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
                {
                    result = candidate;
                    return true;
                }
            }
            return false;
        }

        public static string List<T>() where T : struct, Enum => string.Join(", ", Enum.GetNames(typeof(T)));
    }
}
