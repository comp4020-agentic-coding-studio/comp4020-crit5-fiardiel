import { describe, expect, it } from "vitest";
import { TUNING } from "../src/scripts/rules";
import { generatePillars, initWorld, nextPillar } from "../src/scripts/world";

const SEED = 424242;

describe("world: seeded pillar generation", () => {
  it("is deterministic: the same seed produces the same sequence", () => {
    const a = generatePillars(SEED, 20);
    const b = generatePillars(SEED, 20);
    expect(a).toEqual(b);
  });

  it("never lets a gap-to-gap step exceed the clamp", () => {
    const pillars = generatePillars(SEED, 200);
    for (let i = 1; i < pillars.length; i++) {
      const step = Math.abs(pillars[i].gapY - pillars[i - 1].gapY);
      expect(step).toBeLessThanOrEqual(TUNING.gapWalkClamp);
    }
  });

  it("keeps the clamp itself within what a single full ping reveals — the constraint that keeps dark from being unfair", () => {
    expect(TUNING.gapWalkClamp).toBeLessThanOrEqual(TUNING.maxSight);
  });

  it("keeps every gap band inside the playable field", () => {
    const pillars = generatePillars(SEED, 200);
    for (const pillar of pillars) {
      expect(pillar.gapY - pillar.gapHalf).toBeGreaterThanOrEqual(0);
      expect(pillar.gapY + pillar.gapHalf).toBeLessThanOrEqual(TUNING.playHeight);
    }
  });

  it("advances x by pillarSpacing each pillar", () => {
    const pillars = generatePillars(SEED, 3);
    expect(pillars.map((p) => p.x)).toEqual([
      TUNING.pillarSpacing,
      TUNING.pillarSpacing * 2,
      TUNING.pillarSpacing * 3,
    ]);
  });

  it("initWorld + nextPillar chained matches generatePillars", () => {
    let state = initWorld(SEED);
    const chained = [];
    for (let i = 0; i < 5; i++) {
      const next = nextPillar(state);
      chained.push(next.pillar);
      state = next.state;
    }
    expect(chained).toEqual(generatePillars(SEED, 5));
  });
});
