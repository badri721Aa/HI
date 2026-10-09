import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SplitText } from "@/components/motion/split-text";
import { getDictionary } from "@/lib/i18n";

/** Server HTML of the component, without the shared keyframes <style>. */
function render(text: string, as: "span" | "h2" = "span"): string {
  return renderToStaticMarkup(createElement(SplitText, { text, as })).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

/** What a crawler or a screen reader's name computation reads: text nodes, whitespace collapsed. */
function readText(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("SplitText", () => {
  it("keeps the words as the only, readable copy of the text (no aria-label or hidden copy)", () => {
    const html = render("Objects, printed layer by layer.");
    expect(html).not.toContain("aria-label");
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("sr-only");
    expect(readText(html)).toBe("Objects, printed layer by layer.");
    expect(html.match(/class="lu-word"/g)).toHaveLength(5);
  });

  it("separates the words either side of a line break", () => {
    const html = render("Objects,\nprinted layer");
    expect(html).toContain("<br/>");
    expect(readText(html)).toBe("Objects, printed layer");
  });

  it("reads mixed Arabic and Latin lines once, in order, with spaces between runs", () => {
    const html = render("طباعة PLA Silk بدقة");
    expect(readText(html)).toBe("طباعة PLA Silk بدقة");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('dir="rtl"');
  });

  it("reads every hero title line in both languages", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const line of getDictionary(locale).home.hero.titleLines) {
        expect(readText(render(line, "h2"))).toBe(line.replace(/\s+/g, " ").trim());
      }
    }
  });
});
