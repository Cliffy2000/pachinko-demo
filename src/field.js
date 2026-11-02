// The playfield: the rail and the drain. Pins will live here.

import { BALL, DEBUG, DRAIN, ELLIPSE, RAIL } from './config.js';
import { outward, rad, railPoint } from './geometry.js';
import { FILTER, SURFACE, add, wall } from './world.js';

const drainT = (((DRAIN.bearing - RAIL.head) % 360) + 360) % 360;
export const DRAIN_GAP = { from: drainT - DRAIN.span / 2, to: drainT + DRAIN.span / 2 };

const holeReach = (ELLIPSE.a * rad(DRAIN.span)) / 2 + BALL.r;
export const isOverDrain = (x) => Math.abs(x - ELLIPSE.x) < holeReach;

// The rail as overlapping chord slabs. Each runs a ball's reach past its chord,
// so a ball near a joint is always well inside some slab; otherwise SAT can
// resolve it against an end face and push it along the rail.
function railSlabs() {
  const slabs = [];
  const grow = (RAIL.hitThickness - RAIL.thickness) / 2;
  let prev = railPoint(0);

  for (let t = RAIL.segment; t <= RAIL.end; t += RAIL.segment) {
    const p = railPoint(t);
    const inGap = t > DRAIN_GAP.from && t - RAIL.segment < DRAIN_GAP.to;

    if (!inGap) {
      const mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
      const out = outward(mid);
      const length = Math.hypot(p.x - prev.x, p.y - prev.y) + BALL.r * 2 + RAIL.hitThickness;
      const angle = Math.atan2(p.y - prev.y, p.x - prev.x);

      const slab = wall(
        mid.x + out.x * grow,
        mid.y + out.y * grow,
        length,
        RAIL.hitThickness,
        angle,
        SURFACE.rail,
        FILTER.field
      );
      slab.render.visible = DEBUG.hitboxes;
      slabs.push(slab);
    }
    prev = p;
  }
  return slabs;
}

export function buildField() {
  add(railSlabs());
}
