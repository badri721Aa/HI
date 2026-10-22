using System.Text;
using System.Text.RegularExpressions;

namespace MonkeWardrobe
{
    /// <summary>
    /// The cosmetic id worn in each slot. Encoded as "Head=mw.top_hat;Face=mw.shades" both in the
    /// config file and in the Photon player property other MonkeWardrobe users read.
    /// </summary>
    internal sealed class Loadout
    {
        public const int MaxEncodedLength = 256;
        public const int MaxIdLength = 48;

        // \z rather than $: '$' would also accept a trailing newline.
        static readonly Regex IdPattern = new Regex(@"^[a-z0-9_.\-]{1," + MaxIdLength + @"}\z", RegexOptions.CultureInvariant);

        readonly string[] ids = new string[Slots.All.Length];

        /// <summary>Bumped on every real change so watchers can detect edits without comparing strings.</summary>
        public int Version { get; private set; }

        /// <summary>Invalid ids are stored as "nothing equipped".</summary>
        public string this[CosmeticSlot slot]
        {
            get => ids[(int)slot];
            set
            {
                string id = IsValidId(value) ? value : null;
                if (ids[(int)slot] == id)
                    return;
                ids[(int)slot] = id;
                Version++;
            }
        }

        public bool IsEmpty
        {
            get
            {
                foreach (string id in ids)
                {
                    if (id != null)
                        return false;
                }
                return true;
            }
        }

        public static bool IsValidId(string id) => id != null && IdPattern.IsMatch(id);

        public string Encode()
        {
            var text = new StringBuilder();
            foreach (CosmeticSlot slot in Slots.All)
            {
                string id = ids[(int)slot];
                if (id == null)
                    continue;
                if (text.Length > 0)
                    text.Append(';');
                text.Append(slot).Append('=').Append(id);
            }
            return text.ToString();
        }

        /// <summary>
        /// Parses text that may come from another player, so it never throws: oversized input yields an
        /// empty loadout, and malformed entries, unknown slots and invalid ids are dropped one by one.
        /// </summary>
        public static Loadout Decode(string encoded)
        {
            var loadout = new Loadout();
            if (string.IsNullOrEmpty(encoded) || encoded.Length > MaxEncodedLength)
                return loadout;

            foreach (string entry in encoded.Split(';'))
            {
                int separator = entry.IndexOf('=');
                if (separator <= 0)
                    continue;
                if (Slots.TryParse(entry.Substring(0, separator), out CosmeticSlot slot))
                    loadout[slot] = entry.Substring(separator + 1);
            }
            return loadout;
        }
    }
}
