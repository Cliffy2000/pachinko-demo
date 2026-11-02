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

// A burst of filtered white noise.
function noise({ gain, decay, filter = 'bandpass', freq = 3000, q = 1, at = 0, counted = true }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const env = ctx.createGain();

  src.buffer = noiseBuffer;
  band.type = filter;
  band.frequency.value = freq;
  band.Q.value = q;
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);

  src.connect(band).connect(env).connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + decay + 0.02);
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

// A rising run, then a clatter of coins that is densest early and thins out.
export function playJackpot() {
  if (!allowed('jackpot')) return;
  [523, 659, 784, 1047, 1319, 1568].forEach((freq, i) =>
    tone({ freq, type: 'triangle', gain: 0.16, decay: 0.4, at: i * 0.07, counted: false })
  );
  for (let i = 0; i < AUDIO.jackpotCoins; i++) {
    coinClink(0.25 + Math.random() ** 1.6 * AUDIO.jackpotClatterS);
  }
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
