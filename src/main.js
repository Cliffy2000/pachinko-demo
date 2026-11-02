import { LAUNCH, PHYSICS } from './config.js';
import { clamp } from './geometry.js';
import { engine } from './world.js';
import { buildField } from './field.js';
import { buildDeck, buy, dispense, dispenseHz } from './deck.js';
import { launch } from './launch.js';
import { startRules } from './rules.js';
import { canvas, drawFrame, rememberPoses } from './view.js';
import { bindLever } from './input.js';
import { bindButtons, readPower, showAuto, showPower, showSource, updatePanel } from './panel.js';
import { runLoop } from './loop.js';

const { Engine } = Matter;

buildField();
buildDeck();
startRules();

let autoFire = false;
let fromOverflow = false;

const fire = (power) => launch(LAUNCH.minSpeed + (LAUNCH.maxSpeed - LAUNCH.minSpeed) * power, fromOverflow);
const autoPower = () => clamp(readPower() + (Math.random() * 2 - 1) * LAUNCH.autoJitter, 0, 1);

bindLever(canvas, { onPull: showPower, onRelease: fire });
bindButtons({
  onBuy: buy,
  onAuto: () => showAuto((autoFire = !autoFire)),
  onSource: () => showSource((fromOverflow = !fromOverflow))
});

const fireEvery = Math.round(PHYSICS.hz * LAUNCH.autoInterval);
let steps = 0;
let dispenseDue = 0;

runLoop({
  hz: PHYSICS.hz,
  maxLagMs: PHYSICS.maxLagMs,
  step(ms) {
    rememberPoses();
    dispenseDue += dispenseHz() / PHYSICS.hz;
    if (dispenseDue >= 1) {
      dispenseDue -= 1;
      dispense();
    }
    if (autoFire && steps % fireEvery === 0) fire(autoPower());
    steps += 1;
    Engine.update(engine, ms);
  },
  draw(alpha) {
    drawFrame(alpha);
    updatePanel();
  }
});

updatePanel();
