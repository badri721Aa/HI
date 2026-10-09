"use client";

import { useId, type Ref } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { LIMITS } from "@/lib/whatsapp/order";
import { cn } from "@/lib/utils";
import { FieldError, inputStyles } from "./checkout-form";

/**
 * The per-item detail a product asks for (e.g. "iPhone model"). Visible
 * label, the same 16px input as the checkout (so iOS never zooms), and an
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
  const { dir } = useI18n();
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
          dir="ltr"
          className={cn(
            "font-mono text-[0.6875rem] text-fg-muted tabular transition-opacity duration-300",
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
        // Empty, it follows the page (the Arabic placeholder reads right to left); an answer finds its own direction.
        dir={value ? "auto" : dir}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(inputStyles, "mt-2 h-12")}
      />
      {error ? (
        <FieldError id={errorId} testId="error-note">
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}
