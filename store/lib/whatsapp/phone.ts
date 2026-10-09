/**
 * Phone helpers. wa.me links need the full international number as digits
 * only: no "+", no spaces, no leading "00", and no trunk "0" after the
 * country code.
 */

const TRUNK_ZERO_PREFIXES = ["9710", "9730", "9660", "9650", "9680", "9740"];

/**
 * Arabic-Indic (٠–٩) and Eastern Arabic-Indic (۰–۹) digits to 0–9. Arabic
 * keyboards on iOS, macOS and many Android phones type these.
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function toWaDigits(input: string): string {
  let digits = normalizeDigits(input).replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  for (const prefix of TRUNK_ZERO_PREFIXES) {
    if (digits.startsWith(prefix)) {
      digits = prefix.slice(0, 3) + digits.slice(prefix.length);
      break;
    }
  }
  return digits;
}

/** True when the input looks like a reachable phone number (7–15 digits). */
export function isPlausiblePhone(input: string): boolean {
  const digits = toWaDigits(input);
  return digits.length >= 7 && digits.length <= 15;
}
