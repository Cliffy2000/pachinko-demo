// Per-step behaviour for every dynamic body, dispatched by kind. A new kind of
// body gets its own entry in UPDATE.

import { CANVAS, DECK_TOP } from './config.js';
import { KIND, allBodies, engine, remove } from './world.js';
import { isOverDrain } from './field.js';
import { isRiding, updateRide } from './launch.js';
import { updateStorageBall, updateTrayBall } from './deck.js';
import { counts, queue, stats } from './state.js';

const { Events } = Matter;

// Below the window a ball has left the field: over the hole it drained,
// anywhere else it fell out of the launch area and goes back to the tray.
function updatePlayBall(body) {
  if (isRiding(body)) return updateRide(body);
  if (body.position.y <= DECK_TOP) return true;

  remove(body);
  if (isOverDrain(body.position.x)) stats.drained += 1;
  else queue.tray += 1;
  return false;
}

// Each returns false if it removed the body.
const UPDATE = {
  [KIND.PLAY]: updatePlayBall,
  [KIND.TRAY]: updateTrayBall,
  [KIND.STORE]: updateStorageBall
};

const offCanvas = ({ x, y }) => y > CANVAS.height + 40 || x < -40 || x > CANVAS.width + 40;

function updateBodies() {
  counts.play = counts.tray = counts.store = 0;

  for (const body of allBodies()) {
    if (body.isStatic) continue;

    if (offCanvas(body.position)) {
      remove(body);
      stats.spilled += 1;
      continue;
    }

    const update = UPDATE[body.label];
    if (update && update(body) && body.label in counts) counts[body.label] += 1;
  }
}

export function startRules() {
  Events.on(engine, 'afterUpdate', updateBodies);
}
