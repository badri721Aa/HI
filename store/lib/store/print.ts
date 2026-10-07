"use client";

import { create } from "zustand";

/**
 * Live state of the hero print animation. Written by the 3D hero scene
 * (throttled, ~10 Hz), read by the DOM HUD next to it.
 */
interface PrintState {
  /** 0 → 1 */
  progress: number;
  layer: number;
  totalLayers: number;
  /** Remaining print time in minutes (simulated). */
  minutesLeft: number;
  set: (s: Partial<Omit<PrintState, "set">>) => void;
}

export const usePrintState = create<PrintState>()((set) => ({
  progress: 0,
  layer: 0,
  totalLayers: 1100,
  minutesLeft: 7 * 60,
  set: (s) => set(s),
}));
