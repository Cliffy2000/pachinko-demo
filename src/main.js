import { DECK, LAUNCH, PHYSICS } from './config.js';
import { engine } from './world.js';
import { buildField } from './field.js';
import { buildDeck, dispense, fillTray, payout } from './deck.js';
import { launch } from './launch.js';
import { startRules } from './rules.js';
import { canvas, drawFrame, rememberPoses } from './view.js';
import { bindLever } from './input.js';
import { bindButtons, readPower, showAuto, showPower, updatePanel } from './panel.js';
import { runLoop } from './loop.js';

const { Engine } = Matter;

buildField();
buildDeck();
startRules();

const fire = (power) => launch(LAUNCH.minSpeed + (LAUNCH.maxSpeed - LAUNCH.minSpeed) * power);

let autoFire = false;

bindLever(canvas, { onPull: showPower, onRelease: fire });
bindButtons({
  onFill: fillTray,
  onPayout: () => payout(),
  onAuto: () => showAuto((autoFire = !autoFire))
});

const dispenseEvery = Math.round(PHYSICS.hz / DECK.dispenseHz);
const fireEvery = Math.round(PHYSICS.hz * LAUNCH.autoInterval);
let steps = 0;

runLoop({
  hz: PHYSICS.hz,
  maxLagMs: PHYSICS.maxLagMs,
  step(ms) {
    rememberPoses();
    if (steps % dispenseEvery === 0) dispense();
    if (autoFire && steps % fireEvery === 0) fire(readPower());
    steps += 1;
    Engine.update(engine, ms);
  },
  draw(alpha) {
    drawFrame(alpha);
    updatePanel();
  }
});

updatePanel();
