import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium " +
  "transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-fg text-ink-950 hover:bg-white shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_8px_24px_-12px_rgb(0_0_0/0.8)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.2),0_8px_24px_-12px_rgb(0_0_0/0.8)]",
  secondary: "glass text-fg hover:border-line-strong hover:bg-ink-700/70",
  ghost: "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-13 px-7 text-base",
  icon: "size-11",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type CommonProps = { variant?: ButtonVariant; size?: ButtonSize; className?: string; children?: ReactNode };

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}

/** Internal hrefs use next/link; absolute URLs open in a new tab. */
export function ButtonLink({
  href,
  variant,
  size,
  className,
  ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const cls = buttonStyles({ variant, size, className });
  if (/^https?:\/\//.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...props} />;
  }
  return <Link href={href} className={cls} {...props} />;
}
