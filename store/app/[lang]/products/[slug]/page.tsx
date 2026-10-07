import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { isLocale } from "@/lib/i18n";
import { productJsonLd, productMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { JsonLd } from "@/components/seo/json-ld";
import { Reveal } from "@/components/motion/reveal";
import { ProductGallery } from "@/components/commerce/product-gallery";
import { ProductDetails } from "@/components/commerce/product-details";
import { Breadcrumb } from "@/components/product-page/breadcrumb";
import { RelatedProducts } from "@/components/product-page/related-products";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/products/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) notFound();
  return productMetadata(product, lang);
}

/**
 * Product page: breadcrumb, then a sticky gallery beside the details on
 * large screens (stacked below lg), then related pieces. The gallery is
 * capped so the whole photo fits the viewport under the header.
 */
export default async function ProductPage({ params }: PageProps<"/[lang]/products/[slug]">) {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) notFound();

  const multiple = product.images.length > 1;

  return (
    <>
      <JsonLd data={productJsonLd(product, lang)} />
      <div className="shell pb-28 pt-24 md:pb-40 md:pt-28">
        <Breadcrumb product={product} locale={lang} />

        <article className="mt-4 grid grid-cols-1 gap-y-10 md:mt-6 lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
          <div className="lg:col-span-7">
            <div className="lg:sticky lg:top-24">
              <ProductGallery
                key={product.slug}
                product={product}
                variant="page"
                preload
                sizes="(min-width: 1360px) 720px, (min-width: 1024px) 55vw, (min-width: 640px) 36rem, 92vw"
                className={cn(
                  "max-w-xl",
                  // Large screens: as wide as the column allows while the whole 4:5 photo (and thumbnails) fits under the header.
                  multiple ? "lg:max-w-[min(100%,calc((100svh-13rem)*0.8))]" : "lg:max-w-[min(100%,calc((100svh-8rem)*0.8))]",
                )}
              />
            </div>
          </div>

          <Reveal delay={0.06} className="max-w-xl lg:col-span-5 lg:max-w-none lg:pt-1">
            <ProductDetails key={product.slug} product={product} variant="page" />
          </Reveal>
        </article>

        <RelatedProducts product={product} locale={lang} />
      </div>
    </>
  );
}
