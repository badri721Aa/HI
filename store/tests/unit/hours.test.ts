import { describe, expect, it, vi } from "vitest";
import { HOURS, REGION_CONFIG } from "@/lib/site";
import { getOpenStatus, localTime, type Hours } from "@/lib/hours";

/*
 * Fixed instants (no clock reads). Bahrain is UTC+3 and the UAE UTC+4 all
 * year (no DST). 2026-10-07 is a Wednesday; 2026-10-09 is a Friday.
 */
const BH = "Asia/Bahrain";
const AE = "Asia/Dubai";
const at = (iso: string) => new Date(iso);

const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;

describe("region time zones", () => {
  it("are the ones these tests assume", () => {
    expect(REGION_CONFIG.BH.timeZone).toBe(BH);
    expect(REGION_CONFIG.AE.timeZone).toBe(AE);
  });

  it("uses the shop hours these tests assume (Friday opens at 14:00)", () => {
    expect(HOURS[WED]).toEqual(["10:00", "22:00"]);
    expect(HOURS[FRI]).toEqual(["14:00", "22:00"]);
  });
});

describe("localTime", () => {
  it("converts an instant to the local weekday and minutes", () => {
    expect(localTime(at("2026-10-07T09:00:00Z"), BH)).toEqual({ weekday: WED, minutes: 12 * 60 });
    expect(localTime(at("2026-10-07T09:00:00Z"), AE)).toEqual({ weekday: WED, minutes: 13 * 60 });
  });

  it("rolls over to the next local day after midnight", () => {
    // 21:30 UTC Wednesday = 00:30 Thursday in Bahrain.
    expect(localTime(at("2026-10-07T21:30:00Z"), BH)).toEqual({ weekday: THU, minutes: 30 });
  });

  it("reports midnight as 0 minutes, not 24:00", () => {
    expect(localTime(at("2026-10-07T21:00:00Z"), BH)).toEqual({ weekday: THU, minutes: 0 });
  });
});

describe("getOpenStatus", () => {
  it("is open mid-day and says when it closes", () => {
    expect(getOpenStatus(at("2026-10-07T09:00:00Z"), BH)).toEqual({ open: true, closesAt: "22:00" });
    expect(getOpenStatus(at("2026-10-07T09:00:00Z"), AE)).toEqual({ open: true, closesAt: "22:00" });
  });

  it("before opening, opens later today", () => {
    // 08:00 in Bahrain.
    expect(getOpenStatus(at("2026-10-07T05:00:00Z"), BH)).toEqual({
      open: false,
      nextOpen: { dayOffset: 0, weekday: WED, time: "10:00" },
    });
  });

  it("after closing, opens tomorrow", () => {
    // 23:00 in Bahrain.
    expect(getOpenStatus(at("2026-10-07T20:00:00Z"), BH)).toEqual({
      open: false,
      nextOpen: { dayOffset: 1, weekday: THU, time: "10:00" },
    });
  });

  it("just after local midnight, opens later the same (new) day", () => {
    expect(getOpenStatus(at("2026-10-07T21:30:00Z"), BH)).toEqual({
      open: false,
      nextOpen: { dayOffset: 0, weekday: THU, time: "10:00" },
    });
  });

  it("opens at 14:00 on Friday", () => {
    // Friday 11:00 in Bahrain: closed, opens today at 14:00.
    expect(getOpenStatus(at("2026-10-09T08:00:00Z"), BH)).toEqual({
      open: false,
      nextOpen: { dayOffset: 0, weekday: FRI, time: "14:00" },
    });
    // Friday 15:00 in Bahrain: open.
    expect(getOpenStatus(at("2026-10-09T12:00:00Z"), BH)).toEqual({ open: true, closesAt: "22:00" });
  });

  it("after Thursday's close, the next opening is Friday 14:00", () => {
    expect(getOpenStatus(at("2026-10-08T19:30:00Z"), BH)).toEqual({
      open: false,
      nextOpen: { dayOffset: 1, weekday: FRI, time: "14:00" },
    });
  });

  it("treats opening time as open and closing time as closed", () => {
    expect(getOpenStatus(at("2026-10-07T07:00:00Z"), BH).open).toBe(true); // 10:00
    expect(getOpenStatus(at("2026-10-07T06:59:00Z"), BH).open).toBe(false); // 09:59
    expect(getOpenStatus(at("2026-10-07T18:59:00Z"), BH).open).toBe(true); // 21:59
    expect(getOpenStatus(at("2026-10-07T19:00:00Z"), BH)).toEqual({
      open: false,
      nextOpen: { dayOffset: 1, weekday: THU, time: "10:00" },
    }); // 22:00
  });

  it("can be open in Dubai while Bahrain is still closed", () => {
    // 06:30 UTC = 09:30 in Bahrain, 10:30 in Dubai.
    const instant = at("2026-10-07T06:30:00Z");
    expect(getOpenStatus(instant, BH).open).toBe(false);
    expect(getOpenStatus(instant, AE)).toEqual({ open: true, closesAt: "22:00" });
  });

  it("can be closed in Dubai while Bahrain is still open", () => {
    // 18:30 UTC = 21:30 in Bahrain, 22:30 in Dubai.
    const instant = at("2026-10-07T18:30:00Z");
    expect(getOpenStatus(instant, BH).open).toBe(true);
    expect(getOpenStatus(instant, AE)).toEqual({
      open: false,
      nextOpen: { dayOffset: 1, weekday: THU, time: "10:00" },
    });
  });

  it("skips closed days", () => {
    const hours: Hours = { ...HOURS, [FRI]: null };
    // Thursday 23:00 in Bahrain, Friday closed → Saturday.
    expect(getOpenStatus(at("2026-10-08T20:00:00Z"), BH, hours)).toEqual({
      open: false,
      nextOpen: { dayOffset: 2, weekday: SAT, time: "10:00" },
    });
    // On the closed day itself.
    expect(getOpenStatus(at("2026-10-09T12:00:00Z"), BH, hours).open).toBe(false);
  });

  it("wraps around the week to the same weekday", () => {
    const onlyWednesday: Hours = { 0: null, 1: null, 2: null, 3: ["10:00", "12:00"], 4: null, 5: null, 6: null };
    expect(getOpenStatus(at("2026-10-07T12:00:00Z"), BH, onlyWednesday)).toEqual({
      open: false,
      nextOpen: { dayOffset: 7, weekday: WED, time: "10:00" },
    });
  });

  it("is closed with no next opening when there are no hours at all", () => {
    const never: Hours = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    expect(getOpenStatus(at("2026-10-07T09:00:00Z"), BH, never)).toEqual({ open: false });
  });

  it("does not depend on the machine's own time zone", () => {
    const instant = at("2026-10-07T06:30:00Z");
    // Restored after the test (unstubEnvs in vitest.config.mts).
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      vi.stubEnv("TZ", tz);
      expect(getOpenStatus(instant, AE).open).toBe(true);
      expect(getOpenStatus(instant, BH).open).toBe(false);
    }
  });
});
