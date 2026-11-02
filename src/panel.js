// The side panel: readout, power gauge and buttons.

import { counts, stats } from './state.js';

const $ = (id) => document.getElementById(id);

const out = {
  box: $('stat-box'),
  live: $('stat-live'),
  drained: $('stat-drained'),
  spilled: $('stat-spilled'),
  jackpots: $('stat-jackpots'),
  cash: $('stat-cash')
};
const power = $('power');
const autoButton = $('auto-fire');
const sourceButton = $('launch-from');

export function updatePanel() {
  out.box.textContent = counts.box;
  out.live.textContent = counts.play;
  out.drained.textContent = stats.drained;
  out.spilled.textContent = stats.spilled;
  out.jackpots.textContent = stats.jackpots;
  out.cash.textContent = stats.cash;
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

export function bindButtons({ onFill, onPayout, onAuto, onSource }) {
  $('add-balls').addEventListener('click', onFill);
  $('payout').addEventListener('click', onPayout);
  autoButton.addEventListener('click', onAuto);
  sourceButton.addEventListener('click', onSource);
}
