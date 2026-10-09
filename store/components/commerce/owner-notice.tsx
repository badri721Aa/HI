"use client";

import { Info } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { NOTICE } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The owner's current note from lib/site.ts (e.g. a holiday closure). Renders nothing when NOTICE is null. */
export function OwnerNotice({ className }: { className?: string }) {
  const { locale } = useI18n();
  if (!NOTICE) return null;
  return (
    <p
      role="note"
      data-testid="owner-notice"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-line bg-ink-900 px-4 py-3 text-sm leading-relaxed text-fg",
        className,
      )}
    >
      <Info aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-warn" />
      <span>{NOTICE[locale]}</span>
    </p>
  );
}
