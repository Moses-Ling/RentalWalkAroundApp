import { describe, it, expect } from "vitest";
import { fitWithin, arrowHead, ellipseFromDrag } from "@/lib/annotate";

describe("annotation helpers", () => {
  it("downscales large images but never upscales", () => {
    expect(fitWithin(4000, 3000, 2000)).toMatchObject({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toMatchObject({ width: 1500, height: 2000 });
    expect(fitWithin(800, 600, 2000)).toMatchObject({ width: 800, height: 600, scale: 1 });
  });

  it("computes arrowhead wings symmetric about the shaft", () => {
    const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, Math.PI / 6);
    expect(l.x).toBeCloseTo(r.x);
    expect(l.y).toBeCloseTo(-r.y);
    expect(l.x).toBeLessThan(100);
  });

  it("computes an ellipse from drag corners in any direction", () => {
    expect(ellipseFromDrag({ x: 10, y: 10 }, { x: 50, y: 30 })).toEqual({ cx: 30, cy: 20, rx: 20, ry: 10 });
    expect(ellipseFromDrag({ x: 50, y: 30 }, { x: 10, y: 10 })).toEqual({ cx: 30, cy: 20, rx: 20, ry: 10 });
  });
});
