"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import type { Region } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { REGION_CONFIG } from "@/lib/site";
import { getOpenStatus, type OpenStatus as OpenStatusValue } from "@/lib/hours";
import { fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

/** Ticks every minute, and again when the tab becomes visible after being in the background. */
function subscribeClock(onTick: () => void) {
  const id = window.setInterval(onTick, REFRESH_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") onTick();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** The server (and the hydration pass) never reads the clock, so prerendered HTML stays deterministic. */
const getServerSnapshot = () => null;

/**
 * Whether the region's WhatsApp lines are answered right now.
 * The status is only computed in the browser, after hydration; until then a
 * neutral placeholder of the same height holds the space.
 */
export function OpenStatus({ region, className }: { region: Region; className?: string }) {
  const { t } = useI18n();
  const timeZone = REGION_CONFIG[region].timeZone;

  // A string snapshot compares by value, so React only re-renders when the status actually changes.
  const getSnapshot = useCallback(() => JSON.stringify(getOpenStatus(new Date(), timeZone)), [timeZone]);
  const snapshot = useSyncExternalStore(subscribeClock, getSnapshot, getServerSnapshot);
  const status = snapshot ? (JSON.parse(snapshot) as OpenStatusValue) : null;

  const s = t.common.status;
  let content: ReactNode;

  if (!status) {
    content = (
      <>
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-ink-600" />
        <span aria-hidden className="h-2.5 w-36 rounded-full bg-white/[0.05]" />
      </>
    );
  } else if (status.open) {
    content = (
      <>
        <span aria-hidden className="size-2 shrink-0 animate-pulse-dot rounded-full bg-ok" />
        <span className="text-fg">{s.open}</span>
        {/* Collapsed by flex layout, but keeps the words apart for screen readers and copy-paste. */}
        {" "}
        {status.closesAt ? (
          <span className="tabular text-fg-muted">{fmt(s.closesAt, { time: status.closesAt })}</span>
        ) : null}
      </>
    );
  } else if (status.nextOpen) {
    const { dayOffset, weekday, time } = status.nextOpen;
    const label =
      dayOffset === 0
        ? fmt(s.opensToday, { time })
        : dayOffset === 1
          ? fmt(s.opensTomorrow, { time })
          : fmt(s.opensOn, { day: t.common.weekdays[weekday] ?? "", time });
    content = (
      <>
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-fg-subtle" />
        <span className="tabular text-fg-muted">{label}</span>
      </>
    );
  } else {
    content = null;
  }

  return (
    <p aria-live="polite" className={cn("flex min-h-5 items-center gap-2.5 text-sm leading-5", className)}>
      {content}
    </p>
  );
}
