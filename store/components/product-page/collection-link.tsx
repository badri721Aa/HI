"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCollectionFilter, type CollectionFilter } from "@/components/commerce/filter-bar";

/**
 * A link back to the home collection that pre-selects a category filter
 * (or "all") on the way, so "Fidgets" in the breadcrumb lands on the
 * fidgets.
 */
export function CollectionLink({
  href,
  filter,
  className,
  children,
}: {
  href: string;
  filter: CollectionFilter;
  className?: string;
  children: ReactNode;
}) {
  const setFilter = useCollectionFilter((s) => s.setFilter);
  return (
    <Link href={href} onClick={() => setFilter(filter)} className={className}>
      {children}
    </Link>
  );
}
