"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { releaseBackEntry, useCloseOnBack } from "@/lib/hooks/use-close-on-back";
import { lockScroll, unlockScroll } from "@/lib/scroll";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Below Tailwind's `sm` (640px) every drawer is a bottom sheet. */
const SHEET_QUERY = "(max-width: 39.999rem)";
/** Drag-to-dismiss: past this share of the sheet's height, or flicked down faster than this (px/s). */
const DISMISS_RATIO = 0.3;
const DISMISS_VELOCITY = 600;

const SPRING = { type: "spring", damping: 34, stiffness: 340, mass: 0.9 } as const;
const SNAP_BACK = { type: "spring", damping: 32, stiffness: 420 } as const;
const EXIT_EASE = [0.4, 0, 1, 1] as const;

const subscribeNoop = () => () => {};

function subscribeSheet(cb: () => void) {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useSheetLayout() {
  return useSyncExternalStore(
    subscribeSheet,
    () => window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );
}

/** The open drawer's footer slot for <DrawerFooter>; `undefined` outside a drawer. */
const FooterSlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Renders its children in the enclosing Drawer's footer, the sticky area
 * below the scrolling body, or in place when not inside a Drawer. Lets a
 * drawer's content pin its main action without lifting its state.
 */
export function DrawerFooter({ children }: { children: ReactNode }) {
  const slot = useContext(FooterSlot);
  if (slot === undefined) return <>{children}</>;
  return slot ? createPortal(children, slot) : null;
}

/**
 * Modal panel rendered in a portal: a side drawer from the inline-end edge
 * (right in English, left in Arabic) on tablets and up, a bottom sheet with a
 * grab handle on phones (drag the handle or header down to dismiss).
 * Handles the backdrop, Esc, focus trapping and restoring, scroll locking
 * (native + Lenis), safe-area insets and reduced motion (a fade, no slide).
 * With `closeOnBack`, the browser's Back closes it instead of leaving the page.
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
  closeOnBack = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky area below the scrollable body (totals, primary action). Content can also portal in with <DrawerFooter>. */
  footer?: ReactNode;
  className?: string;
  side?: "start" | "end";
  testId?: string;
  /** Own a history entry while open: Back closes the drawer, other ways of closing step back over it. */
  closeOnBack?: boolean;
}) {
  const { dir, t } = useI18n();
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const sheet = useSheetLayout();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const requestClose = useEffectEvent(() => onClose());
  const dragControls = useDragControls();
  const y = useMotionValue<number | string>(0);

  useCloseOnBack(open, onClose, closeOnBack);

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

  // Every mode starts from y: 0 or its own offset: `y` outlives the panel, and a sheet may have been dragged away.
  const motionProps = reduced
    ? {
        initial: { opacity: 0, y: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: { duration: 0.16 } },
        transition: { duration: 0.2 },
      }
    : sheet
      ? {
          initial: { y: "100%" },
          animate: { y: 0 },
          exit: { y: "100%", transition: { duration: 0.24, ease: EXIT_EASE } },
          transition: SPRING,
        }
      : {
          initial: { x: offscreen, y: 0 },
          animate: { x: 0 },
          exit: { x: offscreen, transition: { duration: 0.22, ease: EXIT_EASE } },
          transition: SPRING,
        };

  /* Only the grab handle and the header start a drag, so the body still scrolls. */
  const startDrag = (e: ReactPointerEvent) => {
    if (!sheet || (e.target as Element).closest("a, button, input, select, textarea")) return;
    dragControls.start(e);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const height = panelRef.current?.offsetHeight ?? Infinity;
    if (info.offset.y > height * DISMISS_RATIO || info.velocity.y > DISMISS_VELOCITY) onClose();
    else animate(y, 0, reduced ? { duration: 0 } : SNAP_BACK);
  };

  /*
   * With a history entry of our own, following a link must not step back over
   * it. A link to another page replaces the entry rather than stacking on top
   * of it, so Back returns to the page the drawer was opened on. In-page
   * anchors (SmoothScroll) and links to the other language (a new document)
   * keep their own handling.
   */
  const onLinkCapture = (e: ReactMouseEvent) => {
    if (!closeOnBack || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) {
      return;
    }
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin) return;
    releaseBackEntry();
    const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
    if (e.defaultPrevented || samePage || anchor.hreflang) return;
    e.preventDefault();
    router.replace(url.pathname + url.search + url.hash);
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        // 100vw, not inset-0: also covers the scrollbar gutter the page keeps while it is locked.
        <div className="fixed inset-y-0 left-0 z-50 w-screen" data-testid={testId ? `${testId}-root` : undefined}>
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
            data-sheet={sheet ? "" : undefined}
            className={cn(
              "absolute flex flex-col border-line bg-ink-900/92 backdrop-blur-2xl outline-none",
              sheet
                ? "inset-x-0 bottom-0 max-h-[92svh] rounded-t-2xl border-t shadow-[0_-24px_80px_-24px_rgb(0_0_0/0.9)]"
                : cn(
                    "inset-y-0 w-full max-w-[30rem] shadow-[0_0_80px_-20px_rgb(0_0_0/0.9)]",
                    fromRight ? "right-0 border-l pr-[env(safe-area-inset-right)]" : "left-0 border-r pl-[env(safe-area-inset-left)]",
                  ),
              className,
            )}
            style={{ y }}
            drag={sheet ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={reduced ? 0 : 0.04}
            dragMomentum={false}
            onDragEnd={onDragEnd}
            onClickCapture={onLinkCapture}
            {...motionProps}
          >
            {sheet ? (
              <div
                aria-hidden
                onPointerDown={startDrag}
                className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
              >
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
            ) : null}
            <div
              onPointerDown={startDrag}
              className={cn(
                "flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 sm:px-6",
                sheet ? "touch-none pb-3.5 pt-1" : "pb-4 pt-[max(1rem,env(safe-area-inset-top))]",
              )}
            >
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
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                // Without a footer the body runs to the bottom edge: keep its end clear of the home indicator.
                !footer && "pb-[env(safe-area-inset-bottom)]",
              )}
            >
              <FooterSlot.Provider value={slot}>{children}</FooterSlot.Provider>
            </div>
            {footer ? <div className={FOOTER}>{footer}</div> : null}
            <div ref={setSlot} className={cn(FOOTER, "empty:hidden")} />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

const FOOTER = "shrink-0 border-t border-line bg-ink-900/95 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6";
