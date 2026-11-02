// The launch lever: grab the knob, drag down, release to fire.

import { CANVAS, LEVER } from './config.js';
import { clamp, rad } from './geometry.js';

export const lever = { pull: 0, dragging: false, fromY: 0, fromPull: 0 };

export function leverTip() {
  const a = rad(LEVER.travel * lever.pull);
  return { x: LEVER.x + LEVER.length * Math.cos(a), y: LEVER.y + LEVER.length * Math.sin(a) };
}

// The canvas is scaled by CSS; map pointer coordinates back to its own grid.
function canvasPoint(canvas, e) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - box.left) * (CANVAS.width / box.width),
    y: (e.clientY - box.top) * (CANVAS.height / box.height)
  };
}

export function bindLever(canvas, { onPull, onRelease }) {
  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(canvas, e);
    const tip = leverTip();
    if (Math.hypot(p.x - tip.x, p.y - tip.y) > LEVER.grabRadius) return;

    canvas.setPointerCapture(e.pointerId);
    lever.dragging = true;
    lever.fromY = p.y;
    lever.fromPull = lever.pull;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!lever.dragging) return;
    const p = canvasPoint(canvas, e);
    lever.pull = clamp(lever.fromPull + (p.y - lever.fromY) / LEVER.pullPx, 0, 1);
    onPull(lever.pull);
  });

  const release = () => {
    if (!lever.dragging) return;
    lever.dragging = false;
    onRelease(lever.pull);
    lever.pull = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}
