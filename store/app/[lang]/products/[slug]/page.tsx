// STUB — owned by the collection builder (product detail page).
import { notFound } from "next/navigation";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { isLocale } from "@/lib/i18n";
import { ProductDetails } from "@/components/commerce/product-details";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({ params }: PageProps<"/[lang]/products/[slug]">) {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) notFound();
  return <ProductDetails product={product} variant="page" />;
}
