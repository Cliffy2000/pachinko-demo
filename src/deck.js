// The box below the window that holds every ball outside the field.

import { BALL, DECK, DECK_TOP, ECONOMY, PHYSICS } from './config.js';
import { FILTER, KIND, SURFACE, add, ball, ballsOf, isClear, remove, setVelocity, wake, wall } from './world.js';
import { queue, stats } from './state.js';

const { box, plate } = DECK;

const PITCH = BALL.r * 2 + 1;
const spillLine = box.y - BALL.r * 2 * DECK.fullAbove;
const spillSteps = Math.round(DECK.spillDelay * PHYSICS.hz);

// Floor sloping down boxDrop to the right, walls rising from its ends to the rim.
export function buildDeck() {
  const leftFloor = box.y + box.h;
  const rightFloor = leftFloor + DECK.boxDrop;
  const piece = (x, y, w, h, angle) => wall(x, y, w, h, angle, SURFACE.box, FILTER.deck);

  add(
    piece(box.x + box.w / 2, (leftFloor + rightFloor) / 2 + DECK.floor / 2, box.w + plate * 2, DECK.floor, Math.atan2(DECK.boxDrop, box.w)),
    piece(box.x - plate / 2, box.y + box.h / 2, plate, box.h, 0),
    piece(box.x + box.w + plate / 2, box.y + (box.h + DECK.boxDrop) / 2, plate, box.h + DECK.boxDrop, 0)
  );
}

/* ---- dispensing -------------------------------------------------------- */

// A refill only drops once its chute is clear, so arrivals land on the pile
// rather than inside it.
function dropIntoBox() {
  const y = box.y - BALL.r - 10 - DECK.dropHeight;

  for (let tries = 0; tries < 6; tries++) {
    const x = box.x + BALL.r + Math.random() * (box.w - BALL.r * 2);
    if (!isClear(x, y, PITCH * 0.95)) continue;

    const b = ball(KIND.BOX, x, y);
    add(b);
    setVelocity(b, 0, 240);
    return true;
  }
  return false;
}

export function dispense() {
  if (queue.box > 0 && dropIntoBox()) queue.box -= 1;
  queue.reward = Math.min(queue.reward, queue.box);
}

export const dispenseHz = () => DECK.dispenseHz * (queue.reward > 0 ? DECK.rewardSpeedup : 1);

export const canBuy = (n) => stats.cash >= n * ECONOMY.ballCost;

export function buy(n) {
  if (!canBuy(n)) return;
  stats.cash -= n * ECONOMY.ballCost;
  queue.box += n;
}

export function reward(n) {
  queue.box += n;
  queue.reward += n;
}

/* ---- per-step behaviour ------------------------------------------------ */

// A ball resting above the full line gets spillSteps to roll off a side wall,
// then falls out the front of the box.
export function updateBoxBall(body) {
  const above = body.position.y > DECK_TOP && body.position.y < spillLine;
  if (!above || body.speed >= 0.5) {
    body.plugin.restSteps = 0;
    return true;
  }

  body.plugin.restSteps = (body.plugin.restSteps ?? 0) + 1;
  if (body.plugin.restSteps <= spillSteps) return true;

  spillForward(body);
  return false;
}

// There is no depth axis to fall along, so a front spill is a collisionless
// ghost dropping down the face of the cabinet.
function spillForward(body) {
  remove(body);
  wake(ballsOf(KIND.BOX));
  add(ball(KIND.SPILL, body.position.x, body.position.y));
}
