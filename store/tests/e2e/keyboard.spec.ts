import type { Locator, Page } from "@playwright/test";
import { getDictionary } from "@/lib/i18n";
import { cartDrawer, expect, gotoHome, header, productCard, quickView, test } from "./fixtures";

const focusIsInside = (dialog: Locator) => dialog.evaluate((el) => el.contains(document.activeElement));

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
