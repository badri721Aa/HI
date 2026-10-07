/* Small timing helpers for the scenes. Pure functions, no allocation. */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 0 → 1 as x goes from a to b (clamped, linear). */
export const range = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));

export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => {
  const x = clamp01(t);
  return x * x * x;
};
export const easeOutExpo = (t: number) => {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
};

/** Smooth 0 → 1 → 0 window: rises over [a, b], holds, falls over [c, d]. */
export const window4 = (x: number, a: number, b: number, c: number, d: number) => {
  const up = range(x, a, b);
  const down = 1 - range(x, c, d);
  const s = Math.min(up, down);
  return s * s * (3 - 2 * s);
};

/** Frame-rate independent exponential approach: current → target with time constant tau (s). */
export const damp = (current: number, target: number, tau: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau));
