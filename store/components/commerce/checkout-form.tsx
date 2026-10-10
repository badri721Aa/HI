"use client";

import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, CircleAlert } from "lucide-react";
import { REGIONS, type Customer, type OrderLine, type Region } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { Amount } from "@/components/commerce/price";
import { buttonStyles } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { REGION_CONFIG, site } from "@/lib/site";
import { currencyForRegion } from "@/lib/currency";
import { usePrefs } from "@/lib/store/prefs";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import {
  LIMITS,
  buildOrderLink,
  checkOrderEssentials,
  isOtherCity,
  normalizeDigits,
  orderLinkOverflow,
  type OrderErrorKey,
  type OrderInput,
  type ValidationResult,
} from "@/lib/whatsapp";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { LinePicker, radioKeyNav, useWhatsAppLine } from "./line-picker";
import { WhatsAppPreview } from "./whatsapp-preview";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------ form parts */

/** Text inputs, selects and textareas: ink well, hairline, quiet focus. 16px+ text so iOS never zooms. */
export const inputStyles = cn(
  "block w-full rounded-xl border border-line bg-ink-850 px-4 text-base text-fg placeholder:text-fg-subtle",
  "transition-[border-color,background-color] duration-200 hover:border-line-strong",
  "focus:border-line-strong focus:bg-ink-800 focus-visible:outline-offset-2",
  "aria-invalid:border-danger/55 aria-invalid:hover:border-danger/75",
);

/** Space-separated ids for aria-describedby, skipping the empty ones. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids.filter(Boolean);
  return list.length ? list.join(" ") : undefined;
}

/** Inline validation message: danger colour plus an icon, so colour is never the only signal. */
export function FieldError({
  id,
  testId,
  alert = false,
  children,
  className,
}: {
  id?: string;
  testId?: string;
  /** Announce immediately: for errors no focused field points to (aria-describedby covers the rest). */
  alert?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.p
      id={id}
      data-testid={testId}
      role={alert ? "alert" : undefined}
      initial={reduced ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={cn("mt-2 flex items-start gap-1.5 text-sm leading-snug text-danger", className)}
    >
      <CircleAlert aria-hidden strokeWidth={1.5} className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </motion.p>
  );
}

/** Live "120/400" counter for capped free text; turns amber near the cap. */
export function CharCount({ id, value, max }: { id?: string; value: number; max: number }) {
  return (
    <span
      id={id}
      dir="ltr"
      className={cn("font-mono text-xs tabular transition-colors duration-200", value >= max * 0.9 ? "text-warn" : "text-fg-muted")}
    >
      {value}/{max}
    </span>
  );
}

/**
 * Inline parts joined by a middle dot that never dangles at a line end: each
 * part wraps as a unit with its dot in front, and the dot that would open a
 * line falls in a clipped gutter at the inline start. Mirrors in RTL.
 */
export function DotList({ parts, className }: { parts: ReactNode[]; className?: string }) {
  return (
    <span className={cn("block overflow-x-clip", className)}>
      <span className="-ms-4 flex flex-wrap">
        {parts.map((part, i) => (
          // The dot sits in the part's own start padding, so a part that wraps continues inside the visible edge.
          <span key={i} className="min-w-0 ps-4">
            <span aria-hidden className="-ms-4 inline-block w-4 select-none text-center">
              ·
            </span>
            {part}
            {/* Keeps the parts separate words for assistive tech; a space at a line end takes no room. */}{" "}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Focuses a form field without the browser's minimal scroll-into-view, then
 * centres the field (label, control and message) in its scroller, so the
 * message isn't left under a sticky footer.
 */
export function focusField(el: HTMLElement | null | undefined, reduced: boolean) {
  if (!el) return;
  el.focus({ preventScroll: true });
  (el.closest<HTMLElement>("[data-field]") ?? el).scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
}

/**
 * Enter in a single-line field moves to the next field, as the keyboard's
 * "next" key promises (a form with no submit button never submits on Enter).
 */
export function enterToNextField(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || e.nativeEvent.isComposing || !(e.target instanceof HTMLInputElement)) return;
  e.preventDefault();
  const fields = Array.from(e.currentTarget.elements).filter(
    (el): el is HTMLElement => el.matches("input, select, textarea") && !el.matches(":disabled") && (el as HTMLElement).tabIndex >= 0,
  );
  fields[fields.indexOf(e.target) + 1]?.focus();
}

/** Label row (with an optional "optional" tag and an end slot), control, hint and error. */
export function Field({
  id,
  label,
  optional,
  aside,
  hint,
  hintId,
  error,
  errorId,
  errorTestId,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  optional?: string;
  aside?: ReactNode;
  hint?: ReactNode;
  hintId?: string;
  error?: ReactNode;
  errorId?: string;
  errorTestId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-field className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {/* A real space: Arabic letters would join across the tag, and the accessible name would fuse. */}
          {optional ? (
            <>
              {" "}
              <span className="text-xs font-normal text-fg-muted">{optional}</span>
            </>
          ) : null}
        </label>
        {aside}
      </div>
      <div className="mt-2">{children}</div>
      {hint ? (
        <p id={hintId} className="mt-2 text-[0.8125rem] leading-snug text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <FieldError id={errorId} testId={errorTestId}>
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}

/** Native <select> (best on phones) dressed like the inputs, with a chevron on the inline end. */
export function Select({ className, children, value, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        value={value}
        className={cn(
          inputStyles,
          "h-12 appearance-none pe-11 [&>option]:bg-ink-800 [&>option]:text-fg",
          value === "" && "text-fg-subtle",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        strokeWidth={1.5}
        className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}

/* -------------------------------------------------------- validation */

type ValidateOrder = (input: OrderInput) => ValidationResult;
type ValidatorState = { validate?: ValidateOrder; failed: boolean };

const VALIDATOR_IDLE: ValidatorState = { failed: false };
let validatorState = VALIDATOR_IDLE;
let validatorLoad: Promise<void> | undefined;
const validatorListeners = new Set<() => void>();

function setValidatorState(next: ValidatorState) {
  validatorState = next;
  validatorListeners.forEach((listener) => listener());
}

/**
 * Order validation uses zod (~27 KB gzipped), so it isn't part of the page:
 * it loads when the order drawer opens. Never rejects; a failed load can be
 * retried, and until then checkOrderEssentials() stands in.
 */
export function loadOrderValidator(): Promise<void> {
  validatorLoad ??= import("@/lib/whatsapp/schema").then(
    (m) => setValidatorState({ validate: m.validateOrder, failed: false }),
    () => {
      validatorLoad = undefined;
      setValidatorState({ failed: true });
    },
  );
  return validatorLoad;
}

function subscribeValidator(listener: () => void) {
  validatorListeners.add(listener);
  return () => {
    validatorListeners.delete(listener);
  };
}

/* ------------------------------------------------------------- state */

export type CheckoutField = "name" | "phone" | "city" | "area" | "notes";
/** Document order: the first invalid one gets focus on send. */
export const CHECKOUT_FIELDS: readonly CheckoutField[] = ["name", "phone", "city", "area", "notes"];
type Draft = Record<CheckoutField, string>;

const EMPTY_DRAFT: Draft = { name: "", phone: "", city: "", area: "", notes: "" };
const MAX_LENGTH: Record<CheckoutField, number> = {
  name: LIMITS.name,
  phone: LIMITS.phone,
  city: 40,
  area: LIMITS.area,
  notes: LIMITS.notes,
};
const STORAGE_KEY = "checkout-details";

/** Details typed earlier in this tab, if any. Storage can be blocked or full: never throws. */
function readDraft(): Partial<Draft> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    const out: Partial<Draft> = {};
    for (const field of CHECKOUT_FIELDS) {
      const value = (data as Record<string, unknown>)[field];
      if (typeof value === "string") out[field] = value.slice(0, MAX_LENGTH[field]);
    }
    return out;
  } catch {
    return {};
  }
}

function writeDraft(draft: Draft) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or storage full: the form still works, it just won't remember.
  }
}

const inRegion = (region: Region, city: string) => REGION_CONFIG[region].cities.some((c) => c.id === city);

/** Before step 2 there's no reference yet; one of the same length keeps the items step's size check exact. */
const REF_PLACEHOLDER = `${site.orderPrefix}-00000`;

/**
 * Everything step 2 of the order drawer needs, derived on every render from
 * the cart, the region and what the visitor typed: the exact WhatsApp
 * message, its wa.me link, and validation errors.
 *
 * Errors are computed live but only shown for fields the visitor has left
 * (blur) or after a send attempt, so nothing is red before they interact.
 * Details persist in sessionStorage; `restore()` loads them on first use.
 */
export function useCheckout({ region, lines, orderRef }: { region: Region; lines: OrderLine[]; orderRef: string | null }) {
  const { locale } = useI18n();
  const baseId = useId();
  const setPrefsRegion = usePrefs((s) => s.setRegion);
  const line = useWhatsAppLine(region);
  const { validate, failed } = useSyncExternalStore(subscribeValidator, () => validatorState, () => VALIDATOR_IDLE);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [website, setWebsite] = useState("");
  const [touched, setTouched] = useState<ReadonlySet<CheckoutField>>(() => new Set());
  const [attempted, setAttempted] = useState(false);
  const restored = useRef(false);

  // A city from the other region (switched mid-checkout) counts as not chosen.
  const customer: Customer = {
    name: draft.name,
    phone: draft.phone,
    city: inRegion(region, draft.city) ? draft.city : "",
    area: draft.area,
    notes: draft.notes,
  };
  // Past the URL limit the receipt drops SKUs and dimensions; the preview shows whichever is sent.
  // The message is only shown once the real reference exists, so the placeholder never reaches the screen.
  const ref = orderRef ?? REF_PLACEHOLDER;
  const link = buildOrderLink(line.e164, { ref, region, locale, lines, customer });

  // Without the full validator (its chunk failed to load), the essentials are still checked.
  const input: OrderInput = { region, lines, customer, website };
  const errors: Record<string, OrderErrorKey> = {
    ...(validate ? validate(input) : failed ? checkOrderEssentials(input) : undefined)?.errors,
  };
  // Some in-app browsers truncate very long links. If shorter notes would fix it, flag the notes;
  // if the order itself is too long (many pieces, especially in Arabic), ask to split it. When the
  // pieces alone are too long, no details can help, so the items step says so before step 2.
  const overflow = orderLinkOverflow(line.e164, { ref, region, locale, lines, customer });
  if (overflow === "notes") errors["customer.notes"] ??= "notes_too_long_for_link";
  else if (overflow) errors.link = "too_many_lines";
  if (overflow === "pieces") errors.lines ??= "too_many_lines";

  const lineErrors: Record<number, OrderErrorKey> = {};
  for (const [path, key] of Object.entries(errors)) {
    const match = /^lines\.(\d+)\./.exec(path);
    if (match && lineErrors[Number(match[1])] === undefined) lineErrors[Number(match[1])] = key;
  }

  const ids = {
    name: `${baseId}-name`,
    phone: `${baseId}-phone`,
    city: `${baseId}-city`,
    area: `${baseId}-area`,
    notes: `${baseId}-notes`,
    website: `${baseId}-website`,
  };

  const update = (field: CheckoutField, raw: string) => {
    // Arabic keyboards type ٣٩٨٥…: keep the preview and the message in Western digits.
    const value = field === "phone" ? normalizeDigits(raw) : raw;
    const next = { ...draft, [field]: value };
    setDraft(next);
    writeDraft(next);
  };

  return {
    ids,
    draft,
    customer,
    website,
    setWebsite,
    line,
    message: link.message,
    href: link.href,
    /** The compact receipt (no SKUs or dimensions) is the one being sent. */
    compact: link.compact,
    /** "loading" until the validator (zod) arrives; "failed" if it could not be loaded. */
    validation: validate ? ("ready" as const) : failed ? ("failed" as const) : ("loading" as const),
    /** "Other area": the address becomes required. */
    areaRequired: isOtherCity(customer.city),
    errors,
    lineErrors,
    /** Order-level error (empty cart, too many lines). */
    orderError: errors.lines as OrderErrorKey | undefined,
    /** The pieces alone make the message too long to send: flagged on the items step, before any details. */
    orderTooLong: overflow === "pieces",
    /** Problems no field owns (link too long, honeypot filled): shown only after a send attempt. */
    formError: attempted ? (errors.link ?? errors.website) : undefined,
    fieldError: (field: CheckoutField): OrderErrorKey | undefined =>
      touched.has(field) ? errors[`customer.${field}`] : undefined,
    firstInvalidField: (): CheckoutField | undefined => CHECKOUT_FIELDS.find((f) => errors[`customer.${f}`]),
    update,
    blur: (field: CheckoutField) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field))),
    /** Called on send: every field shows its error from now on. */
    markAttempted: () => {
      setAttempted(true);
      setTouched(new Set(CHECKOUT_FIELDS));
    },
    restore: () => {
      if (restored.current) return;
      restored.current = true;
      const saved = readDraft();
      if (Object.keys(saved).length) setDraft((d) => ({ ...d, ...saved }));
    },
    changeRegion: (next: Region) => {
      if (next !== region) playSound("switch");
      setPrefsRegion(next, true);
      if (draft.city && !inRegion(next, draft.city)) update("city", "");
    },
    /** After "Clear order": keep who and where, forget this order's notes and error state. */
    resetForNextOrder: () => {
      update("notes", "");
      setTouched(new Set());
      setAttempted(false);
    },
  };
}

export type Checkout = ReturnType<typeof useCheckout>;

/* ------------------------------------------------------------- step 2 */

/** Bahrain / UAE as two halves of a pill, with the currency each one prices in. */
export function RegionChoice({
  region,
  onChange,
  labelledBy,
  testIdPrefix = "checkout-",
  className,
}: {
  region: Region;
  onChange: (region: Region) => void;
  labelledBy: string;
  /** Test ids are `${testIdPrefix}region-<id>`. */
  testIdPrefix?: string;
  className?: string;
}) {
  const { locale, dir } = useI18n();
  const reduced = useReducedMotion();
  const pillId = useId();

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn("grid grid-cols-2 rounded-full border border-line bg-ink-950/40 p-1", className)}
    >
      {REGIONS.map((r, i) => {
        const selected = r === region;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-testid={`${testIdPrefix}region-${r}`}
            onClick={() => onChange(r)}
            onKeyDown={(e) => radioKeyNav(e, i, REGIONS.length, dir, (n) => onChange(REGIONS[n]))}
            className={cn(
              "relative isolate inline-flex h-11 items-center justify-center gap-2.5 rounded-full px-4 text-sm font-medium transition-colors duration-300",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                aria-hidden
                layoutId={`region-choice-${pillId}`}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                className="absolute inset-0 -z-10 rounded-full bg-white/[0.07] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)] ring-1 ring-line-strong"
              />
            ) : null}
            <span>{REGION_CONFIG[r].name[locale]}</span>
            <span dir="ltr" className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-fg-muted">
              {currencyForRegion(r)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Step 2 body: region, line, delivery details and the live message preview. */
export function CheckoutForm({ checkout, region, onBack }: { checkout: Checkout; region: Region; onBack: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.commerce.cart;
  const errorText = t.common.errors;
  const { ids, draft, fieldError } = checkout;
  const regionLabelId = useId();
  const cities = REGION_CONFIG[region].cities;
  const city = checkout.customer.city;

  const err = (field: CheckoutField) => fieldError(field);
  const errMessage = (field: CheckoutField) => {
    const key = fieldError(field);
    return key ? errorText[key] : undefined;
  };
  const errId = (field: CheckoutField) => `${ids[field]}-error`;
  const hintId = `${ids.phone}-hint`;
  const countId = `${ids.notes}-count`;

  /** Shared props for the text controls: value, change, blur and the aria wiring for errors. */
  const control = (field: CheckoutField, extraDescribedBy?: string) => ({
    id: ids[field],
    name: field,
    value: field === "city" ? city : draft[field],
    "data-testid": `checkout-${field}`,
    onBlur: () => checkout.blur(field),
    "aria-invalid": err(field) ? true : undefined,
    "aria-describedby": describedBy(extraDescribedBy, err(field) && errId(field)),
  });

  return (
    <div className="px-5 pb-10 pt-3 sm:px-6">
      <button type="button" onClick={onBack} className={buttonStyles({ variant: "ghost", size: "md", className: "-ms-3.5 gap-1.5 px-3.5 text-sm" })}>
        <ArrowLeft aria-hidden strokeWidth={1.5} className="size-4 rtl:-scale-x-100" />
        {copy.editOrder}
      </button>

      <h3 data-step-heading tabIndex={-1} className="mt-4 text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-fg outline-none">
        {copy.details}
      </h3>

      <div className="mt-6">
        <p id={regionLabelId} className="eyebrow">
          {copy.region}
        </p>
        <RegionChoice region={region} onChange={checkout.changeRegion} labelledBy={regionLabelId} className="mt-3" />
      </div>

      {REGION_CONFIG[region].lines.length > 1 ? (
        <div className="mt-6">
          <p className="eyebrow">{copy.sendTo}</p>
          <LinePicker region={region} className="mt-3" />
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={enterToNextField}
        className="relative mt-8 grid gap-6 border-t border-line pt-7"
      >
        <Field
          id={ids.name}
          label={copy.name}
          error={errMessage("name")}
          errorId={errId("name")}
          errorTestId="error-name"
        >
          <input
            {...control("name")}
            type="text"
            required
            autoComplete="name"
            enterKeyHint="next"
            maxLength={LIMITS.name}
            onChange={(e) => checkout.update("name", e.target.value)}
            className={cn(inputStyles, "h-12")}
          />
        </Field>

        <Field
          id={ids.phone}
          label={copy.phone}
          hint={copy.phoneHint}
          hintId={hintId}
          error={errMessage("phone")}
          errorId={errId("phone")}
          errorTestId="error-phone"
        >
          <input
            {...control("phone", hintId)}
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            enterKeyHint="next"
            maxLength={LIMITS.phone}
            onChange={(e) => checkout.update("phone", e.target.value)}
            className={cn(inputStyles, "h-12 font-mono tabular rtl:text-right")}
          />
        </Field>

        <Field
          id={ids.city}
          label={copy.city}
          error={errMessage("city")}
          errorId={errId("city")}
          errorTestId="error-city"
        >
          <Select
            {...control("city")}
            required
            autoComplete="address-level2"
            onChange={(e) => {
              checkout.update("city", e.target.value);
              // A pick is a complete answer: validate now rather than waiting for blur.
              checkout.blur("city");
            }}
          >
            <option value="" disabled>
              {copy.cityPlaceholder}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name[locale]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id={ids.area}
          label={copy.area}
          optional={checkout.areaRequired ? undefined : copy.optional}
          error={errMessage("area")}
          errorId={errId("area")}
          errorTestId="error-area"
        >
          <input
            {...control("area")}
            type="text"
            required={checkout.areaRequired}
            autoComplete="street-address"
            enterKeyHint="next"
            maxLength={LIMITS.area}
            placeholder={copy.areaPlaceholder}
            onChange={(e) => checkout.update("area", e.target.value)}
            className={cn(inputStyles, "h-12")}
          />
        </Field>

        <Field
          id={ids.notes}
          label={copy.notes}
          optional={copy.optional}
          aside={<CharCount id={countId} value={draft.notes.length} max={LIMITS.notes} />}
          error={errMessage("notes")}
          errorId={errId("notes")}
          errorTestId="error-notes"
        >
          <textarea
            {...control("notes", countId)}
            rows={3}
            maxLength={LIMITS.notes}
            placeholder={copy.notesPlaceholder}
            onChange={(e) => checkout.update("notes", e.target.value)}
            className={cn(inputStyles, "min-h-28 resize-none py-3 leading-relaxed")}
          />
        </Field>

        {/* Honeypot: invisible to people and assistive tech, irresistible to form bots. */}
        <div aria-hidden className="pointer-events-none absolute size-px overflow-hidden opacity-0 [clip-path:inset(50%)]">
          <label htmlFor={ids.website}>{copy.honeypot}</label>
          <input
            id={ids.website}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={checkout.website}
            onChange={(e) => checkout.setWebsite(e.target.value)}
          />
        </div>
      </form>

      <WhatsAppPreview message={checkout.message} className="mt-9 border-t border-line pt-7" />
    </div>
  );
}

/** "Order 3DBH-7K3Q2" with only the reference in mono (mono spacing would stretch the Arabic words). */
function OrderRefLabel({ template, value }: { template: string; value: string }) {
  const [before, after = ""] = template.split("{ref}");
  return (
    <>
      {before}
      <span dir="ltr" className="font-mono tabular text-fg">
        {value}
      </span>
      {after}
    </>
  );
}

/**
 * Step 2 footer: order reference and total, the send link (a real wa.me
 * anchor, so it works with middle-click and without our JS), and the
 * destination number. After a send, "Clear order" empties and closes.
 */
export function CheckoutSend({
  checkout,
  orderRef,
  total,
  totalLabel,
  sent,
  onSend,
  onClear,
}: {
  checkout: Checkout;
  orderRef: string | null;
  total: number;
  /** "Subtotal" or "Total": what `total` is. Defaults to Subtotal (delivery is quoted in the chat). */
  totalLabel?: string;
  sent: boolean;
  onSend: (e: MouseEvent<HTMLAnchorElement>) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const copy = t.commerce.cart;
  const reduced = useReducedMotion();
  const destId = useId();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs text-fg-muted">{orderRef ? <OrderRefLabel template={copy.orderRef} value={orderRef} /> : null}</p>
        <p className="text-xs text-fg-muted">
          {totalLabel ?? copy.subtotal}{" "}
          <Amount value={total} className="text-[0.9375rem] font-medium text-fg" />
        </p>
      </div>

      {checkout.formError ? (
        <FieldError testId="error-form" alert className="mt-3">
          {t.common.errors[checkout.formError]}
        </FieldError>
      ) : null}

      <a
        data-testid="checkout-send"
        href={checkout.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={destId}
        onClick={onSend}
        onAuxClick={(e) => {
          if (e.button === 1) onSend(e);
        }}
        className={buttonStyles({ variant: "primary", size: "lg", className: "mt-3 w-full" })}
      >
        <WhatsAppIcon className="size-5" />
        {copy.send}
      </a>

      <div className="mt-1 flex min-h-11 items-center justify-between gap-4">
        <p id={destId} className="text-xs text-fg-muted">
          {copy.sendTo}{" "}
          <span dir="ltr" className="whitespace-nowrap font-mono tabular text-fg">
            {checkout.line.display}
          </span>
        </p>
        <AnimatePresence initial={false}>
          {sent ? (
            <motion.button
              key="clear"
              type="button"
              onClick={onClear}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.35, ease: EASE }}
              className="-me-1 inline-flex h-11 items-center px-1 text-xs text-fg-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg-muted"
            >
              {copy.clear}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
