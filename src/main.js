/* Pachinko: square cabinet, circular field, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Sleeping } = Matter;

/* ---- cabinet ----------------------------------------------------------- */

// Margins are outside the machine; overflow falls there.
const MARGIN_TOP = 10;
const MARGIN_SIDE = 50;
const MARGIN_BOTTOM = 25;
const CAB_W = 600;
const CAB_H = 865;
const WIDTH = CAB_W + MARGIN_SIDE * 2;
const HEIGHT = MARGIN_TOP + CAB_H + MARGIN_BOTTOM;
const OX = MARGIN_SIDE;
const OY = MARGIN_TOP;

const BOX = 600;                             // square glass box, top of the cabinet
const DECK_TOP = OY + BOX;                   // glass above, deck below
const WALL = 20;
const BALL_R = 8.4;
const PITCH = BALL_R * 2 + 1;                // centre spacing, packed
const ROW = PITCH * 0.866;                   // row spacing, hex pack

/* ---- playfield --------------------------------------------------------- */

const CX = OX + BOX / 2;
const CY = OY + BOX / 2;
const R = BOX / 2 - WALL;                    // inner face of the circular wall

// Launch channel: concentric with the wall, 7 to 10 on a clock face, so a shot
// travels clockwise. Capped at the lower end.
const RAIL_GAP = 28;                         // clear width
const RAIL_T = 8;
const RAIL_FROM = -105;                      // deg, capped end
const RAIL_TO = -210;                        // deg, opens into the field
const LAUNCH_DEG = -122;                     // deg, seat

// Stalled shots slide back to the cap and return to the tray. Only the hole at
// bottom centre loses a ball.
const RETURN_LO = -118;                      // deg
const RETURN_HI = -95;                       // deg
const DRAIN_W = 110;
const DRAIN_H = 26;
const DRAIN_TOP = CY + R - DRAIN_H;

const MIN_POWER = 11;                        // px/step, falls short of the exit
const MAX_POWER = 19;                        // px/step

/* ---- deck -------------------------------------------------------------- */

const PLATE = 8;                             // wall and floor thickness
const STORE = { x: OX + 28, y: OY + 637, w: 384, h: 110 };   // interior
const STORE_WALLS = 0.64;                    // short sides, so the pile spills
const STORE_WALL_ADD = 10;
const STORE_RIM = STORE.y + STORE.h - (STORE.h * STORE_WALLS + STORE_WALL_ADD);
const STORE_FLOOR = PLATE + 20;              // deep enough that a payout cannot tunnel
const TRAY = { x: OX + 216, y: OY + 797, w: 190, h: 30 };    // interior at the shallow end
const TRAY_CAP = 25;
const TRAY_DROP = 30;                        // floor fall, left to right
const PAYOUT = 50;                           // stand-in for a jackpot

// 22px gap between the storage floor and the tray; refills drop through it.
const TRAY_CHUTE = {
  x: TRAY.x + 26,
  y: (STORE.y + STORE.h + STORE_FLOOR + TRAY.y) / 2
};

// Full at one ball above the rim, which is also about where a ball can roll off
// a side wall, so front spill and side spill compete instead of queueing.
const SPILL_LINE = STORE_RIM - BALL_R * 2;
const SPILL_DELAY = 25;                      // steps resting above the line

/* ---- lever ------------------------------------------------------------- */

const LEVER_X = OX + 444;
const LEVER_Y = OY + 746;
const LEVER_LEN = 108;
const LEVER_MAX = 40;                        // deg of travel
const PULL_PX = 160;                         // drag for a full pull
const GRAB_R = 36;

/* ---- physics setup ----------------------------------------------------- */

// Deck and field are separate collision worlds: payouts fall from above the
// glass box, straight through the playfield, and must not touch it.
const CAT_FIELD = 0x0001;
const CAT_DECK = 0x0002;
const CAT_PLAY = 0x0004;
const CAT_STOCK = 0x0008;
const FIELD_FILTER = { category: CAT_FIELD, mask: CAT_PLAY };
const DECK_FILTER = { category: CAT_DECK, mask: CAT_STOCK };
const STOCK_FILTER = { category: CAT_STOCK, mask: CAT_DECK | CAT_STOCK };
const PLAY_FILTER = { category: CAT_PLAY, mask: CAT_FIELD | CAT_PLAY };

// Matter takes the lower friction of a pair but the HIGHER frictionStatic, so
// both sides of a contact must be slackened or nothing slides.
const SLICK = { friction: 0, frictionStatic: 0, filter: DECK_FILTER };
const BEARINGS = { friction: 0.001, frictionStatic: 0, filter: DECK_FILTER };
const PLAY_GRIP = { friction: 0.02, frictionStatic: 0.05 };
const GRIP = { tray: SLICK, store: BEARINGS };

// 9 degrees is inside the solver's resting tolerance, so tray balls are pushed
// down-slope as well. Set to 0 for geometry alone.
const TRAY_PUSH = 0.000225;                  // added accel; gravity is 0.001
const CHUTE_LIFT = 210;                      // payout drop height above the rim

const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Angles run anticlockwise from east; canvas y is inverted, so sin flips.
const atAngle = (r, deg) => ({ x: CX + r * Math.cos(rad(deg)), y: CY - r * Math.sin(rad(deg)) });

const state = { drained: 0, spilled: 0 };
const lever = { pull: 0, dragging: false, fromY: 0, fromPull: 0 };
const counts = { tray: 0, store: 0, play: 0 };
const feed = { tray: 0, store: 0 };

const engine = Engine.create();
engine.gravity.y = 1;
engine.enableSleeping = true;

// Default slop and iteration count let a deep pile compress visibly.
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

/* ---- geometry ---------------------------------------------------------- */

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

// Curve approximated by slabs laid tangent to a circle about the field centre.
// Centres sit on `r`; faces land a half-thickness either side.
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

// Dead end at the bottom of the channel. Laid along the radius, not across it.
function railCap() {
  const p = atAngle(R - RAIL_GAP / 2, RAIL_FROM);
  return slab(p.x, p.y, RAIL_GAP + RAIL_T, RAIL_T, -rad(RAIL_FROM));
}

// Open-topped container. Each wall runs from its own end of the floor up to
// box.y; `wallScale` below 1 leaves them short so a full pile rolls off.
function bin(box, drop = 0, wallScale = 1, grip = {}, floorT = PLATE, wallAdd = 0) {
  const leftFloor = box.y + box.h;
  const rightFloor = leftFloor + drop;
  const lh = (leftFloor - box.y) * wallScale + wallAdd;
  const rh = (rightFloor - box.y) * wallScale + wallAdd;

  return [
    // Floor thickens downwards, keeping its top face at the declared depth.
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

/* ---- balls ------------------------------------------------------------- */

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
    sleepThreshold: label === 'tray' ? Infinity : 60,   // the tray must keep feeding
    render: { fillStyle: '#e8eef5', visible: label === 'play' }  // deck balls drawn by hand
  });
}

function ballsLabelled(...labels) {
  return Composite.allBodies(engine.world).filter((b) => labels.includes(b.label));
}

function isBall(body) {
  return !body.isStatic;
}

// Matter wakes a sleeping body on collision, but removing one is silent: the
// pile above it keeps sleeping on support that is no longer there.
function wake(bodies) {
  for (const b of bodies) Sleeping.set(b, false);
}

function occupied(x, y, reach = PITCH * 0.95) {
  for (const body of Composite.allBodies(engine.world)) {
    if (!isBall(body)) continue;
    if (Math.hypot(body.position.x - x, body.position.y - y) < reach) return true;
  }
  return false;
}

/* ---- dispensing -------------------------------------------------------- */

// Gating on a clear chute throttles dispensing to the real fall rate, which is
// what keeps arrivals landing on top of the pile rather than inside it.
function dispenseStore() {
  const y = STORE_RIM - BALL_R - 10 - CHUTE_LIFT;

  // Random x, so the box fills and spills across its width.
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

// Slot in the tray pack, filling the deep end first: the end the lever draws
// from. Follows the sloped floor rather than a flat grid.
function traySlot(i) {
  const cols = Math.floor(TRAY.w / PITCH);
  const row = Math.floor(i / cols);
  const x = TRAY.x + TRAY.w - BALL_R - (i % cols) * PITCH - (row % 2) * (PITCH / 2);
  const floorY = TRAY.y + TRAY.h + ((x - TRAY.x) / TRAY.w) * TRAY_DROP;
  return { x, y: floorY - BALL_R - 1 - row * ROW };
}

function dispenseTray() {
  if (!occupied(TRAY_CHUTE.x, TRAY_CHUTE.y, PITCH * 0.9)) {
    Composite.add(engine.world, ball(TRAY_CHUTE.x, TRAY_CHUTE.y, 'tray'));
    return true;
  }

  // Chute blocked: place into the pack so a fill cannot stall.
  for (let i = counts.tray; i < counts.tray + 12; i++) {
    const p = traySlot(i);
    if (occupied(p.x, p.y, PITCH * 0.9)) continue;
    Composite.add(engine.world, ball(p.x, p.y, 'tray'));
    return true;
  }
  return false;
}

function trayRoom() {
  return TRAY_CAP - counts.tray - feed.tray;
}

// Payouts fill the tray before storage; storage then tops the tray up as the
// lever drains it, off the bottom of the pile so the heap sinks. One ball in
// flight at a time, which throttles the transfer to the dispense rate.
function routeStock() {
  if (feed.store > 0 && trayRoom() > 0) {
    feed.store -= 1;
    feed.tray += 1;
    return;
  }

  if (feed.tray > 0 || trayRoom() <= 0 || counts.store === 0) return;

  const pile = ballsLabelled('store');
  const lowest = pile.reduce((a, b) => (b.position.y > a.position.y ? b : a));
  Composite.remove(engine.world, lowest);
  wake(pile);
  feed.tray += 1;
}

// No third axis to fall along, so a forward spill becomes a collisionless ghost
// dropping down the face of the machine.
function spillForward(body) {
  Composite.remove(engine.world, body);
  wake(ballsLabelled('store'));
  const ghost = ball(body.position.x, body.position.y, 'spill');
  ghost.collisionFilter.mask = 0;
  Composite.add(engine.world, ghost);
}

/* ---- play -------------------------------------------------------------- */

function launch(power) {
  const tray = ballsLabelled('tray');
  if (tray.length === 0) return;

  const next = tray.reduce((a, b) => (b.position.x > a.position.x ? b : a));
  Composite.remove(engine.world, next);

  const seat = atAngle(R - RAIL_GAP / 2, LAUNCH_DEG);
  const shot = ball(seat.x, seat.y, 'play');
  const t = rad(LAUNCH_DEG);

  Composite.add(engine.world, shot);
  Body.setVelocity(shot, { x: Math.sin(t) * power, y: Math.cos(t) * power });  // tangent, clockwise
}

function inDrain(p) {
  return p.y > DRAIN_TOP && Math.abs(p.x - CX) < DRAIN_W / 2;
}

// Back below the seat and into the capped pocket.
function inReturn(p) {
  const dx = p.x - CX;
  const dy = CY - p.y;
  const r = Math.hypot(dx, dy);
  if (r < R - RAIL_GAP || r > R) return false;

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return deg > RETURN_LO && deg < RETURN_HI;
}

Events.on(engine, 'afterUpdate', () => {
  routeStock();
  if (feed.store > 0 && dispenseStore()) feed.store -= 1;
  if (feed.tray > 0 && dispenseTray()) feed.tray -= 1;

  counts.tray = 0;
  counts.store = 0;
  counts.play = 0;

  for (const body of Composite.allBodies(engine.world)) {
    if (!isBall(body)) continue;

    // Side spills roll off a wall, front spills drop down the face, and nothing
    // catches either, so both leave through the bottom. One check counts both.
    const { x, y } = body.position;
    if (y > HEIGHT + 40 || x < -40 || x > WIDTH + 40) {
      Composite.remove(engine.world, body);
      state.spilled += 1;
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

    // Above the full line: a grace period to roll off a side, then out the front.
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

/* ---- rendering --------------------------------------------------------- */

function paintBalls(ctx, bodies) {
  ctx.fillStyle = '#e8eef5';
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

Events.on(render, 'afterRender', () => {
  const ctx = render.context;

  ctx.save();
  ctx.strokeStyle = '#2d3a4b';
  ctx.lineWidth = 2;
  ctx.strokeRect(OX, OY, CAB_W, CAB_H);
  ctx.strokeRect(OX, OY, BOX, BOX);

  ctx.fillStyle = '#e0574a';
  ctx.fillRect(CX - DRAIN_W / 2, DRAIN_TOP, DRAIN_W, DRAIN_H);   // the losing hole

  // Clipped to the deck, so the glass box occludes a payout dropping in.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, DECK_TOP, WIDTH, HEIGHT - DECK_TOP);
  ctx.clip();
  paintBalls(ctx, ballsLabelled('store', 'tray'));
  ctx.restore();

  paintBalls(ctx, ballsLabelled('spill'));   // in front of everything, unclipped

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

/* ---- controls ---------------------------------------------------------- */

const powerInput = document.getElementById('power');
const addButton = document.getElementById('add-balls');
const payoutButton = document.getElementById('payout');
const out = {
  tray: document.getElementById('stat-tray'),
  store: document.getElementById('stat-store'),
  live: document.getElementById('stat-live'),
  drained: document.getElementById('stat-drained'),
  spilled: document.getElementById('stat-spilled')
};

function draw() {
  out.tray.textContent = counts.tray;
  out.store.textContent = counts.store;
  out.live.textContent = counts.play;
  out.drained.textContent = state.drained;
  out.spilled.textContent = state.spilled;
}

function leverTip() {
  const a = rad(LEVER_MAX * lever.pull);
  return { x: LEVER_X + LEVER_LEN * Math.cos(a), y: LEVER_Y + LEVER_LEN * Math.sin(a) };
}

// CSS scales the canvas, so pointer coords need mapping back to its grid.
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
