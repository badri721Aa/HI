"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, type PanInfo } from "motion/react";
import type { Product, ProductImage } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { useFinePointer } from "@/components/motion/shared";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Cover photos are cropped 4:5; anything noticeably wider or taller is shown whole instead of cropped. */
const WELL_RATIO = 4 / 5;
const isWellShaped = (image: ProductImage) => Math.abs(image.width / image.height - WELL_RATIO) < 0.08;

/**
 * A product photo in a positioned well (4:5 in the gallery; grids may reshape
 * it). 4:5 photos fill the well (object-cover, centred unless `className`
 * moves the focal point). Other shapes, e.g. a landscape shot of a set, sit
 * whole and inset on the plain dark well with their own rounded corners, so
 * nothing is cut and no colour wash muddies the surface.
 *
 * Either way a photo is never drawn larger than its file: in a well bigger
 * than that (a small original on a large screen) it sits centred at its own
 * size, corners rounded, instead of being blown up soft. Uses the catalog's
 * tiny blurDataURL as the loading placeholder.
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
  const label = alt ?? image.alt[locale];
  const props = {
    src: image.src,
    width: image.width,
    height: image.height,
    sizes,
    placeholder: "blur",
    blurDataURL: image.blurDataURL,
    preload,
    draggable: false,
  } as const;

  if (isWellShaped(image)) {
    return (
      <Image
        {...props}
        alt={label}
        // The box is the well, capped at the file's size. Its rounded corners and hairline only show when the
        // cap leaves it smaller than the well; otherwise the well's own (larger) rounding clips them away.
        style={{ objectFit: "cover", maxWidth: image.width, maxHeight: image.height }}
        className={cn("absolute inset-0 m-auto size-full select-none rounded-xl object-cover ring-1 ring-line", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        // A faint centre light on the plain well, so the inset photo sits in a lit studio rather than a void.
        "absolute inset-0 grid place-items-center p-[6%] [container-type:size]",
        "bg-radial-[closest-side] from-fg/4 to-transparent",
        className,
      )}
    >
      <Image
        {...props}
        alt={label}
        // Sized to its own shape inside the well (container units), so the rounded corners are the photo's.
        style={{
          objectFit: "cover",
          width: `min(100cqw, ${image.width}px, 100cqh * ${image.width / image.height})`,
          height: "auto",
          aspectRatio: `${image.width} / ${image.height}`,
        }}
        className="select-none rounded-[min(0.75rem,3cqw)] object-cover ring-1 ring-line"
      />
    </div>
  );
}

const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 420;
const MAX_ZOOM = 1.6;
/** Below this the zoom would barely move, so the photo doesn't zoom at all. */
const MIN_ZOOM = 1.15;

/**
 * How far a photo can be magnified before it runs out of pixels: the loaded
 * file's width over the width it is drawn at, in device pixels. naturalWidth
 * is the file the browser actually fetched (next/image never upscales), so
 * a small original or a retina screen leaves little or no headroom. The photo
 * covers its own box (the well, or a smaller box for a capped or contained
 * photo); offset sizes ignore the zoom's own scale.
 */
export function zoomHeadroom(
  img: Pick<HTMLImageElement, "naturalWidth" | "naturalHeight" | "offsetWidth" | "offsetHeight"> | null | undefined,
  dpr: number,
) {
  if (!img?.naturalWidth || !img.naturalHeight || !img.offsetWidth) return 1;
  const drawn = Math.max(img.offsetWidth, img.offsetHeight * (img.naturalWidth / img.naturalHeight));
  return img.naturalWidth / (drawn * (dpr || 1));
}

/**
 * Product photos: a 4:5 main image (cross-fades between photos) and, when
 * there is more than one, a row of thumbnail buttons. Arrow keys on the
 * thumbnails step through the photos (mirrored in RTL); on touch the main
 * image can be swiped; on fine pointers hovering the main image zooms
 * towards the cursor, as far as the photo's resolution allows (up to 1.6×).
 *
 * On the page (large screens) the well keeps its 4:5 shape and fits the
 * viewport under the header with the thumbnails, so nothing is cropped.
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
  const zoomScale = useRef(1);
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
    // Up/Down too: on the product page the thumbnails stand in a column on large screens.
    if (e.key === forward || e.key === "ArrowDown") go(active + 1, true);
    else if (e.key === backward || e.key === "ArrowUp") go(active - 1, true);
    else if (e.key === "Home") go(0, true);
    else if (e.key === "End") go(count - 1, true);
    else return;
    e.preventDefault();
  };

  /* Hover zoom: the scale is fixed on enter, then transform-origin follows the pointer (fine pointers only). */
  const zoomFollow = (e: PointerEvent<HTMLDivElement>) => {
    const el = zoomRef.current;
    if (!el || zoomScale.current === 1 || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    el.style.transformOrigin = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
    el.style.scale = String(zoomScale.current);
  };
  const zoomIn = (e: PointerEvent<HTMLDivElement>) => {
    if (!fine || e.pointerType !== "mouse") return;
    const img = zoomRef.current?.querySelector<HTMLImageElement>(`[data-photo="${active}"] img`);
    const scale = Math.min(MAX_ZOOM, zoomHeadroom(img, window.devicePixelRatio));
    zoomScale.current = scale >= MIN_ZOOM ? scale : 1;
    e.currentTarget.style.cursor = zoomScale.current > 1 ? "zoom-in" : "";
    zoomFollow(e);
  };
  const unzoom = () => {
    zoomScale.current = 1;
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
      data-testid="product-gallery"
      className={cn(
        // Page, large screens: as wide as the column allows while the well still fits under the header and
        // breadcrumb (~12rem), at its own 4:5 so the photo is never cropped. Thumbnails become a rail at the
        // start side (4rem + gap), so they don't take height from the photo.
        variant === "page" &&
          (multiple
            ? "lg:grid lg:max-w-[min(100%,calc((100svh-12rem)*0.8+4.75rem))] lg:grid-cols-[4rem_minmax(0,1fr)] lg:gap-x-3"
            : "lg:max-w-[min(100%,calc((100svh-12rem)*0.8))]"),
        className,
      )}
    >
      <div
        data-testid="product-photo"
        className={cn(
          "relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-ink-900",
          // Quick view: a shorter, centre-cropped photo on phones so the name and options show without scrolling.
          variant === "drawer" && "max-h-[min(40svh,22rem)] sm:max-h-[min(56svh,34rem)]",
          variant === "page" && "lg:max-h-[calc(100svh-12rem)]",
          variant === "page" && multiple && "lg:col-start-2 lg:row-start-1",
        )}
        onPointerEnter={zoomIn}
        onPointerMove={zoomFollow}
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
                data-photo={i}
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

        {/* Which photo this is: the edited cover or the shop's original. Thumbnails carry it for screen readers. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 start-3 flex items-center gap-1.5 rounded-full bg-ink-950/60 px-2.5 py-1 text-[0.6875rem] text-fg backdrop-blur-md"
        >
          {multiple ? (
            <>
              <span dir="ltr" className="font-mono tabular">
                {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              </span>
              <span className="text-fg-subtle">·</span>
            </>
          ) : null}
          {images[active] ? <span data-testid="photo-kind">{t.commerce.product.photoKind[images[active].kind]}</span> : null}
        </span>
      </div>

      {multiple ? (
        <div
          role="group"
          aria-label={t.commerce.product.photos}
          onKeyDown={onThumbKeyDown}
          className={cn("mt-3 flex gap-2", variant === "page" && "lg:col-start-1 lg:row-start-1 lg:mt-0 lg:flex-col")}
        >
          {images.map((image, i) => {
            const current = i === active;
            return (
              <button
                key={image.src}
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                type="button"
                aria-label={`${image.alt[locale]} (${t.commerce.product.photoKind[image.kind]})`}
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
