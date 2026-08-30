import { describe, expect, it } from "vitest";
import { TUNING, reachedMilestone, sightRadius, stepBat } from "../src/scripts/rules";

describe("rules: stepBat — flight physics", () => {
  it("gravity accelerates a fall, one tick at a time", () => {
    const start = { y: 0, vy: 0 };
    const a = stepBat(start, false);
    const b = stepBat(a, false);
    expect(a.vy).toBeCloseTo(TUNING.gravity);
    expect(b.vy).toBeCloseTo(TUNING.gravity * 2);
    expect(b.y).toBeCloseTo(a.y + b.vy);
  });

  it("fall speed is capped at terminalVelocity", () => {
    let bat = { y: 0, vy: 0 };
    for (let i = 0; i < 1000; i++) bat = stepBat(bat, false);
    expect(bat.vy).toBeCloseTo(TUNING.terminalVelocity);
  });

  it("a flap SETS upward velocity — mashing does not accumulate lift", () => {
    const falling = { y: 0, vy: TUNING.terminalVelocity };
    const flapped = stepBat(falling, true);
    expect(flapped.vy).toBeCloseTo(-TUNING.flapImpulse);

    const alreadyRising = { y: 0, vy: -TUNING.flapImpulse };
    const flappedAgain = stepBat(alreadyRising, true);
    expect(flappedAgain.vy).toBeCloseTo(-TUNING.flapImpulse); // not doubled
  });
});

describe("rules: sightRadius — the light", () => {
  it("is at its maximum on the flap tick", () => {
    expect(sightRadius(0)).toBeCloseTo(TUNING.maxSight);
  });

  it("decreases monotonically after a flap", () => {
    const samples = [0, 5, 10, 20, 30, 48];
    for (let i = 1; i < samples.length; i++) {
      expect(sightRadius(samples[i])).toBeLessThan(sightRadius(samples[i - 1]));
    }
  });

  it("never falls below AURA, however long since the last flap", () => {
    expect(sightRadius(TUNING.decayTicks)).toBeCloseTo(TUNING.aura, 5);
    expect(sightRadius(TUNING.decayTicks * 10)).toBeCloseTo(TUNING.aura, 5);
    expect(sightRadius(1_000_000)).toBeGreaterThanOrEqual(TUNING.aura - 1e-9);
  });
});

describe("rules: reachedMilestone — the win condition", () => {
  it("is false before the milestone distance", () => {
    expect(reachedMilestone(TUNING.milestoneDistance - 1)).toBe(false);
  });

  it("is true at and beyond the milestone distance", () => {
    expect(reachedMilestone(TUNING.milestoneDistance)).toBe(true);
    expect(reachedMilestone(TUNING.milestoneDistance + 1000)).toBe(true);
  });
});
