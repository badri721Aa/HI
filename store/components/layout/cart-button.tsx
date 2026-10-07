"use client";

import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { selectCount, useCart } from "@/lib/store/cart";
import { useUI } from "@/lib/store/ui";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Minimal tote: a tapered body and a single handle. */
function BagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5.25 8.25h13.5l-.93 10.73a1.75 1.75 0 0 1-1.74 1.6H7.92a1.75 1.75 0 0 1-1.74-1.6L5.25 8.25Z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </svg>
  );
}

/**
 * Opens the order drawer. The count badge appears once there is something in
 * the order and pops when it grows. The cart store rehydrates after mount,
 * so the server and first client render both show no badge.
 */
export function CartButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const count = useCart(selectCount);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const reduced = useReducedMotion();
  const [badge, animate] = useAnimate<HTMLSpanElement>();
  const prev = useRef(count);
  const countId = useId();

  // Restoring a saved order on load shouldn't look like something was just added.
  useEffect(
    () =>
      useCart.persist.onFinishHydration((state) => {
        prev.current = selectCount(state);
      }),
    [],
  );

  useEffect(() => {
    if (prev.current > 0 && count > prev.current && !reduced && badge.current) {
      animate(badge.current, { scale: [1, 1.38, 1] }, { duration: 0.5, ease: EASE });
    }
    prev.current = count;
  }, [count, reduced, animate, badge]);

  return (
    <button
      type="button"
      data-testid="cart-button"
      aria-label={t.common.actions.openOrder}
      // The badge is decorative; its number is read as the button's description.
      aria-describedby={count > 0 ? countId : undefined}
      aria-haspopup="dialog"
      onClick={() => {
        setCartOpen(true);
        playSound("open");
      }}
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-full text-fg transition-colors duration-300 hover:bg-white/[0.05]",
        className,
      )}
    >
      <BagIcon className="size-5" />
      <AnimatePresence initial={false}>
        {count > 0 ? (
          <motion.span
            key="count"
            ref={badge}
            id={countId}
            data-testid="cart-count"
            aria-hidden
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="pointer-events-none absolute end-1 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-1 font-mono text-[10px] font-medium leading-none text-ink-950 tabular shadow-[0_0_0_2px_var(--color-ink-950)]"
          >
            {count}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </button>
  );
}
