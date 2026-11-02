// Per-step behaviour for every dynamic body, dispatched by kind. A new kind of
// body gets its own entry in UPDATE.

import { CANVAS, DECK_TOP, PINS } from './config.js';
import { KIND, allBodies, engine, remove, setVelocity } from './world.js';
import { isInLuckySlot, isOverDrain } from './field.js';
import { isRiding, updateRide } from './launch.js';
import { reward, updateBoxBall } from './deck.js';
import { fireworks, throwCash } from './fx.js';
import { playCash, playClink } from './audio.js';
import { enterLuckySlot, updateLucky } from './lucky.js';
import { knobPay, pinPay } from './bonus.js';
import { counts, queue, stats } from './state.js';

const { Body, Events } = Matter;

// Turns a ball's velocity by a random angle within scatterDeg.
function scatter(body) {
  const v = Body.getVelocity(body);
  const a = ((Math.random() * 2 - 1) * PINS.scatterDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  setVelocity(body, (v.x * c - v.y * s) * 60, (v.x * s + v.y * c) * 60);
}

// Below the window a ball has left the field: over the hole it drained,
// anywhere else it fell out of the launch area and goes back to the box.
function updatePlayBall(body) {
  if (isRiding(body)) return updateRide(body);
  if (body.plugin.scatter) {
    body.plugin.scatter = false;
    scatter(body);
  }

  if (isInLuckySlot(body.position)) {
    remove(body);
    enterLuckySlot();
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

// Knobs always pay; pins only during a bonus. A ball off a pin is marked to
// scatter once the step has resolved the bounce.
function onHits({ pairs }) {
  for (const { bodyA, bodyB } of pairs) {
    const [hit] = [bodyA, bodyB].filter((b) => b.label === KIND.KNOB || b.label === KIND.PIN);
    if (!hit) continue;
    const ball = hit === bodyA ? bodyB : bodyA;
    if (hit.label === KIND.PIN && ball.label === KIND.PLAY) ball.plugin.scatter = true;
    const owed = hit.label === KIND.KNOB ? knobPay() : pinPay();
    if (owed) pay(owed, hit.position, hit.label === KIND.KNOB ? undefined : 3);
  }
}

function step() {
  updateBodies();
  updateLucky();
}

export function startRules() {
  Events.on(engine, 'afterUpdate', step);
  Events.on(engine, 'collisionStart', onHits);
}
