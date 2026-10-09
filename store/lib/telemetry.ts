import { track } from "@vercel/analytics";

/**
 * A Vercel Analytics custom event. Fire and forget: never throws, and callers
 * send only the shape of what happened, never names, phones, addresses or notes.
 */
export function trackEvent(name: string, data: Record<string, string | number | boolean> = {}): void {
  try {
    track(name, data);
  } catch {
    // Analytics blocked or not loaded: nothing to do.
  }
}
