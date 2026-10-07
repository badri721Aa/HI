"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OrderLine } from "@/types";
import { MAX_LINES, MAX_QTY } from "@/lib/whatsapp/order";
import { getProduct } from "@/content/catalog";

interface CartState {
  lines: OrderLine[];
  add: (line: OrderLine) => void;
  setQty: (index: number, qty: number) => void;
  remove: (index: number) => void;
  clear: () => void;
}

const sameVariant = (a: OrderLine, b: OrderLine) =>
  a.slug === b.slug &&
  a.colorId === b.colorId &&
  a.sizeId === b.sizeId &&
  (a.note ?? "").trim().toLowerCase() === (b.note ?? "").trim().toLowerCase();

/**
 * Order basket, persisted to localStorage. `skipHydration` keeps the first
 * client render identical to the server render; <Providers> rehydrates it.
 */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (input) =>
        set((state) => {
          const raw = Math.floor(input.qty);
          if (!Number.isFinite(raw)) return state;
          const line = { ...input, qty: Math.min(MAX_QTY, Math.max(1, raw)) };
          const i = state.lines.findIndex((l) => sameVariant(l, line));
          if (i >= 0) {
            const lines = [...state.lines];
            lines[i] = { ...lines[i], qty: Math.min(MAX_QTY, lines[i].qty + line.qty) };
            return { lines };
          }
          if (state.lines.length >= MAX_LINES) return state;
          return { lines: [...state.lines, { ...line, qty: Math.min(MAX_QTY, Math.max(1, line.qty)) }] };
        }),
      setQty: (index, qty) =>
        set((state) => {
          if (!state.lines[index]) return state;
          const lines = [...state.lines];
          lines[index] = { ...lines[index], qty: Math.min(MAX_QTY, Math.max(1, Math.floor(qty) || 1)) };
          return { lines };
        }),
      remove: (index) => set((state) => ({ lines: state.lines.filter((_, i) => i !== index) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "3dbh-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Drop lines whose product or variant was removed from the catalog.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<CartState> | undefined)?.lines ?? [];
        const lines = saved.filter((l) => {
          const p = getProduct(l.slug);
          return p && p.colors.some((c) => c.id === l.colorId) && p.sizes.some((s) => s.id === l.sizeId);
        });
        return { ...current, lines };
      },
    },
  ),
);

export const selectCount = (s: CartState) => s.lines.reduce((n, l) => n + l.qty, 0);
