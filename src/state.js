// Running tallies and the dispensing queue.

import { ECONOMY } from './config.js';

export const stats = { drained: 0, spilled: 0, luckyHits: 0, cash: ECONOMY.startCash };
export const counts = { play: 0, box: 0 };
export const queue = { box: 0, reward: 0 }; // reward: won balls still in queue.box
