import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Unit tests for the pure logic (currency, WhatsApp links and messages,
 * validation, hours, stores, i18n, catalog, 3D geometry, SEO, proxy).
 * Runs in Node: nothing here needs a DOM, and the setup file provides the
 * in-memory Web Storage the persisted zustand stores expect.
 */
export default defineConfig({
  resolve: {
    alias: { "@": root.replace(/\/$/, "") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
    // Pin the clock zone so nothing depends on the machine running the suite.
    env: { TZ: "UTC" },
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
