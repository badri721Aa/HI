import type { Locale, Product } from "@/types";
import { Reveal } from "@/components/motion/reveal";
import { ProductGallery } from "@/components/commerce/product-gallery";
import { ProductDetails } from "@/components/commerce/product-details";
import { Breadcrumb } from "./breadcrumb";
import { RelatedProducts } from "./related-products";

/**
 * Product page body: breadcrumb, then a sticky gallery beside the details on
 * large screens (stacked below lg), then related pieces. ProductGallery keeps
 * the photo within the viewport under the header. Synchronous and
 * server-safe; client islands do the rest.
 */
export function ProductPageView({ product, locale }: { product: Product; locale: Locale }) {
  return (
    <div className="shell pb-28 pt-24 md:pb-40 md:pt-28">
      <Breadcrumb product={product} locale={locale} />

      <article className="mt-4 grid grid-cols-1 gap-y-10 md:mt-6 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-6">
          <div className="lg:sticky lg:top-24">
            <ProductGallery
              key={product.slug}
              product={product}
              variant="page"
              preload
              sizes="(min-width: 1360px) 620px, (min-width: 1024px) 46vw, (min-width: 640px) 36rem, 92vw"
              className="max-w-xl"
            />
          </div>
        </div>

        <Reveal delay={0.06} className="max-w-xl lg:col-span-5 lg:col-start-8 lg:max-w-none lg:pt-1">
          <ProductDetails key={product.slug} product={product} variant="page" />
        </Reveal>
      </article>

      <RelatedProducts product={product} locale={locale} />
    </div>
  );
}
