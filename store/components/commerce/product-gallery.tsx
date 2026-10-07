"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, type PanInfo } from "motion/react";
import type { Product, ProductImage } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { useFinePointer } from "@/components/motion/shared";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Cover photos are cropped 4:5; anything noticeably wider or taller is letterboxed instead of cropped. */
const WELL_RATIO = 4 / 5;
const isWellShaped = (image: ProductImage) => Math.abs(image.width / image.height - WELL_RATIO) < 0.08;

/**
 * A product photo that fills a positioned 4:5 well. 4:5 photos are cropped
 * to fill (object-cover); other shapes (e.g. a landscape shot of a set) sit
 * whole on a blurred wash of their own colours, so nothing important is cut.
 * Uses the catalog's tiny blurDataURL as the loading placeholder.
 */
export function ProductPhoto({
  image,
  sizes,
  alt,
  preload,
  className,
}: {
  image: ProductImage;
  sizes: string;
  /** Defaults to the image's localized alt; pass "" for a decorative duplicate. */
  alt?: string;
  preload?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const fit = isWellShaped(image) ? "cover" : "contain";
  const img = (
    <Image
      src={image.src}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt[locale]}
      sizes={sizes}
      placeholder="blur"
      blurDataURL={image.blurDataURL}
      preload={preload}
      draggable={false}
      style={{ objectFit: fit }}
      className={cn("absolute inset-0 size-full select-none", fit === "cover" ? "object-cover" : "object-contain", fit === "cover" && className)}
    />
  );
  if (fit === "cover") return img;
  return (
    <div className={cn("absolute inset-0", className)}>
      <div
        aria-hidden
        className="absolute inset-0 scale-125 bg-cover bg-center opacity-60 blur-2xl"
        style={{ backgroundImage: `url("${image.blurDataURL}")` }}
      />
      {img}
    </div>
  );
}

const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 420;

/**
 * Product photos: a 4:5 main image (cross-fades between photos) and, when
 * there is more than one, a row of thumbnail buttons. Arrow keys on the
 * thumbnails step through the photos (mirrored in RTL); on touch the main
 * image can be swiped; on fine pointers hovering the main image zooms 1.6×
 * towards the cursor.
 */
export function ProductGallery({
  product,
  variant = "page",
  preload = false,
  sizes,
  className,
}: {
  product: Product;
  variant?: "drawer" | "page";
  /** Preload the first photo (the product page's LCP image). */
  preload?: boolean;
  sizes?: string;
  className?: string;
}) {
  const { t, locale, dir } = useI18n();
  const fine = useFinePointer();
  const images = product.images;
  const count = images.length;
  const multiple = count > 1;
  const [index, setIndex] = useState(0);
  const active = Math.min(index, Math.max(0, count - 1));

  const zoomRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const imageSizes =
    sizes ?? (variant === "drawer" ? "(min-width: 30rem) 27rem, 92vw" : "(min-width: 1024px) 50vw, 92vw");

  const go = (next: number, focusThumb = false) => {
    if (!multiple) return;
    const wrapped = (next + count) % count;
    if (wrapped === active) return;
    setIndex(wrapped);
    playSound("tap");
    if (focusThumb) thumbRefs.current[wrapped]?.focus();
  };

  const onThumbKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward) go(active + 1, true);
    else if (e.key === backward) go(active - 1, true);
    else if (e.key === "Home") go(0, true);
    else if (e.key === "End") go(count - 1, true);
    else return;
    e.preventDefault();
  };

  /* Hover zoom: scale on enter, transform-origin follows the pointer (fine pointers only). */
  const zoomTo = (e: PointerEvent<HTMLDivElement>, scale: number | null) => {
    const el = zoomRef.current;
    if (!el || !fine || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    el.style.transformOrigin = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
    if (scale !== null) el.style.scale = String(scale);
  };
  const unzoom = () => {
    if (zoomRef.current) zoomRef.current.style.scale = "1";
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x;
    if (Math.abs(dx) < SWIPE_DISTANCE && Math.abs(info.velocity.x) < SWIPE_VELOCITY) return;
    // Swiping against the reading direction reveals the next photo.
    const next = dir === "rtl" ? dx > 0 : dx < 0;
    go(active + (next ? 1 : -1));
  };

  if (count === 0) {
    return <div className={cn("aspect-[4/5] w-full rounded-2xl border border-line bg-ink-900", className)} />;
  }

  return (
    <div
      className={cn(
        // Page, large screens: fill the column, but keep the photo (and thumbnails) within the viewport under
        // the header; when height is short the well may crop up to ~10% rather than shrink to a sliver.
        variant === "page" &&
          (multiple ? "lg:max-w-[min(100%,calc((100svh-13rem)*0.9))]" : "lg:max-w-[min(100%,calc((100svh-8rem)*0.9))]"),
        className,
      )}
    >
      <div
        className={cn(
          "relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-ink-900",
          variant === "drawer" && "max-h-[min(56svh,34rem)]",
          variant === "page" && (multiple ? "lg:max-h-[calc(100svh-13rem)]" : "lg:max-h-[calc(100svh-8rem)]"),
          fine && "cursor-zoom-in",
        )}
        onPointerEnter={(e) => zoomTo(e, 1.6)}
        onPointerMove={(e) => zoomTo(e, null)}
        onPointerLeave={unzoom}
        onPointerCancel={unzoom}
      >
        <motion.div
          className="absolute inset-0"
          drag={multiple && !fine ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.16}
          dragSnapToOrigin
          onDragEnd={onDragEnd}
        >
          <div ref={zoomRef} className="absolute inset-0 transition-[scale] duration-500 ease-out-expo">
            {images.map((image, i) => (
              <div
                key={image.src}
                aria-hidden={i !== active || undefined}
                className={cn(
                  "absolute inset-0 transition-opacity duration-500 ease-out-expo",
                  i === active ? "opacity-100" : "opacity-0",
                )}
              >
                <ProductPhoto image={image} sizes={imageSizes} preload={preload && i === 0} />
              </div>
            ))}
          </div>
        </motion.div>

        {multiple ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 start-3 rounded-full bg-ink-950/60 px-2.5 py-1 font-mono text-[0.6875rem] text-fg tabular backdrop-blur-md"
          >
            <span dir="ltr">
              {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
          </span>
        ) : null}
      </div>

      {multiple ? (
        <div role="group" aria-label={t.commerce.product.photos} onKeyDown={onThumbKeyDown} className="mt-3 flex gap-2">
          {images.map((image, i) => {
            const current = i === active;
            return (
              <button
                key={image.src}
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                type="button"
                aria-label={image.alt[locale]}
                aria-current={current ? "true" : undefined}
                onClick={() => go(i)}
                className={cn(
                  "relative size-16 overflow-hidden rounded-xl border bg-ink-900 transition-[border-color,opacity] duration-300 ease-out-expo",
                  current
                    ? "border-transparent outline-1 outline-offset-2 outline-glow focus-visible:outline-2"
                    : "border-line opacity-60 hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                <ProductPhoto image={image} sizes="64px" alt="" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
