"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OrderLine } from "@/types";
import { MAX_LINES, MAX_QTY } from "@/lib/whatsapp/order";
import { getProduct } from "@/content/catalog";

/**
 * What `add` did: `added` everything asked for; `capped` the line reached
 * MAX_QTY, so only part (or none) of it was added; `full` the order already
 * has MAX_LINES lines, so nothing was added.
 */
export type AddResult = "added" | "capped" | "full";

interface CartState {
  lines: OrderLine[];
  add: (line: OrderLine) => AddResult;
  setQty: (index: number, qty: number) => void;
  /** Changes a line's note; a line that then matches another one folds into it. */
  setNote: (index: number, note: string) => void;
  remove: (index: number) => void;
  clear: () => void;
}

const sameVariant = (a: OrderLine, b: OrderLine) =>
  a.slug === b.slug &&
  a.colorId === b.colorId &&
  a.sizeId === b.sizeId &&
  (a.note ?? "").trim().toLowerCase() === (b.note ?? "").trim().toLowerCase();

const clampQty = (qty: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(qty) || 1));

const withNote = (line: OrderLine, note: string): OrderLine => {
  const { slug, colorId, sizeId, qty } = line;
  const trimmed = note.trim();
  return trimmed ? { slug, colorId, sizeId, qty, note: trimmed } : { slug, colorId, sizeId, qty };
};

/**
 * A saved cart can be stale (catalog changes) or hand-edited: keep lines that
 * still exist, clamp quantities to 1…MAX_QTY, fold duplicates, cap the count.
 */
function sanitizeLines(saved: unknown): OrderLine[] {
  if (!Array.isArray(saved)) return [];
  const lines: OrderLine[] = [];
  for (const item of saved) {
    if (!item || typeof item !== "object") continue;
    const { slug, colorId, sizeId, qty, note } = item as Record<string, unknown>;
    if (typeof slug !== "string" || typeof colorId !== "string" || typeof sizeId !== "string") continue;
    const product = getProduct(slug);
    if (!product?.colors.some((c) => c.id === colorId) || !product.sizes.some((s) => s.id === sizeId)) continue;
    const line = withNote({ slug, colorId, sizeId, qty: clampQty(Number(qty)) }, typeof note === "string" ? note : "");
    const i = lines.findIndex((l) => sameVariant(l, line));
    if (i >= 0) lines[i] = { ...lines[i], qty: Math.min(MAX_QTY, lines[i].qty + line.qty) };
    else if (lines.length < MAX_LINES) lines.push(line);
  }
  return lines;
}

/**
 * Order basket, persisted to localStorage. `skipHydration` keeps the first
 * client render identical to the server render; <AppProviders> rehydrates it
 * (and again when another tab changes it).
 */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (input) => {
        const { lines } = get();
        const line = { ...input, qty: clampQty(input.qty) };
        const askedTooMany = input.qty > MAX_QTY;
        const i = lines.findIndex((l) => sameVariant(l, line));
        if (i >= 0) {
          const total = lines[i].qty + line.qty;
          const next = [...lines];
          next[i] = { ...lines[i], qty: Math.min(MAX_QTY, total) };
          set({ lines: next });
          return askedTooMany || total > MAX_QTY ? "capped" : "added";
        }
        if (lines.length >= MAX_LINES) return "full";
        set({ lines: [...lines, line] });
        return askedTooMany ? "capped" : "added";
      },
      setQty: (index, qty) =>
        set((state) => {
          if (!state.lines[index]) return state;
          const lines = [...state.lines];
          lines[index] = { ...lines[index], qty: clampQty(qty) };
          return { lines };
        }),
      setNote: (index, note) =>
        set((state) => {
          const current = state.lines[index];
          if (!current) return state;
          const edited = withNote(current, note);
          const twin = state.lines.findIndex((l, k) => k !== index && sameVariant(l, edited));
          if (twin < 0) return { lines: state.lines.map((l, k) => (k === index ? edited : l)) };
          // Now identical to another line: keep that one, with both quantities.
          return {
            lines: state.lines
              .map((l, k) => (k === twin ? { ...l, qty: Math.min(MAX_QTY, l.qty + edited.qty) } : l))
              .filter((_, k) => k !== index),
          };
        }),
      remove: (index) => set((state) => ({ lines: state.lines.filter((_, i) => i !== index) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "3dbh-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Nothing stored (storage blocked or wiped): keep what this tab has rather than empty it on a re-sync.
      merge: (persisted, current) =>
        persisted ? { ...current, lines: sanitizeLines((persisted as { lines?: unknown }).lines) } : current,
    },
  ),
);

export const selectCount = (s: CartState) => s.lines.reduce((n, l) => n + l.qty, 0);
