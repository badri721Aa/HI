/**
 * A value given directly, or read every frame from a source (scroll- or
 * timeline-driven values that must not re-render React).
 */
export type Live<T> = T | { get(): T };

export function readLive<T>(v: Live<T>): T {
  return typeof v === "object" && v !== null && "get" in v && typeof v.get === "function" ? v.get() : (v as T);
}
