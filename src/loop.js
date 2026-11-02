// Fixed-step simulation, rendered once per display frame. Leftover time is not
// stepped; it is passed to draw as alpha, the fraction of a step since the last
// physics state, so motion is smooth at any refresh rate.

export function runLoop({ hz, maxLagMs, step, draw }) {
  const stepMs = 1000 / hz;
  let lag = 0;
  let last = null;

  function frame(now) {
    requestAnimationFrame(frame);

    if (last === null) last = now;
    lag = Math.min(lag + (now - last), maxLagMs);
    last = now;

    while (lag >= stepMs) {
      step(stepMs);
      lag -= stepMs;
    }
    draw(lag / stepMs);
  }

  requestAnimationFrame(frame);
}
