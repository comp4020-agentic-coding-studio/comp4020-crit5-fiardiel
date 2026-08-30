// Wiring: the canvas, the fixed-timestep loop, input, and nothing else.
import { createGame, requestFlap, step } from "./game";
import { bindInput } from "./input";
import { render } from "./render";
import { TUNING } from "./rules";

const canvasEl = document.querySelector<HTMLCanvasElement>("#game");
if (!canvasEl) throw new Error("no #game canvas in the page");
const canvas: HTMLCanvasElement = canvasEl;

const context = canvas.getContext("2d");
if (!context) throw new Error("2d canvas context unavailable");
const ctx: CanvasRenderingContext2D = context;

const WORLD_WIDTH = 480; // logical px; scaled to fit the viewport below
const WORLD_HEIGHT = TUNING.playHeight;
const STEP_MS = 1000 / 60;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  const scale = Math.min(cssWidth / WORLD_WIDTH, cssHeight / WORLD_HEIGHT);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}

const game = createGame();
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let accumulator = 0;
let lastTime: number | null = null;
let prevBatY = game.bat.y;

function frame(now: number): void {
  if (lastTime === null) lastTime = now;
  accumulator += Math.min(now - lastTime, 250); // clamp huge gaps (backgrounded tab)
  lastTime = now;

  while (accumulator >= STEP_MS) {
    prevBatY = game.bat.y;
    step(game);
    accumulator -= STEP_MS;
  }

  const alpha = accumulator / STEP_MS;
  const drawBatY = prevBatY + (game.bat.y - prevBatY) * alpha;
  render(ctx, game, WORLD_WIDTH, WORLD_HEIGHT, reducedMotionQuery.matches, now, drawBatY);

  requestAnimationFrame(frame);
}

resize();
window.addEventListener("resize", resize);
bindInput(canvas, () => requestFlap(game));
requestAnimationFrame(frame);
