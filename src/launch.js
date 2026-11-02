// The launch ride. A ball in the channel is not simulated against the rail: it
// is moved along it as a one-dimensional body, which is smooth where slab
// contacts are not, and handed back to Matter when it leaves.

import { LAUNCH, RAIL } from './config.js';
import { clamp, outward, rideFrame, ridePoint, rideRadius } from './geometry.js';
import { FILTER, GRAVITY, KIND, STEP_S, add, ball, ballsOf, remove, setVelocity, wake } from './world.js';
import { queue, stats } from './state.js';

const { Body } = Matter;

// Overflow balls are only a count, so drawing one costs no physics.
function takeFromOverflow() {
  if (stats.spilled === 0) return false;
  stats.spilled -= 1;
  return true;
}

// The box ball nearest the lever.
function takeFromBox() {
  const pile = ballsOf(KIND.BOX);
  if (pile.length === 0) return false;
  remove(pile.reduce((a, b) => (b.position.x > a.position.x ? b : a)));
  wake(pile);
  return true;
}

// Draws from the chosen source, or the other one when it is empty; a free
// launch takes nothing. Returns whether a ball was fired.
export function launch(speed, { fromOverflow = false, free = false } = {}) {
  const [first, second] = fromOverflow ? [takeFromOverflow, takeFromBox] : [takeFromBox, takeFromOverflow];
  if (!free && !first() && !second()) return false;

  const seat = ridePoint(LAUNCH.seat);
  const shot = ball(KIND.PLAY, seat.x, seat.y);
  shot.collisionFilter.mask = 0;
  shot.plugin.ride = { t: LAUNCH.seat, v: speed };
  add(shot);
  return true;
}

export const isRiding = (body) => Boolean(body.plugin.ride);

// The rail can only push. Past the top of the curve gravity bends the ball
// inward by itself, and once it bends harder than the rail does, the ball leaves.
function railHolds(t, v) {
  const down = -outward(ridePoint(t)).y; // downward share of the inward direction
  if (down <= 0) return true;
  return (v * v) / rideRadius(t) >= GRAVITY * down;
}

function release(body, frame) {
  const { ride } = body.plugin;
  const p = ridePoint(clamp(ride.t, LAUNCH.top, RAIL.end));
  const out = outward(p);

  // A pixel clear of the wall, so collisions do not resume in contact.
  Body.setPosition(body, { x: p.x - out.x, y: p.y - out.y });
  setVelocity(body, frame.tx * ride.v, frame.ty * ride.v);
  body.collisionFilter.mask = FILTER.play.mask;
  body.plugin.ride = null;
}

// One step of the ride. Returns false if the ball was removed.
export function updateRide(body) {
  const { ride } = body.plugin;
  const frame = rideFrame(ride.t);

  ride.v = (ride.v + GRAVITY * frame.ty * STEP_S) * (1 - LAUNCH.drag) ** STEP_S;
  ride.t -= (ride.v * STEP_S) / frame.arcPerDeg;

  if (ride.t >= RAIL.end) {
    remove(body); // rolled back off the end: the ball returns to the box
    queue.box += 1;
    return false;
  }

  if (ride.t <= LAUNCH.top || (ride.t < LAUNCH.openAt && !railHolds(ride.t, ride.v))) {
    release(body, frame);
    return true;
  }

  Body.setPosition(body, ridePoint(ride.t));
  setVelocity(body, frame.tx * ride.v, frame.ty * ride.v);
  return true;
}
