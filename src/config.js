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
  pin: '#b4c3d6',
  cup: '#f2685b',
  gold: '#ffd166',
  coin: '#f5c542',
  coinEdge: '#b8860b',
  cash: '#4cc96b',
  cashDark: '#25703a',
  bonusA: '#22d3ee', // small bonus: cyan and magenta
  bonusB: '#e040fb',
  white: '#ffffff'
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

// Gently arched rows under the top of the rail, then rows through the middle,
// then small gates round the knobs and the cup. Successive rows are offset by
// a third of their 60 px pitch, so no ball can fall straight down untouched.
// Points are [dx from the centre line, y from the window top]; any dx other
// than 0 is mirrored.
export const PINS = {
  r: 4,
  railClear: 20, // pins closer than this to the rail are dropped
  scatterDeg: 4, // a bounce off a pin leaves up to this far off true, like a real nail
  layout: {
    arch: [[0, 95], [60, 99], [120, 113]],
    rowB: [[20, 160], [80, 163], [140, 170], [200, 180]],
    rowC: [[40, 222], [100, 222], [160, 222], [220, 222]],
    rowD: [[0, 285], [60, 285], [120, 285], [180, 285], [240, 285]],
    knobRow: [[60, 352], [138, 360], [208, 360]], // the split, and a gate either side of each knob
    cupGuard: [[0, 397]], // on the centre line, 60 px above the cup rim
    cupSide: [[90, 420]],
    wall: [[225, 420]],
    cupWing: [[50, 445]],
    underKnob: [[200, 468]],
    lower: [[100, 500], [160, 500]],
    underCup: [[40, 520]],
    drain: [[80, 558], [130, 540]]
  }
};


/* ---- lucky slot -------------------------------------------------------- */

export const LUCKY = {
  x: WINDOW.x + WINDOW.w / 2,
  y: WINDOW.y + 457, // rim of the cup
  mouth: 26 * 1.6, // inner width
  depth: 22, // inside, rim to floor
  wall: 5,
  floor: 9
};

// Each ball into the lucky slot queues a draw. The outcome is picked by weight
// when the draw starts; the roulette under the slot only shows it.
export const DRAW = {
  x: LUCKY.x,
  y: LUCKY.y + 95, // roulette centre
  r: 34, // pocket ring
  track: 44, // where the ball rolls before it drops in
  pockets: 25, // shared out by weight, at least one each
  spinS: 2,
  holdS: 0.5, // result shown before the next draw starts
  laps: 3,
  enterS: 0.4, // a ball's drop from the slot into the queue
  // Small wins are labelled by the wheel; the rest get a banner.
  outcomes: [
    { name: 'small', weight: 15, balls: 88, colour: '#7d8fa6', label: '+88' },
    { name: 'large', weight: 7, balls: 288, colour: '#f5c542', banner: ['GOLD RUSH', '+288 balls'] },
    { name: 'smallBonus', weight: 2, bonus: 'small', colour: '#22d3ee', banner: ['LUCKY TIME', 'free balls for 10 s'] },
    { name: 'bigBonus', weight: 1, bonus: 'big', colour: '#ff4d4d', banner: ['FEVER', 'everything turns gold'] }
  ],
  stockedLabel: 'STOCKED' // a small bonus drawn during big bonus waits for it to end
};

// During a bonus, launches are free and pins and knobs pay. A drawn bonus of
// the same or higher rank restarts the clock; big replaces small.
export const BONUS = {
  seconds: 10,
  small: { rank: 1, pinColour: '#3fdc6a', knobColour: '#f5c542', pin: { cash: 25 }, knob: { balls: 50 } },
  big: { rank: 2, pinColour: '#f5c542', knobColour: '#f5c542', pin: { balls: 10 }, knob: { balls: 100 }, slotBalls: 250 },
  fireJitter: 0.06, // power spread of the bonus fire button
  shakeEveryS: [0.8, 2.2] // random gap between extra shakes in big bonus
};

// Light levels step up: slot hit, large reward, small bonus, big bonus.
export const FX = {
  lights: { hit: 0.3, large: 0.55, small: 0.75, big: 1 },
  flashS: { hit: 0.25, large: 0.6 },
  bannerS: 2.2,
  shake: { px: 11, s: 0.6 },
  bonusShake: { px: 6, s: 0.3 }
};

/* ---- cash knobs -------------------------------------------------------- */

export const KNOBS = {
  r: 8,
  dx: 173, // either side of the centre line
  y: WINDOW.y + 393,
  cash: 50, // per hit
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
  dropHeight: 210, // refills fall from behind the window
  spillDelay: 0.14, // a ball resting above the rim falls out the front after this

  dispenseHz: 60,
  rewardSpeedup: 1.25 // dispenser runs this much faster while a reward pays out
};

/* ---- economy ----------------------------------------------------------- */

export const ECONOMY = {
  startCash: 2500,
  ballCost: 4
};

/* ---- audio ------------------------------------------------------------- */

export const AUDIO = {
  volume: 0.6,
  maxVoices: 32,
  pinGapS: 0.012, // shortest gap between two pin pings
  tapGapS: 0.01,
  minImpact: 40, // px/s; slower contacts make no sound
  fullImpact: 900, // px/s; impacts this hard play at full volume
  coins: { small: 18, large: 60, big: 80 }, // clinks per clatter
  clatterS: { small: 1, large: 2.2, big: 2.6 }
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
