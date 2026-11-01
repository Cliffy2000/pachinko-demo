/* Barebones pachinko: square cabinet, circular field, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

// The canvas is larger than the cabinet. The strip to the right and below is
// outside the machine, where overflow falls until a catcher exists.
const WIDTH = 700;
const HEIGHT = 900;
const CAB_W = 600;
const CAB_H = 800;
const BOX = 600;                             // the square glass box on top
const WALL = 20;
const BALL_R = 8.4;

// Circular playfield inscribed in the square box.
const CX = BOX / 2;
const CY = BOX / 2;
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
const STORE = { x: 28, y: 612, w: 384, h: 110 };   // interior
const STORE_CAP = 147;
const TRAY = { x: 216, y: 724, w: 190, h: 56 };    // interior
const TRAY_CAP = 25;
const TRAY_DROP = 14;                        // how far the tray floor falls to the right
const PAYOUT = 50;                           // stand-in for a jackpot, until there is one

// Lever: pivots on its left end, swings down, fires on release.
const LEVER_X = 444;
const LEVER_Y = 706;
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

const engine = Engine.create();
engine.gravity.y = 1;
engine.enableSleeping = true;                // a settled pile costs nothing

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

function slab(x, y, w, h, angle = 0) {
  return Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    angle,
    friction: 0.02,
    restitution: 0.1,
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

// Open-topped container: floor plus two side walls, nothing across the top, so
// anything past capacity climbs out on its own.
function bin(box, drop = 0) {
  const left = box.x - PLATE / 2;
  const right = box.x + box.w + PLATE / 2;
  const floorY = box.y + box.h + PLATE / 2;
  const span = box.w + PLATE * 2;
  const tilt = Math.atan2(drop, box.w);

  return [
    slab(box.x + box.w / 2, floorY + drop / 2, span, PLATE, tilt),
    slab(left, box.y + box.h / 2 + drop / 2, PLATE, box.h + drop + PLATE),
    slab(right, box.y + box.h / 2 + drop / 2, PLATE, box.h + drop + PLATE)
  ];
}

Composite.add(engine.world, [
  ...arc(R + WALL / 2, 0, 360, 96, WALL),
  ...arc(R - RAIL_GAP - RAIL_T / 2, RAIL_FROM, RAIL_TO, 48, RAIL_T),
  railCap(),
  ...bin(STORE),
  ...bin(TRAY, TRAY_DROP)
]);

function ball(x, y, label) {
  return Bodies.circle(x, y, BALL_R, {
    label,
    restitution: 0.45,
    friction: 0.02,
    frictionAir: 0.001,
    density: 0.004,
    render: { fillStyle: '#e8eef5' }
  });
}

function count(label) {
  return Composite.allBodies(engine.world).filter((b) => b.label === label).length;
}

// Hex-packed slot, filling from the floor up, so a payout lands settled instead
// of exploding. Past capacity the slot sits above the rim and spills.
function slotIn(box, i, cap) {
  const d = BALL_R * 2 + 1;
  const cols = Math.floor(box.w / d);

  if (i >= cap) {
    return { x: box.x + box.w / 2, y: box.y - 30 - (i - cap) * d };
  }

  const row = Math.floor(i / cols);
  const col = i % cols;
  return {
    x: box.x + BALL_R + col * d + (row % 2) * (d / 2),
    y: box.y + box.h - BALL_R - row * d * 0.866
  };
}

function fill(box, label, cap, n) {
  const start = count(label);
  for (let i = 0; i < n; i++) {
    const p = slotIn(box, start + i, cap);
    Composite.add(engine.world, ball(p.x, p.y, label));
  }
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
  for (const body of Composite.allBodies(engine.world)) {
    if (body.isStatic) continue;

    // Anything that leaves the canvas has spilled out of the machine.
    if (body.position.y > HEIGHT + 40) {
      Composite.remove(engine.world, body);
      continue;
    }

    if (body.label !== 'play') continue;

    if (inDrain(body.position)) {
      Composite.remove(engine.world, body);
      state.drained += 1;
    } else if (inReturn(body.position)) {
      Composite.remove(engine.world, body);
      fill(TRAY, 'tray', TRAY_CAP, 1);
    }
  }
  draw();
});

Events.on(render, 'afterRender', () => {
  const ctx = render.context;

  ctx.save();
  ctx.strokeStyle = '#2d3a4b';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CAB_W - 2, CAB_H - 2);
  ctx.strokeRect(1, 1, BOX - 2, BOX - 2);

  // The losing hole, drawn exactly where the hitbox is.
  ctx.fillStyle = '#e0574a';
  ctx.fillRect(CX - DRAIN_W / 2, DRAIN_TOP, DRAIN_W, DRAIN_H);

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
  out.tray.textContent = count('tray');
  out.store.textContent = count('store');
  out.live.textContent = count('play');
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
  fill(TRAY, 'tray', TRAY_CAP, Math.max(0, TRAY_CAP - count('tray')));
  draw();
});

payoutButton.addEventListener('click', () => {
  fill(STORE, 'store', STORE_CAP, PAYOUT);
  draw();
});

Render.run(render);
Runner.run(Runner.create(), engine);
draw();

window.__debug = { engine, Composite, state, lever };
