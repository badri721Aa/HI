/*
 * Mashrabiya lattice, shared by the lamp shader (materials.ts) and the SVG
 * silhouette generator. Pure math, no three.js.
 *
 * One tile is a square cell (in tile units, centred at 0) holding:
 * - an eight-point star: the union of an axis-aligned square and the same
 *   square rotated 45°, each with half-size STAR_HALF. Its points reach
 *   STAR_HALF·√2 = 0.40 of a tile from the centre, so neighbouring stars
 *   keep a solid bar of 0.20 tile between their points;
 * - a small square at every tile corner (half-size CORNER_HALF), which
 *   turns the solid between four stars into the cross-and-bar web that
 *   reads as mashrabiya woodwork.
 *
 * At the lamp's tile size (≈31 mm on the table size, ≈40 mm on the large)
 * the narrowest bar is ≈0.13 tile ≈ 4 mm, comfortably above the 2.5 mm
 * minimum for a clean FDM print and for legibility on screen.
 */

export const STAR_HALF = 0.2828; // 0.40 / √2
export const CORNER_HALF = 0.085;

/** Around the shade: integer, so the lattice closes with no seam at u = 0/1. */
export const LAMP_TILES_AROUND = 14;

/**
 * Signed distance (tile units) to the lattice. Positive = solid material,
 * negative = open (hole). `cx`, `cy` are tile coordinates; `rows` is the
 * number of complete tile rows (corner squares are only cut between rows,
 * never on the solid bands above and below the lattice).
 */
export function latticeSdf(cx: number, cy: number, rows: number): number {
  if (cy < 0 || cy > rows) {
    // Outside the band: solid, distance to the band edge.
    return cy < 0 ? -cy : cy - rows;
  }
  const fx = cx - Math.floor(cx) - 0.5;
  const fy = cy - Math.floor(cy) - 0.5;
  const ax = Math.abs(fx);
  const ay = Math.abs(fy);
  const square = Math.max(ax, ay) - STAR_HALF;
  const diamond = (ax + ay) * Math.SQRT1_2 - STAR_HALF;
  const star = Math.min(square, diamond);
  // Corner squares sit on the lattice of tile corners (offset by half a tile).
  const kx = cx - Math.round(cx);
  const ky = cy - Math.round(cy);
  const cornerRow = Math.round(cy);
  let corner = Math.max(Math.abs(kx), Math.abs(ky)) - CORNER_HALF;
  if (cornerRow <= 0 || cornerRow >= rows) corner = 1;
  return Math.min(star, corner);
}
