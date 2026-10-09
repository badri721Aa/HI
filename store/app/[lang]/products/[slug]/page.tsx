import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NOT_FOUND_SLUG, PRODUCTS, getProduct } from "@/content/catalog";
import { isLocale } from "@/lib/i18n";
import { breadcrumbJsonLd, notFoundMetadata, productJsonLd, productMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductPageView } from "@/components/product-page/product-page-view";

export function generateStaticParams() {
  // NOT_FOUND_SLUG is where the proxy rewrites unknown paths. Prerendering it
  // means even the first such request gets the cached 404, never a 200 render.
  return [...PRODUCTS.map((p) => ({ slug: p.slug })), { slug: NOT_FOUND_SLUG }];
}

export async function generateMetadata({ params }: PageProps<"/[lang]/products/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  // The page itself calls notFound(); throwing here too would leave the 404 as an empty error shell.
  if (!isLocale(lang)) return {};
  if (!product) return notFoundMetadata(lang);
  return productMetadata(product, lang);
}

export default async function ProductPage({ params }: PageProps<"/[lang]/products/[slug]">) {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) notFound();

  return (
    <>
      <JsonLd data={productJsonLd(product, lang)} />
      <JsonLd data={breadcrumbJsonLd(product, lang)} />
      <ProductPageView product={product} locale={lang} />
    </>
  );
}
