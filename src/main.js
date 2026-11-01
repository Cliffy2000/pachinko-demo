/* Barebones pachinko: square cabinet, circular field, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

// The cabinet sits inside the canvas with a margin all round. That margin is
// outside the machine, where overflow falls until a catcher exists.
const MARGIN_TOP = 10;
const MARGIN_SIDE = 50;
const MARGIN_BOTTOM = 25;
const CAB_W = 600;
const CAB_H = 865;                           // reclaimed from the top and bottom margins
const WIDTH = CAB_W + MARGIN_SIDE * 2;
const HEIGHT = MARGIN_TOP + CAB_H + MARGIN_BOTTOM;
const OX = MARGIN_SIDE;
const OY = MARGIN_TOP;

const BOX = 600;                             // the square glass box on top
const WALL = 20;
const BALL_R = 8.4;
const PITCH = BALL_R * 2 + 1;                // centre spacing of packed balls
const ROW = PITCH * 0.866;                   // row spacing of a hex pack

// Circular playfield inscribed in the square box.
const CX = OX + BOX / 2;
const CY = OY + BOX / 2;
const R = BOX / 2 - WALL;                    // inner face of the circular wall

// The launch channel runs up the inside of the left wall, roughly 7 through to
// 10 on a clock face, so a ball fired into it travels clockwise. Its lower end
// is capped, which is what lets a weak shot come back instead of draining.
const RAIL_GAP = 28;                         // clear width of the channel
const RAIL_T = 8;
const RAIL_FROM = -105;                      // degrees; capped end, below the seat
const RAIL_TO = -210;                        // degrees; 10 on the clock, into the field
const LAUNCH_DEG = -122;                     // degrees; 7 on the clock, where a ball sits

// A shot that stalls slides back into the capped pocket and goes to the tray.
// Only the hole at the bottom centre of the circle loses a ball.
const RETURN_LO = -118;
const RETURN_HI = -95;
const DRAIN_W = 110;
const DRAIN_H = 26;
const DRAIN_TOP = CY + R - DRAIN_H;

const MIN_POWER = 11;
const MAX_POWER = 19;

// The deck, cut horizontally. Storage on top, firing tray below it. The two are
// not connected: nothing moves between them on its own.
const PLATE = 8;                             // thickness of a box wall or floor
const STORE = { x: OX + 28, y: OY + 652, w: 384, h: 110 };   // interior
const STORE_WALLS = 0.64;                    // side walls run short, so the pile spills
const STORE_WALL_ADD = 10;
const STORE_RIM = STORE.y + STORE.h - (STORE.h * STORE_WALLS + STORE_WALL_ADD);
const STORE_FLOOR = PLATE + 20;              // thick, so a fast payout cannot tunnel it
const TRAY = { x: OX + 216, y: OY + 797, w: 190, h: 30 };    // interior, shallow end
const TRAY_CAP = 25;
const TRAY_DROP = 30;                        // how far the tray floor falls to the right
const PAYOUT = 50;                           // stand-in for a jackpot, until there is one

// Deck and field are separate collision worlds. Payout balls are dropped from
// high above the deck, which means falling straight through the playfield, so
// they must not see the circle wall and the balls in it must not see them.
const CAT_FIELD = 0x0001;
const CAT_DECK = 0x0002;
const CAT_PLAY = 0x0004;
const CAT_STOCK = 0x0008;
const FIELD_FILTER = { category: CAT_FIELD, mask: CAT_PLAY };
const DECK_FILTER = { category: CAT_DECK, mask: CAT_STOCK };
const STOCK_FILTER = { category: CAT_STOCK, mask: CAT_DECK | CAT_STOCK };
const PLAY_FILTER = { category: CAT_PLAY, mask: CAT_FIELD | CAT_PLAY };

// The tray has to keep feeding itself towards the lever. Its floor and balls
// are frictionless: Matter takes the lower friction of a contact pair but the
// HIGHER static friction, so both sides have to be slackened or nothing moves.
// Even then a nine degree slope is inside the solver's resting tolerance, so
// tray balls also get a constant push down-slope. Set TRAY_PUSH to 0 to see
// what the geometry does on its own.
const SLICK = { friction: 0, frictionStatic: 0, filter: DECK_FILTER };
const TRAY_PUSH = 0.000225;                  // added acceleration, towards the lever
const CHUTE_LIFT = 210;                      // payouts fall from above the glass box
const DECK_TOP = OY + BOX;                   // payouts stay hidden until they clear this

// Storage balls are near frictionless too, for a different reason: a pile with
// grip holds an angle of repose, so a ball landing on top has no slope to run
// down and never reaches a side wall. A slick pile levels itself and spills off
// the edges, which is what side overflow needs.
const BEARINGS = { friction: 0.001, frictionStatic: 0, filter: DECK_FILTER };
const GRIP = { tray: SLICK, store: BEARINGS };
const PLAY_GRIP = { friction: 0.02, frictionStatic: 0.05 };

// Height at which the storage box is considered full: one ball above the rim,
// so a small pile stands proud before anything leaves. A ball can roll off a
// side wall from roughly here too, so the two routes out compete rather than
// running in sequence.
const SPILL_LINE = STORE_RIM - BALL_R * 2;
const SPILL_DELAY = 25;                      // steps above the line before it falls out front

// Lever: pivots on its left end, swings down, fires on release.
const LEVER_X = OX + 444;
const LEVER_Y = OY + 746;
const LEVER_LEN = 108;
const LEVER_MAX = 40;                        // degrees of travel
const PULL_PX = 160;                         // drag distance for a full pull
const GRAB_R = 36;

// Angles are measured the maths way: 0 is right, 90 is straight up. Canvas y
// runs the other way, so every conversion flips it.
const rad = (deg) => (deg * Math.PI) / 180;
const atAngle = (r, deg) => ({ x: CX + r * Math.cos(rad(deg)), y: CY - r * Math.sin(rad(deg)) });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const state = { drained: 0 };
const lever = { pull: 0, dragging: false, fromY: 0, fromPull: 0 };
const counts = { tray: 0, store: 0, play: 0 };
const feed = { tray: 0, store: 0 };

const engine = Engine.create();
engine.gravity.y = 1;
engine.enableSleeping = true;                // a settled storage pile costs nothing

// Matter lets bodies sink into each other by `slop` and only pushes them apart
// over several passes. A deep pile compounds both, so the pack ends up tighter
// than the balls really are. More passes, less slop, less visible overlap.
engine.positionIterations = 12;
engine.velocityIterations = 8;

const canvas = document.getElementById('field');
const render = Render.create({
  canvas,
  engine,
  options: {
    width: WIDTH,
    height: HEIGHT,
    wireframes: false,
    background: 'transparent'
  }
});

function slab(x, y, w, h, angle = 0, grip = {}) {
  return Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    angle,
    friction: grip.friction ?? 0.02,
    frictionStatic: grip.frictionStatic ?? 0.5,
    restitution: 0.1,
    collisionFilter: grip.filter ?? FIELD_FILTER,
    render: { fillStyle: '#2d3a4b' }
  });
}

// A curve approximated by short slabs laid tangent to a circle about the field
// centre. Slab centres sit on `r`, so the faces land a half-thickness either side.
function arc(r, fromDeg, toDeg, segments, thickness) {
  const step = (toDeg - fromDeg) / segments;
  const segLen = Math.abs(rad(step)) * r + thickness;
  const pieces = [];

  for (let i = 0; i < segments; i++) {
    const deg = fromDeg + step * (i + 0.5);
    const p = atAngle(r, deg);
    pieces.push(slab(p.x, p.y, segLen, thickness, Math.PI / 2 - rad(deg)));
  }
  return pieces;
}

// Closes the bottom of the channel so a stalled ball collects instead of
// spilling into the field. Laid along the radius, not across it.
function railCap() {
  const p = atAngle(R - RAIL_GAP / 2, RAIL_FROM);
  return slab(p.x, p.y, RAIL_GAP + RAIL_T, RAIL_T, -rad(RAIL_FROM));
}

// Open-topped container: a floor plus two side walls, each wall running from
// its own end of the floor up to the declared top. `wallScale` under 1 leaves
// the sides short, so a pile that reaches them rolls off.
function bin(box, drop = 0, wallScale = 1, grip = {}, floorT = PLATE, wallAdd = 0) {
  const leftFloor = box.y + box.h;
  const rightFloor = leftFloor + drop;
  const lh = (leftFloor - box.y) * wallScale + wallAdd;
  const rh = (rightFloor - box.y) * wallScale + wallAdd;

  return [
    // The floor thickens downwards, so its top face stays where the box says.
    slab(
      box.x + box.w / 2,
      (leftFloor + rightFloor) / 2 + floorT / 2,
      box.w + PLATE * 2,
      floorT,
      Math.atan2(drop, box.w),
      grip
    ),
    slab(box.x - PLATE / 2, leftFloor - lh / 2, PLATE, lh, 0, grip),
    slab(box.x + box.w + PLATE / 2, rightFloor - rh / 2, PLATE, rh, 0, grip)
  ];
}

Composite.add(engine.world, [
  ...arc(R + WALL / 2, 0, 360, 96, WALL),
  ...arc(R - RAIL_GAP - RAIL_T / 2, RAIL_FROM, RAIL_TO, 48, RAIL_T),
  railCap(),
  ...bin(STORE, 0, STORE_WALLS, BEARINGS, STORE_FLOOR, STORE_WALL_ADD),
  ...bin(TRAY, TRAY_DROP, 1, SLICK)
]);

function ball(x, y, label) {
  const grip = GRIP[label] || PLAY_GRIP;
  return Bodies.circle(x, y, BALL_R, {
    label,
    restitution: 0.45,
    friction: grip.friction,
    frictionStatic: grip.frictionStatic,
    frictionAir: label === 'tray' ? 0.0002 : 0.001,
    slop: 0.01,
    collisionFilter: label === 'play' ? { ...PLAY_FILTER } : { ...STOCK_FILTER },
    density: 0.004,
    // Tray balls have to keep sliding down to the lever as it empties, so they
    // are never allowed to fall asleep.
    sleepThreshold: label === 'tray' ? Infinity : 60,
    // Deck balls are drawn by hand after the field, so the glass box can sit in
    // front of them. Matter skips anything marked invisible.
    render: { fillStyle: '#e8eef5', visible: label === 'play' }
  });
}

function ballsLabelled(...labels) {
  return Composite.allBodies(engine.world).filter((b) => labels.includes(b.label));
}

function paintBalls(ctx, bodies) {
  ctx.fillStyle = '#e8eef5';
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

function isBall(body) {
  return !body.isStatic;
}

function occupied(x, y, reach = PITCH * 0.95) {
  for (const body of Composite.allBodies(engine.world)) {
    if (!isBall(body)) continue;
    if (Math.hypot(body.position.x - x, body.position.y - y) < reach) return true;
  }
  return false;
}

// Storage is fed from a chute above the rim. A ball only leaves the chute once
// the last one is clear of it, which is what keeps new balls landing on top of
// the pile instead of inside it.
function dispenseStore() {
  const y = STORE_RIM - BALL_R - 10 - CHUTE_LIFT;

  // Anywhere across the width, so the box fills and spills evenly rather than
  // growing a column in the middle. A blocked spot just retries next step.
  for (let tries = 0; tries < 6; tries++) {
    const x = STORE.x + BALL_R + Math.random() * (STORE.w - BALL_R * 2);
    if (occupied(x, y)) continue;

    const b = ball(x, y, 'store');
    Composite.add(engine.world, b);
    Body.setVelocity(b, { x: 0, y: 4 });
    return true;
  }
  return false;
}

// The tray sits directly under the storage floor, so there is no room to drop
// balls in from above. They are placed into the pack instead, deep end first,
// which is also the end the lever draws from.
function traySlot(i) {
  const cols = Math.floor(TRAY.w / PITCH);
  const row = Math.floor(i / cols);
  const x = TRAY.x + TRAY.w - BALL_R - (i % cols) * PITCH - (row % 2) * (PITCH / 2);
  const floorY = TRAY.y + TRAY.h + ((x - TRAY.x) / TRAY.w) * TRAY_DROP;
  return { x, y: floorY - BALL_R - 1 - row * ROW };
}

function dispenseTray() {
  for (let i = counts.tray; i < counts.tray + 12; i++) {
    const p = traySlot(i);
    if (occupied(p.x, p.y, PITCH * 0.9)) continue;
    Composite.add(engine.world, ball(p.x, p.y, 'tray'));
    return true;
  }
  return false;
}

// A ball left sitting proud of the storage rim topples off the front of the
// box. There is no third axis to fall along, so it becomes a collisionless
// ghost that drops down the face of the machine.
function spillForward(body) {
  Composite.remove(engine.world, body);
  const ghost = ball(body.position.x, body.position.y, 'spill');
  ghost.collisionFilter.mask = 0;
  Composite.add(engine.world, ghost);
}

function launch(power) {
  // Take the tray ball nearest the lever.
  const tray = Composite.allBodies(engine.world).filter((b) => b.label === 'tray');
  if (tray.length === 0) return;

  const next = tray.reduce((a, b) => (b.position.x > a.position.x ? b : a));
  Composite.remove(engine.world, next);

  const seat = atAngle(R - RAIL_GAP / 2, LAUNCH_DEG);
  const shot = ball(seat.x, seat.y, 'play');

  // Tangent to the wall, heading clockwise: up the left side of the channel.
  const t = rad(LAUNCH_DEG);
  Composite.add(engine.world, shot);
  Body.setVelocity(shot, { x: Math.sin(t) * power, y: Math.cos(t) * power });
}

function inDrain(p) {
  return p.y > DRAIN_TOP && Math.abs(p.x - CX) < DRAIN_W / 2;
}

// True once a ball has slid back below its seat and into the capped pocket.
function inReturn(p) {
  const dx = p.x - CX;
  const dy = CY - p.y;
  const r = Math.hypot(dx, dy);
  if (r < R - RAIL_GAP || r > R) return false;

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return deg > RETURN_LO && deg < RETURN_HI;
}

Events.on(engine, 'afterUpdate', () => {
  if (feed.store > 0 && dispenseStore()) feed.store -= 1;
  if (feed.tray > 0 && dispenseTray()) feed.tray -= 1;

  counts.tray = 0;
  counts.store = 0;
  counts.play = 0;

  for (const body of Composite.allBodies(engine.world)) {
    if (!isBall(body)) continue;

    // Anything that leaves the canvas has spilled out of the machine.
    if (body.position.y > HEIGHT + 40) {
      Composite.remove(engine.world, body);
      continue;
    }

    if (body.label === 'tray' && TRAY_PUSH) {
      Body.applyForce(body, body.position, { x: body.mass * TRAY_PUSH, y: 0 });
    }

    if (body.label === 'play') {
      if (inDrain(body.position)) {
        Composite.remove(engine.world, body);
        state.drained += 1;
        continue;
      }
      if (inReturn(body.position)) {
        Composite.remove(engine.world, body);
        feed.tray += 1;
        continue;
      }
    }

    // A ball resting above the full line gets a moment to roll off a side wall.
    // Only if it is still sitting there does it topple off the front.
    if (body.label === 'store') {
      const aboveLine = body.position.y > DECK_TOP && body.position.y < SPILL_LINE;
      if (aboveLine && body.speed < 0.5) {
        body.restingAboveLine = (body.restingAboveLine || 0) + 1;
        if (body.restingAboveLine > SPILL_DELAY) {
          spillForward(body);
          continue;
        }
      } else {
        body.restingAboveLine = 0;
      }
    }

    if (body.label in counts) counts[body.label] += 1;
  }
  draw();
});

Events.on(render, 'afterRender', () => {
  const ctx = render.context;

  ctx.save();
  ctx.strokeStyle = '#2d3a4b';
  ctx.lineWidth = 2;
  ctx.strokeRect(OX, OY, CAB_W, CAB_H);
  ctx.strokeRect(OX, OY, BOX, BOX);

  // The losing hole, drawn exactly where the hitbox is.
  ctx.fillStyle = '#e0574a';
  ctx.fillRect(CX - DRAIN_W / 2, DRAIN_TOP, DRAIN_W, DRAIN_H);

  // Deck balls, clipped to below the glass box, so a payout dropping in slides
  // out from behind the machine face instead of appearing on top of it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, DECK_TOP, WIDTH, HEIGHT - DECK_TOP);
  ctx.clip();
  paintBalls(ctx, ballsLabelled('store', 'tray'));
  ctx.restore();

  // A ball spilling off the front is in front of everything, so it is not clipped.
  paintBalls(ctx, ballsLabelled('spill'));

  ctx.translate(LEVER_X, LEVER_Y);
  ctx.rotate(rad(LEVER_MAX * lever.pull));
  ctx.fillStyle = '#2d3a4b';
  ctx.fillRect(0, -7, LEVER_LEN, 14);
  ctx.beginPath();
  ctx.arc(LEVER_LEN, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#e0574a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#8296ad';
  ctx.fill();
  ctx.restore();
});

const powerInput = document.getElementById('power');
const addButton = document.getElementById('add-balls');
const payoutButton = document.getElementById('payout');
const out = {
  tray: document.getElementById('stat-tray'),
  store: document.getElementById('stat-store'),
  live: document.getElementById('stat-live'),
  drained: document.getElementById('stat-drained')
};

function draw() {
  out.tray.textContent = counts.tray;
  out.store.textContent = counts.store;
  out.live.textContent = counts.play;
  out.drained.textContent = state.drained;
}

function leverTip() {
  const a = rad(LEVER_MAX * lever.pull);
  return { x: LEVER_X + LEVER_LEN * Math.cos(a), y: LEVER_Y + LEVER_LEN * Math.sin(a) };
}

// The canvas is scaled by CSS, so pointer coords need mapping back to its grid.
function canvasPoint(e) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - box.left) * (WIDTH / box.width),
    y: (e.clientY - box.top) * (HEIGHT / box.height)
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const tip = leverTip();
  if (Math.hypot(p.x - tip.x, p.y - tip.y) > GRAB_R) return;

  canvas.setPointerCapture(e.pointerId);
  lever.dragging = true;
  lever.fromY = p.y;
  lever.fromPull = lever.pull;
});

canvas.addEventListener('pointermove', (e) => {
  if (!lever.dragging) return;
  const p = canvasPoint(e);
  lever.pull = clamp(lever.fromPull + (p.y - lever.fromY) / PULL_PX, 0, 1);
  powerInput.value = Math.round(lever.pull * 100);
});

function release() {
  if (!lever.dragging) return;
  lever.dragging = false;
  launch(MIN_POWER + (MAX_POWER - MIN_POWER) * lever.pull);
  lever.pull = 0;
}

canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

addButton.addEventListener('click', () => {
  feed.tray = Math.max(feed.tray, TRAY_CAP - counts.tray);
});

payoutButton.addEventListener('click', () => {
  feed.store += PAYOUT;
});

Render.run(render);
Runner.run(Runner.create(), engine);
draw();

window.__debug = { engine, Composite, state, lever, feed, counts };
