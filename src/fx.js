// Visual effects: fireworks and coins, bills from cash knobs, the window lights
// (flashes and bonus chases), banners, and canvas shake. Runs on wall-clock time, not
// physics steps.

import { FX, KNOBS, PALETTE, WINDOW } from './config.js';

const LIGHT_GAP = 30;
const SPARK_GRAVITY = 900; // px/s²
const BILL = { w: 9, h: 5, gravity: 260, drag: 2.5 }; // light paper: slow fall, high drag

const BURSTS = {
  tiny: { sparks: 6, coins: 0, speed: [80, 180], life: [0.25, 0.45], size: [2, 3] },
  pop: { sparks: 12, coins: 3, speed: [140, 320], life: [0.35, 0.7], size: [2, 4] },
  small: { sparks: 26, coins: 6, speed: [180, 420], life: [0.5, 1], size: [3, 5] },
  large: { sparks: 70, coins: 34, speed: [300, 800], life: [0.9, 1.8], size: [4, 7] }
};

let lastDraw = null;
let sparks = [];
let bills = [];
let flash = null;
let shakes = [];
let shown = null; // the banner

const clock = () => performance.now() / 1000;
const between = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* ---- triggers ---------------------------------------------------------- */

// A burst over the upper half, `delay` seconds from now. Gold bursts carry coins.
export function fireworks({ x, y }, size, colours = [PALETTE.gold], delay = 0) {
  const spec = BURSTS[size];
  const coins = colours.includes(PALETTE.gold) ? spec.coins : 0;

  for (let i = 0; i < spec.sparks + coins; i++) {
    const a = -Math.PI * Math.random();
    const v = between(...spec.speed);
    const spark = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, wait: delay, life: between(...spec.life) };
    if (i < spec.sparks) Object.assign(spark, { colour: pick(colours), size: between(...spec.size) });
    else Object.assign(spark, { coin: between(4, 6), phase: Math.random() * Math.PI * 2, life: spark.life * 1.4 });
    sparks.push(spark);
  }
}

export function throwCash({ x, y }, count = KNOBS.bills) {
  for (let i = 0; i < count; i++) {
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

// Every window light at once, fading out over `seconds`.
export function flashLights(colour, level, seconds) {
  flash = { colour, level, from: clock(), seconds };
}

export function shake(px, seconds) {
  shakes.push({ px, from: clock(), seconds });
}

export function banner(title, sub, colour, glow) {
  shown = { title, sub, colour, glow, from: clock() };
}

/* ---- window lights ----------------------------------------------------- */

const BULBS = (() => {
  const { x, y, w, h } = WINDOW;
  const bulbs = [];
  for (let s = 0; s < 2 * (w + h); s += LIGHT_GAP) {
    bulbs.push(
      s < w ? { x: x + s, y } :
      s < w + h ? { x: x + w, y: y + s - w } :
      s < 2 * w + h ? { x: x + w - (s - w - h), y: y + h } :
      { x, y: y + h - (s - 2 * w - h) }
    );
  }
  return bulbs;
})();

// colourOf(i) gives bulb i's colour, or null for unlit. Higher levels are
// bigger, brighter and glow wider.
function drawBulbs(ctx, colourOf, level, alpha = 1) {
  ctx.globalAlpha = (0.35 + 0.65 * level) * alpha;
  ctx.shadowBlur = 4 + 14 * level;
  const r = 2.5 + 2 * level;

  BULBS.forEach((b, i) => {
    const colour = colourOf(i);
    if (!colour) return;
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

// Small bonus: every third bulb, cyan and magenta, running round the window.
// Big bonus: every other bulb in gold, swapping 8 times a second.
const CHASES = {
  small: (t) => {
    const step = Math.floor(t * 10);
    return (i) => ((i + step) % 3 ? null : Math.floor((i + step) / 3) % 2 ? PALETTE.bonusA : PALETTE.bonusB);
  },
  big: (t) => {
    const phase = Math.floor(t * 8) % 2;
    return (i) => (i % 2 === phase ? PALETTE.gold : null);
  }
};

/* ---- particles --------------------------------------------------------- */

function drawSparks(ctx, dt) {
  sparks = sparks.filter((s) => s.wait > 0 || (s.life -= dt) > 0);
  for (const s of sparks) {
    if (s.wait > 0) {
      s.wait -= dt;
      continue;
    }
    s.vy += SPARK_GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    ctx.globalAlpha = Math.min(1, s.life * 2);
    if (s.coin) drawCoin(ctx, s, dt);
    else {
      ctx.fillStyle = s.colour;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
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

/* ---- banner ------------------------------------------------------------ */

// Pops in over 0.15 s, pulses, and fades over the last 0.4 s.
function drawBanner(ctx, t) {
  const age = t - shown.from;
  const pop = Math.min(1, age / 0.15);
  const cx = WINDOW.x + WINDOW.w / 2;
  const cy = WINDOW.y + WINDOW.h * 0.3;

  ctx.globalAlpha = Math.min(1, (FX.bannerS - age) / 0.4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = shown.colour;
  ctx.shadowColor = shown.glow;
  ctx.shadowBlur = 16;
  ctx.font = `bold ${Math.round(64 * pop * (1 + 0.05 * Math.sin(age * 12)))}px system-ui, sans-serif`;
  ctx.fillText(shown.title, cx, cy);
  ctx.font = `bold ${Math.round(26 * pop)}px system-ui, sans-serif`;
  ctx.fillText(shown.sub, cx, cy + 50);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

/* ---- per frame --------------------------------------------------------- */

function applyShake(canvas, t) {
  shakes = shakes.filter((s) => t - s.from < s.seconds);
  const amp = Math.max(0, ...shakes.map((s) => s.px * (1 - (t - s.from) / s.seconds)));
  canvas.style.transform = amp
    ? `translate(${between(-amp, amp)}px, ${between(-amp, amp)}px)`
    : '';
}

// `chase` is the running bonus mode, or null.
export function drawEffects(ctx, canvas, chase) {
  const t = clock();
  const dt = lastDraw === null ? 0 : Math.min(t - lastDraw, 0.1);
  lastDraw = t;

  ctx.save();
  applyShake(canvas, t);
  if (chase) drawBulbs(ctx, CHASES[chase](t), FX.lights[chase]);
  if (flash && t - flash.from < flash.seconds) {
    drawBulbs(ctx, () => flash.colour, flash.level, 1 - (t - flash.from) / flash.seconds);
  }
  if (sparks.length) drawSparks(ctx, dt);
  if (bills.length) drawBills(ctx, dt);
  if (shown && t - shown.from < FX.bannerS) drawBanner(ctx, t);
  ctx.restore();
}
