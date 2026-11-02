// Tunables. Lengths in px, angles in degrees, speeds in px/s, times in s.

export const DEBUG = {
  hitboxes: true // draw physics bodies instead of the finished art
};

export const PHYSICS = {
  hz: 180, // fixed step; small steps keep ball piles from compressing
  gravity: 1.8, // multiple of Matter's default, 1000 px/s²
  positionIterations: 12,
  velocityIterations: 8,
  maxLagMs: 100 // catch-up cap after a stalled frame
};

const MARGIN = 20;

export const WINDOW = { x: MARGIN, y: MARGIN, w: 600, h: 545 };
export const DECK_TOP = WINDOW.y + WINDOW.h;

export const CANVAS = {
  width: WINDOW.w + MARGIN * 2,
  height: 835 + MARGIN * 2 // window top to tray floor, plus margins
};

export const BALL = { r: 8.4, density: 0.004 };

export const PALETTE = {
  wall: '#2d3a4b',
  ball: '#e8eef5',
  hole: '#e0574a',
  knob: '#e0574a',
  pivot: '#8296ad'
};

/* ---- rail -------------------------------------------------------------- */

// The rail is one curve traced by sweep t, anticlockwise from its inner end at
// bearing `head`. Up to liftFrom it is the field boundary; from there it lifts
// by one pitch to become the outer wall of the launch channel.
const RAIL_T = 10;
const RAIL_CLEAR = 28;

export const RAIL = {
  thickness: RAIL_T,
  hitThickness: 15, // grown outward, so the contact face matches the drawing
  pitch: RAIL_CLEAR + RAIL_T, // centre-to-centre gap between the windings
  segment: 2, // sweep per slab

  head: 150,
  liftFrom: 300,
  liftTo: 360,
  mouthFrom: 390,
  mouthTo: 480,
  mouthDrop: 25, // outer winding falls away below the drain
  innerDip: 10, // inner winding pulled in between 10 and 6 o'clock
  dipTo: 120,
  end: 470
};

export const ELLIPSE = {
  x: WINDOW.x + WINDOW.w / 2,
  y: WINDOW.y + 281.5,
  a: WINDOW.w / 2 - RAIL.pitch - RAIL_T / 2, // outer winding flush with the left edge
  b: 268.5
};

export const DRAIN = { bearing: -90, span: 17.4 };

export const LAUNCH = {
  seat: 460, // sweep position of a fresh ball
  top: 300, // end of the ride; the ball is released
  openAt: 360, // channel opens; the ball may leave the rail from here
  minSpeed: 1260, // just short of making the top
  maxSpeed: 1586,
  drag: 0.018 // fraction of speed lost per second on the rail
};

/* ---- deck -------------------------------------------------------------- */

const PLATE = 8;

export const DECK = {
  plate: PLATE,

  storage: { x: MARGIN + 28, y: MARGIN + 607, w: 384, h: 110 },
  storageWallScale: 0.64, // walls shorter than the box, so a full load spills
  storageWallAdd: 10,
  storageFloor: PLATE + 20,
  dropHeight: 210, // refills fall from behind the window
  spillDelay: 0.14, // a ball resting above the rim falls out the front after this

  tray: { x: MARGIN + 216, y: MARGIN + 767, w: 190, h: 30 },
  trayDrop: 30, // floor falls this far to the right
  trayCapacity: 25,
  trayPush: 0.225, // extra down-slope acceleration, as a fraction of gravity

  payout: 50,
  dispenseHz: 60
};

/* ---- lever ------------------------------------------------------------- */

export const LEVER = {
  x: MARGIN + 444,
  y: MARGIN + 716,
  length: 108,
  travel: 40, // degrees at full pull
  pullPx: 160, // drag distance for a full pull
  grabRadius: 36
};
