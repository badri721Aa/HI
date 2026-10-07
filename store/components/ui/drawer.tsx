"use client";

import { useEffect, useEffectEvent, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { scrollDriver } from "@/lib/scroll";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const subscribeNoop = () => () => {};

/** Number of drawers currently open, so nested/sequential drawers share one scroll lock. */
let openCount = 0;

function lockScroll() {
  if (openCount++ > 0) return;
  scrollDriver.lenis?.stop();
  document.documentElement.style.overflow = "hidden";
}

function unlockScroll() {
  if (--openCount > 0) return;
  openCount = 0;
  scrollDriver.lenis?.start();
  document.documentElement.style.overflow = "";
}

/**
 * Slide-out panel rendered in a portal. Handles the backdrop, Esc to close,
 * focus trapping and restoring, scroll locking (native + Lenis), and slides
 * in from the inline-end edge (right in English, left in Arabic).
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  side = "end",
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky area below the scrollable body (totals, primary action). */
  footer?: ReactNode;
  className?: string;
  side?: "start" | "end";
  testId?: string;
}) {
  const { dir, t } = useI18n();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();
    const focusFirst = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panel).focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;

  const fromRight = (side === "end") === (dir === "ltr");
  const offscreen = fromRight ? "100%" : "-100%";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" data-testid={testId ? `${testId}-root` : undefined}>
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-ink-950/65 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.28 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            data-testid={testId}
            data-lenis-prevent
            className={cn(
              "absolute inset-y-0 flex w-full max-w-[30rem] flex-col border-line bg-ink-900/92 shadow-[0_0_80px_-20px_rgb(0_0_0/0.9)] backdrop-blur-2xl outline-none",
              fromRight ? "right-0 border-l" : "left-0 border-r",
              className,
            )}
            initial={{ x: offscreen }}
            animate={{ x: 0 }}
            exit={{ x: offscreen, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: "spring", damping: 34, stiffness: 340, mass: 0.9 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em] text-fg">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-sm text-fg-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.actions.close}
                className="-me-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer ? <div className="border-t border-line bg-ink-900/95 px-5 py-4 sm:px-6">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
