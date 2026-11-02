// Bonus time: which bonus is running, how long it has left, and what pins and
// knobs pay meanwhile.

import { BONUS, FX, KNOBS } from './config.js';
import { paintField } from './field.js';
import { shake } from './fx.js';

export const bonus = { mode: null, left: 0, nextShake: 0 };

const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

// Returns whether the bonus started; a small bonus does not interrupt a big one.
export function startBonus(mode) {
  if (bonus.mode && BONUS[mode].rank < BONUS[bonus.mode].rank) return false;
  if (bonus.mode !== mode) paintField(BONUS[mode]);
  bonus.mode = mode;
  bonus.left = BONUS.seconds;
  bonus.nextShake = between(BONUS.shakeEveryS);
  return true;
}

export function updateBonus(dt) {
  if (!bonus.mode) return;

  if (bonus.mode === 'big' && (bonus.nextShake -= dt) <= 0) {
    shake(FX.bonusShake.px, FX.bonusShake.s);
    bonus.nextShake = between(BONUS.shakeEveryS);
  }
  if ((bonus.left -= dt) > 0) return;

  bonus.mode = null;
  paintField(null);
}

export const isFree = () => bonus.mode !== null;
export const isBig = () => bonus.mode === 'big';

// What a hit pays now: { cash } or { balls }, or null for nothing.
export const pinPay = () => (bonus.mode ? BONUS[bonus.mode].pin : null);
export const knobPay = () => (bonus.mode ? BONUS[bonus.mode].knob : { cash: KNOBS.cash });
