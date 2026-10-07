import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { isLocale } from "@/lib/i18n";
import { productJsonLd, productMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductPageView } from "@/components/product-page/product-page-view";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/products/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) notFound();
  return productMetadata(product, lang);
}

export default async function ProductPage({ params }: PageProps<"/[lang]/products/[slug]">) {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) notFound();

  return (
    <>
      <JsonLd data={productJsonLd(product, lang)} />
      <ProductPageView product={product} locale={lang} />
    </>
  );
}
