/* Pachinko: square cabinet, spiral rail, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Sleeping } = Matter;

/* ---- cabinet ----------------------------------------------------------- */

const MARGIN = 25;                           // canvas border, outside the machine
const PAD = 25;                              // cabinet border around its contents
const BOX = 600;                             // square glass box, top of the cabinet
const CONTENT_H = 865;                       // box top to tray floor bottom

const CAB_W = BOX + PAD * 2;
const CAB_H = CONTENT_H + PAD * 2;
const WIDTH = CAB_W + MARGIN * 2;
const HEIGHT = CAB_H + MARGIN * 2;
const CAB_X = MARGIN;
const CAB_Y = MARGIN;
const OX = CAB_X + PAD;                      // content origin: top left of the glass box
const OY = CAB_Y + PAD;
const DECK_TOP = OY + BOX;                   // glass above, deck below

const BALL_R = 8.4;
const PITCH = BALL_R * 2 + 1;                // centre spacing, packed
const ROW = PITCH * 0.866;                   // row spacing, hex pack

/* ---- playfield --------------------------------------------------------- */

const CX = OX + BOX / 2;
const CY = OY + BOX / 2;

const RAIL_T = 20;                           // thick enough that a fast ball cannot tunnel
const RAIL_STEP = 1;                         // deg per hitbox

// Two plain ellipses, in units where five reach the window. They are tangent at
// 12 o'clock, both passing through (0, 5), and diverge from there, which is
// what opens the channel down the left side. Nothing is offset or swept, so
// each piece carries an ellipse's own curvature and the joint is smooth.
const UNIT = (BOX / 2 - RAIL_T / 2) / 5;

// 4 by 5, centred. Carries the field boundary for 300 degrees: 12 o'clock the
// long way round to 10, leaving the 11 o'clock arc to the outer winding.
const INNER = { x: CX, y: CY, ax: 4 * UNIT, ay: 5 * UNIT };
const INNER_FROM = -210;                     // deg, 10 o'clock
const INNER_TO = 90;                         // deg, 12 o'clock

// x intercepts at 5.5, top at 5, bottom at 6, so it sits half a unit low. Runs
// 12 o'clock anticlockwise to 6, overhanging the window at the left and the
// mouth, where the drawing is clipped but the hitboxes stay.
const OUTER = {
  x: CX,
  y: CY + 0.5 * UNIT,
  ax: (5.5 * UNIT) / Math.sqrt(1 - (0.5 / 5.5) ** 2),
  ay: 5.5 * UNIT
};
const OUTER_FROM = 90;                       // deg, 12 o'clock
const OUTER_TO = 270;                        // deg, 6 o'clock

const LAUNCH_DEG = -120;                     // 7 o'clock, where a ball sits
const CAP_DEG = -114;                        // dead end just below the seat
const RETURN_LO = -118;                      // stalled shots land between these
const RETURN_HI = -100;

// Hole in the rail at the bottom, flush with the bottom of the window and
// centred on it. The window is the viewable area and the hole is the only way
// out of the field, so a ball is counted lost on a flat line just below the
// window edge rather than by any test against the curve.
const DRAIN_PHI = -90;
const DRAIN_W = 74;                          // px of rail removed
const DRAIN_SPAN = ((DRAIN_W / INNER.ax) * 180) / Math.PI;
const DRAIN_Y = DECK_TOP + BALL_R;

// Floor is the climb from the seat to the exit: 428px, needing 15.4.
const MIN_POWER = 15;                        // px/step, just short of the exit
const MAX_POWER = 24;                        // px/step, capped by RAIL_T against tunneling

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

// Everything on the boundary is located by the ellipse parameter, anticlockwise
// from east, with canvas y inverted so sin flips. For a near-circular ellipse
// the parameter and the true bearing differ by only a couple of degrees.
function ellAt(E, phiDeg) {
  const phi = rad(phiDeg);
  return { x: E.x + E.ax * Math.cos(phi), y: E.y - E.ay * Math.sin(phi) };
}

const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Unit tangent in the direction a launched ball travels, which is decreasing
// parameter: 7 o'clock round to 10.
function ellTangent(E, phiDeg) {
  const phi = rad(phiDeg);
  const tx = E.ax * Math.sin(phi);
  const ty = E.ay * Math.cos(phi);
  const t = Math.hypot(tx, ty);
  return { x: tx / t, y: ty / t };
}

// Where a point sits relative to an ellipse: k is 1 on it, and deg is its
// parameter.
function ellK(E, p) {
  const u = (p.x - E.x) / E.ax;
  const v = (E.y - p.y) / E.ay;
  return { k: Math.hypot(u, v), deg: (Math.atan2(v, u) * 180) / Math.PI };
}

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

// The rail is drawn by hand as smooth arcs, so its hitboxes stay out of the
// renderer and their faceting is never seen.
function hide(body) {
  body.render.visible = false;
  return body;
}

// Matter has no curved collider of any kind, so a wall is a chain of chord
// slabs and the only lever on smoothness is how short the chords are. One
// degree keeps every facet around 4px and the reflection normal within half a
// degree of the true one. Slabs overlap by 2 so the chain cannot leak, but no
// more, or a ball would be resolved against several faces at once.
function ellWall(E, fromDeg, toDeg, skip) {
  const pieces = [];
  let prev = ellAt(E, fromDeg);

  for (let d = fromDeg + RAIL_STEP; d <= toDeg; d += RAIL_STEP) {
    const p = ellAt(E, d);

    if (!skip || !skip(d - RAIL_STEP / 2)) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const mid = midpoint(prev, p);
      pieces.push(hide(slab(mid.x, mid.y, Math.hypot(dx, dy) + 2, RAIL_T, Math.atan2(dy, dx))));
    }
    prev = p;
  }
  return pieces;
}

const inDrainGap = (deg) => Math.abs(deg - DRAIN_PHI) < DRAIN_SPAN / 2;

// Dead end below the seat: without it a stalled shot runs out of the mouth.
// Spans the channel rather than lining it.
function railCap() {
  const a = ellAt(INNER, CAP_DEG);
  const b = ellAt(OUTER, CAP_DEG);
  const mid = midpoint(a, b);
  return hide(slab(mid.x, mid.y, Math.hypot(b.x - a.x, b.y - a.y), RAIL_T * 0.6, Math.atan2(b.y - a.y, b.x - a.x)));
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
  ...ellWall(INNER, INNER_FROM, INNER_TO, inDrainGap),
  ...ellWall(OUTER, OUTER_FROM, OUTER_TO),
  railCap(),
  ...bin(STORE, 0, STORE_WALLS, BEARINGS, STORE_FLOOR, STORE_WALL_ADD),
  ...bin(TRAY, TRAY_DROP, 1, SLICK)
]);

/* ---- balls ------------------------------------------------------------- */

// Matter approximates a circle with a polygon, and at this radius that is only
// ten sides: a 36 degree facet, which is coarser than the rail. Balls in play
// get 24 so they roll the channel cleanly. circleRadius keeps them drawn round.
function ball(x, y, label) {
  const grip = GRIP[label] || PLAY_GRIP;
  return Bodies.polygon(x, y, label === 'play' ? 24 : 10, BALL_R, {
    label,
    circleRadius: BALL_R,
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

  const seat = midpoint(ellAt(INNER, LAUNCH_DEG), ellAt(OUTER, LAUNCH_DEG));
  const dir = ellTangent(INNER, LAUNCH_DEG);
  const shot = ball(seat.x, seat.y, 'play');

  Composite.add(engine.world, shot);
  Body.setVelocity(shot, { x: dir.x * power, y: dir.y * power });
}

// Back below the seat and into the capped pocket. Anything in play sits well
// inside the ellipse, so requiring k above 1 keeps the field out of it.
function inReturn(p) {
  const { k, deg } = ellK(INNER, p);
  if (k < 1) return false;
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
      // Past the bottom of the window, so it went through the hole.
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
  ctx.strokeRect(OX, OY, BOX, BOX);

  // The rail is drawn as true ellipse arcs rather than from its hitboxes, so
  // the picture carries none of the faceting the physics is stuck with. Canvas
  // angles run the other way, hence the negated parameters. Clipped to the
  // window, which is what trims the outer winding where it overhangs.
  ctx.save();
  ctx.beginPath();
  ctx.rect(OX, OY, BOX, BOX);
  ctx.clip();
  ctx.lineWidth = RAIL_T;

  ctx.strokeStyle = '#2d3a4b';
  ctx.beginPath();
  ctx.ellipse(INNER.x, INNER.y, INNER.ax, INNER.ay, 0, rad(-INNER_TO), rad(-DRAIN_PHI - DRAIN_SPAN / 2));
  ctx.ellipse(INNER.x, INNER.y, INNER.ax, INNER.ay, 0, rad(-DRAIN_PHI + DRAIN_SPAN / 2), rad(-INNER_FROM));
  ctx.ellipse(OUTER.x, OUTER.y, OUTER.ax, OUTER.ay, 0, rad(-OUTER_FROM), rad(-OUTER_TO), true);
  ctx.stroke();

  ctx.strokeStyle = '#e0574a';
  ctx.beginPath();
  ctx.ellipse(INNER.x, INNER.y, INNER.ax, INNER.ay, 0, rad(-DRAIN_PHI - DRAIN_SPAN / 2), rad(-DRAIN_PHI + DRAIN_SPAN / 2));
  ctx.stroke();
  ctx.restore();

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

window.__debug = { engine, Composite, state, lever, feed, counts, INNER, OUTER, ellAt, ellK };
