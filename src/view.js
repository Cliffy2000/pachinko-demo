// Drawing: Matter's renderer for bodies, plus the window, rail art and lever.

import { BALL, CANVAS, DEBUG, DECK_TOP, LEVER, PALETTE, RAIL, WINDOW } from './config.js';
import { rad, railPoint } from './geometry.js';
import { DRAIN_GAP } from './field.js';
import { KIND, allBodies, ballsOf, engine } from './world.js';
import { lever } from './input.js';
import { drawEffects } from './fx.js';

const { Render, Events, Body } = Matter;

export const canvas = document.getElementById('field');

const render = Render.create({
  canvas,
  engine,
  options: {
    width: CANVAS.width,
    height: CANVAS.height,
    wireframes: DEBUG.hitboxes,
    background: 'transparent'
  }
});

/* ---- interpolation ----------------------------------------------------- */

// Bodies are drawn between their last two physics poses. Each moved body is
// shifted to its blended pose for the draw and then restored; setPosition
// moves positionPrev by the same amount, so velocity is unaffected.
const previous = new Map();

export function rememberPoses() {
  previous.clear();
  for (const b of allBodies()) {
    if (!b.isStatic) previous.set(b.id, { x: b.position.x, y: b.position.y });
  }
}

export function drawFrame(alpha) {
  const restore = [];

  for (const b of allBodies()) {
    if (b.isStatic) continue;
    const was = previous.get(b.id);
    if (!was || (was.x === b.position.x && was.y === b.position.y)) continue;

    restore.push([b, b.position.x, b.position.y]);
    Body.setPosition(b, {
      x: was.x + (b.position.x - was.x) * alpha,
      y: was.y + (b.position.y - was.y) * alpha
    });
  }

  Render.world(render);

  for (const [b, x, y] of restore) Body.setPosition(b, { x, y });
}

/* ---- overlays ---------------------------------------------------------- */

function strokeRail(ctx, from, to, colour) {
  ctx.beginPath();
  for (let t = from; t < to; t += 1) {
    const p = railPoint(t);
    if (t === from) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  const end = railPoint(to);
  ctx.lineTo(end.x, end.y);
  ctx.strokeStyle = colour;
  ctx.stroke();
}

function paintBalls(ctx, bodies) {
  ctx.fillStyle = PALETTE.ball;
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, BALL.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function withClip(ctx, x, y, w, h, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  draw();
  ctx.restore();
}

// The finished look: the rail drawn smooth and clipped to the window, and deck
// balls clipped to the deck so the window hides refills falling behind it.
function drawArt(ctx) {
  withClip(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, () => {
    ctx.lineWidth = RAIL.thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokeRail(ctx, 0, DRAIN_GAP.from, PALETTE.wall);
    strokeRail(ctx, DRAIN_GAP.from, DRAIN_GAP.to, PALETTE.hole);
    strokeRail(ctx, DRAIN_GAP.to, RAIL.end, PALETTE.wall);
  });

  withClip(ctx, 0, DECK_TOP, CANVAS.width, CANVAS.height - DECK_TOP, () =>
    paintBalls(ctx, ballsOf(KIND.STORE, KIND.TRAY))
  );
  paintBalls(ctx, ballsOf(KIND.SPILL));
}

function drawLever(ctx) {
  ctx.save();
  ctx.translate(LEVER.x, LEVER.y);
  ctx.rotate(rad(LEVER.travel * lever.pull));

  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(0, -7, LEVER.length, 14);

  ctx.beginPath();
  ctx.arc(LEVER.length, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.knob;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.pivot;
  ctx.fill();
  ctx.restore();
}

Events.on(render, 'afterRender', () => {
  const ctx = render.context;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.wall;
  ctx.strokeRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
  ctx.restore();

  if (!DEBUG.hitboxes) drawArt(ctx);
  drawLever(ctx);
  drawEffects(ctx, canvas);
});
