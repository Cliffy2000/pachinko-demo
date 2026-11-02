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
const BOX_LIFT = 55;                         // the window bottom, raised across the rail
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
const RAIL_STEP = 2;                         // deg per segment
const MOUTH_DROP = 25;                       // extra lift by 6 o'clock, outer winding only
const MOUTH_FROM = 390;                      // deg of sweep where that drop eases in

// Base ellipse. The three numbers to tune: width, height, and how far its
// centre sits above the window's own centre.
const ELL_A = BOX / 2 - RAIL_PITCH - RAIL_T / 2;   // 242, outer winding flush left
const ELL_B = 268.5;
const ELL_RISE = 18.5;
const ELL = { x: CX, y: CY - ELL_RISE };

const CHANNEL_L = RAIL_T / 2 + RAIL_CLEAR / 2;     // lift at the middle of the channel

// A flat launch panel butted against the 6 o'clock end of the curve. The curve
// is horizontal there and the mouth drop has zero slope at that point, so the
// two meet tangentially and a ball crosses the join without a step to hit.
const PANEL_LEN = 100;

// A ball in the channel is driven along the rail rather than resolved against
// it. A launch lane is a one dimensional problem - position on the rail is a
// single angle - and letting the solver negotiate it against four overlapping
// slabs every step is what produced the chatter: the slabs a ball touches span
// about seven degrees of arc whatever step they are cut at, so the averaged
// normal jogs as that set shifts. Driving it removes the contact entirely, and
// with it any argument about friction.
const RAIL_TOP = 300;                        // deg of sweep where the rail ends, 12 o'clock
const RAIL_DRAG = 0.0003;                    // speed lost per step on the rail
const RAIL_FREE_AT = 360;                    // deg of sweep, 10 o'clock: the channel opens

// Hole in the rail at the bottom, where the curve is tangent to the window.
const DRAIN_DEG = -90;
const DRAIN_SPAN = 17.4;                     // deg, about 73px of rail
const DRAIN_T = ((DRAIN_DEG - RAIL_HEAD) % 360 + 360) % 360;

// A box rather than a line, hung under the window across the hole. 30 tall is
// more than the fastest ball covers in a step, so nothing gets through it, and
// being bounded means the launch area below the channel stays clear of it.
const DRAIN_H = 30;
const DRAIN_BOX = {
  x1: ELL.x - (ELL_A * DRAIN_SPAN * Math.PI / 180) / 2 - BALL_R,
  x2: ELL.x + (ELL_A * DRAIN_SPAN * Math.PI / 180) / 2 + BALL_R,
  y1: DECK_TOP,
  y2: DECK_TOP + DRAIN_H
};

// What stops a ball tunnelling is not the wall thickness but the catch window,
// 2 * (RAIL_T / 2 + BALL_R) = 26.8px: a ball is caught as long as it travels
// less than that in a step. The fastest perpendicular impact is about 18, so
// there is 1.5x in hand. MAX_POWER itself is 25, but that is tangent to the
// channel at launch, never into a wall.
const MIN_POWER = 16;                        // px/step, just short of the top
const MAX_POWER = 23;                        // px/step

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
const RAIL_GRIP = { friction: 0.005, frictionStatic: 0, slop: 0.01 };
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
    slop: grip.slop ?? 0.05,
    restitution: 0.1,
    collisionFilter: grip.filter ?? FIELD_FILTER,
    render: { fillStyle: '#2d3a4b' }
  });
}

// Lift at `t` degrees along the sweep: on the base ellipse, then the ramp out,
// then parallel, then easing down by MOUTH_DROP to clear the drain box. Only
// the outer winding ever reaches that last stretch, so the line carrying the
// hole stays put while the channel floor drops away under it.
function railLift(t) {
  if (t <= RAIL_SWEEP - 180) return 0;
  if (t <= RAIL_SWEEP - 120) {
    // Smoothstep, not a straight ramp: a linear one leaves a corner in the
    // curve at both ends of the lift, which the ride feels as a kick.
    const u = (t - (RAIL_SWEEP - 180)) / RAIL_LIFT;
    return RAIL_PITCH * u * u * (3 - 2 * u);
  }
  if (t <= MOUTH_FROM) return RAIL_PITCH;

  const u = (t - MOUTH_FROM) / (RAIL_SWEEP - MOUTH_FROM);
  return RAIL_PITCH + MOUTH_DROP * u * u * (3 - 2 * u);
}

const railPoint = (t) => atAngle(RAIL_HEAD + t, railLift(t));
// The rail is allowed below the window: the drawing is clipped, not the shape.
const insideBox = () => true;

// Chord slabs along the curve, skipping the drain hole and anything the window
// would cut off. Chords, not tangents, so the flare stays aligned.
//
// Each slab runs well past its own chord on purpose. SAT picks the axis of
// least overlap, and for a slab whose END is near the ball that axis is the end
// face, whose normal points ALONG the rail: the ball gets shoved forwards or
// backwards instead of being held in. Overlapping generously means every slab
// the ball touches has it comfortably inside, so every normal points across the
// channel. The sagitta this costs is under a pixel.
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
      const span = Math.hypot(dx, dy) + (BALL_R + RAIL_T / 2) * 2;
      const piece = slab(mid.x, mid.y, span, RAIL_T, Math.atan2(dy, dx), RAIL_GRIP);
      piece.render.visible = false;
      pieces.push(piece);
    }
    prev = p;
  }
  return pieces;
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

// Overlaps the curve's end by half a thickness so the join cannot leak.
function launchPanel() {
  const end = railPoint(RAIL_SWEEP);
  const panel = slab(end.x + PANEL_LEN / 2, end.y, PANEL_LEN + RAIL_T, RAIL_T, 0, RAIL_GRIP);
  panel.render.visible = false;
  return panel;
}

// Where a ball's centre sits when it is riding the inner face of the outer
// winding. The channel widens at the mouth, so this is not a fixed offset.
const railContactLift = (t) => railLift(t) - RAIL_T / 2 - BALL_R;
const railRidePoint = (t) => atAngle(RAIL_HEAD + t, railContactLift(t));

// Unit tangent in the travel direction, which is decreasing t, and how much
// arc a degree of sweep is worth there.
function railFrame(t) {
  const a = railRidePoint(t - 0.5);
  const b = railRidePoint(t + 0.5);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const len = Math.hypot(dx, dy);
  return { tx: dx / len, ty: dy / len, perDeg: len };
}

// Dead centre of the panel, resting on it.
function launchSeat() {
  const end = railPoint(RAIL_SWEEP);
  return { x: end.x + PANEL_LEN / 2, y: end.y - RAIL_T / 2 - BALL_R };
}

Composite.add(engine.world, [
  ...railWall(),
  launchPanel(),
  ...bin(STORE, 0, STORE_WALLS, BEARINGS, STORE_FLOOR, STORE_WALL_ADD),
  ...bin(TRAY, TRAY_DROP, 1, SLICK)
]);

/* ---- balls ------------------------------------------------------------- */

// Matter approximates a circle with a polygon, and at this radius that is only
// ten sides: a 36 degree facet, coarser than the rail itself. Balls in play get
// 24 so they ride the channel cleanly. circleRadius keeps them drawn round.
function ball(x, y, label) {
  const grip = GRIP[label] || PLAY_GRIP;
  return Bodies.polygon(x, y, label === 'play' ? 48 : 10, BALL_R, {
    label,
    circleRadius: BALL_R,
    // Matter takes the HIGHER restitution of a pair, so the rail cannot damp a
    // bouncy ball: this number alone decides how the rail ride feels. A ball
    // held against a curve is in contact every step, and at 0.45 each of those
    // contacts kicked it back off.
    restitution: label === 'play' ? 0.2 : 0.45,
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

// Gravity as the engine actually applies it, in px per step squared.
const G_STEP = engine.gravity.y * (engine.gravity.scale ?? 0.001) * (1000 / 60) ** 2;

// A ball that has crossed the end of the panel moving left gets picked up by
// the rail. Its t is found from where it actually is, so there is no jump.
function catchRail(body) {
  const mouth = railRidePoint(RAIL_SWEEP);
  if (body.position.y < DRAIN_BOX.y2) return false;
  if (body.position.x > mouth.x || body.velocity.x >= 0) return false;

  let t = RAIL_SWEEP;
  while (t > RAIL_TOP && railRidePoint(t).x > body.position.x) t -= 0.5;

  body.railT = t;
  body.railV = Math.hypot(body.velocity.x, body.velocity.y);
  body.collisionFilter.mask = 0;
  return true;
}

function leaveRail(body, frame) {
  body.railT = clamp(body.railT, RAIL_TOP, RAIL_SWEEP);
  const p = railRidePoint(body.railT);

  // Nudge a pixel off the wall so the ball is not already touching it when
  // collisions come back on.
  const nx = ELL.x - p.x;
  const ny = ELL.y - p.y;
  const n = Math.hypot(nx, ny);
  Body.setPosition(body, { x: p.x + nx / n, y: p.y + ny / n });
  Body.setVelocity(body, { x: frame.tx * body.railV, y: frame.ty * body.railV });
  body.railT = null;
  body.collisionFilter.mask = PLAY_FILTER.mask;
}

// Radius of curvature of the ride path, as the circumradius of three points.
function railRadius(t) {
  const a = railRidePoint(t - 1);
  const b = railRidePoint(t);
  const c = railRidePoint(t + 1);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  const sides =
    Math.hypot(b.x - a.x, b.y - a.y) *
    Math.hypot(c.x - b.x, c.y - b.y) *
    Math.hypot(a.x - c.x, a.y - c.y);
  return sides / (4 * area);
}

// A wall can push but never pull. Below the centre of the curve the inward
// direction has no downward component, so the wall is always working against
// gravity and the ball cannot come off: that is 6 o'clock round to 9. Above it,
// gravity bends the ball inward by itself, and the moment it bends harder than
// the rail does the ball leaves. No rule needed, it falls out of the geometry.
function railHolds(t, v) {
  const p = railRidePoint(t);
  const down = (ELL.y - p.y) / Math.hypot(ELL.x - p.x, ELL.y - p.y);
  if (down <= 0) return true;
  return (v * v) / railRadius(t) >= G_STEP * down;
}

// One step of the one dimensional ride: gravity along the rail, then advance.
function rideRail(body) {
  const frame = railFrame(body.railT);
  body.railV = (body.railV + G_STEP * frame.ty) * (1 - RAIL_DRAG);
  body.railT -= body.railV / frame.perDeg;

  const freed = body.railT < RAIL_FREE_AT && !railHolds(body.railT, body.railV);
  if (freed || body.railT <= RAIL_TOP || body.railT >= RAIL_SWEEP) {
    leaveRail(body, frame);
    return;
  }

  const p = railRidePoint(body.railT);
  Body.setPosition(body, p);
  Body.setVelocity(body, { x: frame.tx * body.railV, y: frame.ty * body.railV });
}

function launch(power) {
  const tray = ballsLabelled('tray');
  if (tray.length === 0) return;

  const next = tray.reduce((a, b) => (b.position.x > a.position.x ? b : a));
  Composite.remove(engine.world, next);

  const seat = launchSeat();
  const shot = ball(seat.x, seat.y, 'play');

  Composite.add(engine.world, shot);
  Body.setVelocity(shot, { x: -power, y: 0 });   // straight down the panel, to the left
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
      if (body.railT) {
        rideRail(body);
        counts.play += 1;
        continue;
      }
      if (catchRail(body)) {
        counts.play += 1;
        continue;
      }

      if (x > DRAIN_BOX.x1 && x < DRAIN_BOX.x2 && y > DRAIN_BOX.y1 && y < DRAIN_BOX.y2) {
        Composite.remove(engine.world, body);
        state.drained += 1;
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

function strokeRail(ctx, from, to, style) {
  ctx.beginPath();
  for (let t = from; t <= to; t += 1) {
    const p = railPoint(t);
    if (t === from) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  const end = railPoint(to);
  ctx.lineTo(end.x, end.y);
  ctx.strokeStyle = style;
  ctx.stroke();
}

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

  // The rail, traced from the same function the hitboxes use, so the two can
  // never drift apart. Clipped to the window, which is what trims the part that
  // runs on below the hole.
  ctx.save();
  ctx.beginPath();
  ctx.rect(OX, OY, BOX, BOX_H);
  ctx.clip();
  ctx.lineWidth = RAIL_T;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const gapLo = DRAIN_T - DRAIN_SPAN / 2;
  const gapHi = DRAIN_T + DRAIN_SPAN / 2;
  strokeRail(ctx, 0, gapLo, '#2d3a4b');
  strokeRail(ctx, gapLo, gapHi, '#e0574a');          // the hole
  strokeRail(ctx, gapHi, RAIL_SWEEP, '#2d3a4b');
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

window.__debug = { engine, Composite, state, lever, feed, counts, railLift, railPoint, atAngle };
