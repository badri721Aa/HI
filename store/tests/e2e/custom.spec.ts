import { ORDER_REF, expect, gotoHome, setField, test, waText } from "./fixtures";

test.describe("custom print form", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page, "en");
  });

  test("builds a WhatsApp request with the description", async ({ page, waRequests }) => {
    const form = page.getByTestId("custom-form");
    await form.scrollIntoViewIfNeeded();
    const description = "A replacement knob for my desk lamp, about 4 cm across";

    await setField(form.getByTestId("custom-what"), description);
    await setField(form.getByTestId("custom-name"), "Fatima Ali");
    await setField(form.getByTestId("custom-city"), "manama");

    const send = form.getByTestId("custom-send");
    await expect(send).toHaveAttribute("target", "_blank");
    await expect(send).toHaveAttribute("href", /^https:\/\/wa\.me\/\d{8,15}\?text=/);
    await expect.poll(async () => waText(await send.getAttribute("href"))).toContain(description);
    const text = waText(await send.getAttribute("href"));
    expect(text).toContain("Fatima Ali");
    expect(text).toMatch(ORDER_REF);
    expect(text).not.toMatch(/undefined|NaN|null/);

    await send.click();
    await expect.poll(() => waRequests.length).toBeGreaterThan(0);
    expect(waText(waRequests[0])).toContain(description);
  });

  test("does not open WhatsApp while the form is empty", async ({ page, context, waRequests }) => {
    const form = page.getByTestId("custom-form");
    await form.scrollIntoViewIfNeeded();
    const opened: string[] = [];
    context.on("page", (p) => opened.push(p.url()));

    await form.getByTestId("custom-send").click();
    // The first invalid field takes focus, as in the checkout.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
      .toMatch(/^custom-(what|name|city)$/);
    expect(opened).toEqual([]);
    expect(waRequests).toEqual([]);
  });
});
