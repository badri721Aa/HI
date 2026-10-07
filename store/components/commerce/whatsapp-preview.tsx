"use client";

import { useId } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * The exact text the visitor is about to send. The <pre>'s textContent is
 * the WhatsApp message verbatim (asterisks and all), so what you see here is
 * what the shop receives. `dir="auto"` lets an Arabic message read RTL.
 */
export function WhatsAppPreview({ message, className }: { message: string; className?: string }) {
  const { t } = useI18n();
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;

  return (
    <section aria-labelledby={labelId} className={className}>
      <p id={labelId} className="eyebrow">
        {t.commerce.cart.preview}
      </p>
      <p id={hintId} className="mt-2 text-[0.8125rem] leading-snug text-fg-muted">
        {t.commerce.cart.previewHint}
      </p>
      <pre
        data-testid="whatsapp-preview"
        dir="auto"
        // Scrollable, so it must be reachable from the keyboard.
        tabIndex={0}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className={cn(
          "mt-3 max-h-64 overflow-auto overscroll-contain whitespace-pre-wrap rounded-xl border border-line bg-ink-950 px-4 py-3.5",
          "font-mono text-[12.5px] leading-relaxed text-fg-muted [overflow-wrap:anywhere]",
        )}
      >
        {message}
      </pre>
    </section>
  );
}
