"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type FocusEvent, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { useUI, type Toast } from "@/lib/store/ui";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const DURATION = 5000;
const EASE = [0.16, 1, 0.3, 1] as const;

const WIDE_QUERY = "(min-width: 64rem)";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True from the lg breakpoint up, where a drawer leaves room beside it. */
function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}

type Placement = "bottom" | "beside" | "top";

const PLACEMENT: Record<Placement, { outer: string; inner: string }> = {
  // Bottom-centre on phones, bottom inline-end from sm up.
  bottom: {
    outer: "bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]",
    inner: "flex-col",
  },
  // A drawer is open on a wide screen: bottom inline-end of the page area, just beside the drawer.
  beside: {
    outer: "bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
    inner: "flex-col me-[30rem]",
  },
  // A drawer fills the screen: drop in below its header, clear of the footer actions.
  top: {
    outer: "top-0 pt-[calc(env(safe-area-inset-top)+5.75rem)]",
    inner: "flex-col-reverse",
  },
};

/**
 * Confirmations ("Added to your order", "WhatsApp is open"). Bottom-centre
 * on phones, bottom inline-end on larger screens, above drawers. While a
 * drawer is open its footer holds the next action (send, clear, add), so
 * toasts move beside the drawer on wide screens and below its header on
 * narrow ones. The live region is always mounted so screen readers announce
 * each new toast.
 */
export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  const drawerOpen = useUI((s) => s.cartOpen || s.navOpen || s.quickView !== null);
  const wide = useWide();
  const placement: Placement = !drawerOpen ? "bottom" : wide ? "beside" : "top";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[60] flex justify-center sm:justify-end",
        // Physical padding on purpose: safe-area insets are physical too.
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
        "sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]",
        PLACEMENT[placement].outer,
      )}
    >
      <div className={cn("flex w-full max-w-sm gap-2", PLACEMENT[placement].inner)}>
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} fromTop={placement === "top"} onDismiss={() => dismiss(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * One toast. A hairline along the bottom edge shows the time left; it is
 * also the timer (a Web Animation whose finish dismisses the toast), so it
 * pauses exactly when the toast does: on hover, on focus, and while the tab
 * is hidden (e.g. the visitor is over in WhatsApp).
 */
function ToastCard({
  toast,
  fromTop,
  onDismiss,
  ref,
}: {
  toast: Toast;
  fromTop: boolean;
  onDismiss: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const barRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<Animation | null>(null);
  const dismissNow = useEffectEvent(onDismiss);
  const paused = hovered || focused;

  // Start the countdown once.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof bar.animate !== "function") {
      const id = window.setTimeout(() => dismissNow(), DURATION);
      return () => window.clearTimeout(id);
    }
    const anim = bar.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: DURATION,
      easing: "linear",
      fill: "forwards",
    });
    anim.onfinish = () => dismissNow();
    timer.current = anim;
    return () => {
      anim.onfinish = null;
      anim.cancel();
      timer.current = null;
    };
  }, []);

  // Pause while hovered, focused or the tab is in the background.
  useEffect(() => {
    const sync = () => {
      const anim = timer.current;
      if (!anim || anim.playState === "finished") return;
      if (paused || document.visibilityState === "hidden") anim.pause();
      else anim.play();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [paused]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <motion.div
      ref={ref}
      layout={reduced ? false : "position"}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: fromTop ? -18 : 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0.12 : 0.2, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: reduced ? 0.2 : 0.5, ease: EASE }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      // Frosted, but dense enough to stay legible over a bright button underneath.
      className="pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-line bg-ink-800/90 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9)] backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="flex items-start gap-3 py-3.5 pe-1.5 ps-4">
        <span aria-hidden className="mt-[0.4375rem] size-1.5 shrink-0 rounded-full bg-ok" />
        <div className="min-w-0 flex-1 py-px">
          <p className="text-sm font-medium leading-snug text-fg">{toast.title}</p>
          {toast.body ? <p className="mt-1 text-sm leading-relaxed text-fg-muted">{toast.body}</p> : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.common.actions.close}
          className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors duration-200 hover:bg-white/[0.05] hover:text-fg"
        >
          <X aria-hidden strokeWidth={1.5} className="size-4" />
        </button>
      </div>
      {/* Time left. Hidden with reduced motion; it keeps time either way. */}
      <span
        ref={barRef}
        aria-hidden
        className={cn(
          "absolute inset-x-4 bottom-0 h-px origin-left bg-glow/60 rtl:origin-right",
          reduced && "opacity-0",
        )}
      />
    </motion.div>
  );
}
