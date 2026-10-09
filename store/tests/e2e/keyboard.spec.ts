import type { Locator, Page } from "@playwright/test";
import { getProduct } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import {
  addToOrder,
  cartDrawer,
  closeDialogs,
  expect,
  gotoHome,
  header,
  openCart,
  openQuickView,
  productCard,
  quickView,
  test,
} from "./fixtures";

const t = getDictionary("en");

const focusIsInside = (dialog: Locator) => dialog.evaluate((el) => el.contains(document.activeElement));
const layerEntry = (page: Page) => page.evaluate(() => (history.state as Record<string, unknown> | null)?.__layer ?? null);
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
/** Two frames: anything the browser or the page does after a history step has landed. */
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Waits until the page has stopped scrolling (Lenis eases anchor jumps). */
async function scrollSettled(page: Page) {
  let last = -1;
  await expect
    .poll(async () => {
      const y = await scrollY(page);
      const still = y === last;
      last = y;
      return still;
    })
    .toBe(true);
}

/** Tabs forward and back a few times; focus must never leave the open drawer. */
async function expectFocusTrapped(page: Page, dialog: Locator) {
  for (const key of ["Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await focusIsInside(dialog), `focus escaped after ${key}`).toBe(true);
  }
}

test.describe("keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "Keyboard use is covered on desktop.");

  test.beforeEach(async ({ page }) => {
    await gotoHome(page, "en");
  });

  test("the quick view opens from the keyboard, traps focus, and Escape returns focus to its trigger", async ({
    page,
  }) => {
    const trigger = productCard(page, "keycap-clicker").getByTestId("quick-view-open");
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = quickView(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect.poll(() => focusIsInside(dialog)).toBe(true);
    await expectFocusTrapped(page, dialog);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the cart opens from the keyboard and Escape returns focus to the cart button", async ({ page }) => {
    const trigger = header(page).getByTestId("cart-button");
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = cartDrawer(page);
    await expect(dialog).toBeVisible();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);
    await expectFocusTrapped(page, dialog);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  for (const how of ["Escape", "Back"] as const) {
    test(`after a section link, closing the quick view (${how}) keeps the page and focus where they were`, async ({ page }) => {
      // The hero's CTA leaves #collection in the URL; stepping back onto it used to throw the page there.
      await page.locator(`#main a[href="/en#collection"]`).first().click();
      await expect(page).toHaveURL(/#collection$/);
      await scrollSettled(page);

      const trigger = productCard(page, "plant-cell-model").getByTestId("quick-view-open");
      await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await scrollSettled(page);
      const y = await scrollY(page);

      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(quickView(page)).toBeVisible();
      await expect.poll(() => layerEntry(page)).not.toBeNull();
      if (how === "Escape") await page.keyboard.press("Escape");
      else await page.goBack();
      await expect(quickView(page)).toBeHidden();
      await expect.poll(() => layerEntry(page)).toBeNull();
      await frames(page);

      expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(1);
      await expect(trigger).toBeFocused();
    });
  }

  test("Shift+Tab never leaves the focused control under the fixed header", async ({ page }) => {
    // The last filter pill, just under the header's band, then Tab off it and back.
    const pill = page.getByRole("group", { name: t.home.collection.filterLabel }).getByRole("button").last();
    await pill.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: "instant" }));
    await scrollSettled(page);
    await pill.evaluate((el) => el.focus({ preventScroll: true }));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(pill).toBeFocused();
    await frames(page);

    const { top, headerBottom } = await pill.evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      headerBottom: document.querySelector("header")!.getBoundingClientRect().bottom,
    }));
    expect(top).toBeGreaterThanOrEqual(headerBottom);
  });

  test("the skip link is the first stop and moves focus to the main content", async ({ page }) => {
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: getDictionary("en").common.skipToContent });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest("main") || document.activeElement?.tagName === "MAIN"))
      .toBe(true);
  });
});

test.describe("drawers", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page, "en");
  });

  test("the quick view keeps Add to order in view, as a bottom sheet on phones", async ({ page, isMobile }) => {
    await openQuickView(page, "hex-phone-case");
    const dialog = quickView(page);
    expect(await dialog.getAttribute("data-sheet")).toBe(isMobile ? "" : null);
    await expect(dialog.getByTestId("add-to-order")).toBeInViewport({ ratio: 1 });
  });

  test("Back closes the quick view without leaving the page; Escape leaves history as it was", async ({ page }) => {
    const url = page.url();

    await openQuickView(page, "keycap-clicker");
    await page.goBack();
    await expect(quickView(page)).toBeHidden();
    expect(page.url()).toBe(url);

    await openQuickView(page, "keycap-clicker");
    await expect.poll(() => layerEntry(page)).not.toBeNull();
    await page.keyboard.press("Escape");
    await expect(quickView(page)).toBeHidden();
    await expect.poll(() => layerEntry(page)).toBeNull();
    expect(page.url()).toBe(url);
  });

  test("a link in the cart to the page already open closes it without leaving a dead Back step", async ({ page }) => {
    const gear = getProduct("gear-shifter")!;
    await addToOrder(page, gear.slug);
    await closeDialogs(page);
    await page.goto(`/en/products/${gear.slug}`);
    const drawer = await openCart(page);
    await expect.poll(() => layerEntry(page)).not.toBeNull();

    await drawer.getByTestId("cart-line").getByRole("link", { name: gear.name.en }).click();
    await expect(cartDrawer(page)).toBeHidden();
    await expect.poll(() => layerEntry(page)).toBeNull();
    await expect(page).toHaveURL(new RegExp(`/en/products/${gear.slug}$`));

    // One Back now leaves the product page.
    await page.goBack();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("switching language from the menu takes the menu's history entry", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The menu is the phone header's.");
    await page.getByTestId("menu-button").click();
    const nav = page.getByTestId("mobile-nav");
    await expect(nav).toBeVisible();
    await nav.getByTestId("lang-switch").click();
    await expect(page).toHaveURL(/\/ar(#.*)?$/);

    // Back returns to the English page in one step, not to the menu's leftover entry.
    await page.goBack();
    await expect(page).toHaveURL(/\/en(#.*)?$/);
    await expect.poll(() => layerEntry(page)).toBeNull();
  });

  test("on phones a toast stays clear of the sheet's title and close button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Drawers are bottom sheets on phones.");
    await openQuickView(page, "keycap-clicker");
    const dialog = quickView(page);
    await dialog.getByTestId("add-to-order").click();
    const toast = page.getByTestId("toast").filter({ hasText: t.commerce.product.addedTitle });
    await expect(toast).toBeVisible();
    await frames(page);

    const close = dialog.getByRole("button", { name: t.common.actions.close }).first();
    const hit = await close.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && el.contains(at);
    });
    expect(hit, "a tap on the sheet's X must reach it, not a toast").toBe(true);
    const title = await dialog.getByRole("heading", { level: 2, name: getProduct("keycap-clicker")!.name.en }).boundingBox();
    const card = await toast.boundingBox();
    expect(card!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  });
});
