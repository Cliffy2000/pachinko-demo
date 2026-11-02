// Pure geometry of the field boundary and launch rail. No physics in here.

import { BALL, ELLIPSE, RAIL } from './config.js';

export const rad = (deg) => (deg * Math.PI) / 180;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (u) => u * u * (3 - 2 * u);

// Point at bearing `deg` on the base ellipse with both semi-axes grown by
// `lift`. Bearings run anticlockwise from east; canvas y points down.
export function ellipsePoint(deg, lift = 0) {
  const a = ELLIPSE.a + lift;
  const b = ELLIPSE.b + lift;
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const r = (a * b) / Math.hypot(b * c, a * s);
  return { x: ELLIPSE.x + r * c, y: ELLIPSE.y - r * s };
}

// Unit vector from the ellipse centre through `p`.
export function outward(p) {
  const dx = p.x - ELLIPSE.x;
  const dy = p.y - ELLIPSE.y;
  const n = Math.hypot(dx, dy);
  return { x: dx / n, y: dy / n };
}

// Offset of the rail from the base ellipse at sweep `t`. Each stage meets the
// next with zero slope, so the rail has no corners.
export function railLift(t) {
  const { liftFrom, liftTo, mouthFrom, mouthTo, pitch } = RAIL;

  if (t <= liftFrom) {
    return t < RAIL.dipTo ? -RAIL.innerDip * Math.sin((Math.PI * t) / RAIL.dipTo) ** 2 : 0;
  }
  if (t <= liftTo) return pitch * smoothstep((t - liftFrom) / (liftTo - liftFrom));
  if (t <= mouthFrom) return pitch;
  return pitch + RAIL.mouthDrop * smoothstep((t - mouthFrom) / (mouthTo - mouthFrom));
}

export const railPoint = (t) => ellipsePoint(RAIL.head + t, railLift(t));

// Centre of a ball riding the inner face of the outer winding.
export const ridePoint = (t) =>
  ellipsePoint(RAIL.head + t, railLift(t) - RAIL.thickness / 2 - BALL.r);

// Direction of travel along the ride (decreasing t) and arc length per degree.
export function rideFrame(t) {
  const a = ridePoint(t - 0.5);
  const b = ridePoint(t + 0.5);
  const len = Math.hypot(a.x - b.x, a.y - b.y);
  return { tx: (a.x - b.x) / len, ty: (a.y - b.y) / len, arcPerDeg: len };
}

// Radius of curvature of the ride path: circumradius of three nearby points.
export function rideRadius(t) {
  const a = ridePoint(t - 1);
  const b = ridePoint(t);
  const c = ridePoint(t + 1);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  const sides =
    Math.hypot(b.x - a.x, b.y - a.y) *
    Math.hypot(c.x - b.x, c.y - b.y) *
    Math.hypot(a.x - c.x, a.y - c.y);
  return sides / (4 * area);
}
