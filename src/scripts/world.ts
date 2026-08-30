// Seeded, deterministic pillar generation: no DOM, no canvas. The gap
// centre random-walks from pillar to pillar, clamped so a full ping is
// always enough to see the next one coming.
import { TUNING } from "./rules";
import type { Pillar } from "./rules";

/** xorshift32 — small, fast, deterministic. State 0 is a fixed point
 *  (always produces 0), so callers must never seed with 0. */
function nextRandom(state: number): { value: number; state: number } {
  let x = state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return { value: x / 0xffffffff, state: x };
}

export type WorldState = { rng: number; lastGapY: number; index: number };

export function initWorld(seed: number): WorldState {
  return {
    rng: (seed >>> 0) || 1, // 0 would freeze xorshift; fall back to 1
    lastGapY: TUNING.playHeight / 2,
    index: 0,
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** One pillar plus the next generator state, walking from the previous
 *  gap centre — the step is clamped to TUNING.gapWalkClamp. */
export function nextPillar(state: WorldState): { pillar: Pillar; state: WorldState } {
  const { value, state: rng } = nextRandom(state.rng);
  const step = (value * 2 - 1) * TUNING.gapWalkClamp;
  const gapHalf = TUNING.gapSize / 2;
  const minGapY = gapHalf + TUNING.floorMargin;
  const maxGapY = TUNING.playHeight - gapHalf - TUNING.floorMargin;
  const gapY = clamp(state.lastGapY + step, minGapY, maxGapY);
  const pillar: Pillar = {
    x: TUNING.pillarSpacing * (state.index + 1),
    gapY,
    gapHalf,
  };
  return { pillar, state: { rng, lastGapY: gapY, index: state.index + 1 } };
}

/** A pure batch of `count` pillars from a fixed seed — what the
 *  reachability test, and any other deterministic replay, calls. */
export function generatePillars(seed: number, count: number): Pillar[] {
  let state = initWorld(seed);
  const pillars: Pillar[] = [];
  for (let i = 0; i < count; i++) {
    const next = nextPillar(state);
    pillars.push(next.pillar);
    state = next.state;
  }
  return pillars;
}
