import { ArrowRight } from "lucide-react";
import type { Locale, Product } from "@/types";
import { PRODUCTS } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/commerce/product-card";
import { CollectionLink } from "./collection-link";

/** Up to `limit` other products: same category first, then the featured piece, then catalog order. */
export function relatedTo(product: Product, limit = 3): Product[] {
  const score = (p: Product) => (p.category === product.category ? 2 : 0) + (p.featured ? 1 : 0);
  return PRODUCTS.filter((p) => p.slug !== product.slug)
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ p }) => p);
}

/**
 * "Also printed to order": other pieces as product cards that link straight
 * to their pages. A swipeable row on phones, three columns from sm up.
 */
export function RelatedProducts({ product, locale }: { product: Product; locale: Locale }) {
  const t = getDictionary(locale);
  const related = relatedTo(product, 3);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-title" className="mt-28 border-t border-line pt-14 md:mt-40 md:pt-20">
      <Reveal className="flex items-end justify-between gap-6">
        <h2
          id="related-title"
          className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-fg"
        >
          {t.commerce.product.related}
        </h2>
        <CollectionLink
          href={`/${locale}#collection`}
          filter="all"
          className="group -me-2 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          {t.commerce.product.backToCollection}
          <ArrowRight
            aria-hidden
            strokeWidth={1.5}
            className="size-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
          />
        </CollectionLink>
      </Reveal>

      <ul className="-mx-4 -my-2 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:mx-0 sm:mt-10 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:gap-6 [&::-webkit-scrollbar]:hidden">
        {related.map((p, i) => (
          <li key={p.slug} className="w-[72%] shrink-0 snap-start sm:w-auto">
            <Reveal delay={i * 0.06} className="h-full">
              <ProductCard product={p} action="page" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 31vw, 72vw" />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
