"use client";

import { useEffect, useEffectEvent, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Locale } from "@/types";
import type { Dictionary } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { Drawer } from "@/components/ui/drawer";
import { useCart } from "@/lib/store/cart";
import { useUI } from "@/lib/store/ui";
import { useRegion } from "@/lib/hooks/use-region";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { createOrderRef, priceOrder } from "@/lib/whatsapp";
import { trackOrderSent } from "@/lib/whatsapp/track";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { OwnerNotice } from "./owner-notice";
import { CartEmpty, CartLines, CartSummary, orderTotals } from "./cart-lines";
import { CheckoutForm, CheckoutSend, focusField, loadOrderValidator, useCheckout } from "./checkout-form";

const EASE = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

type Step = 1 | 2;
/** Slide direction of the next step change: 1 forward, -1 back, 0 cross-fade. */
type Direction = 1 | -1 | 0;

/** "1 piece", "2 pieces"; Arabic gets its dual and plural forms. */
function pieceCount(n: number, locale: Locale, forms: Dictionary["commerce"]["cart"]["pieces"]): string {
  const rule = new Intl.PluralRules(locale).select(n);
  return fmt(rule === "zero" ? forms.other : forms[rule], { n });
}

/** Focuses an element as soon as it exists (it may mount a frame or two later, after a step change). */
function focusWhenReady(find: () => HTMLElement | null | undefined, options?: FocusOptions) {
  let frames = 0;
  const tick = () => {
    const el = find();
    if (el) el.focus(options);
    else if (++frames < 30) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const inDrawer = (selector: string) => document.querySelector<HTMLElement>(`[data-testid="cart-drawer"] ${selector}`);

/**
 * Cross-fades between the drawer's two steps with a short slide that follows
 * the reading direction (forward slides in from the inline end). Both steps
 * share one grid cell during the swap, so nothing jumps. Reduced motion: fade.
 */
function StepSwap({
  id,
  direction,
  className,
  children,
}: {
  id: string;
  direction: Direction;
  className?: string;
  children: ReactNode;
}) {
  const { dir } = useI18n();
  const reduced = useReducedMotion();
  const sign = dir === "rtl" ? -1 : 1;
  const shift = (d: number, px: number) => (reduced ? 0 : d * px * sign);

  return (
    <div className={cn("grid", className)}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={id}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: shift(d, 28) }),
            center: { opacity: 1, x: 0, transition: { duration: reduced ? 0.18 : 0.46, delay: reduced ? 0 : 0.05, ease: EASE } },
            exit: (d: number) => ({ opacity: 0, x: shift(d, -18), transition: { duration: reduced ? 0.12 : 0.2, ease: EASE_IN } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          className="col-start-1 row-start-1 min-w-0"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * The order drawer. Step 1 reviews the pieces (quantities, notes, totals);
 * step 2 collects delivery details next to a live preview of the exact
 * WhatsApp message, and sends it as a wa.me link to the chosen line. There
 * is no backend: the order exists once the visitor presses send in WhatsApp,
 * so the cart is kept after sending until they clear it.
 */
export function CartDrawer() {
  const { t, locale } = useI18n();
  const copy = t.commerce.cart;
  const open = useUI((s) => s.cartOpen);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const toast = useUI((s) => s.toast);
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const removeLine = useCart((s) => s.remove);
  const setNote = useCart((s) => s.setNote);
  const clearCart = useCart((s) => s.clear);
  const region = useRegion();
  const reduced = useReducedMotion();
  const bodyRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<Direction>(1);
  /** Created on the way to step 2; kept until the order is cleared, or the drawer reopens after a send. */
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [showLineErrors, setShowLineErrors] = useState(false);

  // Every time the drawer opens it starts at the items step.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setDirection(1);
      setShowLineErrors(false);
      if (sent) {
        setSent(false);
        setOrderRef(null);
      }
    }
  }

  // Validation (zod) is fetched on first open, well before anyone can press send.
  useEffect(() => {
    if (open) void loadOrderValidator();
  }, [open]);

  const checkout = useCheckout({ region, lines, orderRef });
  const priced = priceOrder(lines, region, locale);

  // Send pressed before the validator arrived: focus the first problem as soon as it can be known.
  const focusPending = useRef(false);
  const focusFirstInvalid = useEffectEvent(() => {
    const field = checkout.firstInvalidField();
    if (field) focusField(document.getElementById(checkout.ids[field]), reduced);
  });
  useEffect(() => {
    if (checkout.validation !== "ready" || !focusPending.current) return;
    focusPending.current = false;
    focusFirstInvalid();
  }, [checkout.validation]);
  const totals = orderTotals(priced, region);
  const empty = lines.length === 0;
  const current: Step = empty ? 1 : step;
  const lineErrors = showLineErrors ? checkout.lineErrors : {};
  const firstLineError = Object.keys(checkout.lineErrors).map(Number).sort((a, b) => a - b)[0];

  const close = () => {
    setCartOpen(false);
    playSound("close");
  };

  const goTo = (next: Step) => {
    setDirection(next === 2 ? 1 : -1);
    setStep(next);
    // The drawer body is the scroller; each step starts at its top.
    bodyRef.current?.parentElement?.scrollTo({ top: 0 });
  };

  /** Back to the items with the problem lines flagged and the first one focused. */
  const showLineProblems = () => {
    setShowLineErrors(true);
    if (firstLineError === undefined) return;
    focusWhenReady(() => inDrawer(`[data-line-note="${firstLineError}"]`) ?? inDrawer(`[data-line="${firstLineError}"]`));
  };

  const onContinue = () => {
    playSound("tap");
    if (firstLineError !== undefined || checkout.orderError) {
      showLineProblems();
      return;
    }
    if (!orderRef) setOrderRef(createOrderRef());
    checkout.restore();
    goTo(2);
    focusWhenReady(() => inDrawer("[data-step-heading]"), { preventScroll: true });
  };

  const onBack = () => {
    playSound("tap");
    goTo(1);
    focusWhenReady(() => inDrawer('[data-testid="cart-line"] [data-line]'), { preventScroll: true });
  };

  const onSend = (e: MouseEvent<HTMLAnchorElement>) => {
    checkout.markAttempted();
    if (checkout.validation === "loading") {
      // Only on a very slow connection. Errors (if any) show once the validator lands; a valid order needs a second tap.
      e.preventDefault();
      playSound("tap");
      focusPending.current = true;
      void loadOrderValidator();
      return;
    }
    // If the validator could not load at all, let the order through rather than block it.
    if (firstLineError !== undefined || checkout.orderError) {
      e.preventDefault();
      playSound("tap");
      goTo(1);
      showLineProblems();
      return;
    }
    const field = checkout.firstInvalidField();
    if (field || checkout.errors.link || checkout.errors.website) {
      e.preventDefault();
      playSound("tap");
      if (field) focusField(document.getElementById(checkout.ids[field]), reduced);
      return;
    }
    // Valid: let the link open WhatsApp. Keep the cart; they may not press send there.
    playSound("send");
    setSent(true);
    toast({ title: copy.sentTitle, body: copy.sentBody, ref: orderRef ?? "" });
    trackOrderSent({
      region,
      line: checkout.line.id,
      items: priced.itemCount,
      lines: priced.lines.length,
      currency: priced.currency,
      subtotal: priced.subtotal,
      lang: locale,
      compact: checkout.compact,
    });
  };

  const onClear = () => {
    clearCart();
    setOrderRef(null);
    setSent(false);
    checkout.resetForNextOrder();
    setCartOpen(false);
    playSound("close");
  };

  const onRemove = (index: number) => {
    playSound("tap");
    if (lines.length === 1) {
      // Removing the last piece clears the order (and its reference).
      setDirection(0);
      setOrderRef(null);
      setSent(false);
    }
    removeLine(index);
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      closeOnBack
      title={copy.title}
      description={empty ? undefined : pieceCount(priced.itemCount, locale, copy.pieces)}
      testId="cart-drawer"
      // Empty: no 0.000 subtotal or dead Continue; the empty state has its own ways forward.
      footer={
        empty ? undefined : (
          <StepSwap id={`footer-${current}`} direction={direction}>
            {current === 1 ? (
              <CartSummary
                totals={totals}
                disabled={empty}
                error={showLineErrors && checkout.orderError ? t.common.errors[checkout.orderError] : undefined}
                onContinue={onContinue}
              />
            ) : (
              <CheckoutSend
                checkout={checkout}
                orderRef={orderRef}
                total={totals.total ?? totals.subtotal}
                totalLabel={totals.total !== null ? copy.total : copy.subtotal}
                sent={sent}
                onSend={onSend}
                onClear={onClear}
              />
            )}
          </StepSwap>
        )
      }
    >
      <div ref={bodyRef} className="min-h-full">
        {empty ? null : <OwnerNotice className="mb-6" />}
        <StepSwap id={current === 1 ? (empty ? "empty" : "items") : "details"} direction={direction}>
          {current === 2 ? (
            <CheckoutForm checkout={checkout} region={region} onBack={onBack} />
          ) : empty ? (
            <CartEmpty onNavigate={close} />
          ) : (
            <CartLines
              priced={priced}
              lines={lines}
              errors={lineErrors}
              onQty={(index, qty) => {
                playSound("tap");
                setQty(index, qty);
              }}
              onRemove={onRemove}
              onNote={setNote}
              onNavigate={close}
            />
          )}
        </StepSwap>
      </div>
    </Drawer>
  );
}
