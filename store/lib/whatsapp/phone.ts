/**
 * Phone helpers. wa.me links need the full international number as digits
 * only: no "+", no spaces, no leading "00", and no trunk "0" after the
 * country code.
 */

const TRUNK_ZERO_PREFIXES = ["9710", "9730", "9660", "9650", "9680", "9740"];

export function toWaDigits(input: string): string {
  let digits = input.replace(/[^\d]/g, "");
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
