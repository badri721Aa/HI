import type { Page } from "@playwright/test";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { escapeRegExp, expect, expectCartCount, test, waitForHydration } from "./fixtures";

const cell = getProduct("plant-cell-model")!;
const gear = getProduct("gear-shifter")!;

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

  test("shows the SKU without an empty specifications table", async ({ page }) => {
    await page.goto(`/en/products/${cell.slug}`);
    await expect(page.getByText(cell.sku, { exact: true })).toBeVisible();
    // The real products list no dimensions or materials yet, and availability is the badge's job.
    await expect(page.getByRole("heading", { name: "Specifications" })).toHaveCount(0);
  });

  test("fits the photo and its thumbnails in the first screen", async ({ page, isMobile }) => {
    test.skip(isMobile, "Phones stack the photo above the details.");
    for (const product of [cell, gear]) {
      await page.goto(`/en/products/${product.slug}`);
      const gallery = page.getByTestId("product-gallery");
      await expect(gallery).toBeVisible();
      const box = (await gallery.boundingBox())!;
      expect(box.y + box.height, product.slug).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
  });

  test("zooms a photo on hover only as far as its resolution allows", async ({ page, isMobile }) => {
    test.skip(isMobile, "Hover zoom is for fine pointers.");
    await page.goto(`/en/products/${gear.slug}`);
    await waitForHydration(page);
    const gallery = page.getByTestId("product-gallery");
    const well = gallery.getByTestId("product-photo");
    const photo = (i: number) => well.locator(`[data-photo="${i}"]`);
    // The layer that scales: the parent of the stacked photos.
    const scale = () => photo(0).locator("..").evaluate((el: HTMLElement) => Number(el.style.scale || 1));
    const loaded = (i: number) =>
      photo(i).locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    const hover = async () => {
      await page.mouse.move(0, 0);
      await well.hover();
    };

    // The 1000px studio cover has room to zoom on a 1x screen…
    await expect.poll(() => loaded(0)).toBe(true);
    await hover();
    await expect.poll(scale).toBeGreaterThan(1.15);

    // …the 440px phone photo doesn't, so it stays put.
    await gallery.getByRole("button", { name: gear.images[1].alt.en }).click();
    await expect.poll(() => loaded(1)).toBe(true);
    await hover();
    await well.hover({ position: { x: 40, y: 40 } });
    expect(await scale()).toBe(1);
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
