// Bonus time: which bonus is running, how long it has left, any small bonuses
// stocked behind a big one, and what pins and knobs pay meanwhile.

import { BONUS, FX, KNOBS } from './config.js';
import { paintField } from './field.js';
import { shake } from './fx.js';
import { playRumble } from './audio.js';

export const bonus = { mode: null, left: 0, stocked: 0, nextShake: 0 };

const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

// A small bonus drawn during big bonus is stocked and runs when big ends.
// Returns 'started' or 'stocked'.
export function startBonus(mode) {
  if (bonus.mode && BONUS[mode].rank < BONUS[bonus.mode].rank) {
    bonus.stocked += 1;
    return 'stocked';
  }
  if (bonus.mode !== mode) paintField(BONUS[mode]);
  bonus.mode = mode;
  bonus.left = BONUS.seconds;
  bonus.nextShake = between(BONUS.shakeEveryS);
  return 'started';
}

// Returns the mode a stocked bonus started in when one did, for its effects.
export function updateBonus(dt) {
  if (!bonus.mode) return null;

  if (bonus.mode === 'big' && (bonus.nextShake -= dt) <= 0) {
    shake(FX.bonusShake.px, FX.bonusShake.s);
    playRumble();
    bonus.nextShake = between(BONUS.shakeEveryS);
  }
  if ((bonus.left -= dt) > 0) return null;

  bonus.mode = null;
  paintField(null);
  if (bonus.stocked === 0) return null;
  bonus.stocked -= 1;
  startBonus('small');
  return 'small';
}

export const isFree = () => bonus.mode !== null;
export const isBig = () => bonus.mode === 'big';

// What a hit pays now: { cash } or { balls }, or null for nothing.
export const pinPay = () => (bonus.mode ? BONUS[bonus.mode].pin : null);
export const knobPay = () => (bonus.mode ? BONUS[bonus.mode].knob : { cash: KNOBS.cash });
