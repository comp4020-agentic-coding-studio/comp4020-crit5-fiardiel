// Mutable game state: the state machine and the fixed-timestep tick.
// Physics and collision are pure (rules.ts); this module owns time, phase,
// and the one side effect the game has (best score in localStorage).
import { TUNING, hits, reachedMilestone, stepBat } from "./rules";
import type { Bat, Phase, Pillar } from "./rules";
import { initWorld, nextPillar } from "./world";
import type { WorldState } from "./world";

export type Game = {
  phase: Phase;
  bat: Bat;
  pillars: Pillar[];
  distance: number; // distance travelled this run
  best: number; // from localStorage
  madeItOut: boolean; // milestone crossed this run, sticky
  ticksSinceFlap: number; // drives the light

  // implementation detail, not part of the design's illustrative shape:
  world: WorldState;
  pendingFlap: boolean;
};

const BEST_KEY = "echo:best";
const SPAWN_AHEAD = TUNING.pillarSpacing * 3; // px of queued pillars past the screen

function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0; // private window, blocked storage, or no localStorage at all
  }
}

function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // best just won't persist — the run itself is unaffected
  }
}

function freshBat(): Bat {
  return { y: TUNING.playHeight / 2, vy: 0 };
}

export function createGame(seed: number = Date.now()): Game {
  return {
    phase: "ready",
    bat: freshBat(),
    pillars: [],
    distance: 0,
    best: loadBest(),
    madeItOut: false,
    ticksSinceFlap: TUNING.decayTicks * 4, // fully decayed to AURA at rest
    world: initWorld(seed),
    pendingFlap: false,
  };
}

/** The one player intent. Queued so the next fixed tick consumes it, and
 *  handles the two phase transitions a tap can cause. */
export function requestFlap(game: Game): void {
  if (game.phase === "dead") {
    // a panic-tap after a crash must not fling the player into a wall
    // they cannot see — go back to ready, not straight into flying.
    game.phase = "ready";
    game.bat = freshBat();
    game.pillars = [];
    game.distance = 0;
    game.madeItOut = false;
    game.ticksSinceFlap = TUNING.decayTicks * 4;
    game.world = initWorld(Date.now());
    game.pendingFlap = false;
    return;
  }
  if (game.phase === "ready") game.phase = "flying";
  game.pendingFlap = true;
}

function spawnPillars(game: Game): void {
  while (
    game.pillars.length === 0 ||
    game.pillars[game.pillars.length - 1]!.x - game.distance < SPAWN_AHEAD
  ) {
    const { pillar, state } = nextPillar(game.world);
    game.pillars.push(pillar);
    game.world = state;
  }
}

function removePassedPillars(game: Game): void {
  const halfWidth = TUNING.pillarWidth / 2;
  while (
    game.pillars.length > 0 &&
    game.pillars[0]!.x - game.distance + halfWidth < TUNING.batX - TUNING.batRadius
  ) {
    game.pillars.shift();
  }
}

function die(game: Game): void {
  game.phase = "dead";
  game.best = Math.max(game.best, Math.floor(game.distance));
  saveBest(game.best);
}

/** Advances one fixed 60Hz tick. No-op outside "flying" — "ready" holds
 *  still, "dead" is a frozen last frame. */
export function step(game: Game): void {
  if (game.phase !== "flying") return;

  const flapped = game.pendingFlap;
  game.pendingFlap = false;
  game.bat = stepBat(game.bat, flapped);
  game.ticksSinceFlap = flapped ? 0 : game.ticksSinceFlap + 1;
  game.distance += TUNING.scrollSpeed;

  spawnPillars(game);
  removePassedPillars(game);

  if (game.bat.y - TUNING.batRadius <= 0 || game.bat.y + TUNING.batRadius >= TUNING.playHeight) {
    die(game);
    return;
  }
  for (const pillar of game.pillars) {
    const screenPillar = { ...pillar, x: pillar.x - game.distance };
    if (hits(game.bat, screenPillar)) {
      die(game);
      return;
    }
  }

  if (!game.madeItOut && reachedMilestone(game.distance)) game.madeItOut = true;
}
