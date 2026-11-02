// The launch ride. A ball in the channel is not simulated against the rail: it
// is moved along it as a one-dimensional body, which is smooth where slab
// contacts are not, and handed back to Matter when it leaves.

import { LAUNCH, RAIL } from './config.js';
import { clamp, outward, rideFrame, ridePoint, rideRadius } from './geometry.js';
import { FILTER, GRAVITY, KIND, STEP_S, add, ball, ballsOf, remove, setVelocity } from './world.js';
import { queue } from './state.js';

const { Body } = Matter;

// Fire the tray ball nearest the lever.
export function launch(speed) {
  const tray = ballsOf(KIND.TRAY);
  if (tray.length === 0) return;
  remove(tray.reduce((a, b) => (b.position.x > a.position.x ? b : a)));

  const seat = ridePoint(LAUNCH.seat);
  const shot = ball(KIND.PLAY, seat.x, seat.y);
  shot.collisionFilter.mask = 0;
  shot.plugin.ride = { t: LAUNCH.seat, v: speed };
  add(shot);
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
    remove(body); // rolled back off the end: the ball returns to the tray
    queue.tray += 1;
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
