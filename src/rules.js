// Per-step behaviour for every dynamic body, dispatched by kind. A new kind of
// body gets its own entry in UPDATE.

import { CANVAS, DECK_TOP, JACKPOT, KNOBS } from './config.js';
import { KIND, allBodies, engine, remove } from './world.js';
import { isInJackpot, isOverDrain } from './field.js';
import { isRiding, updateRide } from './launch.js';
import { reward, updateBoxBall } from './deck.js';
import { celebrate, throwCash } from './fx.js';
import { counts, queue, stats } from './state.js';

const { Events } = Matter;

// Below the window a ball has left the field: over the hole it drained,
// anywhere else it fell out of the launch area and goes back to the box.
function updatePlayBall(body) {
  if (isRiding(body)) return updateRide(body);

  if (isInJackpot(body.position)) {
    remove(body);
    stats.jackpots += 1;
    reward(JACKPOT.reward);
    celebrate(body.position);
    return false;
  }
  if (body.position.y <= DECK_TOP) return true;

  remove(body);
  if (isOverDrain(body.position.x)) stats.drained += 1;
  else queue.box += 1;
  return false;
}

// Each returns false if it removed the body.
const UPDATE = {
  [KIND.PLAY]: updatePlayBall,
  [KIND.BOX]: updateBoxBall
};

const offCanvas = ({ x, y }) => y > CANVAS.height + 40 || x < -40 || x > CANVAS.width + 40;

function updateBodies() {
  counts.play = counts.box = 0;

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

function payKnobHits({ pairs }) {
  for (const { bodyA, bodyB } of pairs) {
    const knob = bodyA.label === KIND.KNOB ? bodyA : bodyB.label === KIND.KNOB ? bodyB : null;
    if (!knob) continue;
    stats.cash += KNOBS.cash;
    throwCash(knob.position);
  }
}

export function startRules() {
  Events.on(engine, 'afterUpdate', updateBodies);
  Events.on(engine, 'collisionStart', payKnobHits);
}
