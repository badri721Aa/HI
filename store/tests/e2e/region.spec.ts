import type { Page } from "@playwright/test";
import { PRODUCTS } from "@/content/catalog";
import { chooseRegion, expect, gotoHome, test, waitForHydration } from "./fixtures";

/** Text of every product card, once they are all rendered. */
async function cardTexts(page: Page) {
  const cards = page.getByTestId("product-card");
  await expect(cards).toHaveCount(PRODUCTS.length);
  return cards.allTextContents();
}

test.describe("region and currency", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page, "en");
  });

  test("switching to the UAE prices everything in AED, and it sticks after a reload", async ({ page, isMobile }) => {
    await chooseRegion(page, "AE", isMobile);
    await expect.poll(async () => (await cardTexts(page)).every((t) => /\d\.\d{2} AED/.test(t) && !t.includes("BHD"))).toBe(true);

    await page.reload();
    await waitForHydration(page);
    await expect.poll(async () => (await cardTexts(page)).every((t) => t.includes("AED"))).toBe(true);
  });

  test("switching back to Bahrain prices everything in BHD", async ({ page, isMobile }) => {
    await chooseRegion(page, "AE", isMobile);
    await expect.poll(async () => (await cardTexts(page)).every((t) => t.includes("AED"))).toBe(true);

    await chooseRegion(page, "BH", isMobile);
    await expect.poll(async () => (await cardTexts(page)).every((t) => /\d\.\d{3} BHD/.test(t) && !t.includes("AED"))).toBe(true);

    await page.reload();
    await waitForHydration(page);
    await expect.poll(async () => (await cardTexts(page)).every((t) => t.includes("BHD"))).toBe(true);
  });

  test("shows the exact catalog price for the UAE", async ({ page, isMobile }) => {
    await chooseRegion(page, "AE", isMobile);
    const card = page.locator('[data-testid="product-card"][data-slug="plant-cell-model"]');
    await expect(card).toContainText("30.00 AED");
  });
});
