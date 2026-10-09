import { describe, expect, it } from "vitest";
import { HOT_RAMP, hotRamp } from "@/components/3d/materials";

describe("hotRamp", () => {
  it("starts dark, ends at full strength and stays there", () => {
    expect(hotRamp(0)).toBe(0);
    expect(hotRamp(-1)).toBe(0);
    expect(hotRamp(HOT_RAMP)).toBe(1);
    expect(hotRamp(HOT_RAMP * 10)).toBe(1);
  });

  it("rises smoothly in between", () => {
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = hotRamp((HOT_RAMP * i) / 20);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(hotRamp(HOT_RAMP / 2)).toBeCloseTo(0.5, 6);
  });

  it("keeps the solid floor of a piece (its first 2 mm) dim", () => {
    // 1 model unit = 100 mm; the hot band is 1.5 mm, so a 2 mm floor sits in it until about 3.5 mm.
    expect(hotRamp(0.02)).toBeLessThan(0.2);
    expect(hotRamp(0.035)).toBeLessThan(0.5);
  });
});
