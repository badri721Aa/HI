import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useCloseOnBack's history logic (holdLayer and friends) against a small
 * fake of the browser: one document's session history, scroll position and
 * focus. Stepping back lands a task later and, like a same-document step
 * onto an entry with a #fragment, moves the page and drops focus, so the
 * tests can see the hook put both back.
 */

class FakeElement {
  isConnected = true;
  focus = vi.fn(() => {
    doc.activeElement = this;
  });
  closest() {
    return null;
  }
}

interface Entry {
  state: Record<string, unknown> | null;
  url: string;
}

const doc = { body: new FakeElement(), activeElement: null as FakeElement | null };

function fakeBrowser(url: string) {
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  const entries: Entry[] = [{ state: { __NA: true }, url }];
  let index = 0;
  const current = () => new URL(entries[index].url, "https://shop.test");
  const history = {
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    pushState: vi.fn((state: Record<string, unknown>, _: string, next?: string) => {
      entries.splice(index + 1, Infinity, { state: { ...entries[index].state, ...state }, url: next ?? entries[index].url });
      index++;
    }),
    replaceState: vi.fn((state: Record<string, unknown> | null, _: string, next?: string) => {
      entries[index] = { state, url: next ?? entries[index].url };
    }),
    back: vi.fn(() => {
      setTimeout(() => {
        index--;
        win.scrollY = 900;
        doc.activeElement = doc.body;
        win.dispatchEvent(new Event("popstate"));
      });
    }),
  };
  Object.assign(win, {
    history,
    scrollY: 0,
    scrollTo: vi.fn((opts: { top: number }) => {
      win.scrollY = opts.top;
    }),
  });
  Object.defineProperty(win, "location", {
    get: () => {
      const u = current();
      return { pathname: u.pathname, search: u.search, hash: u.hash };
    },
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => setTimeout(() => cb(0)));
  return {
    win,
    history,
    entries,
    get index() {
      return index;
    },
    /** The visitor presses Back. */
    pressBack: () => history.back(),
  };
}

/** Lets microtasks, the back traversal and the next frame run. */
async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r));
}

async function load() {
  vi.resetModules();
  return import("@/lib/hooks/use-close-on-back");
}

describe("closing a layer with its own history entry", () => {
  let trigger: FakeElement;

  beforeEach(() => {
    trigger = new FakeElement();
    doc.activeElement = trigger;
  });

  it("pushes one entry and drops a stale #fragment from the entry below it", async () => {
    const browser = fakeBrowser("/en#collection");
    const { holdLayer } = await load();
    holdLayer(() => {});
    expect(browser.entries.map((e) => e.url)).toEqual(["/en", "/en"]);
    expect(browser.entries[0].state).toEqual({ __NA: true });
    expect(browser.entries[1].state).toMatchObject({ __NA: true, __layer: expect.any(Number) });
    expect(browser.index).toBe(1);
  });

  it("X or Esc steps back over the entry and leaves the page and focus where they were", async () => {
    const browser = fakeBrowser("/en");
    browser.win.scrollY = 1637;
    const { holdLayer } = await load();
    const release = holdLayer(() => {});
    release();
    await settle();
    expect(browser.history.back).toHaveBeenCalledTimes(1);
    expect(browser.index).toBe(0);
    expect(browser.win.scrollY).toBe(1637);
    expect(doc.activeElement).toBe(trigger);
  });

  it("Back closes the layer, and once it has closed the page is put back without a second step", async () => {
    const browser = fakeBrowser("/en");
    browser.win.scrollY = 2101;
    const { holdLayer } = await load();
    const close = vi.fn();
    const release = holdLayer(close);
    browser.pressBack();
    await settle();
    expect(close).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(browser.history.back).toHaveBeenCalledTimes(1);
    expect(browser.index).toBe(0);
    expect(browser.win.scrollY).toBe(2101);
    expect(doc.activeElement).toBe(trigger);
  });

  it("leaves focus alone when the drawer has already put it somewhere", async () => {
    const browser = fakeBrowser("/en");
    const { holdLayer } = await load();
    const release = holdLayer(() => {});
    release();
    const elsewhere = new FakeElement();
    browser.history.back.mockImplementationOnce(() => {
      setTimeout(() => {
        doc.activeElement = elsewhere;
        browser.win.dispatchEvent(new Event("popstate"));
      });
    });
    await settle();
    expect(trigger.focus).not.toHaveBeenCalled();
    expect(doc.activeElement).toBe(elsewhere);
  });

  it("a hand-over in one update (quick view to cart) keeps the one entry", async () => {
    const browser = fakeBrowser("/en");
    const { holdLayer } = await load();
    const releaseQuickView = holdLayer(() => {});
    releaseQuickView();
    const releaseCart = holdLayer(() => {});
    await settle();
    expect(browser.history.pushState).toHaveBeenCalledTimes(1);
    expect(browser.history.back).not.toHaveBeenCalled();
    expect(browser.index).toBe(1);
    releaseCart();
    await settle();
    expect(browser.history.back).toHaveBeenCalledTimes(1);
    expect(browser.index).toBe(0);
  });

  it("releaseBackEntry leaves the entry to the navigation that replaces it", async () => {
    const browser = fakeBrowser("/en");
    browser.win.scrollY = 400;
    const { holdLayer, releaseBackEntry } = await load();
    const release = holdLayer(() => {});
    releaseBackEntry();
    release();
    await settle();
    expect(browser.history.back).not.toHaveBeenCalled();
    expect(browser.index).toBe(1);
    expect(browser.win.scrollTo).not.toHaveBeenCalled();
  });

  it("afterClose runs instead of putting the page back (a link to the page itself)", async () => {
    const browser = fakeBrowser("/en/products/gear-shifter");
    browser.win.scrollY = 1200;
    const { afterClose, holdLayer } = await load();
    const release = holdLayer(() => {});
    const toTop = vi.fn();
    afterClose(toTop);
    release();
    await settle();
    expect(browser.history.back).toHaveBeenCalledTimes(1);
    expect(browser.index).toBe(0);
    expect(toTop).toHaveBeenCalledTimes(1);
    expect(browser.win.scrollTo).not.toHaveBeenCalled();
  });
});
