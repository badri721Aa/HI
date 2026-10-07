import { getProduct } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import {
  ORDER_REF,
  addToOrder,
  escapeRegExp,
  expect,
  expectCartCount,
  fillCheckout,
  goToCheckout,
  gotoHome,
  test,
  waText,
} from "./fixtures";

const ar = getDictionary("ar");
const clicker = getProduct("keycap-clicker")!;

test.describe("Arabic", () => {
  test("the home page is right to left with the Arabic hero", async ({ page }) => {
    await gotoHome(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAccessibleName(new RegExp(escapeRegExp(ar.home.hero.titleLines[0])));
    await expect(page.locator(`[data-testid="product-card"][data-slug="${clicker.slug}"]`)).toContainText(clicker.name.ar);
    await expect(page.getByTestId("product-card").first()).toContainText("د.ب");
  });

  test("the checkout preview is in Arabic with د.ب prices", async ({ page }) => {
    await gotoHome(page, "ar");
    await addToOrder(page, clicker.slug);
    await expectCartCount(page, 1);
    const drawer = await goToCheckout(page);
    await fillCheckout(page, { name: "فاطمة", city: "manama" });

    const preview = drawer.getByTestId("whatsapp-preview");
    await expect(preview).toContainText("د.ب");
    await expect(preview).toContainText("1.000 د.ب");
    await expect(preview).toContainText(clicker.name.ar);
    await expect(preview).toContainText("فاطمة");
    await expect(preview).toContainText("المنامة");
    await expect(preview).toContainText(ORDER_REF);
    await expect(preview).not.toContainText("BHD");

    const send = drawer.getByTestId("checkout-send");
    await expect(send).toHaveAttribute("href", /^https:\/\/wa\.me\/97339858885\?text=/);
    await expect
      .poll(async () => waText(await send.getAttribute("href")) === ((await preview.textContent()) ?? ""))
      .toBe(true);
  });
});
