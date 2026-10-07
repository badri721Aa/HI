import type { Locale, Product } from "@/types";
import { CATEGORIES } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CollectionLink } from "./collection-link";

const LINK = "inline-flex min-h-11 items-center text-fg-muted transition-colors duration-200 hover:text-fg";

/** Collection / Category / Name, in small mono. The first two return to the home grid, pre-filtered. */
export function Breadcrumb({ product, locale, className }: { product: Product; locale: Locale; className?: string }) {
  const t = getDictionary(locale);
  const category = CATEGORIES.find((c) => c.id === product.category);
  const href = `/${locale}#collection`;
  const sep = (
    <li aria-hidden className="text-fg-muted/50">
      /
    </li>
  );

  return (
    <nav aria-label={t.commerce.product.breadcrumb} className={className}>
      <ol className="flex flex-wrap items-center gap-x-2.5 font-mono text-xs">
        <li>
          <CollectionLink href={href} filter="all" className={LINK}>
            {t.common.nav.collection}
          </CollectionLink>
        </li>
        {category ? (
          <>
            {sep}
            <li>
              <CollectionLink href={href} filter={category.id} className={LINK}>
                {category.name[locale]}
              </CollectionLink>
            </li>
          </>
        ) : null}
        {sep}
        <li className="min-w-0">
          <span aria-current="page" className={cn("block truncate text-fg")}>
            {product.name[locale]}
          </span>
        </li>
      </ol>
    </nav>
  );
}
