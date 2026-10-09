"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { Eye } from "lucide-react";
import type { Currency, Product } from "@/types";
import { CATEGORIES } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { useFinePointer } from "@/components/motion/shared";
import { Amount } from "@/components/commerce/price";
import { useCurrency } from "@/lib/hooks/use-region";
import { priceFor } from "@/lib/currency";
import { useUI } from "@/lib/store/ui";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { ProductPhoto } from "./product-gallery";
import { StockBadge } from "./stock-badge";
import { ColorDot } from "./swatches";

/** Lowest unit price, and whether sizes differ in price (then it reads "From …"). */
function priceSummary(product: Product, currency: Currency) {
  const prices = product.sizes.map((s) => priceFor(s, currency));
  return { min: Math.min(...prices), varies: new Set(prices).size > 1 };
}

const isPlainLeftClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export type ProductCardAction = "quick-view" | "page";

/**
 * A product in a grid: 4:5 photo well, then name and price, tagline, colour
 * dots and availability.
 *
 * The product name is the card's one real link (to the product page) and its
 * ::after stretches over the whole card. With `action="quick-view"` (the
 * collection), a plain click or Enter on it opens the quick-view drawer
 * instead; modified and middle clicks still open the page. With
 * `action="page"` it simply navigates. The round button in the well always
 * opens the quick view (shown on hover / focus with a mouse, always on touch).
 *
 * `variant="feature"` is the large editorial card: full-width on phones, a
 * photo + text spread on tablets, and on large screens a tall card whose
 * photo fills whatever height its grid area gives it (the parent must give
 * it a height, e.g. a 2-row span). `wellClassName` lets a grid reshape the
 * default 4:5 well (e.g. `lg:aspect-square`); the studio shots are centred,
 * so a centred crop keeps the whole piece (the wide feature well crops a
 * little higher, see `focal`).
 */
export function ProductCard({
  product,
  variant = "default",
  action = "quick-view",
  sizes,
  className,
  wellClassName,
}: {
  product: Product;
  variant?: "default" | "feature";
  action?: ProductCardAction;
  /** next/image sizes for the photo; defaults suit the collection grid. */
  sizes?: string;
  className?: string;
  wellClassName?: string;
}) {
  const { t, locale } = useI18n();
  const currency = useCurrency();
  const openQuickView = useUI((s) => s.openQuickView);
  const fine = useFinePointer();

  const feature = variant === "feature";
  const name = product.name[locale];
  const href = `/${locale}/products/${product.slug}`;
  const [cover, second] = product.images;
  const { min, varies } = priceSummary(product, currency);
  const category = CATEGORIES.find((c) => c.id === product.category)?.name[locale];
  const photoSizes =
    sizes ??
    (feature
      ? "(min-width: 1360px) 632px, (min-width: 1024px) 47vw, (min-width: 640px) 46vw, 92vw"
      : "(min-width: 1360px) 300px, (min-width: 1024px) 23vw, (min-width: 640px) 45vw, 46vw");
  /*
   * The large feature well is wider than 4:5, so a centred crop takes ~17% off a tall piece's height and the
   * phone case's top edge met the frame. The studio pieces sit a touch above centre: crop there instead.
   */
  const focal = feature ? "lg:object-[50%_38%]" : undefined;

  /* Cursor highlight over the photo (fine pointers): --mx/--my on the well, once per frame. */
  const wellRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const el = wellRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--mx", `${x.toFixed(1)}px`);
      el.style.setProperty("--my", `${y.toFixed(1)}px`);
    });
  };

  const openPreview = () => {
    openQuickView(product.slug);
    playSound("open");
  };

  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (action !== "quick-view" || e.defaultPrevented || !isPlainLeftClick(e)) return;
    e.preventDefault();
    openPreview();
  };

  return (
    <article
      data-testid="product-card"
      data-slug={product.slug}
      onPointerMove={onPointerMove}
      className={cn(
        "group/card @container/card relative flex h-full flex-col",
        feature && "sm:grid sm:grid-cols-2 sm:gap-x-5 lg:flex",
        className,
      )}
    >
      {/*
        Photo well. It sits above the stretched link (z-[2] vs z-[1]) so it can be its own stacking context
        (isolate: reliable rounded clipping of the scaling photo, incl. Safari), but lets clicks fall through
        to the link (pointer-events-none); only the quick-view button takes pointer events back.
      */}
      <div
        ref={wellRef}
        data-cursor="view"
        className={cn(
          "pointer-events-none relative isolate z-[2] aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-ink-900 transition-colors duration-500 ease-out-expo group-hover/card:border-line-strong",
          feature && "lg:aspect-auto lg:min-h-0 lg:flex-1",
          wellClassName,
        )}
      >
        <div className="absolute inset-0 transition-[scale] duration-[600ms] ease-out-expo group-hover/card:scale-[1.03]">
          {cover ? <ProductPhoto image={cover} sizes={photoSizes} className={focal} /> : null}
          {/* Second photo cross-fades in on hover; never loaded on touch screens, which can't hover. */}
          {second && fine ? (
            <ProductPhoto
              image={second}
              sizes={photoSizes}
              alt=""
              className={cn("opacity-0 transition-opacity duration-500 ease-out-expo group-hover/card:opacity-100", focal)}
            />
          ) : null}
        </div>

        <div
          aria-hidden
          className="spotlight pointer-events-none absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-500 ease-out-expo group-hover/card:opacity-100"
        />

        {product.badge ? (
          <span className="absolute start-3 top-3 rounded-full bg-ink-950/65 px-2.5 py-1 font-mono text-[0.625rem] uppercase leading-4 tracking-[0.14em] text-fg backdrop-blur-md">
            {t.common.badges[product.badge]}
          </span>
        ) : null}

        <button
          type="button"
          data-testid="quick-view-open"
          aria-label={`${t.common.actions.quickView}: ${name}`}
          aria-haspopup="dialog"
          onClick={openPreview}
          className={cn(
            "glass pointer-events-auto absolute bottom-3 end-3 z-10 grid size-11 place-items-center rounded-full text-fg",
            "transition-[opacity,translate,background-color,border-color] duration-300 ease-out-expo hover:border-line-strong hover:bg-ink-700/80",
            "pointer-fine:translate-y-1 pointer-fine:opacity-0",
            "pointer-fine:group-hover/card:translate-y-0 pointer-fine:group-hover/card:opacity-100",
            "pointer-fine:group-focus-within/card:translate-y-0 pointer-fine:group-focus-within/card:opacity-100",
          )}
        >
          <Eye aria-hidden strokeWidth={1.5} className="size-[1.125rem]" />
        </button>
      </div>

      {/* Text */}
      {/* flex-1 + mt-auto on the meta row: colour dots and availability line up across a grid row. */}
      <div className={cn("mt-4 flex min-w-0 flex-1 flex-col", feature && "sm:mt-0 sm:justify-end sm:pb-1 lg:mt-5 lg:flex-none lg:pb-0")}>
        {feature && category ? <p className="eyebrow mb-3 hidden sm:block">{category}</p> : null}

        <div
          className={cn(
            "flex gap-x-4",
            feature
              ? "items-baseline justify-between"
              : "flex-col gap-y-1 @2xs/card:flex-row @2xs/card:items-baseline @2xs/card:justify-between",
          )}
        >
          <h3
            className={cn(
              "min-w-0 text-fg",
              feature
                ? "text-xl font-semibold leading-tight tracking-[-0.025em] sm:text-[1.75rem] lg:text-[1.875rem]"
                : "text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] @2xs/card:text-base",
            )}
          >
            <Link
              href={href}
              onClick={onLinkClick}
              data-cursor="view"
              aria-haspopup={action === "quick-view" ? "dialog" : undefined}
              className={cn(
                "outline-none after:absolute after:inset-0 after:z-[1] after:rounded-2xl after:content-['']",
                "focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-glow",
              )}
            >
              {name}
            </Link>
          </h3>
          <p
            className={cn(
              "shrink-0 font-mono tabular text-fg",
              feature ? "text-base sm:text-lg" : "text-[0.8125rem] @2xs/card:text-sm",
            )}
          >
            {varies ? <span className="text-fg-muted">{t.home.collection.from} </span> : null}
            <Amount value={min} />
          </p>
        </div>

        {/* Narrow cards (the 4-up collection grid) keep the tagline to one line, so two rows fit a screen. */}
        <p
          className={cn(
            "mt-1.5 text-sm leading-relaxed text-fg-muted",
            feature
              ? "line-clamp-2 max-w-md sm:mt-3 sm:line-clamp-none sm:text-[0.9375rem]"
              : "hidden @3xs/card:line-clamp-1 @xs/card:line-clamp-2",
          )}
        >
          {product.tagline[locale]}
        </p>

        <div className={cn("mt-auto flex items-center justify-between gap-3 pt-3", feature && "sm:mt-0 sm:pt-5")}>
          <ul aria-label={t.commerce.product.colour} className="flex shrink-0 items-center gap-1">
            {product.colors.map((c) => (
              <li key={c.id} title={c.name[locale]} className="flex">
                <ColorDot color={c} className="size-3" />
                <span className="sr-only">{c.name[locale]}</span>
              </li>
            ))}
          </ul>
          <StockBadge product={product} />
        </div>
      </div>
    </article>
  );
}
