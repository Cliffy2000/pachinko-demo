// Jackpot celebration: canvas shake, chasing lights round the window, sparks
// from the cup and a banner. Runs on wall-clock time, not physics steps.

import { JACKPOT, PALETTE, WINDOW } from './config.js';

const LIGHT_GAP = 30;
const SPARK_GRAVITY = 900; // px/s²

let startedAt = -Infinity;
let lastDraw = null;
let sparks = [];

export function celebrate({ x, y }) {
  startedAt = performance.now();
  for (let i = 0; i < JACKPOT.sparks; i++) {
    const a = -Math.PI * Math.random(); // upper half
    const speed = 200 + Math.random() * 350;
    sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.6 + Math.random() * 0.6 });
  }
}

function shake(canvas, t) {
  if (t > JACKPOT.shakeS) {
    canvas.style.transform = '';
    return;
  }
  const amp = JACKPOT.shakePx * (1 - t / JACKPOT.shakeS);
  const dx = (Math.random() * 2 - 1) * amp;
  const dy = (Math.random() * 2 - 1) * amp;
  canvas.style.transform = `translate(${dx}px, ${dy}px)`;
}

// Bulbs evenly spaced round the window, every other one lit, swapping 8 times a second.
function drawLights(ctx, t) {
  const { x, y, w, h } = WINDOW;
  const perimeter = 2 * (w + h);
  const phase = Math.floor(t * 8) % 2;

  ctx.fillStyle = PALETTE.jackpot;
  ctx.shadowColor = PALETTE.jackpot;
  ctx.shadowBlur = 12;
  for (let i = 0, s = 0; s < perimeter; i++, s += LIGHT_GAP) {
    if (i % 2 !== phase) continue;
    const p =
      s < w ? { x: x + s, y } :
      s < w + h ? { x: x + w, y: y + s - w } :
      s < 2 * w + h ? { x: x + w - (s - w - h), y: y + h } :
      { x, y: y + h - (s - 2 * w - h) };
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawSparks(ctx, dt) {
  ctx.fillStyle = PALETTE.jackpot;
  sparks = sparks.filter((s) => (s.life -= dt) > 0);
  for (const s of sparks) {
    s.vy += SPARK_GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    ctx.globalAlpha = Math.min(1, s.life * 2);
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawBanner(ctx, t) {
  const pop = Math.min(1, t / 0.15); // grows in over 0.15 s
  const fade = Math.min(1, (JACKPOT.showS - t) / 0.4); // fades over the last 0.4 s
  const cx = WINDOW.x + WINDOW.w / 2;
  const cy = WINDOW.y + WINDOW.h * 0.3;

  ctx.globalAlpha = fade;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.jackpot;
  ctx.shadowColor = PALETTE.cup;
  ctx.shadowBlur = 16;
  ctx.font = `bold ${Math.round(64 * pop * (1 + 0.05 * Math.sin(t * 12)))}px system-ui, sans-serif`;
  ctx.fillText('JACKPOT', cx, cy);
  ctx.font = `bold ${Math.round(30 * pop)}px system-ui, sans-serif`;
  ctx.fillText(`+${JACKPOT.reward}`, cx, cy + 52);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

export function drawEffects(ctx, canvas) {
  const now = performance.now();
  const dt = lastDraw === null ? 0 : Math.min((now - lastDraw) / 1000, 0.1);
  lastDraw = now;
  const t = (now - startedAt) / 1000;

  ctx.save();
  shake(canvas, t);
  if (sparks.length) drawSparks(ctx, dt);
  if (t < JACKPOT.showS) {
    drawLights(ctx, t);
    drawBanner(ctx, t);
  }
  ctx.restore();
}
