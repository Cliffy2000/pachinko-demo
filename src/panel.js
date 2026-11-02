// The side panel: readout, power gauge and buttons.

import { counts, stats } from './state.js';
import { canBuy } from './deck.js';
import { bonus } from './bonus.js';

const $ = (id) => document.getElementById(id);

const out = {
  box: $('stat-box'),
  live: $('stat-live'),
  drained: $('stat-drained'),
  spilled: $('stat-spilled'),
  lucky: $('stat-lucky'),
  bonus: $('stat-bonus'),
  cash: $('stat-cash')
};
const power = $('power');
const autoButton = $('auto-fire');
const sourceButton = $('launch-from');
const fireButton = $('bonus-fire');
const buyButtons = [...document.querySelectorAll('[data-buy]')];

export function updatePanel() {
  out.box.textContent = counts.box;
  out.live.textContent = counts.play;
  out.drained.textContent = stats.drained;
  out.spilled.textContent = stats.spilled;
  out.lucky.textContent = stats.luckyHits;
  out.bonus.textContent = bonus.mode ? `${bonus.mode} ${Math.ceil(bonus.left)}s` : '-';
  out.cash.textContent = stats.cash;
  for (const b of buyButtons) b.disabled = !canBuy(Number(b.dataset.buy));

  const big = bonus.mode === 'big';
  fireButton.hidden = !big;
  autoButton.disabled = big;
}

export function showPower(pull) {
  power.value = Math.round(pull * 100);
}

export const readPower = () => power.value / 100;

export function showAuto(on) {
  autoButton.textContent = on ? 'Auto fire: on' : 'Auto fire: off';
  autoButton.setAttribute('aria-pressed', on);
}

export function showSource(fromOverflow) {
  sourceButton.textContent = fromOverflow ? 'Launch from: overflow' : 'Launch from: box';
}

export function bindButtons({ onBuy, onAuto, onSource, onBonusFire }) {
  fireButton.addEventListener('click', onBonusFire);
  for (const b of buyButtons) b.addEventListener('click', () => onBuy(Number(b.dataset.buy)));
  autoButton.addEventListener('click', onAuto);
  sourceButton.addEventListener('click', onSource);
}
