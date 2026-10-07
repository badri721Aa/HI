"use client";

import { useEffect, useState } from "react";

/**
 * Id of the section crossing a thin band just above the middle of the
 * viewport (rootMargin "-45% 0px -50% 0px"). Sections that stream in or
 * mount later are picked up as they appear. When nothing is in the band
 * (between sections) the previous answer is kept, so indicators don't flicker.
 *
 * Pass every section id in document order, including ones without a nav
 * link (e.g. "top"), so the indicator clears while those are on screen.
 * Returns null when `enabled` is false (e.g. off the home page).
 */
export function useActiveSection(ids: readonly string[], enabled = true): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const list = key.split("|").filter(Boolean);
    if (list.length === 0) return;

    const visible = new Set<string>();
    const observed = new Map<string, Element>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // Prefer the later section when two touch the band at once (the one scrolling in).
        for (let i = list.length - 1; i >= 0; i--) {
          if (visible.has(list[i])) {
            setActive(list[i]);
            return;
          }
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );

    let mo: MutationObserver | null = null;
    const scan = () => {
      for (const id of list) {
        const el = document.getElementById(id);
        const prev = observed.get(id);
        if (el === prev) continue;
        if (prev) io.unobserve(prev);
        if (el) {
          observed.set(id, el);
          io.observe(el);
        } else {
          observed.delete(id);
        }
      }
      if (observed.size === list.length) {
        mo?.disconnect();
        mo = null;
      }
    };

    scan();
    if (observed.size < list.length) {
      // Some sections aren't in the DOM yet (streaming, client navigation): watch for them.
      let queued = 0;
      mo = new MutationObserver(() => {
        if (queued) return;
        queued = requestAnimationFrame(() => {
          queued = 0;
          scan();
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
      // Stop watching eventually if a section never shows up.
      const giveUp = window.setTimeout(() => {
        mo?.disconnect();
        mo = null;
      }, 15_000);
      return () => {
        cancelAnimationFrame(queued);
        window.clearTimeout(giveUp);
        mo?.disconnect();
        io.disconnect();
      };
    }

    return () => io.disconnect();
  }, [key, enabled]);

  return enabled ? active : null;
}
