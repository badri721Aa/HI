import { describe, expect, it, vi } from "vitest";
import { cursorModeAt } from "@/components/motion/cursor";

/**
 * The cursor ring's choice of state. A tiny fake DOM: each node knows what
 * the ring's selectors would match on it (text entry, interactive, tagged
 * with data-cursor), its parent, its own boxes, and whether its ::after is
 * absolutely positioned (a stretched link).
 */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

class Node {
  parent: Node | null = null;
  dataset: Record<string, string> = {};
  constructor(
    readonly is: { text?: boolean; interactive?: boolean; cursor?: string; stretched?: boolean } = {},
    readonly rects: Rect[] = [],
  ) {
    if (is.cursor) this.dataset.cursor = is.cursor;
  }
  child(node: Node) {
    node.parent = this;
    return node;
  }
  matches(selector: string) {
    if (selector === "[data-cursor]") return this.is.cursor !== undefined;
    if (selector.includes("textarea")) return !!this.is.text;
    if (selector.includes("a[href]")) return !!this.is.interactive;
    throw new Error(`unexpected selector ${selector}`);
  }
  closest(selector: string): Node | null {
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) ?? null;
  }
  contains(other: Node) {
    for (let n: Node | null = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  getClientRects() {
    return this.rects;
  }
}

const at = (node: Node, x = 0, y = 0) => {
  vi.stubGlobal("getComputedStyle", (el: Node) => ({ position: el.is.stretched ? "absolute" : "static" }));
  return cursorModeAt(node as unknown as Element, x, y);
};

/** A collection card: the photo well (tagged, with the eye button) and the title link stretched over the card. */
function card() {
  const article = new Node();
  const well = article.child(new Node({ cursor: "view" }));
  const eye = well.child(new Node({ interactive: true }));
  const icon = eye.child(new Node());
  const title = article.child(
    new Node({ interactive: true, cursor: "view", stretched: true }, [{ left: 20, top: 500, right: 140, bottom: 522 }]),
  );
  return { well, eye, icon, title };
}

describe("cursorModeAt", () => {
  it("labels the photo of a card (the stretched title link's overlay)", () => {
    expect(at(card().title, 100, 200)).toEqual({ mode: "label", key: "view", byPoint: true });
  });

  it("is a plain link over the title's own text, so the label never covers the name", () => {
    expect(at(card().title, 60, 510)).toEqual({ mode: "link", byPoint: true });
  });

  it("is a plain link over a button inside the labelled area (the quick-view eye)", () => {
    const { eye, icon } = card();
    expect(at(eye)).toEqual({ mode: "link", byPoint: false });
    expect(at(icon)).toEqual({ mode: "link", byPoint: false });
  });

  it("keeps the label over a tagged area that isn't a link, and over a tagged link with no overlay", () => {
    const area = new Node({ cursor: "drag" });
    expect(at(area.child(new Node()))).toEqual({ mode: "label", key: "drag", byPoint: false });
    const link = new Node({ interactive: true, cursor: "open" }, [{ left: 0, top: 0, right: 100, bottom: 20 }]);
    expect(at(link, 10, 10)).toEqual({ mode: "label", key: "open", byPoint: false });
  });

  it("hides over text fields, shrinks over links and rests elsewhere", () => {
    const form = new Node();
    expect(at(form.child(new Node({ text: true })))).toMatchObject({ mode: "hidden" });
    expect(at(new Node({ interactive: true }))).toMatchObject({ mode: "link" });
    expect(at(new Node())).toMatchObject({ mode: "rest" });
  });
});
