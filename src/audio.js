// Synthesised sound effects; no audio files. Browsers only allow sound after a
// user gesture, so the context starts on the first pointer or key press and
// everything before that is silent.

import { AUDIO } from './config.js';
import { KIND } from './world.js';

const { Body, Events } = Matter;

let ctx = null;
let master = null;
let noiseBuffer = null;
let voices = 0;
const lastPlayed = {};

function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = AUDIO.volume;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// Whether a sound may start now: the context is running, the voice cap has
// room, and this kind has not played within its minimum gap.
function allowed(kind, gapS = 0) {
  if (!ctx || ctx.state !== 'running' || voices >= AUDIO.maxVoices) return false;
  const now = ctx.currentTime;
  if (now - (lastPlayed[kind] ?? -Infinity) < gapS) return false;
  lastPlayed[kind] = now;
  return true;
}

// Scheduled effects pass counted: false, so they do not hold the voice cap and
// silence the game sounds while they play out.
function track(node, counted) {
  if (!counted) return;
  voices += 1;
  node.onended = () => (voices -= 1);
}

// A short enveloped oscillator, optionally gliding from freq to `to`.
function tone({ freq, to = freq, type = 'sine', gain, attack = 0.002, decay, at = 0, counted = true }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + attack + decay + 0.02);
  track(osc, counted);
}

// A burst of filtered white noise; the filter can sweep from freq to `to`.
function noise({ gain, decay, filter = 'bandpass', freq = 3000, to = freq, q = 1, attack = 0, at = 0, counted = true }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const env = ctx.createGain();

  src.buffer = noiseBuffer;
  band.type = filter;
  band.frequency.setValueAtTime(freq, t);
  if (to !== freq) band.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  band.Q.value = q;
  env.gain.setValueAtTime(attack ? 0.0001 : gain, t);
  if (attack) env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

  src.connect(band).connect(env).connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + attack + decay + 0.02);
  track(src, counted);
}

const jitter = (spread) => 1 + (Math.random() * 2 - 1) * spread;

/* ---- the sounds -------------------------------------------------------- */

// strength runs 0 to 1, from the impact speed.
function pinPing(strength) {
  if (!allowed('pin', AUDIO.pinGapS)) return;
  const f = 2600 * jitter(0.12);
  tone({ freq: f, type: 'triangle', gain: 0.14 * strength, decay: 0.06 });
  tone({ freq: f * 2.76, gain: 0.04 * strength, decay: 0.03 }); // metallic overtone
}

function tap(strength) {
  if (!allowed('tap', AUDIO.tapGapS)) return;
  noise({ gain: 0.035 * strength, decay: 0.018, freq: 2400 * jitter(0.2), q: 2 });
}

export function playCash() {
  if (!allowed('cash', 0.05)) return;
  noise({ gain: 0.08, decay: 0.05, filter: 'highpass', freq: 5000 }); // the "cha"
  tone({ freq: 1568, type: 'square', gain: 0.05, decay: 0.08 });
  tone({ freq: 2093, type: 'square', gain: 0.05, decay: 0.3, at: 0.07 });
}

// Two inharmonic partials and a tick: a coin striking coins.
function coinClink(at) {
  const f = 3200 + Math.random() * 2600;
  const gain = 0.035 + Math.random() * 0.045;
  tone({ freq: f, type: 'triangle', gain, decay: 0.09, at, counted: false });
  tone({ freq: f * 1.47, gain: gain * 0.6, decay: 0.05, at, counted: false });
  noise({ gain: gain * 0.8, decay: 0.012, filter: 'highpass', freq: 6000, at, counted: false });
}

// A clatter of coins, densest early and thinning out. size: small, large or big.
export function playCoins(size, from = 0) {
  if (!allowed('coins-' + size, 0.05)) return;
  for (let i = 0; i < AUDIO.coins[size]; i++) {
    coinClink(from + Math.random() ** 1.6 * AUDIO.clatterS[size]);
  }
}

export function playClink() {
  if (!allowed('clink', 0.03)) return;
  coinClink(0);
}

// Two quick rising notes as a ball drops into the lucky slot.
export function playSlotHit() {
  if (!allowed('slot', 0.05)) return;
  tone({ freq: 1319, type: 'triangle', gain: 0.12, decay: 0.12 });
  tone({ freq: 1976, type: 'triangle', gain: 0.12, decay: 0.25, at: 0.08 });
}

// Small bonus: a quick up-and-down run. Big bonus: a rising fanfare into coins.
export function playBonus(mode) {
  if (!allowed('bonus')) return;
  const notes = mode === 'big'
    ? [523, 659, 784, 1047, 1319, 1568]
    : [784, 988, 1175, 1568, 1175, 1568];
  notes.forEach((freq, i) =>
    tone({ freq, type: mode === 'big' ? 'triangle' : 'square', gain: mode === 'big' ? 0.16 : 0.07, decay: 0.35, at: i * 0.07, counted: false })
  );
  if (mode === 'big') playCoins('big', 0.25);
}

// The roulette ball clicking over a pocket divider.
export function playTick() {
  if (!allowed('tick', 0.012)) return;
  noise({ gain: 0.05, decay: 0.012, freq: 4200 * jitter(0.1), q: 5 });
  tone({ freq: 2900 * jitter(0.05), gain: 0.025, decay: 0.012 });
}

// The ball dropping into its pocket.
export function playLand() {
  if (!allowed('land', 0.05)) return;
  noise({ gain: 0.1, decay: 0.03, freq: 1800, q: 3 });
  tone({ freq: 880, to: 660, type: 'triangle', gain: 0.08, decay: 0.06 });
}

// A low rumble under a screen shake; heavier for the big one.
export function playRumble(heavy = false) {
  if (!allowed('rumble', 0.1)) return;
  noise({ gain: heavy ? 0.35 : 0.2, decay: heavy ? 0.6 : 0.35, filter: 'lowpass', freq: 160, counted: false });
  tone({ freq: heavy ? 70 : 60, to: 35, gain: heavy ? 0.3 : 0.18, decay: heavy ? 0.6 : 0.35, counted: false });
}

// A rising sweep as a banner pops in.
export function playWhoosh() {
  if (!allowed('whoosh', 0.2)) return;
  noise({ gain: 0.12, attack: 0.12, decay: 0.15, freq: 500, to: 5000, q: 1.5, counted: false });
}

export function playLaunch() {
  if (!allowed('launch', 0.03)) return;
  tone({ freq: 190, to: 60, gain: 0.22, decay: 0.12 });
  noise({ gain: 0.06, decay: 0.05, filter: 'lowpass', freq: 700 });
}

/* ---- collisions -------------------------------------------------------- */

// Closing speed along the contact normal, in px/s (Matter velocities are per 1/60 s).
function impactSpeed({ bodyA, bodyB, collision }) {
  const a = Body.getVelocity(bodyA);
  const b = Body.getVelocity(bodyB);
  const { normal } = collision;
  return Math.abs((a.x - b.x) * normal.x + (a.y - b.y) * normal.y) * 60;
}

// Knob hits have their own cash sound; every other contact is a pin ping or a faint tap.
function collisionSounds({ pairs }) {
  for (const pair of pairs) {
    const labels = [pair.bodyA.label, pair.bodyB.label];
    if (labels.includes(KIND.KNOB)) continue;

    const speed = impactSpeed(pair);
    if (speed < AUDIO.minImpact) continue;
    const strength = Math.min(1, speed / AUDIO.fullImpact);

    if (labels.includes(KIND.PIN)) pinPing(strength);
    else tap(strength);
  }
}

export function startAudio(engine) {
  Events.on(engine, 'collisionStart', collisionSounds);
}
