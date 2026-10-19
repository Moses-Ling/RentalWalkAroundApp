export type Pt = { x: number; y: number };

/** Scale dimensions down to fit within `max` on the longest side (never upscales). */
export function fitWithin(w: number, h: number, max = 2000) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
}

/** Two wing endpoints for an arrowhead at `to`, pointing away from `from`. */
export function arrowHead(from: Pt, to: Pt, size = 18, spread = Math.PI / 7): [Pt, Pt] {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return [
    { x: to.x - size * Math.cos(a - spread), y: to.y - size * Math.sin(a - spread) },
    { x: to.x - size * Math.cos(a + spread), y: to.y - size * Math.sin(a + spread) },
  ];
}

/** Center and radii of an ellipse inscribed in the drag rectangle. */
export function ellipseFromDrag(a: Pt, b: Pt) {
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 };
}
