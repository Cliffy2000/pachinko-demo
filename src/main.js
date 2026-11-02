import { DECK, LAUNCH, PHYSICS } from './config.js';
import { engine } from './world.js';
import { buildField } from './field.js';
import { buildDeck, dispense, fillTray, payout } from './deck.js';
import { launch } from './launch.js';
import { startRules } from './rules.js';
import { canvas, drawFrame, rememberPoses } from './view.js';
import { bindLever } from './input.js';
import { bindButtons, showPower, updatePanel } from './panel.js';
import { runLoop } from './loop.js';

const { Engine } = Matter;

buildField();
buildDeck();
startRules();

bindLever(canvas, {
  onPull: showPower,
  onRelease: (pull) => launch(LAUNCH.minSpeed + (LAUNCH.maxSpeed - LAUNCH.minSpeed) * pull)
});
bindButtons({ onFill: fillTray, onPayout: () => payout() });

const dispenseEvery = Math.round(PHYSICS.hz / DECK.dispenseHz);
let steps = 0;

runLoop({
  hz: PHYSICS.hz,
  maxLagMs: PHYSICS.maxLagMs,
  step(ms) {
    rememberPoses();
    if (steps++ % dispenseEvery === 0) dispense();
    Engine.update(engine, ms);
  },
  draw(alpha) {
    drawFrame(alpha);
    updatePanel();
  }
});

updatePanel();
