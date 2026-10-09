"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import type { Product } from "@/types";
import { MATERIALS } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { DrawerFooter } from "@/components/ui/drawer";
import { WhatsAppIcon } from "@/components/ui/icons";
import { useCart, type AddResult } from "@/lib/store/cart";
import { useUI } from "@/lib/store/ui";
import { usePrefs } from "@/lib/store/prefs";
import { useRegion } from "@/lib/hooks/use-region";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { defaultVariant } from "@/lib/product";
import { generateWhatsAppLink, resolveLine } from "@/lib/whatsapp/link";
import { LIMITS, MAX_LINES, MAX_QTY, sanitizeText } from "@/lib/whatsapp/order";
import { site } from "@/lib/site";
import { fmt } from "@/lib/i18n";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { Price } from "./price";
import { QtyStepper } from "./qty-stepper";
import { SizePills } from "./size-pills";
import { StockBadge } from "./stock-badge";
import { ColorDot, Swatches } from "./swatches";
import { VariantNoteField } from "./variant-note-field";

const EASE = [0.16, 1, 0.3, 1] as const;
/** How long "Add to order" reads "Added" after a successful add. */
const ADDED_MS = 1400;

/** "Colour ........ Sky blue": a label and a value on one hairline row. */
function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-13 items-center justify-between gap-6 border-b border-line py-3", className)}>
      <span className="shrink-0 text-sm text-fg-muted">{label}</span>
      <span className="min-w-0 text-end text-sm text-fg">{children}</span>
    </div>
  );
}

/**
 * The order state for one product: colour and size (starting from
 * defaultVariant, or controlled through `colorId`/`sizeId`), quantity, the
 * product's required note (e.g. iPhone model) and the add action.
 *
 * `add()` refuses while a required note is empty: it shows the error,
 * focuses the note field (wire `noteRef` to it, as ProductDetails does) and
 * returns null. Otherwise it adds the line and returns the cart's result:
 * "added" (sound, toast, and `added` reads true for a moment so the button
 * says "Added"), "capped" (the line hit the per-piece maximum) or "full"
 * (the order has no room for another line), each with its own toast.
 *
 * Call it in a parent and pass the result to both <ProductDetails order>
 * and <AddToOrderBar order> to put the button somewhere else, e.g. a
 * drawer's sticky footer, while the note field stays in the body.
 */
export function useAddToOrder(product: Product, controlled: { colorId?: string; sizeId?: string } = {}) {
  const { t, locale } = useI18n();
  const addLine = useCart((s) => s.add);
  const toast = useUI((s) => s.toast);

  const [colorState, setColorId] = useState(() => defaultVariant(product).colorId);
  const [sizeState, setSizeId] = useState(() => defaultVariant(product).sizeId);
  const color = product.colors.find((c) => c.id === (controlled.colorId ?? colorState)) ?? product.colors[0];
  const size = product.sizes.find((s) => s.id === (controlled.sizeId ?? sizeState)) ?? product.sizes[0];

  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [added, setAdded] = useState(false);
  const [hasAdded, setHasAdded] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);
  const addedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  const noteSpec = product.variantNote;
  const noteMissing = !!noteSpec?.required && !note.trim();
  const noteError = noteTouched && noteMissing ? t.common.errors.note_required : null;

  const add = (): AddResult | null => {
    const copy = t.commerce.product;
    if (noteMissing) {
      setNoteTouched(true);
      noteRef.current?.focus();
      return null;
    }
    const cleanNote = noteSpec ? sanitizeText(note, LIMITS.note) : "";
    const result = addLine({ slug: product.slug, colorId: color.id, sizeId: size.id, qty, ...(cleanNote ? { note: cleanNote } : {}) });
    if (result === "full") {
      toast({ title: copy.fullTitle, body: fmt(copy.fullBody, { max: MAX_LINES }) });
      return result;
    }
    setHasAdded(true);
    if (result === "capped") {
      toast({ title: copy.cappedTitle, body: fmt(copy.cappedBody, { max: MAX_QTY }) });
      return result;
    }
    playSound("add");
    const comma = locale === "ar" ? "، " : ", ";
    toast({
      title: copy.addedTitle,
      body: `${product.name[locale]} — ${size.name[locale]}${comma}${color.name[locale]}${cleanNote ? ` · ${cleanNote}` : ""}`,
    });
    setAdded(true);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setAdded(false), ADDED_MS);
    return result;
  };

  return {
    product,
    color,
    size,
    setColorId,
    setSizeId,
    qty,
    setQty,
    note,
    setNote,
    /** Call on the note field's blur, so the error shows once the visitor has been there. */
    touchNote: () => setNoteTouched(true),
    noteError,
    noteRef,
    add,
    /** True for a moment after a successful add. */
    added,
    /** True once this piece is in the order from here (shows "View order"). */
    hasAdded,
  };
}

export type AddToOrder = ReturnType<typeof useAddToOrder>;

/**
 * Quantity stepper and the "Add to order" button (data-testid="add-to-order"),
 * which flips to "Added" for a moment after each add.
 */
export function AddToOrderBar({ order, className }: { order: AddToOrder; className?: string }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();

  return (
    <div className={cn("flex items-stretch gap-3", className)}>
      <QtyStepper value={order.qty} onChange={order.setQty} />
      <Button data-testid="add-to-order" size="lg" onClick={() => order.add()} className="min-w-0 flex-1 overflow-hidden px-5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={order.added ? "added" : "add"}
            initial={reduced ? false : { y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: -16, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="inline-flex items-center gap-2"
          >
            {order.added ? (
              <>
                <Check aria-hidden strokeWidth={1.75} className="size-4" />
                {t.common.actions.added}
              </>
            ) : (
              t.common.actions.addToOrder
            )}
          </motion.span>
        </AnimatePresence>
      </Button>
    </div>
  );
}

/**
 * Everything needed to order a piece: price and availability, colour and
 * size (a picker only when there is a choice), the product's required detail
 * (e.g. iPhone model), quantity, "Add to order", a WhatsApp question link,
 * the description and the known specs. Shared by the quick view
 * (`variant="drawer"`, where the drawer title already names the piece) and
 * the product page (`variant="page"`, with the h1).
 *
 * Colour and size can be controlled (`colorId`/`sizeId` + change handlers)
 * so a sibling, such as a gallery, can follow the selection; otherwise they
 * are internal state starting from defaultVariant(). Or pass a whole
 * `order` from useAddToOrder() (then control colour and size through it),
 * and `orderBar={false}` when an <AddToOrderBar> is rendered elsewhere.
 *
 * `orderBar="footer"` pins the quantity and "Add to order" in the enclosing
 * Drawer's sticky footer (via <DrawerFooter>), so the quick view's main
 * action is always on screen; the note field stays in the body and an
 * empty required note is focused (scrolled to) on add.
 */
export function ProductDetails({
  product,
  variant,
  colorId: colorIdProp,
  sizeId: sizeIdProp,
  onColorChange,
  onSizeChange,
  order: orderProp,
  orderBar = true,
  className,
}: {
  product: Product;
  variant: "drawer" | "page";
  colorId?: string;
  sizeId?: string;
  onColorChange?: (colorId: string) => void;
  onSizeChange?: (sizeId: string) => void;
  /** Order state owned by a parent (useAddToOrder), shared with an AddToOrderBar outside. */
  order?: AddToOrder;
  /** Where the quantity + "Add to order" row goes: here (default), the enclosing drawer's footer, or nowhere. */
  orderBar?: boolean | "footer";
  className?: string;
}) {
  const { t, locale } = useI18n();
  const copy = t.commerce.product;
  const reduced = useReducedMotion();
  const setCartOpen = useUI((s) => s.setCartOpen);
  const region = useRegion();
  const preferredLine = usePrefs((s) => s.lines[region]);
  const headingId = useId();

  const ownOrder = useAddToOrder(product, { colorId: colorIdProp, sizeId: sizeIdProp });
  const order = orderProp ?? ownOrder;
  const { color, size, qty } = order;

  const page = variant === "page";
  const name = product.name[locale];
  const noteSpec = product.variantNote;

  const chooseColor = (id: string) => {
    order.setColorId(id);
    onColorChange?.(id);
  };
  const chooseSize = (id: string) => {
    order.setSizeId(id);
    onSizeChange?.(id);
  };

  const line = resolveLine(region, preferredLine);
  const askHref = generateWhatsAppLink(
    line.e164,
    fmt(copy.askMessage, { brand: site.name, name, sku: product.sku }),
  );

  /*
   * Specs: only what the catalog actually knows. Availability (and lead time) is left out, since the badge
   * beside the price already says it. With fewer than two real specs there is no table, just the SKU.
   */
  const material = product.material ? MATERIALS.find((m) => m.id === product.material) : undefined;
  const specs: { key: string; label: string; value: string; ltr?: boolean }[] = [];
  if (size.dims) {
    specs.push({ key: "dims", label: copy.dimensions, value: fmt(copy.dims, { w: size.dims.w, d: size.dims.d, h: size.dims.h }) });
  }
  if (material) specs.push({ key: "material", label: copy.material, value: material.name[locale] });
  if (product.layerHeight) {
    specs.push({ key: "layer", label: copy.layerHeight, value: fmt(copy.layerValue, { n: product.layerHeight }) });
  }
  if (product.printHours) {
    specs.push({ key: "print", label: copy.printTime, value: fmt(copy.printTimeValue, { n: product.printHours }) });
  }
  const specTable = specs.length >= 2;
  if (specTable) specs.push({ key: "sku", label: copy.sku, value: product.sku, ltr: true });

  const SpecsHeading = page ? "h2" : "h3";

  return (
    <div className={className}>
      {page ? (
        <>
          <h1 className="text-[clamp(2.25rem,4.4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg">
            {name}
          </h1>
          <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-fg-muted">{product.tagline[locale]}</p>
        </>
      ) : (
        <p className="text-[0.9375rem] leading-relaxed text-fg-muted">{product.tagline[locale]}</p>
      )}

      <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2", page ? "mt-7" : "mt-5")}>
        <p data-testid="product-price" className={cn("font-mono tabular text-fg", page ? "text-2xl" : "text-xl")}>
          <Price size={size} />
          {qty > 1 ? (
            <span className="text-[0.8125rem] text-fg-muted">
              {" "}
              × {qty} = <Price size={size} qty={qty} className="text-fg" />
            </span>
          ) : null}
        </p>
        <StockBadge product={product} />
      </div>

      {/* Options */}
      <div className={cn("border-t border-line", page ? "mt-8" : "mt-6")}>
        {product.colors.length > 1 ? (
          <div className="border-b border-line py-4">
            <div className="flex items-baseline justify-between gap-6">
              <span className="text-sm text-fg-muted">{copy.colour}</span>
              <span className="text-sm text-fg">{color.name[locale]}</span>
            </div>
            <Swatches className="mt-2" colors={product.colors} value={color.id} onChange={chooseColor} label={copy.colour} />
          </div>
        ) : (
          <Row label={copy.colour}>
            <span data-testid={`colour-${color.id}`} className="inline-flex items-center gap-2">
              <ColorDot color={color} />
              {color.name[locale]}
            </span>
          </Row>
        )}

        {product.sizes.length > 1 ? (
          <div className="border-b border-line py-4">
            <span className="text-sm text-fg-muted">{copy.size}</span>
            <SizePills className="mt-3" sizes={product.sizes} value={size.id} onChange={chooseSize} label={copy.size} />
          </div>
        ) : (
          <Row label={copy.size}>
            <span data-testid={`size-${size.id}`}>{size.name[locale]}</span>
          </Row>
        )}
      </div>

      {noteSpec ? (
        <VariantNoteField
          className="mt-6"
          label={noteSpec.label[locale]}
          placeholder={noteSpec.placeholder[locale]}
          value={order.note}
          onChange={order.setNote}
          onBlur={order.touchNote}
          error={order.noteError}
          required={noteSpec.required}
          inputRef={order.noteRef}
        />
      ) : null}

      {orderBar === "footer" ? (
        <DrawerFooter>
          <AddToOrderBar order={order} />
        </DrawerFooter>
      ) : orderBar ? (
        <AddToOrderBar order={order} className="mt-6" />
      ) : null}

      <ButtonLink href={askHref} variant="secondary" size="lg" className={cn("w-full", orderBar === true ? "mt-3" : "mt-6")}>
        <WhatsAppIcon className="size-4 shrink-0" />
        {copy.ask}
        <span className="sr-only"> ({t.common.menu.opensWhatsApp})</span>
      </ButtonLink>

      {order.hasAdded ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mt-2 flex justify-center"
        >
          <button
            type="button"
            onClick={() => {
              setCartOpen(true);
              playSound("open");
            }}
            className="group inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            {copy.viewOrder}
            <ArrowRight
              aria-hidden
              strokeWidth={1.5}
              className="size-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
            />
          </button>
        </motion.div>
      ) : null}

      <p className={cn("leading-relaxed text-fg-muted", page ? "mt-12 text-base" : "mt-10 text-[0.9375rem]")}>
        {product.description[locale]}
      </p>

      {specTable ? (
        <section aria-labelledby={headingId} className={page ? "mt-12" : "mt-10"}>
          <SpecsHeading id={headingId} className="eyebrow">
            {copy.specs}
          </SpecsHeading>
          <dl className="mt-4 border-t border-line">
            {specs.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-6 border-b border-line py-3">
                <dt className="shrink-0 text-sm text-fg-muted">{row.label}</dt>
                <dd dir={row.ltr ? "ltr" : undefined} className="min-w-0 text-end font-mono text-[0.8125rem] text-fg tabular">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <dl className={cn("flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line pt-4 text-[0.8125rem]", page ? "mt-10" : "mt-8")}>
          {specs.map((row) => (
            <div key={row.key} className="flex items-baseline gap-2">
              <dt className="text-fg-muted">{row.label}</dt>
              <dd className="text-fg">{row.value}</dd>
            </div>
          ))}
          <div className="flex items-baseline gap-2">
            <dt className="text-fg-muted">{copy.sku}</dt>
            <dd dir="ltr" className="font-mono text-fg-muted tabular">
              {product.sku}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
