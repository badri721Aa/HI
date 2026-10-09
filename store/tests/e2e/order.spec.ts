import type { Locator } from "@playwright/test";
import { getProduct } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import { LIMITS } from "@/lib/whatsapp";
import {
  ORDER_REF,
  addToOrder,
  closeDialogs,
  expect,
  expectCartCount,
  fillCheckout,
  goToCheckout,
  gotoHome,
  openCart,
  openQuickView,
  quickView,
  test,
  waText,
} from "./fixtures";

const t = getDictionary("en");
const clicker = getProduct("keycap-clicker")!;
const phoneCase = getProduct("hex-phone-case")!;

/** The send link targets this number and carries exactly the previewed message. */
async function expectLinkMatchesPreview(drawer: Locator, digits: string) {
  const send = drawer.getByTestId("checkout-send");
  const preview = drawer.getByTestId("whatsapp-preview");
  await expect(send).toHaveAttribute("href", new RegExp(`^https://wa\\.me/${digits}\\?text=`));
  await expect
    .poll(async () => {
      const link = waText(await send.getAttribute("href"));
      const shown = (await preview.textContent()) ?? "";
      return link === shown ? "match" : `link text:\n${link}\n--- preview:\n${shown}`;
    })
    .toBe("match");
}

test.describe("order flow", () => {
  test.skip(({ isMobile }) => isMobile, "The full checkout walk-through runs on desktop.");

  test("validates, previews and routes the order to the right WhatsApp line", async ({ page, context, waRequests }) => {
    await gotoHome(page, "en");
    await addToOrder(page, clicker.slug);
    await expectCartCount(page, 1);

    const drawer = await goToCheckout(page);
    const send = drawer.getByTestId("checkout-send");
    await expect(send).toHaveAttribute("target", "_blank");

    // Empty form: nothing opens, the name error shows and the name field takes focus.
    const opened: string[] = [];
    context.on("page", (p) => opened.push(p.url()));
    await send.click();
    await expect(drawer.getByTestId("error-name")).toBeVisible();
    await expect(drawer.getByTestId("error-name")).toContainText(t.common.errors.name_required);
    await expect(drawer.getByTestId("checkout-name")).toBeFocused();
    expect(opened).toEqual([]);
    expect(waRequests).toEqual([]);

    await fillCheckout(page, { name: "Fatima Ali", city: "manama" });
    const preview = drawer.getByTestId("whatsapp-preview");
    await expect(preview).toContainText("Fatima Ali");
    await expect(preview).toContainText(clicker.name.en);
    await expect(preview).toContainText("1.000 BHD");
    await expect(preview).toContainText(ORDER_REF);
    await expect(preview).toContainText(clicker.sku);
    await expect(preview).not.toContainText(/undefined|NaN|null/);
    await expectLinkMatchesPreview(drawer, "97339858885");

    // Bahrain's second line.
    await drawer.getByTestId("line-bh-secondary").click();
    await expectLinkMatchesPreview(drawer, "97363669666");

    // Switch the order to the UAE: AED prices, UAE line, no Bahrain line picker.
    await drawer.getByTestId("checkout-region-AE").click();
    await drawer.getByTestId("checkout-city").selectOption("dubai");
    await expect(preview).toContainText("10.00 AED");
    await expect(preview).not.toContainText("BHD");
    await expect(drawer.getByTestId("line-bh-secondary")).toBeHidden();
    await expectLinkMatchesPreview(drawer, "971504644502");

    // Sending opens WhatsApp (blocked in tests) with the same link.
    const href = await send.getAttribute("href");
    await send.click();
    await expect.poll(() => waRequests.length).toBeGreaterThan(0);
    expect(waText(waRequests[0])).toBe(waText(href));
  });

  test("'Other area' needs an address before the order can be sent", async ({ page, waRequests }) => {
    await gotoHome(page, "en");
    await addToOrder(page, clicker.slug);
    const drawer = await goToCheckout(page);
    await fillCheckout(page, { name: "Fatima Ali", city: "other-bh" });

    await drawer.getByTestId("checkout-send").click();
    await expect(drawer.getByTestId("error-area")).toContainText(t.common.errors.area_required);
    await expect(drawer.getByTestId("checkout-area")).toBeFocused();
    expect(waRequests).toEqual([]);

    await drawer.getByTestId("checkout-area").fill("Sanad, block 743");
    await expect(drawer.getByTestId("whatsapp-preview")).toContainText("Other area, Bahrain — Sanad, block 743");
    await drawer.getByTestId("checkout-send").click();
    await expect.poll(() => waRequests.length).toBeGreaterThan(0);
  });

  test("keeps the order reference stable while the form is edited", async ({ page }) => {
    await gotoHome(page, "en");
    await addToOrder(page, clicker.slug);
    const drawer = await goToCheckout(page);
    await fillCheckout(page, { name: "Fatima", city: "riffa" });
    const preview = drawer.getByTestId("whatsapp-preview");
    await expect(preview).toContainText(ORDER_REF);
    const ref = ((await preview.textContent()) ?? "").match(ORDER_REF)?.[0];
    await drawer.getByTestId("checkout-name").fill("Fatima Ali");
    await expect(preview).toContainText("Fatima Ali");
    await expect(preview).toContainText(ref!);
  });
});

test.describe("phone case", () => {
  test("asks for the iPhone model before adding, then carries it to WhatsApp", async ({ page }) => {
    await gotoHome(page, "en");
    await openQuickView(page, phoneCase.slug);
    const details = quickView(page);

    await details.getByTestId("add-to-order").click();
    await expect(details.getByTestId("error-note")).toBeVisible();
    await expect(details.getByTestId("error-note")).toContainText(t.common.errors.note_required);
    await expectCartCount(page, 0);

    const note = details.getByTestId("variant-note");
    await expect(note).toHaveAttribute("maxlength", String(LIMITS.note));
    await note.fill("iPhone 15 Pro");
    await details.getByTestId("add-to-order").click();
    await expectCartCount(page, 1);

    const cart = await openCart(page);
    await expect(cart.getByTestId("cart-line")).toHaveCount(1);
    await expect(cart.getByTestId("cart-line")).toContainText("iPhone 15 Pro");

    await cart.getByTestId("checkout-continue").click();
    await fillCheckout(page, { name: "Fatima", city: "manama" });
    const preview = cart.getByTestId("whatsapp-preview");
    await expect(preview).toContainText(phoneCase.name.en);
    await expect(preview).toContainText("iPhone 15 Pro");
    await expect(preview).toContainText("2.000 BHD");
    await expectLinkMatchesPreview(cart, "97339858885");
  });

  test("different iPhone models stay on separate lines", async ({ page }) => {
    await gotoHome(page, "en");
    await addToOrder(page, phoneCase.slug, { note: "iPhone 15 Pro" });
    await expectCartCount(page, 1);
    await addToOrder(page, phoneCase.slug, { note: "iPhone 13" });
    await expectCartCount(page, 2);
    const cart = await openCart(page);
    await expect(cart.getByTestId("cart-line")).toHaveCount(2);
  });
});

test.describe("quantity", () => {
  test("the same piece added twice is one line with quantity 2", async ({ page }) => {
    await gotoHome(page, "en");
    await addToOrder(page, clicker.slug);
    await expectCartCount(page, 1);
    await closeDialogs(page);
    await addToOrder(page, clicker.slug);
    await expectCartCount(page, 2);

    const cart = await openCart(page);
    const lines = cart.getByTestId("cart-line");
    await expect(lines).toHaveCount(1);
    await expect(lines.locator("output")).toHaveText("2");

    await cart.getByTestId("checkout-continue").click();
    await fillCheckout(page, { name: "Fatima", city: "manama" });
    const preview = cart.getByTestId("whatsapp-preview");
    await expect(preview).toContainText("2 × ");
    await expect(preview).toContainText("2 × 1.000 BHD = 2.000 BHD");
  });

  test("the order survives a reload", async ({ page }) => {
    await gotoHome(page, "en");
    await addToOrder(page, clicker.slug);
    await expectCartCount(page, 1);
    await page.reload();
    await expectCartCount(page, 1);
    const cart = await openCart(page);
    await expect(cart.getByTestId("cart-line")).toContainText(clicker.name.en);
  });
});
