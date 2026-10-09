"use client";

import { create } from "zustand";
import { SHOWCASE } from "@/content/showcase";

/** The hero print opens part-way through (0–1), so its first frame is never an empty plate. */
export const HERO_START_PROGRESS = 0.4;

const PIECE = SHOWCASE.vase;
const TOTAL_LAYERS = Math.round(PIECE.sizes[0].dims.h / PIECE.layerHeight);
const PRINT_MINUTES = Math.round((PIECE.printHours ?? 7) * 60);

/**
 * Live state of the hero print animation. Written by the 3D hero scene
 * (throttled, ~10 Hz), read by the DOM HUD next to it. Starts at the
 * scene's opening frame, so the HUD agrees with it before three.js loads.
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
  progress: HERO_START_PROGRESS,
  layer: Math.round(HERO_START_PROGRESS * TOTAL_LAYERS),
  totalLayers: TOTAL_LAYERS,
  minutesLeft: Math.round((1 - HERO_START_PROGRESS) * PRINT_MINUTES),
  set: (s) => set(s),
}));
