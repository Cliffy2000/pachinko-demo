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

export function bindButtons({ onFill, onPayout }) {
  $('add-balls').addEventListener('click', onFill);
  $('payout').addEventListener('click', onPayout);
}
