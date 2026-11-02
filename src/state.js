// Running tallies and the dispensing queue.

export const stats = { drained: 0, spilled: 0, jackpots: 0, cash: 0 };
export const counts = { play: 0, box: 0 };
export const queue = { box: 0, reward: 0 }; // reward: jackpot balls still in queue.box
