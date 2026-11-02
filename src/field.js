// The playfield: the rail, the drain, the pins and the jackpot cup.

import { BALL, DEBUG, DRAIN, ELLIPSE, JACKPOT, PALETTE, PINS, RAIL } from './config.js';
import { outward, rad, railPoint } from './geometry.js';
import { FILTER, SURFACE, add, pin, wall } from './world.js';

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

// Inside the rail by at least `clear`, measured on the ellipse's own scale.
function insideField(x, y, clear) {
  const u = (x - ELLIPSE.x) / (ELLIPSE.a - clear);
  const v = (y - ELLIPSE.y) / (ELLIPSE.b - clear);
  return u * u + v * v <= 1;
}

function pinGrid() {
  const pins = [];
  const clear = PINS.railClear + PINS.r + RAIL.thickness / 2;

  for (let row = 0, y = PINS.top; y < ELLIPSE.y + ELLIPSE.b; row++, y += PINS.rowGap) {
    const shift = row % 2 ? PINS.pitch / 2 : 0;
    for (let x = ELLIPSE.x + shift - PINS.pitch * 4; x < ELLIPSE.x + ELLIPSE.a; x += PINS.pitch) {
      const nearCup = Math.hypot(x - JACKPOT.x, y - JACKPOT.y) < PINS.cupClear;
      if (insideField(x, y, clear) && !nearCup) pins.push(pin(x, y, PINS.r));
    }
  }
  return pins;
}

// Two posts with an open bottom. A ball whose centre drops below the rim
// between them has gone in.
const CUP = { half: JACKPOT.mouth / 2, floor: JACKPOT.y + JACKPOT.depth };

export const isInJackpot = ({ x, y }) =>
  Math.abs(x - JACKPOT.x) < CUP.half && y > JACKPOT.y + BALL.r && y < CUP.floor;

function cup() {
  const off = CUP.half + JACKPOT.wall / 2;
  const y = JACKPOT.y + JACKPOT.depth / 2;
  return [-off, off].map((dx) => {
    const post = wall(JACKPOT.x + dx, y, JACKPOT.wall, JACKPOT.depth, 0, SURFACE.pin, FILTER.field);
    post.render.fillStyle = PALETTE.cup;
    return post;
  });
}

export function buildField() {
  add(railSlabs(), pinGrid(), cup());
}
