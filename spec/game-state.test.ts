import { afterEach, describe, expect, it, vi } from "vitest";
import { TUNING } from "../src/scripts/rules";
import { createGame, requestFlap, step } from "../src/scripts/game";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("game: the state machine", () => {
  it("starts in ready, holding still", () => {
    const game = createGame(1);
    expect(game.phase).toBe("ready");
    expect(game.distance).toBe(0);
  });

  it("a flap while ready starts flying", () => {
    const game = createGame(1);
    requestFlap(game);
    expect(game.phase).toBe("flying");
  });

  it("ticks only advance the world while flying", () => {
    const game = createGame(1);
    step(game); // still "ready" — no-op
    expect(game.distance).toBe(0);
    requestFlap(game);
    step(game);
    expect(game.distance).toBe(TUNING.scrollSpeed);
  });

  it("a wrong move ends the run: falling with no more flaps is fatal", () => {
    const game = createGame(1);
    requestFlap(game); // one flap to start, then let gravity win
    for (let i = 0; i < 600 && game.phase === "flying"; i++) step(game);
    expect(game.phase).toBe("dead");
  });

  it("a tap after death returns to ready, not straight into flying", () => {
    const game = createGame(1);
    requestFlap(game);
    for (let i = 0; i < 600 && game.phase === "flying"; i++) step(game);
    expect(game.phase).toBe("dead");
    requestFlap(game);
    expect(game.phase).toBe("ready");
  });

  it("records a new best, and a later run reloads it", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });

    const first = createGame(1);
    requestFlap(first);
    for (let i = 0; i < 600 && first.phase === "flying"; i++) step(first);
    expect(first.best).toBeGreaterThan(0);

    const second = createGame(1);
    expect(second.best).toBe(first.best); // reloaded from the same "storage"
  });

  it("still runs when storage throws (private windows, blocked site data)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => {
      const game = createGame(1);
      requestFlap(game);
      step(game);
    }).not.toThrow();
  });

  it("madeItOut flips once past the milestone and stays flipped", () => {
    // Isolates the milestone-flip wiring from pillar navigation (which is
    // the real game, not this unit): widen the gap to the maximum valid
    // width (any larger inverts world.ts's minGapY/maxGapY clamp and pins
    // the gap somewhere nonsensical instead of centring it), which forces
    // every gap to sit dead-centre at playHeight / 2 — then hold altitude
    // there with a simple centre-seeking flap.
    const originalGapSize = TUNING.gapSize;
    TUNING.gapSize = TUNING.playHeight - 2 * TUNING.floorMargin;
    try {
      const game = createGame(1);
      requestFlap(game);
      const ticks = Math.ceil(TUNING.milestoneDistance / TUNING.scrollSpeed) + 5;
      for (let i = 0; i < ticks; i++) {
        if (game.bat.y > TUNING.playHeight / 2) requestFlap(game);
        step(game);
      }
      expect(game.phase).toBe("flying");
      expect(game.madeItOut).toBe(true);
    } finally {
      TUNING.gapSize = originalGapSize;
    }
  });
});
