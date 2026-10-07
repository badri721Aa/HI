import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { organizationJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { Hero } from "@/components/sections/hero";
import { Collection } from "@/components/sections/collection";
import { Process } from "@/components/sections/process";
import { Materials } from "@/components/sections/materials";
import { CustomPrint } from "@/components/sections/custom-print";
import { Delivery } from "@/components/sections/delivery";
import { Reviews } from "@/components/sections/reviews";
import { Faq } from "@/components/sections/faq";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <>
      <JsonLd data={organizationJsonLd(lang)} />
      <Hero />
      <Collection />
      <Process />
      <Materials />
      <CustomPrint />
      <Delivery />
      <Reviews />
      <Faq />
    </>
  );
}
