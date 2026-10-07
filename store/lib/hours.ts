import { HOURS } from "@/lib/site";

export type Hours = Record<number, [open: string, close: string] | null>;

export interface OpenStatus {
  open: boolean;
  /** "22:00" when open. */
  closesAt?: string;
  /** Next opening, in the region's local time. `dayOffset` 0 = today, 1 = tomorrow… */
  nextOpen?: { dayOffset: number; weekday: number; time: string };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Weekday (0 = Sunday) and minutes since midnight for `now` in `timeZone`. */
export function localTime(now: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function getOpenStatus(now: Date, timeZone: string, hours: Hours = HOURS): OpenStatus {
  const { weekday, minutes } = localTime(now, timeZone);
  const today = hours[weekday];
  if (today && minutes >= toMinutes(today[0]) && minutes < toMinutes(today[1])) {
    return { open: true, closesAt: today[1] };
  }
  for (let offset = 0; offset <= 7; offset++) {
    const day = (weekday + offset) % 7;
    const slot = hours[day];
    if (!slot) continue;
    if (offset === 0 && minutes >= toMinutes(slot[0])) continue;
    return { open: false, nextOpen: { dayOffset: offset, weekday: day, time: slot[0] } };
  }
  return { open: false };
}
