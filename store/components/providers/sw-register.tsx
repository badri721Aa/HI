"use client";

import { useEffect } from "react";

const SW_URL = "/sw.js";

/**
 * Registers public/sw.js (offline fallback + immutable asset cache) once the
 * page has loaded and the main thread is idle. Production only: in
 * development it removes a worker left over from a production run on the
 * same origin, so stale assets never shadow hot reloads. Never throws.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.endsWith(SW_URL))
              .map((r) => r.unregister()),
          ),
        )
        .catch(() => {});
      return;
    }

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const register = () => {
      navigator.serviceWorker
        // The worker activates itself (skipWaiting + clients.claim), so updates need no prompt.
        .register(SW_URL, { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    };
    const whenIdle = () => {
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(register, { timeout: 5000 });
      else timeoutId = setTimeout(register, 2000);
    };

    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    return () => {
      window.removeEventListener("load", whenIdle);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
