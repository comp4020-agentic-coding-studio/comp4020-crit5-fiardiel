import { describe, expect, it } from "vitest";
import { TUNING, stepBat } from "../src/scripts/rules";

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
