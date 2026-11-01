/* Pachinko: square cabinet, spiral rail, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Sleeping } = Matter;

/* ---- cabinet ----------------------------------------------------------- */

// The one gap, from the canvas edge to the machine on every side.
const MARGIN = 20;
const BOX = 600;                             // glass window, width
const CONTENT_H = 835;                       // window top to tray floor bottom

const WIDTH = BOX + MARGIN * 2;
const HEIGHT = CONTENT_H + MARGIN * 2;
const OX = MARGIN;                           // top left of the glass window
const OY = MARGIN;
const BOX_LIFT = 50;                         // the window bottom, raised across the rail
const BOX_H = BOX - BOX_LIFT;
const DECK_TOP = OY + BOX_H;                 // glass above, deck below

const BALL_R = 8.4;
const PITCH = BALL_R * 2 + 1;                // centre spacing, packed
const ROW = PITCH * 0.866;                   // row spacing, hex pack

/* ---- playfield --------------------------------------------------------- */

const CX = OX + BOX / 2;
const CY = OY + BOX / 2;

// One continuous rail, traced from its inner end at 10 o'clock and swept
// anticlockwise: on the base ellipse for 300 degrees to 12 o'clock, lifting
// clear of itself over the next 60, parallel through the 90 degree launch
// channel from 10 to 7, then flaring past the window on the way to 6.
//
// The lift grows both semi-axes rather than the radius, so the two ends of the
// sweep are themselves plain ellipses and the whole family is one expression.
const RAIL_T = 10;                           // see the catch-window note by MAX_POWER
const RAIL_CLEAR = 28;                       // channel width
const RAIL_PITCH = RAIL_CLEAR + RAIL_T;      // semi-axis gain per turn
const RAIL_HEAD = 150;                       // deg, inner end at 10 o'clock
const RAIL_LIFT = 60;                        // deg, 12 o'clock to 10 o'clock
const RAIL_SWEEP = 480;                      // deg total, outer end at 6 o'clock
const RAIL_STEP = 3;                         // deg per segment
const RAIL_FLARE = 1.4;                      // px of semi-axis per deg, past 7 o'clock

// Base ellipse. The three numbers to tune: width, height, and how far its
// centre sits above the window's own centre.
const ELL_A = BOX / 2 - RAIL_PITCH - RAIL_T / 2;   // 242, outer winding flush left
const ELL_B = 268.5;
const ELL_RISE = 18.5;
const ELL = { x: CX, y: CY - ELL_RISE };

const CHANNEL_L = RAIL_T / 2 + RAIL_CLEAR / 2;     // lift at the middle of the channel
const SEAT_L = RAIL_PITCH - RAIL_T / 2 - BALL_R - 0.5;   // against the outer wall

const LAUNCH_DEG = -120;                     // 7 o'clock, where a ball sits
const CAP_DEG = -114;                        // dead end just below the seat
const RETURN_LO = -118;                      // stalled shots land between these
const RETURN_HI = -100;

// Hole in the rail at the bottom, where the curve is tangent to the window.
const DRAIN_DEG = -90;
const DRAIN_SPAN = 17.4;                     // deg, about 73px of rail
const DRAIN_T = ((DRAIN_DEG - RAIL_HEAD) % 360 + 360) % 360;

// A flat line below the window, so a ball keeps falling through the hole in
// view instead of vanishing the instant it reaches the rail.
const DRAIN_Y = DECK_TOP + BALL_R;

// What stops a ball tunnelling is not the wall thickness but the catch window,
// 2 * (RAIL_T / 2 + BALL_R) = 26.8px: a ball is caught as long as it travels
// less than that in a step. The fastest perpendicular impact is about 18, so
// there is 1.5x in hand. MAX_POWER itself is 25, but that is tangent to the
// channel at launch, never into a wall.
const MIN_POWER = 17;                        // px/step, just short of the top
const MAX_POWER = 25;                        // px/step

/* ---- deck -------------------------------------------------------------- */

const PLATE = 8;                             // wall and floor thickness
const STORE = { x: OX + 28, y: OY + 607, w: 384, h: 110 };   // interior
const STORE_WALLS = 0.64;                    // short sides, so the pile spills
const STORE_WALL_ADD = 10;
const STORE_RIM = STORE.y + STORE.h - (STORE.h * STORE_WALLS + STORE_WALL_ADD);
const STORE_FLOOR = PLATE + 20;              // deep enough that a payout cannot tunnel
const TRAY = { x: OX + 216, y: OY + 767, w: 190, h: 30 };    // interior at the shallow end
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
const LEVER_Y = OY + 716;
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
const PLAY_GRIP = { friction: 0.02, frictionStatic: 0 };
// Matter takes the HIGHER frictionStatic of a pair, and a slab defaults to 0.5,
// so the rail grabs the ball unless the rail itself is slackened.
const RAIL_GRIP = { friction: 0.005, frictionStatic: 0 };
const GRIP = { tray: SLICK, store: BEARINGS };

// 9 degrees is inside the solver's resting tolerance, so tray balls are pushed
// down-slope as well. Set to 0 for geometry alone.
const TRAY_PUSH = 0.000225;                  // added accel; gravity is 0.001
const CHUTE_LIFT = 210;                      // payout drop height above the rim

const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Angles run anticlockwise from east about the ellipse centre; canvas y is
// inverted, so sin flips. `lift` grows both semi-axes, which is what carries
// the rail off the base ellipse and out to the channel.
function ellRadius(deg, lift) {
  const a = ELL_A + lift;
  const b = ELL_B + lift;
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return (a * b) / Math.hypot(b * c, a * s);
}

function atAngle(deg, lift) {
  const r = ellRadius(deg, lift);
  return { x: ELL.x + r * Math.cos(rad(deg)), y: ELL.y - r * Math.sin(rad(deg)) };
}

// Unit tangent in the travel direction, which is decreasing angle: 7 o'clock
// round to 10.
function ellTangent(deg, lift) {
  const tx = (ELL_A + lift) * Math.sin(rad(deg));
  const ty = (ELL_B + lift) * Math.cos(rad(deg));
  const t = Math.hypot(tx, ty);
  return { x: tx / t, y: ty / t };
}

const angleOf = (p) => (Math.atan2((ELL.y - p.y) / ELL_B, (p.x - ELL.x) / ELL_A) * 180) / Math.PI;
const radiusOf = (p) => Math.hypot((p.x - ELL.x) / ELL_A, (ELL.y - p.y) / ELL_B);

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

// Lift at `t` degrees along the sweep: flat, then the ramp, then parallel
// through the channel, then the flare out of the window.
function railLift(t) {
  if (t <= RAIL_SWEEP - 180) return 0;
  if (t <= RAIL_SWEEP - 120) return (RAIL_PITCH * (t - (RAIL_SWEEP - 180))) / RAIL_LIFT;
  if (t <= RAIL_SWEEP - 30) return RAIL_PITCH;
  return RAIL_PITCH + (t - (RAIL_SWEEP - 30)) * RAIL_FLARE;
}

const railPoint = (t) => atAngle(RAIL_HEAD + t, railLift(t));
const insideBox = (p) =>
  p.x >= OX && p.x <= OX + BOX && p.y >= OY && p.y <= OY + BOX_H;

// Chord slabs along the curve, skipping the drain hole and anything the square
// would cut off. Chords, not tangents, so the flare stays aligned.
function railWall() {
  const gapLo = DRAIN_T - DRAIN_SPAN / 2;
  const gapHi = DRAIN_T + DRAIN_SPAN / 2;
  const pieces = [];
  let prev = railPoint(0);

  for (let t = RAIL_STEP; t <= RAIL_SWEEP; t += RAIL_STEP) {
    const p = railPoint(t);
    const mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
    const inGap = t > gapLo && t - RAIL_STEP < gapHi;

    if (!inGap && insideBox(mid)) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      pieces.push(slab(mid.x, mid.y, Math.hypot(dx, dy) + RAIL_T, RAIL_T, Math.atan2(dy, dx), RAIL_GRIP));
    }
    prev = p;
  }
  return pieces;
}

// Dead end below the seat: without it a stalled shot runs out of the mouth.
function railCap() {
  const p = atAngle(CAP_DEG, CHANNEL_L + 6);
  return slab(p.x, p.y, RAIL_PITCH + 30, RAIL_T * 0.6, -rad(CAP_DEG), RAIL_GRIP);
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
  ...railWall(),
  railCap(),
  ...bin(STORE, 0, STORE_WALLS, BEARINGS, STORE_FLOOR, STORE_WALL_ADD),
  ...bin(TRAY, TRAY_DROP, 1, SLICK)
]);

/* ---- balls ------------------------------------------------------------- */

// Matter approximates a circle with a polygon, and at this radius that is only
// ten sides: a 36 degree facet, coarser than the rail itself. Balls in play get
// 24 so they ride the channel cleanly. circleRadius keeps them drawn round.
function ball(x, y, label) {
  const grip = GRIP[label] || PLAY_GRIP;
  return Bodies.polygon(x, y, label === 'play' ? 24 : 10, BALL_R, {
    label,
    circleRadius: BALL_R,
    restitution: 0.45,
    friction: grip.friction,
    frictionStatic: grip.frictionStatic,
    frictionAir: label === 'tray' ? 0.0002 : label === 'play' ? 0.0003 : 0.001,
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

  const seat = atAngle(LAUNCH_DEG, SEAT_L);
  const shot = ball(seat.x, seat.y, 'play');
  const t = rad(LAUNCH_DEG);

  Composite.add(engine.world, shot);
  Body.setVelocity(shot, { x: Math.sin(t) * power, y: Math.cos(t) * power });  // tangent, clockwise
}

// Back below the seat and into the capped pocket.
function inReturn(p) {
  const r = radiusOf(p);
  if (r < 1 || r > 1 + (RAIL_PITCH + 20) / ELL_A) return false;

  const deg = angleOf(p);
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
      // Backstop: the hole is the only way out of the field, so anything below
      // the window went through it however fast it was moving.
      // A flat line below the window, so the ball stays visible on its way out.
      if (y > DRAIN_Y) {
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
  ctx.strokeRect(OX, OY, BOX, BOX_H);

  // The hole, marked across the gap left in the rail.
  ctx.beginPath();
  ctx.ellipse(ELL.x, ELL.y, ELL_A, ELL_B, 0, rad(-DRAIN_DEG - DRAIN_SPAN / 2), rad(-DRAIN_DEG + DRAIN_SPAN / 2));
  ctx.strokeStyle = '#e0574a';
  ctx.lineWidth = RAIL_T;
  ctx.stroke();

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

window.__debug = { engine, Composite, state, lever, feed, counts, railLift, railPoint, atAngle };
