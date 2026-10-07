"use client";

import type { SizeOption } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { fmt } from "@/lib/i18n";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useRadioGroupKeys } from "./swatches";

/**
 * Size picker as a radiogroup of pills. Each pill shows the size name and,
 * only when the catalog knows them, the outer dimensions in mono. Arrow keys
 * follow the reading direction (see useRadioGroupKeys).
 */
export function SizePills({
  sizes,
  value,
  onChange,
  label,
  className,
}: {
  sizes: SizeOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the group, e.g. "Size". */
  label: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const select = (id: string) => {
    if (id === value) return;
    onChange(id);
    playSound("tap");
  };
  const { onKeyDown, setRef } = useRadioGroupKeys(sizes, value, select);

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("flex flex-wrap gap-2", className)}>
      {sizes.map((size, i) => {
        const checked = size.id === value;
        return (
          <button
            key={size.id}
            ref={setRef(i)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-testid={`size-${size.id}`}
            onClick={() => select(size.id)}
            className={cn(
              "inline-flex min-h-11 flex-col items-start justify-center rounded-full border px-4 py-1.5 text-start transition-[border-color,background-color,color,box-shadow] duration-300 ease-out-expo",
              checked
                ? "border-transparent bg-white/[0.06] text-fg shadow-[inset_0_0_0_1px_var(--color-glow)]"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            <span className="text-sm font-medium leading-5">{size.name[locale]}</span>
            {size.dims ? (
              <span className="font-mono text-[11px] leading-4 text-fg-muted tabular">
                {fmt(t.commerce.product.dims, { w: size.dims.w, d: size.dims.d, h: size.dims.h })}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
