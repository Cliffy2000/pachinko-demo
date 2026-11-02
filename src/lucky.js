// The lucky slot: hits queue draws, one draw spins at a time on the roulette
// under the slot, and each outcome pays out. The outcome is chosen by weight
// when the draw starts; the spin is an animation that lands on a matching pocket.

import { BONUS, DRAW, FX, PALETTE } from './config.js';
import { STEP_S } from './world.js';
import { reward } from './deck.js';
import { isBig, startBonus } from './bonus.js';
import { fireworks, flashLights, shake } from './fx.js';
import { playBonus, playCoins, playSlotHit } from './audio.js';
import { stats } from './state.js';

const TAU = Math.PI * 2;
const AT_WHEEL = { x: DRAW.x, y: DRAW.y };

export const draw = { queued: 0, spin: null, wheel: 0 };

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

function settle(outcome) {
  if (outcome.balls) {
    reward(outcome.balls);
    const large = outcome.name === 'large';
    fireworks(AT_WHEEL, large ? 'large' : 'small');
    playCoins(large ? 'large' : 'small');
    if (large) flashLights(PALETTE.gold, FX.lights.large, FX.flashS.large);
    return;
  }

  const mode = outcome.bonus;
  if (!startBonus(mode)) {
    fireworks(AT_WHEEL, 'small', BONUS_COLOURS[mode]); // a small bonus during big bonus
    return;
  }
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

export function updateDraws() {
  const { spin } = draw;
  if (spin) {
    spin.t += STEP_S;
    if (!spin.landed && spin.t >= DRAW.spinS) {
      spin.landed = true;
      draw.wheel = wheelAngle(spin, DRAW.spinS) % TAU;
      settle(spin.outcome);
    }
    if (spin.t >= DRAW.spinS + DRAW.holdS) draw.spin = null;
  }
  if (!draw.spin && draw.queued > 0) {
    draw.queued -= 1;
    draw.spin = startSpin();
  }
}

// In big bonus the slot pays straight out instead of queueing a draw.
export function enterLuckySlot(at) {
  stats.luckyHits += 1;
  if (isBig()) {
    reward(BONUS.big.slotBalls);
    fireworks(at, 'small');
    playCoins('small');
    return;
  }
  draw.queued += 1;
  fireworks(at, 'small', [PALETTE.white]);
  flashLights(PALETTE.white, FX.lights.hit, FX.flashS.hit);
  playSlotHit();
}
