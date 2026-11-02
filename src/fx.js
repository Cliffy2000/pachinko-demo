// Effects: the jackpot celebration (canvas shake, chasing lights round the
// window, sparks from the cup, a banner) and bills thrown from cash knobs.
// Runs on wall-clock time, not physics steps.

import { ECONOMY, JACKPOT, KNOBS, PALETTE, WINDOW } from './config.js';

const LIGHT_GAP = 30;
const SPARK_GRAVITY = 900; // px/s²
const BILL = { w: 9, h: 5, gravity: 260, drag: 2.5 }; // light paper: slow fall, high drag

let startedAt = -Infinity;
let lastDraw = null;
let sparks = [];
let bills = [];

const between = (lo, hi) => lo + Math.random() * (hi - lo);

// Flares and gold coins burst over the upper half; coins are slower and live longer.
export function celebrate({ x, y }) {
  startedAt = performance.now();
  const burst = (n, speed, life, extra) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random();
      const v = between(...speed);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: between(...life), ...extra() });
    }
  };
  burst(JACKPOT.sparks, [300, 800], [0.9, 1.8], () => ({ size: between(4, 7) }));
  burst(JACKPOT.coins, [250, 600], [1.4, 2.2], () => ({ coin: between(4, 6), phase: Math.random() * Math.PI * 2 }));
}

export function throwCash({ x, y }) {
  for (let i = 0; i < KNOBS.bills; i++) {
    const a = between(-Math.PI * 0.85, -Math.PI * 0.15);
    const speed = between(120, 260);
    bills.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      angle: Math.random() * Math.PI,
      spin: between(-10, 10),
      phase: Math.random() * Math.PI * 2,
      life: between(0.7, 1.1)
    });
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
    if (s.coin) drawCoin(ctx, s, dt);
    else ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

// A coin seen flipping end over end: its width follows cos of the flip.
function drawCoin(ctx, s, dt) {
  s.phase += dt * 14;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(Math.max(0.15, Math.abs(Math.cos(s.phase))), 1);
  ctx.beginPath();
  ctx.arc(0, 0, s.coin, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.coin;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.coinEdge;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = PALETTE.jackpot;
}

// Each bill tumbles and sways side to side as it falls.
function drawBills(ctx, dt) {
  bills = bills.filter((b) => (b.life -= dt) > 0);
  for (const b of bills) {
    const damp = Math.exp(-BILL.drag * dt);
    b.vx *= damp;
    b.vy = b.vy * damp + BILL.gravity * dt;
    b.phase += dt * 9;
    b.x += (b.vx + Math.sin(b.phase) * 40) * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;

    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 3);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.scale(1, Math.cos(b.phase)); // flips edge-on as it tumbles
    ctx.fillStyle = PALETTE.cash;
    ctx.fillRect(-BILL.w / 2, -BILL.h / 2, BILL.w, BILL.h);
    ctx.fillStyle = PALETTE.cashDark;
    ctx.fillRect(-1.5, -BILL.h / 2, 3, BILL.h);
    ctx.restore();
  }
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
  ctx.fillText(`+${JACKPOT.reward * ECONOMY.ballCost}`, cx, cy + 52); // the reward's worth in cash
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
  if (bills.length) drawBills(ctx, dt);
  if (t < JACKPOT.showS) {
    drawLights(ctx, t);
    drawBanner(ctx, t);
  }
  ctx.restore();
}
