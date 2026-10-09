"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/motion/reveal";
import { REVIEWS, type Review } from "@/content/reviews";
import { getProduct } from "@/content/catalog";
import { REGION_CONFIG } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Below this many reviews a marquee looks sparse; show a plain grid instead. */
const MARQUEE_MIN = 3;

/**
 * Real customer reviews (content/reviews.ts). Renders nothing while the list
 * is empty. With enough reviews it is a slow marquee that pauses on hover or
 * keyboard focus; with reduced motion it is a static grid.
 */
export function Reviews() {
  const { t } = useI18n();
  if (REVIEWS.length === 0) return null;

  const copy = t.home.reviews;
  const marquee = REVIEWS.length >= MARQUEE_MIN;

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="relative overflow-hidden py-28 md:py-40">
      <div className="shell">
        <SectionHeader index="06" eyebrow={copy.eyebrow} title={copy.title} id="reviews-title" />
      </div>

      {marquee ? (
        <>
          {/*
            Two identical lists side by side; the track moves by half its width, so the loop is seamless.
            RTL: the reversed animation plus a +50% offset runs 0 → +50%, so cards travel toward the start (right) edge.
            Focusable so keyboard users can pause it (WCAG 2.2.2).
          */}
          <div
            role="region"
            aria-labelledby="reviews-title"
            tabIndex={0}
            className="group/marquee relative mt-14 rounded-2xl motion-reduce:hidden md:mt-20 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
          >
            <div className="flex w-max motion-safe:animate-marquee group-hover/marquee:[animation-play-state:paused] group-focus-within/marquee:[animation-play-state:paused] rtl:motion-safe:translate-x-1/2 rtl:motion-safe:[animation-direction:reverse]">
              <ReviewList reviews={REVIEWS} />
              <ReviewList reviews={REVIEWS} duplicate />
            </div>
          </div>
          <div className="shell mt-14 hidden motion-reduce:block md:mt-20">
            <ReviewGrid reviews={REVIEWS} />
          </div>
        </>
      ) : (
        <div className="shell mt-14 md:mt-20">
          <ReviewGrid reviews={REVIEWS} />
        </div>
      )}
    </section>
  );
}

function ReviewList({ reviews, duplicate = false }: { reviews: Review[]; duplicate?: boolean }) {
  return (
    <ul aria-hidden={duplicate || undefined} inert={duplicate || undefined} className="flex shrink-0 gap-3 pe-3 md:gap-4 md:pe-4">
      {reviews.map((review, i) => (
        <li key={i} className="w-[min(82vw,24rem)] shrink-0">
          <ReviewCard review={review} />
        </li>
      ))}
    </ul>
  );
}

function ReviewGrid({ reviews }: { reviews: Review[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
      {reviews.map((review, i) => (
        <li key={i}>
          <Reveal delay={i * 0.06} className="h-full">
            <ReviewCard review={review} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ review, className }: { review: Review; className?: string }) {
  const { locale } = useI18n();
  const product = review.product ? (getProduct(review.product)?.name[locale] ?? review.product) : null;

  return (
    <figure className={cn("flex h-full flex-col justify-between rounded-2xl bg-ink-900 p-6 edge-light md:p-7", className)}>
      <blockquote className="text-[1.0625rem] leading-relaxed text-fg">
        <p>{review.quote[locale]}</p>
      </blockquote>
      <figcaption className="mt-8 flex items-end justify-between gap-4 border-t border-line pt-4 text-sm">
        <span>
          <span className="block text-fg">{review.name}</span>
          <span className="block text-fg-muted">
            {review.city}, {REGION_CONFIG[review.region].name[locale]}
          </span>
        </span>
        {product ? <span className="shrink-0 font-mono text-xs text-fg-muted">{product}</span> : null}
      </figcaption>
    </figure>
  );
}
