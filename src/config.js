// Tunables. Lengths in px, angles in degrees, speeds in px/s, times in s.

export const DEBUG = {
  hitboxes: false // draw physics bodies instead of the finished art
};

export const PHYSICS = {
  hz: 180, // fixed step; small steps keep ball piles from compressing
  gravity: 1.8, // multiple of Matter's default, 1000 px/s²
  positionIterations: 12,
  velocityIterations: 8,
  maxLagMs: 100 // catch-up cap after a stalled frame
};

const MARGIN = 20;

export const WINDOW = { x: MARGIN, y: MARGIN, w: 680, h: 625 };
export const DECK_TOP = WINDOW.y + WINDOW.h;

export const CANVAS = {
  width: WINDOW.w + MARGIN * 2,
  height: 835 + MARGIN * 2 // window top to box floor, plus margins
};

export const BALL = { r: 6.2, density: 0.004 };

export const PALETTE = {
  wall: '#2d3a4b',
  ball: '#e8eef5',
  hole: '#e0574a',
  knob: '#e0574a',
  pivot: '#8296ad',
  pin: '#8296ad',
  cup: '#e0574a',
  jackpot: '#ffd166',
  coin: '#f5c542',
  coinEdge: '#b8860b',
  cash: '#3fae5a',
  cashDark: '#25703a'
};

/* ---- rail -------------------------------------------------------------- */

// The rail is one curve traced by sweep t, anticlockwise from its inner end at
// bearing `head`. Up to liftFrom it is the field boundary; from there it lifts
// by one pitch to become the outer wall of the launch channel.
const RAIL_T = 12;
const RAIL_CLEAR = 28;

export const RAIL = {
  thickness: RAIL_T,
  hitThickness: 17, // grown outward, so the contact face matches the drawing
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
  y: WINDOW.y + WINDOW.h / 2 + 9,
  a: WINDOW.w / 2 - RAIL.pitch - RAIL_T / 2, // outer winding flush with the left edge
  b: WINDOW.h / 2 - 4 // top just inside the window, bottom just past it
};

export const DRAIN = { bearing: -90, width: 82, trimLeft: 4 }; // px along the rail

export const LAUNCH = {
  seat: 460, // sweep position of a fresh ball
  top: 300, // end of the ride; the ball is released
  openAt: 360, // channel opens; the ball may leave the rail from here
  minSpeed: 1340, // just short of making the top
  maxSpeed: 1687,
  drag: 0.018, // fraction of speed lost per second on the rail
  autoInterval: 0.6 / 1.75, // s between shots on auto fire; 175 a minute
  autoJitter: 0.02 // auto fire power varies by up to this much either way
};

/* ---- pins -------------------------------------------------------------- */

// Arched rows under the top of the rail, even staggered rows through the
// middle, and small gates round the knobs and the cup. Points are [dx from the
// centre line, y from the window top]; any dx other than 0 is mirrored.
export const PINS = {
  r: 4,
  railClear: 20, // pins closer than this to the rail are dropped
  layout: {
    arch: [[0, 90], [60, 96], [120, 114]],
    innerArch: [[30, 155], [90, 165], [150, 185], [205, 215]],
    row: [[30, 240], [90, 240], [150, 240], [210, 240]],
    staggered: [[0, 300], [60, 300], [120, 300], [180, 300]],
    split: [[60, 360]], // sends traffic towards either the cup or a knob
    cupGuard: [[0, 397]], // on the centre line, 60 px above the cup rim
    knobGate: [[138, 360], [208, 360]],
    wall: [[225, 420]],
    cupWing: [[50, 445]],
    lower: [[100, 500], [160, 500]],
    drain: [[70, 555]]
  }
};

/* ---- jackpot ----------------------------------------------------------- */

export const JACKPOT = {
  x: WINDOW.x + WINDOW.w / 2,
  y: WINDOW.y + 457, // rim of the cup
  mouth: 26 * 1.6, // inner width
  depth: 22, // inside, rim to floor
  wall: 5,
  floor: 9,
  reward: 100,

  shakeS: 0.6,
  shakePx: 8,
  showS: 2.4, // banner and lights
  sparks: 60,
  coins: 30
};

/* ---- cash knobs -------------------------------------------------------- */

export const KNOBS = {
  r: 8,
  dx: 173, // either side of the centre line
  y: WINDOW.y + 393,
  cash: 10, // per hit
  bills: 8 // per hit
};

/* ---- deck -------------------------------------------------------------- */

// One box holds every ball outside the field. The floor slopes down to a fixed
// lower-right corner; the left wall's height sets the capacity.
const BOX_W = 378;
const BOX_DROP = BOX_W * (30 / 190); // the old tray's slope
const BOX_DEPTH = 29;
const BOX_CORNER = { x: WINDOW.x + WINDOW.w / 2 + 81, y: MARGIN + 827 };

export const DECK = {
  plate: 8,
  floor: 12,
  fullAbove: 2, // balls stacked above the rim before the box overflows
  box: { x: BOX_CORNER.x - BOX_W, y: BOX_CORNER.y - BOX_DROP - BOX_DEPTH, w: BOX_W, h: BOX_DEPTH },
  boxDrop: BOX_DROP,
  capacity: 200, // what Fill tops the box up to
  dropHeight: 210, // refills fall from behind the window
  spillDelay: 0.14, // a ball resting above the rim falls out the front after this

  payout: 50,
  dispenseHz: 60,
  rewardSpeedup: 1.25 // dispenser runs this much faster while a jackpot pays out
};

/* ---- lever ------------------------------------------------------------- */

// Pivot level with the box rim, right of the box's right wall.
export const LEVER = {
  x: DECK.box.x + DECK.box.w + DECK.plate + 130 - (DECK.box.h + DECK.boxDrop) / 2,
  y: DECK.box.y,
  length: 108,
  travel: 40, // degrees at full pull
  pullPx: 160, // drag distance for a full pull
  grabRadius: 36
};
