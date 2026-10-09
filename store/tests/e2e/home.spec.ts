import { PRODUCTS } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import { escapeRegExp, expect, gotoHome, test } from "./fixtures";

const SECTIONS = ["top", "collection", "process", "materials", "custom", "delivery", "faq"];

test.describe("home page", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page, "en");
  });

  test("has the hero heading and every section", async ({ page }) => {
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAccessibleName(new RegExp(escapeRegExp(getDictionary("en").home.hero.titleLines[0])));
    for (const id of SECTIONS) await expect(page.locator(`#${id}`), `#${id}`).toBeAttached();
  });

  test("keeps the hero's call to action on the first screen", async ({ page }) => {
    const cta = page.locator("#top").getByRole("link", { name: getDictionary("en").common.actions.browse });
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test("shows one card per product", async ({ page }) => {
    const cards = page.getByTestId("product-card");
    await expect(cards).toHaveCount(PRODUCTS.length);
    expect(PRODUCTS).toHaveLength(5);
    const slugs = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-slug")));
    expect(slugs.sort()).toEqual(PRODUCTS.map((p) => p.slug).sort());
  });

  test("filters the collection by category", async ({ page }) => {
    const visibleCards = page.getByTestId("product-card").filter({ visible: true });
    const fidgets = PRODUCTS.filter((p) => p.category === "fidgets").map((p) => p.slug);
    expect(fidgets.sort()).toEqual(["gear-shifter", "keycap-clicker"]);

    await page.getByTestId("filter-fidgets").click();
    await expect(visibleCards).toHaveCount(2);
    await expect
      .poll(async () => (await visibleCards.evaluateAll((els) => els.map((el) => el.getAttribute("data-slug")))).sort())
      .toEqual(fidgets);

    await page.getByTestId("filter-all").click();
    await expect(visibleCards).toHaveCount(PRODUCTS.length);
  });

  test("marks the active filter", async ({ page }) => {
    const fidgets = page.getByTestId("filter-fidgets");
    await fidgets.click();
    await expect
      .poll(async () => (await fidgets.getAttribute("aria-pressed")) ?? (await fidgets.getAttribute("aria-selected")))
      .toBe("true");
  });

  test("shows prices in Bahraini dinars by default", async ({ page }) => {
    const first = page.getByTestId("product-card").first();
    await expect(first).toContainText(/\d+\.\d{3} BHD/);
  });
});
