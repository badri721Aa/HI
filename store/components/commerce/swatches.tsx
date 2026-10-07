"use client";

import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import type { ColorOption } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Fill for a colour dot: flat, or split diagonally for two-tone prints (`hex2`). */
export function swatchFill(color: Pick<ColorOption, "hex" | "hex2">): CSSProperties {
  return color.hex2
    ? { backgroundImage: `linear-gradient(135deg, ${color.hex} 0 50%, ${color.hex2} 50% 100%)` }
    : { backgroundColor: color.hex };
}

/** A round colour chip with a hairline ring (so near-black prints stay visible on ink). Decorative. */
export function ColorDot({ color, className }: { color: Pick<ColorOption, "hex" | "hex2">; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3.5 shrink-0 rounded-full ring-1 ring-line-strong ring-inset", className)}
      style={swatchFill(color)}
    />
  );
}

/**
 * Keyboard model for a radiogroup of buttons (roving tabindex): arrows move
 * and select, mirrored in RTL so "next" always follows the reading direction;
 * Home/End jump to the ends. Returns a ref setter per option and the group's
 * keydown handler.
 */
export function useRadioGroupKeys<T extends { id: string }>(
  options: readonly T[],
  value: string,
  onChange: (id: string) => void,
) {
  const { dir } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const n = options.length;
    if (n < 2) return;
    const current = Math.max(0, options.findIndex((o) => o.id === value));
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    let next: number;
    if (e.key === forward || e.key === "ArrowDown") next = (current + 1) % n;
    else if (e.key === backward || e.key === "ArrowUp") next = (current - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    if (next === current) return;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  const setRef = (index: number) => (el: HTMLButtonElement | null) => {
    refs.current[index] = el;
  };

  return { onKeyDown, setRef };
}

/**
 * Colour picker as a radiogroup of round swatches (44px targets around a
 * 28px chip). The selected chip gets the cyan selection ring; the colour
 * name is the accessible label (colour is never the only signal: the
 * selected name is printed beside the group label by ProductDetails).
 */
export function Swatches({
  colors,
  value,
  onChange,
  label,
  className,
}: {
  colors: ColorOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the group, e.g. "Colour". */
  label: string;
  className?: string;
}) {
  const { locale } = useI18n();
  const select = (id: string) => {
    if (id === value) return;
    onChange(id);
    playSound("tap");
  };
  const { onKeyDown, setRef } = useRadioGroupKeys(colors, value, select);

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("-ms-2 flex flex-wrap gap-1", className)}>
      {colors.map((color, i) => {
        const checked = color.id === value;
        return (
          <button
            key={color.id}
            ref={setRef(i)}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={color.name[locale]}
            title={color.name[locale]}
            tabIndex={checked ? 0 : -1}
            data-testid={`colour-${color.id}`}
            onClick={() => select(color.id)}
            className="group/swatch grid size-11 place-items-center rounded-full"
          >
            <span
              aria-hidden
              className={cn(
                "size-7 rounded-full ring-1 ring-line-strong ring-inset outline-offset-[3px] transition-[outline-color,scale] duration-300 ease-out-expo",
                "group-hover/swatch:scale-[1.06]",
                checked ? "outline-1 outline-glow" : "outline-1 outline-transparent",
              )}
              style={swatchFill(color)}
            />
          </button>
        );
      })}
    </div>
  );
}
