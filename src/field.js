// The playfield: the rail, the drain, the pins, the lucky slot and the cash knobs.

import { BALL, DEBUG, DRAIN, ELLIPSE, LUCKY, KNOBS, PALETTE, PINS, RAIL, WINDOW } from './config.js';
import { outward, rad, railPoint } from './geometry.js';
import { FILTER, KIND, SURFACE, add, ballsOf, pin, wall } from './world.js';

// The drain is at the bottom, where the rail's radius is the ellipse's b.
const drainT = (((DRAIN.bearing - RAIL.head) % 360) + 360) % 360;
const pxPerDeg = ELLIPSE.b * rad(1);
export const DRAIN_GAP = {
  from: drainT + (DRAIN.trimLeft - DRAIN.width / 2) / pxPerDeg,
  to: drainT + DRAIN.width / 2 / pxPerDeg
};

const holeReach = DRAIN.width / 2 + BALL.r;
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

const KNOB_SPOTS = [-KNOBS.dx, KNOBS.dx].map((dx) => ({ x: ELLIPSE.x + dx, y: KNOBS.y }));

function pinLayout() {
  const clear = PINS.railClear + BALL.r * 2 + PINS.r + RAIL.thickness / 2;

  return Object.values(PINS.layout)
    .flat()
    .flatMap(([dx, dy]) => (dx === 0 ? [[0, dy]] : [[dx, dy], [-dx, dy]]))
    .map(([dx, dy]) => ({ x: ELLIPSE.x + dx, y: WINDOW.y + dy }))
    .filter((p) => insideField(p.x, p.y, clear))
    .map((p) => pin(p.x, p.y, PINS.r));
}

function knobs() {
  return KNOB_SPOTS.map((k) => {
    const knob = pin(k.x, k.y, KNOBS.r, KIND.KNOB);
    knob.render.fillStyle = PALETTE.cash;
    return knob;
  });
}

// Sealed sides and floor, open only at the top. A ball whose centre drops
// below the rim between the walls has gone in.
const CUP = { half: LUCKY.mouth / 2, floor: LUCKY.y + LUCKY.depth };

export const isInLuckySlot = ({ x, y }) =>
  Math.abs(x - LUCKY.x) < CUP.half && y > LUCKY.y + BALL.r && y < CUP.floor;

function cup() {
  const piece = (x, y, w, h) => {
    const body = wall(x, y, w, h, 0, SURFACE.pin, FILTER.field);
    body.render.fillStyle = PALETTE.cup;
    return body;
  };
  const off = CUP.half + LUCKY.wall / 2;
  const sideY = LUCKY.y + LUCKY.depth / 2;
  const outer = LUCKY.mouth + LUCKY.wall * 2;

  return [
    piece(LUCKY.x - off, sideY, LUCKY.wall, LUCKY.depth),
    piece(LUCKY.x + off, sideY, LUCKY.wall, LUCKY.depth),
    piece(LUCKY.x, CUP.floor + LUCKY.floor / 2, outer, LUCKY.floor)
  ];
}

export function buildField() {
  add(railSlabs(), pinLayout(), cup(), knobs());
}

// Pin and knob colours for a bonus style, or the normal look for null.
export function paintField(style) {
  for (const p of ballsOf(KIND.PIN)) p.render.fillStyle = style ? style.pinColour : PALETTE.pin;
  for (const k of ballsOf(KIND.KNOB)) k.render.fillStyle = style ? style.knobColour : PALETTE.cash;
}
