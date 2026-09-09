import { Info, ShieldAlert, Lightbulb } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type CalloutVariant = "info" | "warn" | "tip"

const VARIANT_STYLES: Record<
  CalloutVariant,
  { icon: LucideIcon; border: string; bg: string; text: string; label: string }
> = {
  info: {
    icon: Info,
    border: "border-[#5b9eff]",
    bg: "bg-[#5b9eff]/[0.07]",
    text: "text-[#5b9eff]",
    label: "Note",
  },
  warn: {
    icon: ShieldAlert,
    border: "border-[#ffb930]",
    bg: "bg-[#ffb930]/[0.07]",
    text: "text-[#ffb930]",
    label: "Warning",
  },
  tip: {
    icon: Lightbulb,
    border: "border-[#00e5a0]",
    bg: "bg-[#00e5a0]/[0.06]",
    text: "text-[#00e5a0]",
    label: "Tip",
  },
}

interface CalloutProps {
  variant: CalloutVariant
  title?: string
  children: React.ReactNode
}

export function Callout({ variant, title, children }: CalloutProps) {
  const { icon: Icon, border, bg, text, label } = VARIANT_STYLES[variant]

  return (
    <div
      className={cn(
        "my-5 max-w-[660px] rounded-r-lg border-l-[3px] px-4 py-3.5",
        border,
        bg
      )}
    >
      <div
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]",
          text
        )}
      >
        <Icon className="size-3.5" />
        {title ?? label}
      </div>
      <div className="text-[13px] leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-[family-name:var(--font-mono)] [&_code]:text-[12px] [&_code]:text-foreground">
        {children}
      </div>
    </div>
  )
}
