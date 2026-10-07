import { PRODUCTS } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import { site } from "@/lib/site";
import { expect, test, waitForHydration } from "./fixtures";

test.describe("locale redirect from /", () => {
  test("redirects with a 307 by Accept-Language, keeping the query", async ({ request }) => {
    const ar = await request.get("/?utm_source=ig", { headers: { "accept-language": "ar-BH,ar;q=0.9" }, maxRedirects: 0 });
    expect(ar.status()).toBe(307);
    const location = new URL(ar.headers()["location"], "http://localhost");
    expect(location.pathname).toBe("/ar");
    expect(location.searchParams.get("utm_source")).toBe("ig");

    const fr = await request.get("/", { headers: { "accept-language": "fr;q=0.9, ar;q=0.8" }, maxRedirects: 0 });
    expect(new URL(fr.headers()["location"], "http://localhost").pathname).toBe("/ar");

    const en = await request.get("/", { headers: { "accept-language": "en-US" }, maxRedirects: 0 });
    expect(new URL(en.headers()["location"], "http://localhost").pathname).toBe("/en");
  });

  test.describe("an Arabic browser", () => {
    test.use({ locale: "ar-BH" });

    test("lands on /ar, right to left", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/ar\/?$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    });

    test("is sent to /en when the lang cookie says so", async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "lang", value: "en", url: baseURL ?? "http://localhost:3100" }]);
      await page.goto("/");
      await expect(page).toHaveURL(/\/en\/?$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });

  test.describe("an English browser", () => {
    test.use({ locale: "en-US" });

    test("lands on /en, left to right", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/en\/?$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    });

    test("is sent to /ar when the lang cookie says so", async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "lang", value: "ar", url: baseURL ?? "http://localhost:3100" }]);
      await page.goto("/");
      await expect(page).toHaveURL(/\/ar\/?$/);
    });

    test("the language switch remembers the choice for /", async ({ page, isMobile }) => {
      test.skip(isMobile, "The language switch is in the mobile menu; covered on desktop.");
      await page.goto("/en");
      await waitForHydration(page);
      await page.getByTestId("lang-switch").click();
      await expect(page).toHaveURL(/\/ar(\/|#|$)/);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await page.goto("/");
      await expect(page).toHaveURL(/\/ar\/?$/);
    });
  });
});

test.describe("not found", () => {
  test("an unknown product slug renders the 404 page", async ({ page }) => {
    const response = await page.goto("/en/products/this-piece-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: getDictionary("en").site.notFound.title }),
    ).toBeVisible();
  });

  test("the Arabic 404 is in Arabic", async ({ page }) => {
    const response = await page.goto("/ar/products/this-piece-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { level: 1, name: getDictionary("ar").site.notFound.title }),
    ).toBeVisible();
  });
});

test.describe("crawler files", () => {
  test.skip(({ isMobile }) => isMobile, "Plain HTTP checks; the desktop project covers them.");

  test("sitemap.xml lists every product in both languages", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/xml/);
    const xml = await response.text();
    expect(xml).toContain("/en/products/keycap-clicker");
    expect(xml).toContain("/ar/products/keycap-clicker");
    for (const product of PRODUCTS) {
      for (const locale of ["en", "ar"]) expect(xml).toContain(`/${locale}/products/${product.slug}<`);
    }
  });

  test("robots.txt points at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toMatch(/^Sitemap:\s*\S+\/sitemap\.xml\s*$/im);
    expect(text).toMatch(/User-Agent:\s*\*/i);
  });

  test("manifest.webmanifest has a name", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as { name?: string; short_name?: string; start_url?: string };
    expect(manifest.name).toContain(site.name);
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
  });
});
