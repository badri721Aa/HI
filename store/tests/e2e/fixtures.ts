import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { Locale, Region } from "@/types";
import { site } from "@/lib/site";

/**
 * Shared fixtures and steps for the e2e suite.
 *
 * - WhatsApp is never contacted: every request to wa.me (in the page or in a
 *   popup) is aborted and its URL recorded in `waRequests`.
 * - Steps use the data-testid contract from the build brief, role locators
 *   and web-first assertions; nothing waits on a fixed timer.
 */
export const test = base.extend<{ waRequests: string[] }>({
  waRequests: [
    async ({ context }, provide) => {
      const urls: string[] = [];
      await context.route("https://wa.me/**", (route) => {
        urls.push(route.request().url());
        return route.abort();
      });
      await context.route("https://api.whatsapp.com/**", (route) => route.abort());
      await provide(urls);
    },
    { auto: true },
  ],
});

export { expect };

export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An order reference with the shop's prefix, e.g. 3DBH-7K3Q2. */
export const ORDER_REF = new RegExp(`${escapeRegExp(site.orderPrefix)}-[0-9A-HJKMNP-TV-Z]{5}`);

/**
 * Waits until React has hydrated the header, so clicks reach real handlers
 * (the server HTML is interactive-looking before that).
 */
export async function waitForHydration(page: Page) {
  // page.evaluate runs over the DevTools protocol, so the site's strict CSP doesn't get in the way.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="cart-button"]');
        return !!el && Object.keys(el).some((key) => key.startsWith("__reactProps") || key.startsWith("__reactFiber"));
      }),
    )
    .toBe(true);
}

export async function gotoHome(page: Page, locale: Locale = "en") {
  await page.goto(`/${locale}`);
  await waitForHydration(page);
}

/** Closes any open drawer with Escape (the shared Drawer handles it) until none is left. */
export async function closeDialogs(page: Page) {
  const dialogs = page.getByRole("dialog");
  await expect(async () => {
    if ((await dialogs.count()) > 0) await page.keyboard.press("Escape");
    await expect(dialogs).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

/** The site header (banner landmark): scopes controls that other parts of the page may repeat. */
export const header = (page: Page) => page.getByRole("banner");
export const productCard = (page: Page, slug: string) => page.locator(`[data-testid="product-card"][data-slug="${slug}"]`);
export const quickView = (page: Page) => page.getByTestId("quick-view");
export const cartDrawer = (page: Page) => page.getByTestId("cart-drawer");
export const cartCount = (page: Page) => page.getByTestId("cart-count");

/** The header badge shows `n` pieces (no badge, or no positive number, for 0). */
export async function expectCartCount(page: Page, n: number) {
  if (n > 0) await expect(cartCount(page)).toHaveText(String(n));
  else await expect(cartCount(page).filter({ hasText: /[1-9]/ })).toHaveCount(0);
}

export async function openQuickView(page: Page, slug: string) {
  const trigger = productCard(page, slug).getByTestId("quick-view-open");
  await trigger.click();
  await expect(quickView(page)).toBeVisible();
  return trigger;
}

/** Opens the quick view, optionally answers the variant note, adds one piece, and closes whatever is left open. */
export async function addToOrder(page: Page, slug: string, opts: { note?: string } = {}) {
  await closeDialogs(page);
  await openQuickView(page, slug);
  const drawer = quickView(page);
  if (opts.note !== undefined) await drawer.getByTestId("variant-note").fill(opts.note);
  await drawer.getByTestId("add-to-order").click();
}

export async function openCart(page: Page) {
  if (!(await cartDrawer(page).isVisible())) {
    await closeDialogs(page);
    await header(page).getByTestId("cart-button").click();
  }
  await expect(cartDrawer(page)).toBeVisible();
  return cartDrawer(page);
}

export async function goToCheckout(page: Page) {
  const drawer = await openCart(page);
  await drawer.getByTestId("checkout-continue").click();
  await expect(drawer.getByTestId("checkout-name")).toBeVisible();
  return drawer;
}

export async function fillCheckout(page: Page, { name, city }: { name: string; city: string }) {
  const drawer = cartDrawer(page);
  await drawer.getByTestId("checkout-name").fill(name);
  await drawer.getByTestId("checkout-city").selectOption(city);
}

/** Sets a form field whether it is a <select> (by option value) or a text input. */
export async function setField(field: Locator, value: string) {
  const tag = await field.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") await field.selectOption(value);
  else await field.fill(value);
}

/** The text WhatsApp will receive from a wa.me link. */
export function waText(href: string | null): string {
  if (!href) return "";
  const query = href.split("?text=")[1];
  return query === undefined ? "" : decodeURIComponent(query);
}

/** Switches the sales region from the header (desktop) or the mobile menu (pass the `isMobile` fixture). */
export async function chooseRegion(page: Page, region: Region, mobile: boolean) {
  if (mobile) {
    await page.getByTestId("menu-button").click();
    const nav = page.getByTestId("mobile-nav");
    await expect(nav).toBeVisible();
    const option = nav.getByTestId(`region-${region}`);
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await closeDialogs(page);
  } else {
    const option = header(page).getByTestId("region-switch").getByTestId(`region-${region}`);
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  }
}
