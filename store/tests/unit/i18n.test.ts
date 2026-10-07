import { describe, expect, it } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { home } from "@/lib/i18n/messages/home";
import { commerce } from "@/lib/i18n/messages/commerce";
import { siteCopy } from "@/lib/i18n/messages/site";
import { DEFAULT_LOCALE, LOCALES, dirFor, fmt, getDictionary, isLocale } from "@/lib/i18n";

type Tree = string | number | boolean | Tree[] | { [key: string]: Tree };

interface Leaf {
  path: string;
  value: Tree;
}

const NAMESPACES = { common, home, commerce, site: siteCopy } as const;

/** Every leaf (string, number, boolean) with its dotted path; array items use their index. */
function leaves(node: Tree, path = ""): Leaf[] {
  if (Array.isArray(node)) return node.flatMap((item, i) => leaves(item, `${path}[${i}]`));
  if (node !== null && typeof node === "object") {
    return Object.keys(node)
      .sort()
      .flatMap((key) => leaves(node[key], path ? `${path}.${key}` : key));
  }
  return [{ path, value: node }];
}

/** Structural signature: object keys, array lengths and leaf types, not the text. */
function shape(node: Tree): unknown {
  if (Array.isArray(node)) return node.map(shape);
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.keys(node)
        .sort()
        .map((key) => [key, shape(node[key])]),
    );
  }
  return typeof node;
}

const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

const ARABIC = /[\u0600-\u06FF]/;
/** A CLDR plural-category leaf (picked with Intl.PluralRules): "<group>.<category>". */
const PLURAL_FORM = /^(.*)\.(zero|one|two|few|many|other)$/;

describe.each(Object.entries(NAMESPACES))("messages: %s", (_name, messages) => {
  const en = messages.en as unknown as Tree;
  const ar = messages.ar as unknown as Tree;
  const enLeaves = leaves(en);
  const arByPath = new Map(leaves(ar).map((l) => [l.path, l.value]));

  it("has the same keys, nesting and array lengths in English and Arabic", () => {
    expect(shape(ar)).toEqual(shape(en));
  });

  it("uses the same {placeholders} in each translated string", () => {
    for (const { path, value } of enLeaves) {
      if (typeof value !== "string") continue;
      const other = arByPath.get(path);
      expect(typeof other, path).toBe("string");
      const plural = PLURAL_FORM.exec(path);
      if (plural && plural[2] !== "other") {
        // Plural forms may spell the number out (Arabic dual "قطعتان" has no {n}),
        // but may only use placeholders the English forms of the group provide.
        const group = enLeaves
          .filter((l) => l.path.startsWith(`${plural[1]}.`) && typeof l.value === "string")
          .flatMap((l) => placeholders(l.value as string));
        for (const name of placeholders(other as string)) expect(group, path).toContain(name);
        continue;
      }
      expect(placeholders(other as string), path).toEqual(placeholders(value));
    }
  });

  it("has no empty or whitespace-only strings", () => {
    for (const [locale, tree] of [
      ["en", en],
      ["ar", ar],
    ] as const) {
      for (const { path, value } of leaves(tree)) {
        if (typeof value === "string") expect(value.trim(), `${locale}.${path}`).not.toBe("");
      }
    }
  });

  it("has no unbalanced braces or leftover template syntax", () => {
    for (const tree of [en, ar]) {
      for (const { path, value } of leaves(tree)) {
        if (typeof value !== "string") continue;
        expect(value, path).not.toMatch(/\$\{|\{\{|\}\}|undefined|TODO|lorem/i);
        expect((value.match(/\{/g) ?? []).length, path).toBe((value.match(/\}/g) ?? []).length);
      }
    }
  });

  it("is actually translated: Arabic strings with letters contain Arabic", () => {
    const untranslated = leaves(ar).filter(
      ({ value }) => typeof value === "string" && /[A-Za-z]{4,}/.test(value) && !ARABIC.test(value),
    );
    // Pure data (brand names, material codes, numbers) may stay Latin; prose may not.
    for (const { path, value } of untranslated) {
      expect((value as string).split(/\s+/).length, `ar.${path} looks untranslated: "${value}"`).toBeLessThanOrEqual(2);
    }
  });

  it("uses no emoji", () => {
    for (const tree of [en, ar]) {
      for (const { path, value } of leaves(tree)) {
        if (typeof value === "string") expect(value, path).not.toMatch(/\p{Emoji_Presentation}|\uFE0F/u);
      }
    }
  });
});

describe("getDictionary", () => {
  it("returns every namespace for each locale", () => {
    for (const locale of LOCALES) {
      const t = getDictionary(locale);
      expect(Object.keys(t).sort()).toEqual(["commerce", "common", "home", "site"]);
      expect(t.common).toBe(common[locale]);
      expect(t.site).toBe(siteCopy[locale]);
    }
  });
});

describe("i18n helpers", () => {
  it("recognises the supported locales only", () => {
    expect(LOCALES).toEqual(["en", "ar"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    for (const value of ["fr", "EN", "ar-BH", "", null, undefined]) expect(isLocale(value)).toBe(false);
  });

  it("maps Arabic to rtl and English to ltr", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });

  it("fills {placeholders} and leaves unknown ones in place", () => {
    expect(fmt("Only {n} left", { n: 3 })).toBe("Only 3 left");
    expect(fmt("{min}–{max} days", { min: 2, max: 4 })).toBe("2–4 days");
    expect(fmt("{a}{a}", { a: "x" })).toBe("xx");
    expect(fmt("Hi {name}", {})).toBe("Hi {name}");
    expect(fmt("متبقي {n} فقط", { n: 0 })).toBe("متبقي 0 فقط");
  });
});
