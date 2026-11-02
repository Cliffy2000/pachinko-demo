// The lucky slot: a ball that goes in drops down into the draw queue, one draw
// spins at a time on the roulette under the slot, and each outcome pays out.
// The outcome is chosen by weight when the draw starts; the spin is an
// animation that lands on a matching pocket. During big bonus the roulette
// spins without using the queue, and slot hits pay out instead of queueing.

import { BONUS, DRAW, FX, LUCKY, PALETTE } from './config.js';
import { STEP_S } from './world.js';
import { reward } from './deck.js';
import { isBig, startBonus, updateBonus } from './bonus.js';
import { banner, fireworks, flashLights, shake } from './fx.js';
import { playBonus, playCoins, playSlotHit } from './audio.js';
import { stats } from './state.js';

const TAU = Math.PI * 2;
const AT_WHEEL = { x: DRAW.x, y: DRAW.y };

// entering: balls dropping from the slot, each { t, pays } where pays is a
// big-bonus payout or 0 for a queued draw. note: a short label by the wheel.
export const draw = { queued: 0, entering: [], spin: null, wheel: 0, note: null };

// Pockets shared out by weight, at least one each. The rarest are placed first,
// evenly spaced, so each outcome is spread round the wheel.
export const POCKETS = (() => {
  const total = DRAW.outcomes.reduce((s, o) => s + o.weight, 0);
  const share = DRAW.outcomes.map((o) => Math.max(1, Math.round((o.weight / total) * DRAW.pockets)));
  const ring = new Array(share.reduce((s, n) => s + n, 0)).fill(null);
  const rarestFirst = DRAW.outcomes.map((_, i) => i).sort((a, b) => share[a] - share[b]);

  for (const i of rarestFirst) {
    const free = ring.flatMap((p, k) => (p ? [] : [k]));
    for (let j = 0; j < share[i]; j++) ring[free[Math.floor((j * free.length) / share[i])]] = DRAW.outcomes[i];
  }
  return ring;
})();

const POCKET_ANGLE = TAU / POCKETS.length;

function pickOutcome() {
  let roll = Math.random() * DRAW.outcomes.reduce((s, o) => s + o.weight, 0);
  return DRAW.outcomes.find((o) => (roll -= o.weight) < 0) ?? DRAW.outcomes[0];
}

/* ---- the slot ---------------------------------------------------------- */

// The drop runs from the cup floor down a short tube to the top of the queue.
export const TUBE = {
  from: { x: LUCKY.x, y: LUCKY.y + LUCKY.depth - 4 },
  to: { x: DRAW.x - DRAW.track - 20, y: DRAW.y - DRAW.track + 6 }
};

export function enteringPose({ t }) {
  const u = Math.min(1, t / DRAW.enterS);
  const e = u * u; // falls, speeding up
  const { from, to } = TUBE;
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * Math.sqrt(e) };
}

export function enterLuckySlot() {
  stats.luckyHits += 1;
  draw.entering.push({ t: 0, pays: isBig() ? BONUS.big.slotBalls : 0 });
  playSlotHit();
}

// Once a ball reaches the queue: twin pops from the cup rims and a flash of
// the window lights, or in big bonus a straight payout.
function arrive({ pays }) {
  const rims = [-1, 1].map((side) => ({ x: LUCKY.x + side * (LUCKY.mouth / 2 + LUCKY.wall / 2), y: LUCKY.y }));
  if (pays) {
    reward(pays);
    rims.forEach((at) => fireworks(at, 'pop'));
    playCoins('small');
    return;
  }
  draw.queued += 1;
  rims.forEach((at) => fireworks(at, 'pop', [PALETTE.white]));
  flashLights(PALETTE.white, FX.lights.hit, FX.flashS.hit);
}

/* ---- the spin ---------------------------------------------------------- */

// The wheel turns one and a half laps, slowing to a stop. The ball runs the
// other way from the top, and its total travel is chosen so it finishes in the
// drawn pocket.
const WHEEL_TURN = 1.5 * TAU;
const easeOut = (u) => 1 - (1 - u) ** 3;

function startSpin() {
  const outcome = pickOutcome();
  const matching = POCKETS.flatMap((p, k) => (p === outcome ? [k] : []));
  const pocket = matching[Math.floor(Math.random() * matching.length)];

  const wheelEnd = draw.wheel + WHEEL_TURN;
  const ballFrom = -Math.PI / 2;
  const ahead = (((wheelEnd + pocket * POCKET_ANGLE - ballFrom) % TAU) + TAU) % TAU;
  const travel = ahead - TAU * (DRAW.laps + 1);

  return { outcome, pocket, t: 0, wheelFrom: draw.wheel, ballFrom, travel, landed: false };
}

function wheelAngle(spin, t) {
  const u = Math.min(1, t / DRAW.spinS);
  return spin.wheelFrom + WHEEL_TURN * (2 * u - u * u);
}

// The ball rolls round the outer track, then drops onto the pocket ring over
// the second half of the spin.
function ballPose(spin, t) {
  const u = Math.min(1, t / DRAW.spinS);
  const angle = spin.ballFrom + spin.travel * easeOut(u);
  const drop = Math.min(1, Math.max(0, (u - 0.55) / 0.35));
  const r = DRAW.track + (DRAW.r - DRAW.track) * drop * drop * (3 - 2 * drop);
  return { x: DRAW.x + Math.cos(angle) * r, y: DRAW.y + Math.sin(angle) * r };
}

// For the view: the wheel angle, the ball, and the outcome once it has landed.
export function spinPose() {
  const { spin } = draw;
  if (!spin) return { wheel: draw.wheel, ball: null, landed: null };
  return { wheel: wheelAngle(spin, spin.t), ball: ballPose(spin, spin.t), landed: spin.landed ? spin.outcome : null };
}

/* ---- outcomes ---------------------------------------------------------- */

const BONUS_COLOURS = { small: [PALETTE.bonusA, PALETTE.bonusB], big: [PALETTE.gold] };
const BANNER_COLOURS = { large: [PALETTE.gold, PALETTE.cup], smallBonus: [PALETTE.bonusA, PALETTE.bonusB], bigBonus: [PALETTE.gold, PALETTE.cup] };

const showBanner = (outcome) => banner(...outcome.banner, ...BANNER_COLOURS[outcome.name]);

function celebrateBonus(mode) {
  playBonus(mode);
  if (mode === 'small') {
    fireworks(AT_WHEEL, 'large', BONUS_COLOURS.small);
    return;
  }
  shake(FX.shake.px, FX.shake.s);
  fireworks(AT_WHEEL, 'large');
  [0.25, 0.5, 0.75].forEach((f, i) =>
    fireworks({ x: DRAW.x + (f - 0.5) * 420, y: DRAW.y - 300 }, 'large', [PALETTE.gold], 0.3 + i * 0.25)
  );
}

function settle(outcome) {
  if (outcome.banner) showBanner(outcome);
  draw.note = outcome.label ? { text: outcome.label, colour: outcome.colour } : null;

  if (outcome.balls) {
    reward(outcome.balls);
    const large = outcome.name === 'large';
    fireworks(AT_WHEEL, large ? 'large' : 'small');
    playCoins(large ? 'large' : 'small');
    if (large) flashLights(PALETTE.gold, FX.lights.large, FX.flashS.large);
    return;
  }

  if (startBonus(outcome.bonus) === 'stocked') {
    draw.note = { text: DRAW.stockedLabel, colour: outcome.colour };
    fireworks(AT_WHEEL, 'small', BONUS_COLOURS.small);
    playCoins('small');
    return;
  }
  celebrateBonus(outcome.bonus);
}

function updateSpin() {
  const { spin } = draw;
  if (spin) {
    spin.t += STEP_S;
    if (!spin.landed && spin.t >= DRAW.spinS) {
      spin.landed = true;
      draw.wheel = wheelAngle(spin, DRAW.spinS) % TAU;
      settle(spin.outcome);
    }
    if (spin.t >= DRAW.spinS + DRAW.holdS) {
      draw.spin = null;
      draw.note = null;
    }
  }
  if (draw.spin) return;
  if (isBig()) draw.spin = startSpin();
  else if (draw.queued > 0) {
    draw.queued -= 1;
    draw.spin = startSpin();
  }
}

export function updateLucky() {
  for (const ball of draw.entering) ball.t += STEP_S;
  const arrived = draw.entering.filter((b) => b.t >= DRAW.enterS);
  draw.entering = draw.entering.filter((b) => b.t < DRAW.enterS);
  arrived.forEach(arrive);

  updateSpin();
  const stockedStart = updateBonus(STEP_S);
  if (stockedStart) {
    showBanner(DRAW.outcomes.find((o) => o.bonus === stockedStart));
    celebrateBonus(stockedStart);
  }
}
