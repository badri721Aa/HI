/**
 * Visual regression, opt-in: it only runs with VISUAL=1.
 *
 *   VISUAL=1 npx playwright test tests/e2e/visual.spec.ts                      # compare
 *   VISUAL=1 npx playwright test tests/e2e/visual.spec.ts --update-snapshots   # accept changes
 *
 * Baselines live in tests/e2e/__screenshots__/visual.spec.ts/<project>/ (see
 * snapshotPathTemplate in playwright.config.ts), one set per project (desktop,
 * mobile). Font rendering differs between operating systems, so generate and
 * update them on Linux (the CI image, or `npx playwright install --with-deps
 * chromium` in a Linux container), look at every changed PNG in the HTML
 * report before committing, and commit them with the change that caused them.
 *
 * Determinism: reduced motion (the hero shows the finished piece, reveals
 * render their end state, no smooth scrolling), CSS animations disabled, and
 * the WebGL canvas plus every 3D well masked (WebGL output varies by GPU and
 * driver, and the wells show SVG fallbacks where WebGL is unavailable).
 */
import type { Page } from "@playwright/test";
import { PRODUCTS } from "@/content/catalog";
import { expect, test, waitForHydration } from "./fixtures";

test.skip(!process.env.VISUAL, "Visual regression runs only with VISUAL=1.");
test.use({ contextOptions: { reducedMotion: "reduce" } });

const PRODUCT = PRODUCTS[0].slug;

/** Hydrated, fonts loaded, every image (lazy ones too) decoded: nothing left to pop in. */
async function settle(page: Page) {
  await waitForHydration(page);
  await page.evaluate(() => {
    for (const img of document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) img.loading = "eager";
    return document.fonts.ready.then(() => undefined);
  });
  await expect.poll(() => page.evaluate(() => [...document.images].every((img) => img.complete))).toBe(true);
}

const shot = (page: Page) => ({
  animations: "disabled" as const,
  caret: "hide" as const,
  mask: [page.locator("canvas"), page.locator("[data-scene]")],
  maxDiffPixelRatio: 0.01,
});

for (const locale of ["en", "ar"] as const) {
  test.describe(`${locale}`, () => {
    test("hero", async ({ page }) => {
      await page.goto(`/${locale}`);
      await settle(page);
      await expect(page).toHaveScreenshot(`${locale}-hero.png`, shot(page));
    });

    test("collection", async ({ page }) => {
      await page.goto(`/${locale}`);
      await settle(page);
      const collection = page.locator("#collection");
      await collection.scrollIntoViewIfNeeded();
      await expect(collection).toHaveScreenshot(`${locale}-collection.png`, shot(page));
    });

    test("product page", async ({ page }) => {
      await page.goto(`/${locale}/products/${PRODUCT}`);
      await settle(page);
      await expect(page).toHaveScreenshot(`${locale}-product.png`, shot(page));
    });

    test("404", async ({ page }) => {
      const response = await page.goto(`/${locale}/products/this-piece-does-not-exist`);
      expect(response?.status()).toBe(404);
      await settle(page);
      await expect(page).toHaveScreenshot(`${locale}-404.png`, shot(page));
    });
  });
}
