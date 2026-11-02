// The roulette under the lucky slot, drawn as if behind the glass: pockets
// coloured by outcome, the queued balls waiting beside it, the ball of the
// current draw, and the result once it lands.

import { BALL, DRAW, PALETTE } from './config.js';
import { POCKETS, draw, spinPose } from './lucky.js';

const POCKET_ANGLE = (Math.PI * 2) / POCKETS.length;
const QUEUE_SHOWN = 5;
const LABEL = { small: (o) => `+${o.balls}`, large: (o) => `+${o.balls}`, smallBonus: () => 'BONUS', bigBonus: () => 'BIG BONUS' };

function drawWheel(ctx, wheel, landed) {
  const { x, y } = DRAW;

  ctx.beginPath();
  ctx.arc(x, y, DRAW.track + 9, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1218';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.wall;
  ctx.stroke();

  ctx.lineWidth = 11;
  POCKETS.forEach((outcome, k) => {
    const mid = wheel + k * POCKET_ANGLE;
    ctx.beginPath();
    ctx.arc(x, y, DRAW.r, mid - POCKET_ANGLE / 2 + 0.03, mid + POCKET_ANGLE / 2 - 0.03);
    ctx.globalAlpha = landed && landed !== outcome ? 0.35 : 0.9;
    ctx.strokeStyle = outcome.colour;
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(x, y, DRAW.r - 12, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.wall;
  ctx.fill();
}

// Waiting balls stack down the left of the wheel; any beyond what fits are a count.
function drawQueue(ctx) {
  const x = DRAW.x - DRAW.track - 20;
  const top = DRAW.y - DRAW.track + BALL.r;
  ctx.fillStyle = PALETTE.ball;
  for (let i = 0; i < Math.min(draw.queued, QUEUE_SHOWN); i++) {
    ctx.beginPath();
    ctx.arc(x, top + i * (BALL.r * 2 + 2), BALL.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (draw.queued > QUEUE_SHOWN) {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+${draw.queued - QUEUE_SHOWN}`, x, top + QUEUE_SHOWN * (BALL.r * 2 + 2) + 4);
  }
}

function drawLabel(ctx, outcome) {
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = outcome.colour;
  ctx.fillText(LABEL[outcome.name](outcome), DRAW.x, DRAW.y + DRAW.track + 18);
}

export function drawChamber(ctx) {
  const { wheel, ball, landed } = spinPose();

  ctx.save();
  drawWheel(ctx, wheel, landed);
  drawQueue(ctx);
  if (ball) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL.r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.ball;
    ctx.fill();
  }
  if (landed) drawLabel(ctx, landed);
  ctx.restore();
}
