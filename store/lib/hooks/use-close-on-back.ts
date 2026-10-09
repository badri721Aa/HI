"use client";

import { useEffect, useEffectEvent } from "react";
import { jumpToY } from "@/lib/scroll";

const KEY = "__layer";

/** Where the page was, and what had focus, when the first layer opened. */
interface Spot {
  y: number;
  focus: HTMLElement | null;
}

/** Id of the history entry pushed for the open layers, while closing them should step back over it. */
let entryId: number | null = null;
let lastId = 0;
let openLayers = 0;
let spot: Spot | null = null;
/** Runs instead of putting the page back where it was, once the layers have closed (see `afterClose`). */
let then: (() => void) | null = null;
/** The browser's Back already stepped over the entry; the closing layers only settle the page. */
let steppedBack = false;
/** Listener waiting for our own history.back() to land. */
let pendingBack: (() => void) | null = null;

/**
 * Leaves the pushed entry where it is: a navigation is about to replace it
 * (or load a new document), so closing must not step back over it.
 */
export function releaseBackEntry() {
  entryId = null;
  spot = null;
  then = null;
  steppedBack = false;
}

/**
 * Once the open layers have closed and stepped back over their entry, runs
 * `run` instead of putting the page back where it was (a link to the page
 * itself scrolls to the top).
 */
export function afterClose(run: () => void) {
  if (entryId !== null) then = run;
}

/**
 * The traversal has landed: put the page back where the first layer found it
 * (a same-document step onto an entry with a #fragment scrolls to it), and
 * focus back on the trigger if it was dropped on the way.
 */
function settle() {
  const at = spot;
  const run = then;
  spot = null;
  then = null;
  requestAnimationFrame(() => {
    if (run) return run();
    if (!at) return;
    if (Math.abs(window.scrollY - at.y) >= 1) jumpToY(at.y);
    // Dropped: on the body, or left in a panel that is only still there for its exit animation.
    const active = document.activeElement;
    const dropped = !active || active === document.body || (openLayers === 0 && !!active.closest('[aria-modal="true"]'));
    if (dropped && at.focus?.isConnected) at.focus.focus({ preventScroll: true });
  });
}

function stepBack() {
  const onLanded = () => {
    window.removeEventListener("popstate", onLanded);
    pendingBack = null;
    settle();
  };
  pendingBack = () => window.removeEventListener("popstate", onLanded);
  window.addEventListener("popstate", onLanded);
  window.history.back();
}

/**
 * Registers an open layer: pushes the shared history entry for the first one
 * and returns the cleanup that closes it. What `useCloseOnBack` runs in its effect.
 */
export function holdLayer(close: () => void): () => void {
  openLayers++;
  if (entryId === null) {
    pendingBack?.();
    pendingBack = null;
    const active = document.activeElement;
    spot = { y: window.scrollY, focus: active instanceof HTMLElement && active !== document.body ? active : null };
    then = null;
    steppedBack = false;
    // A section hash left in the URL by in-page navigation: stepping back onto it would throw the page to that section.
    const { pathname, search, hash } = window.location;
    if (hash) window.history.replaceState(window.history.state, "", pathname + search);
    entryId = ++lastId;
    // Same URL; Next's patched pushState copies its own router state into the entry.
    window.history.pushState({ [KEY]: entryId }, "");
  }
  const onPop = () => {
    if (entryId !== null) {
      entryId = null;
      steppedBack = true;
    }
    close();
  };
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    openLayers--;
    // After the commit, so a layer opening in the same update can keep the entry.
    queueMicrotask(() => {
      if (openLayers > 0) return;
      if (entryId === null) {
        if (steppedBack) {
          steppedBack = false;
          settle();
        }
        return;
      }
      const ours = (window.history.state as Record<string, unknown> | null)?.[KEY] === entryId;
      entryId = null;
      if (ours) stepBack();
      else settle();
    });
  };
}

/**
 * While `open`, the layer (sheet, drawer) owns a history entry, so the
 * browser's Back button and the phone's back gesture close it instead of
 * leaving the page. Closing it any other way (X, Esc, backdrop) steps back
 * over that entry, so history stays as it was. Either way the page ends
 * where it was, with focus back on what opened it. Layers that hand over to
 * each other in one update (quick view → cart) share the entry.
 */
export function useCloseOnBack(open: boolean, onClose: () => void, enabled = true) {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!open || !enabled) return;
    return holdLayer(() => close());
  }, [open, enabled]);
}
