// The roulette under the lucky slot, drawn as if behind the glass: the tube
// from the slot, the queued balls waiting beside the wheel (gold while big
// bonus spins for free), pockets coloured by outcome, the ball of the current
// draw, and a short label once it lands.

import { BALL, DRAW, PALETTE } from './config.js';
import { POCKETS, TUBE, draw, enteringPose, spinPose } from './lucky.js';
import { isBig } from './bonus.js';

const POCKET_ANGLE = (Math.PI * 2) / POCKETS.length;
const QUEUE_SHOWN = 5;
const QUEUE_PITCH = BALL.r * 2 + 2;
const SMALL_R = BALL.r * 0.8;

function dot(ctx, { x, y }, colour, r = SMALL_R) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

function drawTube(ctx) {
  const { from, to } = TUBE;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(from.x, to.y, to.x, to.y);
  ctx.lineTo(to.x, to.y + QUEUE_PITCH * (QUEUE_SHOWN - 0.5));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = BALL.r * 2 + 4;
  ctx.strokeStyle = '#0d1218';
  ctx.stroke();
  ctx.restore();
}

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

// Waiting balls stack down the tube; any beyond what fits are a count.
function drawQueue(ctx) {
  const { to } = TUBE;
  const colour = isBig() ? PALETTE.gold : PALETTE.ball;
  if (isBig()) {
    ctx.shadowColor = PALETTE.gold;
    ctx.shadowBlur = 8;
  }
  for (let i = 0; i < Math.min(draw.queued, QUEUE_SHOWN); i++) {
    dot(ctx, { x: to.x, y: to.y + (QUEUE_SHOWN - 1 - i) * QUEUE_PITCH }, colour);
  }
  ctx.shadowBlur = 0;

  if (draw.queued > QUEUE_SHOWN) {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colour;
    ctx.fillText(`+${draw.queued - QUEUE_SHOWN}`, to.x, to.y - QUEUE_PITCH);
  }
}

function drawNote(ctx, { text, colour }) {
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(text, DRAW.x, DRAW.y + DRAW.track + 18);
}

export function drawChamber(ctx) {
  const { wheel, ball, landed } = spinPose();

  ctx.save();
  drawTube(ctx);
  drawWheel(ctx, wheel, landed);
  drawQueue(ctx);
  for (const b of draw.entering) dot(ctx, enteringPose(b), PALETTE.ball, BALL.r);
  if (ball) dot(ctx, ball, PALETTE.ball);
  if (draw.note) drawNote(ctx, draw.note);
  ctx.restore();
}
