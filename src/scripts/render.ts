// All canvas drawing lives here: no game rules, just pixels. Draws in the
// logical coordinate space main.ts scales to fit the screen.
import { TUNING, sightRadius } from "./rules";
import type { Game } from "./game";

const CAVE_BG = "#050507";
const SKY = "#eaf6ff"; // daylight wash once madeItOut
const ROCK = "#2b2430";
const BAT_COLOR = "#f2e9d8";

export function render(
  ctx: CanvasRenderingContext2D,
  game: Game,
  width: number,
  height: number,
  reducedMotion: boolean,
  elapsedMs: number,
  drawBatY: number,
): void {
  ctx.clearRect(0, 0, width, height);

  // background: plain dark, or a daylight wash once the milestone is crossed
  ctx.fillStyle = game.madeItOut ? SKY : CAVE_BG;
  ctx.fillRect(0, 0, width, height);

  // pillars
  ctx.fillStyle = ROCK;
  const halfWidth = TUNING.pillarWidth / 2;
  for (const pillar of game.pillars) {
    const x = pillar.x - game.distance;
    if (x + halfWidth < 0 || x - halfWidth > width) continue;
    const topOfGap = pillar.gapY - pillar.gapHalf;
    const bottomOfGap = pillar.gapY + pillar.gapHalf;
    ctx.fillRect(x - halfWidth, 0, TUNING.pillarWidth, topOfGap);
    ctx.fillRect(x - halfWidth, bottomOfGap, TUNING.pillarWidth, height - bottomOfGap);
  }

  // idle bob while "ready": visibly alive and waiting
  const bob = game.phase === "ready" ? Math.sin(elapsedMs / 500) * 6 : 0;
  const batY = drawBatY + bob;

  ctx.fillStyle = BAT_COLOR;
  ctx.beginPath();
  ctx.arc(TUNING.batX, batY, TUNING.batRadius, 0, Math.PI * 2);
  ctx.fill();

  // the darkness: everywhere except a radial hole around the bat
  const radius = reducedMotion
    ? (TUNING.aura + TUNING.maxSight) / 2 + Math.sin(elapsedMs / 1500) * 10
    : sightRadius(game.ticksSinceFlap);
  ctx.save();
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(TUNING.batX, batY, 0, TUNING.batX, batY, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(TUNING.batX, batY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (game.phase === "dead") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = BAT_COLOR;
    ctx.textAlign = "center";
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText(`${Math.floor(game.distance)}`, width / 2, height / 2 - 10);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText(`best ${game.best}`, width / 2, height / 2 + 20);

    // soft pulsing chevron: "again", without words
    const pulse = (Math.sin(elapsedMs / 400) + 1) / 2;
    ctx.globalAlpha = 0.4 + pulse * 0.6;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 12, height / 2 + 50);
    ctx.lineTo(width / 2, height / 2 + 62);
    ctx.lineTo(width / 2 + 12, height / 2 + 50);
    ctx.strokeStyle = BAT_COLOR;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
