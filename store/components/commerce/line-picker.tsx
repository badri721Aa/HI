"use client";

import type { KeyboardEvent } from "react";
import type { Locale, Region, WhatsAppLine, WhatsAppLineId } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { REGION_CONFIG, WHATSAPP_LINES } from "@/lib/site";
import { usePrefs } from "@/lib/store/prefs";
import { resolveLine } from "@/lib/whatsapp";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** "Line 1" out of "Bahrain · Line 1": a line's label without its region prefix. */
export function shortLineLabel(line: WhatsAppLine, locale: Locale): string {
  const label = line.label[locale];
  return label.split(" · ").pop() || label;
}

/** The WhatsApp line a region's orders go to: the visitor's pick, else the region's default. */
export function useWhatsAppLine(region: Region): WhatsAppLine {
  const preferred = usePrefs((s) => s.lines[region]);
  return resolveLine(region, preferred);
}

/**
 * Arrow-key handling for a radio group of buttons (roving tabindex): the
 * arrows move the selection and focus together, wrapping at the ends, and
 * Left/Right follow the reading direction.
 */
export function radioKeyNav(
  e: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  dir: "ltr" | "rtl",
  select: (next: number) => void,
) {
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  let next = -1;
  if (e.key === forward || e.key === "ArrowDown") next = (index + 1) % count;
  else if (e.key === backward || e.key === "ArrowUp") next = (index - 1 + count) % count;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = count - 1;
  if (next < 0) return;
  e.preventDefault();
  select(next);
  const group = e.currentTarget.closest('[role="radiogroup"]');
  group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}

/** Ring with a small cyan dot: the selected-state indicator shared by the radio cards. */
export function RadioDot({ selected, className }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full ring-1 transition-shadow duration-300",
        selected ? "ring-glow/70" : "ring-line-strong",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-glow transition-[opacity,scale] duration-300 ease-out-expo",
          selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
    </span>
  );
}

/**
 * Chooses which of a region's WhatsApp lines receives the order (Bahrain
 * has two). Renders nothing for a region with a single line.
 *
 * - `cards`: two radio cards, "Line 1" over the number in mono (checkout).
 * - `compact`: small pills with the line names only (custom-print form).
 *
 * Test ids are `${testIdPrefix}line-<id>`; the checkout uses the bare ids
 * (`line-bh-primary`), other surfaces pass a prefix so ids stay unique.
 */
export function LinePicker({
  region,
  variant = "cards",
  testIdPrefix = "",
  label,
  className,
}: {
  region: Region;
  variant?: "cards" | "compact";
  testIdPrefix?: string;
  /** Accessible name for the group; defaults to "Send to". */
  label?: string;
  className?: string;
}) {
  const { t, locale, dir } = useI18n();
  const current = useWhatsAppLine(region);
  const setLine = usePrefs((s) => s.setLine);
  const ids: WhatsAppLineId[] = REGION_CONFIG[region].lines;
  if (ids.length < 2) return null;

  const choose = (id: WhatsAppLineId) => {
    if (id !== current.id) playSound("toggle");
    setLine(region, id);
  };

  const compact = variant === "compact";

  return (
    <div
      role="radiogroup"
      aria-label={label ?? t.commerce.cart.sendTo}
      className={cn(
        compact
          ? "inline-flex items-center rounded-full border border-line bg-ink-950/40 p-0.5"
          : "grid grid-cols-2 gap-2",
        className,
      )}
    >
      {ids.map((id, i) => {
        const line = WHATSAPP_LINES[id];
        const selected = id === current.id;
        const common = {
          type: "button" as const,
          role: "radio" as const,
          "aria-checked": selected,
          tabIndex: selected ? 0 : -1,
          "data-testid": `${testIdPrefix}line-${id}`,
          onClick: () => choose(id),
          onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => radioKeyNav(e, i, ids.length, dir, (n) => choose(ids[n])),
        };

        if (compact) {
          return (
            <button
              key={id}
              {...common}
              aria-label={`${shortLineLabel(line, locale)} · ${line.display}`}
              className={cn(
                "relative inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-[color,background-color,box-shadow] duration-300",
                // 44px tall hit area around the compact pill.
                "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
                selected
                  ? "bg-white/[0.07] text-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)] ring-1 ring-line-strong"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {shortLineLabel(line, locale)}
            </button>
          );
        }

        return (
          <button
            key={id}
            {...common}
            className={cn(
              "group/line flex min-h-[4.25rem] flex-col items-start justify-center gap-1.5 rounded-xl border px-3.5 py-3 text-start transition-[border-color,background-color] duration-200",
              selected
                ? "border-line-strong bg-white/[0.04]"
                : "border-line hover:border-line-strong hover:bg-white/[0.02]",
            )}
          >
            <span className="flex items-center gap-2.5">
              <RadioDot selected={selected} />
              <span className={cn("text-sm font-medium transition-colors", selected ? "text-fg" : "text-fg-muted group-hover/line:text-fg")}>
                {shortLineLabel(line, locale)}
              </span>
            </span>
            {/* Indent past the dot; the outer span follows the page direction, the number stays LTR. */}
            <span className="ps-[1.625rem]">
              <span dir="ltr" className="font-mono text-[0.8125rem] tabular text-fg-muted">
                {line.display}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
