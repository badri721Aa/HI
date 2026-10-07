"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types";
import { CATEGORIES, getProduct } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { Drawer } from "@/components/ui/drawer";
import { useUI } from "@/lib/store/ui";
import { playSound } from "@/lib/sound";
import { ProductDetails } from "./product-details";
import { ProductGallery } from "./product-gallery";

/**
 * The quick-view drawer, driven by useUI().quickView (a product slug).
 * Photos, then the full ProductDetails (the drawer title is the product
 * name, so details start with the tagline), then a link to the product page.
 * Remounts its content per product so picks and quantities never leak from
 * one piece to the next, and keeps showing the last product while the
 * drawer slides out.
 */
export function QuickView() {
  const { t, locale } = useI18n();
  const slug = useUI((s) => s.quickView);
  const closeQuickView = useUI((s) => s.closeQuickView);
  const product = slug ? getProduct(slug) : undefined;

  // Remember the last product so the closing drawer doesn't empty mid-animation.
  const [shown, setShown] = useState<Product | undefined>(product);
  if (product && product !== shown) setShown(product);
  const current = product ?? shown;

  const close = () => {
    closeQuickView();
    playSound("close");
  };

  const category = current ? CATEGORIES.find((c) => c.id === current.category)?.name[locale] : undefined;

  return (
    <Drawer
      open={!!product}
      onClose={close}
      testId="quick-view"
      title={current ? current.name[locale] : ""}
      description={category}
    >
      {current ? (
        <div key={current.slug} className="px-5 pb-8 pt-5 sm:px-6">
          <ProductGallery product={current} variant="drawer" />
          <ProductDetails product={current} variant="drawer" className="mt-6" />
          <Link
            href={`/${locale}/products/${current.slug}`}
            onClick={(e) => {
              // Plain clicks navigate here, so close; new-tab clicks leave the drawer open.
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) closeQuickView();
            }}
            className="group mt-8 flex min-h-13 items-center justify-between gap-4 border-y border-line py-3 text-sm font-medium text-fg"
          >
            {t.common.actions.viewDetails}
            <ArrowRight
              aria-hidden
              strokeWidth={1.5}
              className="size-4 text-fg-muted transition-[translate,color] duration-300 ease-out-expo group-hover:translate-x-0.5 group-hover:text-fg rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
            />
          </Link>
        </div>
      ) : null}
    </Drawer>
  );
}
