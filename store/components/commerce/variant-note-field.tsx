"use client";

import { useId, type Ref } from "react";
import { LIMITS } from "@/lib/whatsapp/order";
import { cn } from "@/lib/utils";

/**
 * The per-item detail a product asks for (e.g. "iPhone model"). Visible
 * label, `dir="auto"` so Arabic and Latin answers both read naturally, and an
 * inline error tied to the input with aria-describedby. The parent decides
 * when to show the error (after a blur or an add attempt).
 */
export function VariantNoteField({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  required,
  inputRef,
  className,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Message to show, or null for none. */
  error?: string | null;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const remaining = LIMITS.note - value.length;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {/* Only near the limit: a quiet mono countdown. */}
        <span
          aria-hidden
          className={cn(
            "font-mono text-[11px] text-fg-muted tabular transition-opacity duration-300",
            remaining <= 10 ? "opacity-100" : "opacity-0",
          )}
        >
          {remaining}
        </span>
      </div>
      <input
        ref={inputRef}
        id={id}
        name="variant-note"
        type="text"
        data-testid="variant-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={LIMITS.note}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        dir="auto"
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-2 h-12 w-full rounded-xl border bg-ink-800 px-4 text-[0.9375rem] text-fg transition-colors duration-200 placeholder:text-fg-subtle",
          "hover:border-line-strong focus:border-line-strong",
          error ? "border-danger/60" : "border-line",
        )}
      />
      {error ? (
        <p id={errorId} data-testid="error-note" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
