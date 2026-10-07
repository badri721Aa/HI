"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { ColorOption, Locale, OrderLine, Product, Region, SizeOption } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { Amount } from "@/components/commerce/price";
import { QtyStepper } from "@/components/commerce/qty-stepper";
import { ProductSilhouette } from "@/components/3d/silhouette";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { REGION_CONFIG, vat } from "@/lib/site";
import { fromMinor, toMinor } from "@/lib/currency";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { LIMITS, type OrderErrorKey, type PricedLine, type PricedOrder } from "@/lib/whatsapp";
import { fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FieldError, describedBy, inputStyles } from "./checkout-form";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------ helpers */

/** Same identity the cart uses to merge lines: product, variant and (case-insensitive) note. */
export function lineKey(line: OrderLine): string {
  return [line.slug, line.colorId, line.sizeId, (line.note ?? "").trim().toLowerCase()].join("|");
}

/** "One size" style names carry no information when they're the only option. */
const silentSize = (size: SizeOption) => /^(one|one-size|default)$/.test(size.id) || /^one size$/i.test(size.name.en);
const silentColour = (colour: ColorOption) => /^(one|default)$/.test(colour.id);

/**
 * "Fitted to your iPhone · Sky blue". A part is left out when the product
 * offers only that one option and it says nothing ("One size"); a sole
 * option that does describe the piece ("Fitted to your iPhone", "Yellow") stays.
 */
export function variantLabel(product: Product, line: OrderLine, locale: Locale): string {
  const size = product.sizes.find((s) => s.id === line.sizeId);
  const colour = product.colors.find((c) => c.id === line.colorId);
  const parts: string[] = [];
  if (size && !(product.sizes.length === 1 && silentSize(size))) parts.push(size.name[locale]);
  if (colour && !(product.colors.length === 1 && silentColour(colour))) parts.push(colour.name[locale]);
  return parts.join(" · ");
}

export interface OrderTotals {
  subtotal: number;
  /** null: delivery is quoted in the chat. */
  fee: number | null;
  /** VAT amount, or null when VAT isn't charged. */
  vat: number | null;
  vatRate: number;
  /** Shown only when it differs from the subtotal (a fee or VAT applies). */
  total: number | null;
}

/** Same arithmetic as the WhatsApp message (integer minor units), so the drawer and the chat agree. */
export function orderTotals(priced: PricedOrder, region: Region): OrderTotals {
  const config = REGION_CONFIG[region];
  const { currency, subtotal } = priced;
  const fee = config.deliveryFee;
  const base = toMinor(subtotal + (fee ?? 0), currency);
  if (vat.enabled) {
    const vatMinor = Math.round(base * config.vatRate);
    return { subtotal, fee, vat: fromMinor(vatMinor, currency), vatRate: config.vatRate, total: fromMinor(base + vatMinor, currency) };
  }
  return { subtotal, fee, vat: null, vatRate: config.vatRate, total: fee === null ? null : fromMinor(base, currency) };
}

/* -------------------------------------------------------------- lines */

/**
 * The order's line items. Each line: photo, name (links to the piece),
 * variant, the customer's note (e.g. their iPhone model), quantity stepper,
 * line total and remove. Removed lines fold away; nothing else animates.
 */
export function CartLines({
  priced,
  lines,
  errors,
  onQty,
  onRemove,
  onNote,
  onNavigate,
}: {
  priced: PricedOrder;
  /** The raw cart lines; indexes here are what the store actions take. */
  lines: OrderLine[];
  /** Visible line errors by cart index. */
  errors: Record<number, OrderErrorKey>;
  onQty: (index: number, qty: number) => void;
  onRemove: (index: number) => void;
  onNote: (index: number, note: string) => void;
  /** Called when a link inside a line is followed (closes the drawer). */
  onNavigate: () => void;
}) {
  const [removed, setRemoved] = useState<string | null>(null);

  return (
    <ul>
      <AnimatePresence initial={false} custom={removed}>
        {priced.lines.map((p) => {
          const index = lines.indexOf(p.line);
          const key = lineKey(p.line);
          return (
            <CartLineItem
              key={key}
              itemKey={key}
              priced={p}
              index={index}
              error={errors[index]}
              onQty={(qty) => onQty(index, qty)}
              onRemove={() => {
                setRemoved(key);
                onRemove(index);
              }}
              onNote={(note) => onNote(index, note)}
              onNavigate={onNavigate}
            />
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function CartLineItem({
  itemKey,
  priced,
  index,
  error,
  onQty,
  onRemove,
  onNote,
  onNavigate,
}: {
  itemKey: string;
  priced: PricedLine;
  index: number;
  error?: OrderErrorKey;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onNote: (note: string) => void;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const errorId = useId();
  const { product, line } = priced;
  const name = product.name[locale];
  const variant = variantLabel(product, line, locale);
  const image = product.images[0];
  const needsNote = Boolean(product.variantNote?.required) && !line.note?.trim();

  return (
    <motion.li
      data-testid="cart-line"
      data-slug={product.slug}
      initial={false}
      animate={{ opacity: 1, height: "auto" }}
      exit="gone"
      variants={{
        // Only the line the visitor removed folds away; a line replaced by an edit (its key changed) just swaps.
        gone: (removed: string | null) =>
          removed === itemKey && !reduced
            ? { opacity: 0, height: 0, transition: { duration: 0.34, ease: EASE } }
            : { opacity: 0, transition: { duration: 0 } },
      }}
      className="group/line overflow-hidden"
    >
      <div
        data-line={index}
        tabIndex={-1}
        className="mx-5 flex gap-4 border-b border-line py-5 outline-none group-last/line:border-b-0 sm:mx-6"
      >
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-ink-800 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/10">
          {image ? (
            <Image
              src={image.src}
              alt=""
              fill
              sizes="56px"
              placeholder="blur"
              blurDataURL={image.blurDataURL}
              className="object-cover"
            />
          ) : product.model ? (
            <ProductSilhouette kind={product.model} color={product.colors[0]?.hex} className="size-full p-2 text-silver" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[0.9375rem] font-medium leading-snug text-fg">
                <Link
                  href={`/${locale}/products/${product.slug}`}
                  onClick={onNavigate}
                  className="rounded-sm transition-colors hover:text-silver"
                >
                  {name}
                </Link>
              </h3>
              {variant ? <p className="mt-1 text-sm leading-snug text-fg-muted">{variant}</p> : null}
              {priced.note ? (
                <p className="mt-0.5 text-sm leading-snug text-fg-muted">
                  {priced.note.label}: <span className="text-fg">{priced.note.value}</span>
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-end">
              <Amount value={priced.lineTotal} className="text-[0.9375rem] font-medium text-fg" />
              {line.qty > 1 ? (
                <p className="mt-1 text-xs tabular text-fg-muted">
                  {line.qty} × <Amount value={priced.unitPrice} />
                </p>
              ) : null}
            </div>
          </div>

          {needsNote && product.variantNote ? (
            <LineNote
              index={index}
              label={product.variantNote.label[locale]}
              placeholder={product.variantNote.placeholder[locale]}
              invalid={Boolean(error)}
              errorId={error ? errorId : undefined}
              onCommit={onNote}
            />
          ) : null}

          <div className="mt-3.5 flex items-center justify-between gap-4">
            <QtyStepper size="sm" value={line.qty} onChange={onQty} label={name} />
            <button
              type="button"
              onClick={onRemove}
              aria-label={`${t.common.actions.remove} ${name}`}
              className="-me-1 inline-flex h-11 min-w-11 items-center justify-center px-1 text-[0.8125rem] text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline hover:decoration-line-strong"
            >
              {t.common.actions.remove}
            </button>
          </div>

          {error ? (
            <FieldError id={errorId} testId={`error-line-${index}`}>
              {t.common.errors[error]}
            </FieldError>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}

/**
 * A required per-item detail (e.g. iPhone model) that's missing from a line,
 * typed straight into the cart. Committed on blur, so typing never re-keys
 * the line under the cursor.
 */
function LineNote({
  index,
  label,
  placeholder,
  invalid,
  errorId,
  onCommit,
}: {
  index: number;
  label: string;
  placeholder: string;
  invalid: boolean;
  errorId?: string;
  onCommit: (note: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <div className="mt-3">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        data-line-note={index}
        type="text"
        value={value}
        maxLength={LIMITS.note}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim()) onCommit(value.trim());
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(errorId)}
        className={cn(inputStyles, "mt-1.5 h-11")}
      />
    </div>
  );
}

/* -------------------------------------------------------------- empty */

/** Diagonal infill hatching: the same motif as the logo mark and the materials card. */
const HATCH = "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.028) 0 1px, transparent 1px 11px)";

/** Nothing in the order yet: an empty build plate, and the two ways forward. */
export function CartEmpty({ onNavigate }: { onNavigate: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.commerce.cart;

  return (
    <div className="px-5 pb-10 pt-6 sm:px-6">
      <div
        aria-hidden
        className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-line bg-ink-950/40"
        style={{ backgroundImage: HATCH }}
      >
        {/* Registration marks in the four corners of the bed. */}
        <span className="absolute start-3 top-3 size-3 border-s border-t border-line-strong" />
        <span className="absolute end-3 top-3 size-3 border-e border-t border-line-strong" />
        <span className="absolute bottom-3 start-3 size-3 border-b border-s border-line-strong" />
        <span className="absolute bottom-3 end-3 size-3 border-b border-e border-line-strong" />
        {/* The footprint of a piece that isn't there. */}
        <span className="absolute inset-0 m-auto size-16 rounded-xl border border-dashed border-line-strong bg-ink-900/60" />
        <span dir="ltr" className="absolute inset-x-0 bottom-3.5 text-center font-mono text-[0.6875rem] tracking-[0.14em] text-fg-muted">
          Z 0.00
        </span>
      </div>

      <h3 className="mt-8 text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-fg">{copy.empty}</h3>
      <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-fg-muted">{copy.emptyBody}</p>

      <div className="mt-7 flex flex-wrap gap-2">
        <ButtonLink href={`/${locale}#collection`} variant="primary" size="md" onClick={onNavigate}>
          {t.common.actions.browse}
          <ArrowRight aria-hidden strokeWidth={1.5} className="size-4 rtl:-scale-x-100" />
        </ButtonLink>
        <ButtonLink href={`/${locale}#custom`} variant="secondary" size="md" onClick={onNavigate}>
          {t.common.actions.startCustom}
        </ButtonLink>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- footer */

function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-medium text-fg" : "text-fg-muted"}>{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

/** Step 1 footer: subtotal, delivery (quoted in chat unless a flat fee is set), VAT when charged, continue. */
export function CartSummary({
  totals,
  disabled,
  error,
  onContinue,
}: {
  totals: OrderTotals;
  disabled: boolean;
  /** Order-level problem (e.g. too many lines), already translated. */
  error?: string;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const copy = t.commerce.cart;

  return (
    <div>
      <dl className="grid gap-1.5 text-sm">
        <Row label={copy.subtotal}>
          <Amount value={totals.subtotal} className="text-[0.9375rem] font-medium text-fg" />
        </Row>
        <Row label={copy.delivery}>
          {totals.fee === null ? (
            <span className="text-fg-muted">{copy.deliveryChat}</span>
          ) : (
            <Amount value={totals.fee} className="text-fg" />
          )}
        </Row>
        {totals.vat !== null ? (
          <Row label={fmt(copy.vat, { n: Math.round(totals.vatRate * 100) })}>
            <Amount value={totals.vat} className="text-fg" />
          </Row>
        ) : null}
        {totals.total !== null ? (
          <Row label={copy.total} strong>
            <Amount value={totals.total} className="text-[0.9375rem] font-medium text-fg" />
          </Row>
        ) : null}
      </dl>

      {error ? (
        <FieldError alert className="mt-3">
          {error}
        </FieldError>
      ) : null}

      <button
        type="button"
        data-testid="checkout-continue"
        disabled={disabled}
        onClick={onContinue}
        className={buttonStyles({ variant: "primary", size: "lg", className: "group/continue mt-4 w-full" })}
      >
        {copy.continue}
        <ArrowRight
          aria-hidden
          strokeWidth={1.5}
          className="size-4 transition-transform duration-300 ease-out-expo group-hover/continue:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/continue:-translate-x-0.5"
        />
      </button>
    </div>
  );
}
