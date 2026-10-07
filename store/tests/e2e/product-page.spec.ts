import type { Page } from "@playwright/test";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { escapeRegExp, expect, expectCartCount, test, waitForHydration } from "./fixtures";

const cell = getProduct("plant-cell-model")!;

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((el) => JSON.parse(el.textContent ?? "null") as unknown));
  // Flatten @graph containers so a Product nested in a graph is found too.
  return blocks.flatMap((b) => {
    const node = b as Record<string, unknown> | null;
    if (!node) return [];
    return Array.isArray(node["@graph"]) ? (node["@graph"] as Record<string, unknown>[]) : [node];
  });
}

test.describe("product page", () => {
  test("has the product heading, its photo and Product JSON-LD", async ({ page }) => {
    const response = await page.goto(`/en/products/${cell.slug}`);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: cell.name.en })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(escapeRegExp(cell.name.en)));

    const photo = page.getByAltText(cell.images[0].alt.en).first();
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    const product = (await jsonLd(page)).find((node) => node["@type"] === "Product");
    expect(product, "a JSON-LD node with \"@type\":\"Product\"").toBeTruthy();
    expect(product?.name).toBe(cell.name.en);
    expect(product?.sku).toBe(cell.sku);
    const offers = product?.offers as { price: string; priceCurrency: string }[];
    expect(offers.map((o) => `${o.price} ${o.priceCurrency}`).sort()).toEqual(["3.000 BHD", "30.00 AED"]);
  });

  test("is localized on /ar", async ({ page }) => {
    await page.goto(`/ar/products/${cell.slug}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: cell.name.ar })).toBeVisible();
    await expect(page.getByAltText(cell.images[0].alt.ar).first()).toBeVisible();
  });

  test("adds the piece to the order", async ({ page }) => {
    await page.goto(`/en/products/${cell.slug}`);
    await waitForHydration(page);
    await expect(page.getByTestId("product-price").first()).toContainText("3.000 BHD");
    await page.getByTestId("add-to-order").first().click();
    await expectCartCount(page, 1);
  });

  test("every product has a page", async ({ page, isMobile }) => {
    test.skip(isMobile, "Covered on desktop.");
    for (const product of PRODUCTS) {
      const response = await page.goto(`/en/products/${product.slug}`);
      expect(response?.status(), product.slug).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: product.name.en })).toBeVisible();
    }
  });
});
