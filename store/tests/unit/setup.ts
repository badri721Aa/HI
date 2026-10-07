import { beforeEach } from "vitest";

/**
 * In-memory Web Storage for the Node test environment. The cart and prefs
 * stores persist through `createJSONStorage(() => localStorage)`, so they need
 * a real Storage shape (getItem returns null for missing keys, values are
 * strings, length/key() work).
 */
class MemoryStorage implements Storage {
  #items = new Map<string, string>();

  get length(): number {
    return this.#items.size;
  }

  clear(): void {
    this.#items.clear();
  }

  getItem(key: string): string | null {
    return this.#items.has(key) ? (this.#items.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, String(value));
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
