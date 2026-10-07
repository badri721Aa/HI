"use client";

import { create } from "zustand";

export interface Toast {
  id: number;
  title: string;
  body?: string;
}

interface UIState {
  cartOpen: boolean;
  navOpen: boolean;
  /** Slug of the product open in the quick-view drawer. */
  quickView: string | null;
  toasts: Toast[];
  setCartOpen: (open: boolean) => void;
  setNavOpen: (open: boolean) => void;
  openQuickView: (slug: string) => void;
  closeQuickView: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useUI = create<UIState>()((set) => ({
  cartOpen: false,
  navOpen: false,
  quickView: null,
  toasts: [],
  setCartOpen: (cartOpen) => set(cartOpen ? { cartOpen, quickView: null } : { cartOpen }),
  setNavOpen: (navOpen) => set({ navOpen }),
  openQuickView: (quickView) => set({ quickView, cartOpen: false }),
  closeQuickView: () => set({ quickView: null }),
  toast: (t) => set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id: ++toastId }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
