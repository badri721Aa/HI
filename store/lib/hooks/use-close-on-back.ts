"use client";

import { useEffect, useEffectEvent } from "react";

const KEY = "__layer";

/** Id of the history entry pushed for the open layers, while closing them should step back over it. */
let entryId: number | null = null;
let lastId = 0;
let openLayers = 0;

/**
 * Leaves the pushed entry where it is: a navigation is about to replace it
 * (or load a new document), so closing must not step back over it.
 */
export function releaseBackEntry() {
  entryId = null;
}

/**
 * While `open`, the layer (sheet, drawer) owns a history entry, so the
 * browser's Back button and the phone's back gesture close it instead of
 * leaving the page. Closing it any other way (X, Esc, backdrop) steps back
 * over that entry, so history stays as it was. Layers that hand over to
 * each other in one update (quick view → cart) share the entry.
 */
export function useCloseOnBack(open: boolean, onClose: () => void, enabled = true) {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!open || !enabled) return;
    openLayers++;
    if (entryId === null) {
      entryId = ++lastId;
      // Same URL; Next's patched pushState copies its own router state into the entry.
      window.history.pushState({ [KEY]: entryId }, "");
    }
    const onPop = () => {
      entryId = null;
      close();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      openLayers--;
      // After the commit, so a layer opening in the same update can keep the entry.
      queueMicrotask(() => {
        if (openLayers > 0 || entryId === null) return;
        const ours = (window.history.state as Record<string, unknown> | null)?.[KEY] === entryId;
        entryId = null;
        if (ours) window.history.back();
      });
    };
  }, [open, enabled]);
}
