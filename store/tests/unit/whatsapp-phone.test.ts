import { describe, expect, it } from "vitest";
import { WHATSAPP_LINES } from "@/lib/site";
import { isPlausiblePhone, toWaDigits } from "@/lib/whatsapp";

describe("toWaDigits", () => {
  it.each([
    ["+973 3985 8885", "97339858885"],
    ["+973 6366 9666", "97363669666"],
    ["+971 50 464 4502", "971504644502"],
  ])("cleans the business number %s", (input, expected) => {
    expect(toWaDigits(input)).toBe(expected);
  });

  it("matches the e164 of every configured line", () => {
    for (const line of Object.values(WHATSAPP_LINES)) {
      expect(toWaDigits(line.display)).toBe(line.e164.slice(1));
      expect(toWaDigits(line.e164)).toBe(line.e164.slice(1));
    }
  });

  it("strips the 00 international prefix", () => {
    expect(toWaDigits("00971504644502")).toBe("971504644502");
    expect(toWaDigits("00 973 3985 8885")).toBe("97339858885");
  });

  it("drops the trunk zero written after the country code", () => {
    expect(toWaDigits("+971 050 464 4502")).toBe("971504644502");
    expect(toWaDigits("00971 050 464 4502")).toBe("971504644502");
    expect(toWaDigits("+966 05 1234 5678")).toBe("966512345678");
  });

  it("ignores brackets, dashes, dots and slashes", () => {
    expect(toWaDigits("(+973) 3985-8885")).toBe("97339858885");
    expect(toWaDigits("+973.3985.8885")).toBe("97339858885");
    expect(toWaDigits("+973 / 3985 / 8885")).toBe("97339858885");
  });

  it("ignores non-breaking, thin and zero-width spaces and bidi marks", () => {
    expect(toWaDigits("+973\u00A03985\u00A08885")).toBe("97339858885");
    expect(toWaDigits("+973\u20093985\u202F8885")).toBe("97339858885");
    expect(toWaDigits("\u200E+971\u200B50 464 4502\u200F")).toBe("971504644502");
  });

  it("returns an empty string when there are no digits", () => {
    expect(toWaDigits("")).toBe("");
    expect(toWaDigits("call me")).toBe("");
    expect(toWaDigits("+ ( ) -")).toBe("");
  });

  it("leaves numbers without a trunk zero untouched", () => {
    expect(toWaDigits("97339858885")).toBe("97339858885");
    expect(toWaDigits("447700900123")).toBe("447700900123");
  });
});

describe("isPlausiblePhone", () => {
  it("accepts the three business numbers in any common format", () => {
    for (const n of ["+973 3985 8885", "+973 6366 9666", "+971 50 464 4502", "00971504644502", "(+973) 3985-8885"]) {
      expect(isPlausiblePhone(n)).toBe(true);
    }
  });

  it("accepts 7 to 15 digits", () => {
    expect(isPlausiblePhone("1234567")).toBe(true);
    expect(isPlausiblePhone("123456789012345")).toBe(true);
    expect(isPlausiblePhone("3985 8885")).toBe(true);
  });

  it("rejects fewer than 7 digits", () => {
    expect(isPlausiblePhone("123456")).toBe(false);
    expect(isPlausiblePhone("+973")).toBe(false);
    expect(isPlausiblePhone("")).toBe(false);
    expect(isPlausiblePhone("not a number")).toBe(false);
  });

  it("rejects more than 15 digits", () => {
    expect(isPlausiblePhone("1234567890123456")).toBe(false);
  });

  it("counts digits after stripping 00 and the trunk zero", () => {
    // 00 + 6 digits is still only 6 digits.
    expect(isPlausiblePhone("00123456")).toBe(false);
    // 16 raw digits, 15 after dropping the trunk zero.
    expect(isPlausiblePhone("+971 0 1234 5678 9012")).toBe(true);
  });
});
