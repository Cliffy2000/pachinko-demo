/* Barebones pachinko: square cabinet, circular field, lever launcher. */

const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

const WIDTH = 600;
const HEIGHT = 800;
const BOX = 600;                             // the square glass box on top
const WALL = 20;
const BALL_R = 7;

// Circular playfield inscribed in the square box.
const CX = BOX / 2;
const CY = BOX / 2;
const R = BOX / 2 - WALL;                    // inner face of the circular wall

// The launch channel is a rail concentric with the wall, open at both ends. A
// ball enters at the lower right and rides the inside of the wall to the top.
const RAIL_GAP = 28;                         // clear width of the channel
const RAIL_T = 8;
const RAIL_FROM = -75;                       // degrees; lower end, by the lever
const RAIL_TO = 100;                         // degrees; upper end, into the field
const LAUNCH_DEG = -70;
const DRAIN_Y = CY + R - BALL_R - 8;

const MIN_POWER = 16;
const MAX_POWER = 26;
const ADD_BALLS = 100;                       // placeholder until the tray is specced

// Lever: pivots on its left end, swings down, fires on release.
const LEVER_X = 420;
const LEVER_Y = 655;
const LEVER_LEN = 125;
const LEVER_MAX = 60;                        // degrees of travel
const PULL_PX = 160;                         // drag distance for a full pull
const GRAB_R = 36;

const TRAY = { x: 30, y: 628, w: 350, h: 140 };

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

Composite.add(engine.world, [
  ...arc(R + WALL / 2, 0, 360, 96, WALL),
  ...arc(R - RAIL_GAP - RAIL_T / 2, RAIL_FROM, RAIL_TO, 48, RAIL_T)
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

  // Fire tangent to the wall, heading up the right side of the channel.
  const t = rad(LAUNCH_DEG);
  Composite.add(engine.world, ball);
  Body.setVelocity(ball, { x: -Math.sin(t) * power, y: -Math.cos(t) * power });
}

// Anything that reaches the bottom is out of play, whether it drained through
// the field or dribbled back down the rail on a weak shot.
Events.on(engine, 'afterUpdate', () => {
  for (const body of Composite.allBodies(engine.world)) {
    if (body.label === 'ball' && body.position.y > DRAIN_Y) {
      Composite.remove(engine.world, body);
      state.drained += 1;
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

  ctx.fillStyle = '#161c26';
  ctx.fillRect(0, BOX, WIDTH, HEIGHT - BOX);
  ctx.beginPath();
  ctx.moveTo(0, BOX);
  ctx.lineTo(WIDTH, BOX);
  ctx.stroke();

  ctx.fillStyle = '#10151c';
  ctx.fillRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h);
  ctx.strokeRect(TRAY.x, TRAY.y, TRAY.w, TRAY.h);

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