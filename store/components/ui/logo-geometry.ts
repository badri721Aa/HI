/**
 * The Layer Up mark, in a 24-unit box: printed layers stacked into a stepped
 * point (each narrower than the one below, so the stack reads as "up"), the
 * newest one on top in the accent colour, like the hot layer the nozzle just
 * laid down. Plain data so the React logo, the favicon and the Open Graph
 * cards all draw the same shape.
 */
export const MARK_BOX = 24;

export interface MarkBar {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bottom to top. */
export const MARK_STACK: readonly MarkBar[] = [
  { x: 2.5, y: 18, w: 19, h: 3 },
  { x: 4.5, y: 13.25, w: 15, h: 3 },
  { x: 6.5, y: 8.5, w: 11, h: 3 },
];

/** The newest layer, on top of the point. */
export const MARK_TOP: MarkBar = { x: 8.5, y: 3.75, w: 7, h: 3 };

export const MARK_RADIUS = 1.5;
