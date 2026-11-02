// The Matter engine, collision layers, surfaces, and body factories.

import { BALL, DEBUG, PALETTE, PHYSICS } from './config.js';

const { Engine, Bodies, Body, Composite, Sleeping } = Matter;

export const engine = Engine.create();
engine.gravity.y = PHYSICS.gravity;
engine.enableSleeping = true;
engine.positionIterations = PHYSICS.positionIterations;
engine.velocityIterations = PHYSICS.velocityIterations;

export const STEP_S = 1 / PHYSICS.hz;
export const GRAVITY = engine.gravity.y * engine.gravity.scale * 1e6; // px/s²

export const KIND = { PLAY: 'play', BOX: 'box', SPILL: 'spill', PIN: 'pin' };

// Field and deck never touch: refills fall through the playfield.
const CAT = { FIELD: 0x1, DECK: 0x2, PLAY: 0x4, STOCK: 0x8 };

export const FILTER = {
  field: { category: CAT.FIELD, mask: CAT.PLAY },
  deck: { category: CAT.DECK, mask: CAT.STOCK },
  play: { category: CAT.PLAY, mask: CAT.FIELD | CAT.PLAY },
  stock: { category: CAT.STOCK, mask: CAT.DECK | CAT.STOCK },
  ghost: { category: CAT.STOCK, mask: 0 }
};

// Matter resolves a contact with the lower friction but the higher
// frictionStatic and slop, so a slippery contact needs both sides slippery.
export const SURFACE = {
  rail: { friction: 0.005, frictionStatic: 0, slop: 0.01 },
  box: { friction: 0, frictionStatic: 0 },
  pin: { friction: 0.02, frictionStatic: 0, restitution: 0.95, slop: 0.01 }
};

const BALL_SPEC = {
  [KIND.PLAY]: { sides: 48, restitution: 0.55, friction: 0.02, frictionAir: 0.0001, filter: FILTER.play },
  [KIND.BOX]: { sides: 10, restitution: 0.45, friction: 0, frictionAir: 0.001, filter: FILTER.stock },
  [KIND.SPILL]: { sides: 10, restitution: 0.45, friction: 0.02, frictionAir: 0.001, filter: FILTER.ghost }
};

export function pin(x, y, r) {
  return Bodies.circle(x, y, r, {
    label: KIND.PIN,
    isStatic: true,
    ...SURFACE.pin,
    collisionFilter: FILTER.field,
    plugin: {},
    render: { fillStyle: PALETTE.pin }
  });
}

export function wall(x, y, w, h, angle, surface, filter) {
  return Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    angle,
    friction: 0.02,
    frictionStatic: 0.5,
    slop: 0.05,
    restitution: 0.1,
    ...surface,
    collisionFilter: filter,
    render: { fillStyle: PALETTE.wall }
  });
}

// Matter builds circles as polygons; balls in play get enough sides that their
// facets are finer than the rail's. Outside the hitbox view, only balls in play
// are drawn by Matter; the rest are painted by the view.
export function ball(kind, x, y) {
  const spec = BALL_SPEC[kind];
  return Bodies.polygon(x, y, spec.sides, BALL.r, {
    label: kind,
    circleRadius: BALL.r,
    density: BALL.density,
    restitution: spec.restitution,
    friction: spec.friction,
    frictionStatic: 0,
    frictionAir: spec.frictionAir,
    slop: 0.01,
    sleepThreshold: spec.sleepThreshold ?? 60,
    collisionFilter: { ...spec.filter },
    plugin: {},
    render: { fillStyle: PALETTE.ball, visible: DEBUG.hitboxes || kind === KIND.PLAY }
  });
}

// Matter's velocity unit is px per 1/60 s whatever the step size.
export function setVelocity(body, vx, vy) {
  Body.setVelocity(body, { x: vx / 60, y: vy / 60 });
}

export const add = (...bodies) => Composite.add(engine.world, bodies.flat());
export const remove = (body) => Composite.remove(engine.world, body);
export const allBodies = () => Composite.allBodies(engine.world);
export const ballsOf = (...kinds) => allBodies().filter((b) => kinds.includes(b.label));

export function isClear(x, y, reach) {
  return !allBodies().some(
    (b) => !b.isStatic && Math.hypot(b.position.x - x, b.position.y - y) < reach
  );
}

// Removing a body does not wake whatever was resting on it.
export function wake(bodies) {
  for (const b of bodies) Sleeping.set(b, false);
}
