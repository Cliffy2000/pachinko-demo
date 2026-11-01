/* Barebones pachinko: square cabinet, circular field, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WIDTH = 600;
const HEIGHT = 800;
const BOX = 600;                             // the square glass box on top
const WALL = 20;
const BALL_R = 8.4;                          // 20% up from the original 7

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
const ADD_BALLS = 100;                       // placeholder until the tray is specced

// Lever: pivots on its left end, swings down, fires on release.
const LEVER_X = 420;
const LEVER_Y = 655;
const LEVER_LEN = 125;
const LEVER_MAX = 60;                        // degrees of travel
const PULL_PX = 160;                         // drag distance for a full pull
const GRAB_R = 36;

// Ball tray: the floor slopes down to the right, towards the lever.
const TRAY = { x: 40, y: 640, w: 340, floorL: 716, floorR: 764 };

// Angles are measured the maths way: 0 is right, 90 is straight up. Canvas y
// runs the other way, so every conversion flips it.
const rad = (deg) => (deg * Math.PI) / 180;
const atAngle = (r, deg) => ({ x: CX + r * Math.cos(rad(deg)), y: CY - r * Math.sin(rad(deg)) });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const state = { balls: 0, drained: 0 };
const lever = { pull: 0, dragging: false, fromY: 0, fromPull: 0 };

const engine = Engine.create();
engine.gravity.y = 1;

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

Composite.add(engine.world, [
  ...arc(R + WALL / 2, 0, 360, 96, WALL),
  ...arc(R - RAIL_GAP - RAIL_T / 2, RAIL_FROM, RAIL_TO, 48, RAIL_T),
  railCap()
]);

function launch(power) {
  if (state.balls <= 0) return;
  state.balls -= 1;

  const seat = atAngle(R - RAIL_GAP / 2, LAUNCH_DEG);
  const ball = Bodies.circle(seat.x, seat.y, BALL_R, {
    label: 'ball',
    restitution: 0.45,
    friction: 0.02,
    frictionAir: 0.001,
    density: 0.004,
    render: { fillStyle: '#e8eef5' }
  });

  // Tangent to the wall, heading clockwise: up the left side of the channel.
  const t = rad(LAUNCH_DEG);
  Composite.add(engine.world, ball);
  Body.setVelocity(ball, { x: Math.sin(t) * power, y: Math.cos(t) * power });
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
    if (body.label !== 'ball') continue;

    if (inDrain(body.position)) {
      Composite.remove(engine.world, body);
      state.drained += 1;
    } else if (inReturn(body.position)) {
      Composite.remove(engine.world, body);
      state.balls += 1;
    }
  }
  draw();
});

Events.on(render, 'afterRender', () => {
  const ctx = render.context;

  ctx.save();
  ctx.strokeStyle = '#2d3a4b';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, BOX - 2, BOX - 2);

  // The losing hole, drawn exactly where the hitbox is.
  ctx.fillStyle = '#e0574a';
  ctx.fillRect(CX - DRAIN_W / 2, DRAIN_TOP, DRAIN_W, DRAIN_H);

  ctx.fillStyle = '#161c26';
  ctx.fillRect(0, BOX, WIDTH, HEIGHT - BOX);
  ctx.beginPath();
  ctx.moveTo(0, BOX);
  ctx.lineTo(WIDTH, BOX);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(TRAY.x, TRAY.y);
  ctx.lineTo(TRAY.x + TRAY.w, TRAY.y);
  ctx.lineTo(TRAY.x + TRAY.w, TRAY.floorR);
  ctx.lineTo(TRAY.x, TRAY.floorL);
  ctx.closePath();
  ctx.fillStyle = '#10151c';
  ctx.fill();
  ctx.stroke();

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
const out = {
  balls: document.getElementById('stat-balls'),
  live: document.getElementById('stat-live'),
  drained: document.getElementById('stat-drained')
};

function draw() {
  const live = Composite.allBodies(engine.world).filter((b) => b.label === 'ball').length;
  out.balls.textContent = state.balls;
  out.live.textContent = live;
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
  state.balls += ADD_BALLS;
  draw();
});

Render.run(render);
Runner.run(Runner.create(), engine);
draw();

window.__debug = { engine, Composite, state, lever };
