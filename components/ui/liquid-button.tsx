import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const liquidButtonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full text-sm font-medium text-foreground outline-none transition-transform duration-200 ease-out",
    // Tinted from --card/--border, not hardcoded white — a white-tinted
    // glass layer reads fine on the dark theme but nearly disappears
    // against the light theme's pale background, so this follows the same
    // theme-aware recipe the site's .glass utility already uses.
    "before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:border before:border-border before:bg-[color-mix(in_oklab,var(--card)_55%,transparent)] before:shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_12%,transparent),0_10px_28px_-10px_rgba(0,0,0,0.45)] before:backdrop-blur-md before:transition-colors before:duration-300 before:content-['']",
    "after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:content-[''] after:[backdrop-filter:url(#nosignal-liquid-glass)]",
    "hover:before:bg-[color-mix(in_oklab,var(--card)_75%,transparent)]",
    "focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      size: {
        default: "h-10 px-6",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: { size: "default" },
  }
)

/**
 * A frosted button with real refraction — an SVG displacement filter (see
 * liquid-glass-filter.tsx, mounted once in the root layout) warps what's
 * behind it via the `after:` pseudo-element, the way liquid glass actually
 * bends light. The `before:` tint/blur/border layer always renders; the
 * distortion itself is Chromium-only (backdrop-filter: url(#...) isn't
 * supported in Firefox/Safari), so elsewhere this still reads as a clean
 * frosted button instead of breaking. Both layers are pseudo-elements, not
 * real DOM children, so `asChild` still slots cleanly onto a single real
 * child (e.g. a next/link `<Link>`) with no wrapper-element workarounds.
 */
export function LiquidButton({
  className,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof liquidButtonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp data-slot="button" className={cn(liquidButtonVariants({ size, className }))} {...props} />
  )
}
