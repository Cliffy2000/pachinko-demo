// Running tallies and the dispensing queue.

export const stats = { drained: 0, spilled: 0, jackpots: 0 };
export const counts = { play: 0, tray: 0, store: 0 };
export const queue = { tray: 0, store: 0, reward: 0 }; // reward: jackpot balls still in queue.store
