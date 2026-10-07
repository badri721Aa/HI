"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Region, WhatsAppLineId } from "@/types";

interface PrefsState {
  /** `null` until the visitor picks a region or geo detection answers. */
  region: Region | null;
  /** True once the visitor has chosen a region themselves (geo never overrides it). */
  regionChosen: boolean;
  /** Preferred WhatsApp line per region (Bahrain has two). */
  lines: Partial<Record<Region, WhatsAppLineId>>;
  sound: boolean;
  setRegion: (region: Region, chosen?: boolean) => void;
  setLine: (region: Region, line: WhatsAppLineId) => void;
  setSound: (on: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      region: null,
      regionChosen: false,
      lines: {},
      sound: false,
      setRegion: (region, chosen = true) =>
        set((s) => (chosen ? { region, regionChosen: true } : s.regionChosen ? s : { region })),
      setLine: (region, line) => set((s) => ({ lines: { ...s.lines, [region]: line } })),
      setSound: (sound) => set({ sound }),
    }),
    {
      name: "infill-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** Region to use for prices and WhatsApp routing; Bahrain until known. */
export const selectRegion = (s: PrefsState): Region => s.region ?? "BH";
