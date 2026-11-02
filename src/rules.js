// Per-step behaviour for every dynamic body, dispatched by kind. A new kind of
// body gets its own entry in UPDATE.

import { CANVAS, DECK_TOP } from './config.js';
import { KIND, STEP_S, allBodies, engine, remove } from './world.js';
import { isInLuckySlot, isOverDrain } from './field.js';
import { isRiding, updateRide } from './launch.js';
import { reward, updateBoxBall } from './deck.js';
import { fireworks, throwCash } from './fx.js';
import { playCash, playClink } from './audio.js';
import { enterLuckySlot, updateDraws } from './lucky.js';
import { knobPay, pinPay, updateBonus } from './bonus.js';
import { counts, queue, stats } from './state.js';

const { Events } = Matter;

// Below the window a ball has left the field: over the hole it drained,
// anywhere else it fell out of the launch area and goes back to the box.
function updatePlayBall(body) {
  if (isRiding(body)) return updateRide(body);

  if (isInLuckySlot(body.position)) {
    remove(body);
    enterLuckySlot(body.position);
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

function pay({ cash = 0, balls = 0 }, at, bills) {
  if (cash) {
    stats.cash += cash;
    throwCash(at, bills);
    playCash();
  }
  if (balls) {
    reward(balls);
    fireworks(at, 'tiny');
    playClink();
  }
}

// Knobs always pay; pins only during a bonus.
function payHits({ pairs }) {
  for (const { bodyA, bodyB } of pairs) {
    const [hit] = [bodyA, bodyB].filter((b) => b.label === KIND.KNOB || b.label === KIND.PIN);
    if (!hit) continue;
    const owed = hit.label === KIND.KNOB ? knobPay() : pinPay();
    if (owed) pay(owed, hit.position, hit.label === KIND.KNOB ? undefined : 3);
  }
}

function step() {
  updateBodies();
  updateDraws();
  updateBonus(STEP_S);
}

export function startRules() {
  Events.on(engine, 'afterUpdate', step);
  Events.on(engine, 'collisionStart', payHits);
}
