// The side panel: readout, power gauge and buttons.

import { counts, stats } from './state.js';

const $ = (id) => document.getElementById(id);

const out = {
  tray: $('stat-tray'),
  store: $('stat-store'),
  live: $('stat-live'),
  drained: $('stat-drained'),
  spilled: $('stat-spilled')
};
const power = $('power');
const autoButton = $('auto-fire');

export function updatePanel() {
  out.tray.textContent = counts.tray;
  out.store.textContent = counts.store;
  out.live.textContent = counts.play;
  out.drained.textContent = stats.drained;
  out.spilled.textContent = stats.spilled;
}

export function showPower(pull) {
  power.value = Math.round(pull * 100);
}

export const readPower = () => power.value / 100;

export function showAuto(on) {
  autoButton.textContent = on ? 'Auto fire: on' : 'Auto fire: off';
  autoButton.setAttribute('aria-pressed', on);
}

export function bindButtons({ onFill, onPayout, onAuto }) {
  $('add-balls').addEventListener('click', onFill);
  $('payout').addEventListener('click', onPayout);
  autoButton.addEventListener('click', onAuto);
}
