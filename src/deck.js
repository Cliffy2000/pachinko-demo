// Storage box and firing tray below the window, and how balls move between them.

import { BALL, DECK, DECK_TOP, PHYSICS } from './config.js';
import {
  FILTER,
  KIND,
  SURFACE,
  add,
  ball,
  ballsOf,
  engine,
  isClear,
  remove,
  setVelocity,
  wake,
  wall
} from './world.js';
import { counts, queue } from './state.js';

const { Body } = Matter;
const { storage, tray, plate } = DECK;

const PITCH = BALL.r * 2 + 1;
const storageFloorTop = storage.y + storage.h;
const storageRim = storageFloorTop - (storage.h * DECK.storageWallScale + DECK.storageWallAdd);
const spillLine = storageRim - BALL.r * 2; // full at one ball above the rim
const spillSteps = Math.round(DECK.spillDelay * PHYSICS.hz);

// Tray refills drop through the gap between the storage floor and the tray.
const trayChute = {
  x: tray.x + 26,
  y: (storageFloorTop + DECK.storageFloor + tray.y) / 2
};

// Open-topped box: a floor sloping down `drop` to the right, and two walls
// rising from its ends. Walls shorter than the box let a full load spill.
function bin(box, { drop = 0, wallScale = 1, wallAdd = 0, floor = plate, surface }) {
  const leftFloor = box.y + box.h;
  const rightFloor = leftFloor + drop;
  const lh = box.h * wallScale + wallAdd;
  const rh = (box.h + drop) * wallScale + wallAdd;
  const piece = (x, y, w, h, angle) => wall(x, y, w, h, angle, surface, FILTER.deck);

  return [
    piece(box.x + box.w / 2, (leftFloor + rightFloor) / 2 + floor / 2, box.w + plate * 2, floor, Math.atan2(drop, box.w)),
    piece(box.x - plate / 2, leftFloor - lh / 2, plate, lh, 0),
    piece(box.x + box.w + plate / 2, rightFloor - rh / 2, plate, rh, 0)
  ];
}

export function buildDeck() {
  add(
    bin(storage, {
      wallScale: DECK.storageWallScale,
      wallAdd: DECK.storageWallAdd,
      floor: DECK.storageFloor,
      surface: SURFACE.storage
    }),
    bin(tray, { drop: DECK.trayDrop, surface: SURFACE.tray })
  );
}

/* ---- dispensing -------------------------------------------------------- */

// A refill only drops once its chute is clear, so arrivals land on the pile
// rather than inside it.
function dropIntoStorage() {
  const y = storageRim - BALL.r - 10 - DECK.dropHeight;

  for (let tries = 0; tries < 6; tries++) {
    const x = storage.x + BALL.r + Math.random() * (storage.w - BALL.r * 2);
    if (!isClear(x, y, PITCH * 0.95)) continue;

    const b = ball(KIND.STORE, x, y);
    add(b);
    setVelocity(b, 0, 240);
    return true;
  }
  return false;
}

function dropIntoTray() {
  for (let tries = 0; tries < 4; tries++) {
    const x = trayChute.x + (Math.random() - 0.5) * 8;
    if (!isClear(x, trayChute.y, PITCH * 0.9)) continue;

    const b = ball(KIND.TRAY, x, trayChute.y);
    add(b);
    setVelocity(b, 0, 120);
    return true;
  }
  return false;
}

const trayRoom = () => DECK.trayCapacity - counts.tray - queue.tray;

// Payouts fill the tray first. Storage then tops the tray up from the bottom of
// its pile, one ball in flight at a time.
function routeStock() {
  if (queue.store > 0 && trayRoom() > 0) {
    queue.store -= 1;
    queue.tray += 1;
    return;
  }
  if (queue.tray > 0 || trayRoom() <= 0 || counts.store === 0) return;

  const pile = ballsOf(KIND.STORE);
  remove(pile.reduce((a, b) => (b.position.y > a.position.y ? b : a)));
  wake(pile);
  queue.tray += 1;
}

export function dispense() {
  routeStock();
  if (queue.store > 0 && dropIntoStorage()) queue.store -= 1;
  if (queue.tray > 0 && dropIntoTray()) queue.tray -= 1;
}

export function fillTray() {
  queue.tray = Math.max(queue.tray, DECK.trayCapacity - counts.tray);
}

export function payout(n = DECK.payout) {
  queue.store += n;
}

/* ---- per-step behaviour ------------------------------------------------ */

// The tray floor is too shallow for balls to roll down it unaided.
export function updateTrayBall(body) {
  const g = engine.gravity.y * engine.gravity.scale;
  Body.applyForce(body, body.position, { x: body.mass * g * DECK.trayPush, y: 0 });
  return true;
}

// A ball resting above the full line gets spillSteps to roll off a side wall,
// then falls out the front of the box.
export function updateStorageBall(body) {
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
  wake(ballsOf(KIND.STORE));
  add(ball(KIND.SPILL, body.position.x, body.position.y));
}
