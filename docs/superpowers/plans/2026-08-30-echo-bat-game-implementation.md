# Echo — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Echo — the one-button bat-cave game — as pure, TDD'd game rules
(`rules.ts`, `world.ts`) wired to a thin mutable state machine (`game.ts`) and
an untested-but-eyeballed canvas renderer, matching the design doc exactly.

**Architecture:** Physics, collision, light decay and the win condition are
pure functions with no DOM/canvas dependency, so vitest exercises them
directly and fast. `game.ts` holds the one piece of mutable state (the state
machine + fixed-60Hz-tick loop) and is the only place that touches
`localStorage`. `render.ts` and `input.ts` are the DOM/canvas boundary and are
verified by eye per `CLAUDE.md`, not by test.

**Tech Stack:** TypeScript, Astro (static build), vitest, HTML5 Canvas 2D. No
new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-echo-bat-game-design.md`

## Global Constraints

- Every tunable constant lives in one exported `TUNING` object at the top of
  `src/scripts/rules.ts` (gravity, flap impulse, terminal velocity, `aura`,
  `maxSight`, decay ticks, scroll speed, gap size, gap-walk clamp, milestone
  distance) — balancing the game means editing values there, nowhere else.
- `rules.ts` and `world.ts` are pure: no `document`, no `canvas`, no
  `localStorage`. They must be importable and testable under plain Node.
- One rule gets the spec-mandated focused test: `hits(bat, pillar)`, replacing
  the `expect.fail` placeholder in `spec/game.test.ts`. Explicit cases:
  dead-centre in the gap is `false`; grazing the stalactite is `true`; grazing
  the stalagmite is `true`; just past the pillar's trailing edge is `false`.
- The cave's gap-centre random walk is clamped so no step exceeds
  `TUNING.maxSight` — asserted by a test (`spec/world.test.ts`), not left to
  care. This is the fairness invariant the whole design leans on.
- The world advances in fixed 60Hz steps via an accumulator, independent of
  display frame rate. `game.ts`'s `step()` is a pure-mutation function of one
  tick; `main.ts` owns the accumulator loop.
- One input intent, `flap()`/`requestFlap()`, bound to click, touch, `Enter`,
  `Space`, `ArrowUp`, `W`. `Space` and `ArrowUp` must call `preventDefault()`.
- State machine is exactly `ready → flying → dead`, `dead → ready` on a tap
  (never straight into `flying`), with a `madeItOut` flag that flips once
  during `flying` and stays flipped for the run.
- `best` lives in `localStorage`, read and written through try/catch — the
  game must run identically when storage throws or doesn't exist.
- No instructions, no tutorial text, no HUD text during `flying`, anywhere in
  the DOM (checked against the built `dist/` by `spec/game.test.ts`).
- Shipped invariants (`spec/invariants.test.ts`) must stay green: one `<nav>`,
  exactly one `<h1>`, a title, a meta description, an `og:image`.
- `pnpm check` (typecheck + build + vitest) must be green after every task.

---

### Task 1: `rules.ts` — TUNING, core types, and `hits()` (the losing rule)

This is spec line 5 (the one required focused rule test) and spec line 2 (a
wrong move is possible) answered together, exactly as the design doc calls
for.

**Files:**
- Create: `src/scripts/rules.ts`
- Modify: `spec/game.test.ts` (replace the `expect.fail` placeholder test)

**Interfaces:**
- Produces: `TUNING` (mutable object, see fields below), `type Bat = { y:
  number; vy: number }`, `type Pillar = { x: number; gapY: number; gapHalf:
  number }`, `type Phase = "ready" | "flying" | "dead"`, `hits(bat: Bat,
  pillar: Pillar): boolean`.

- [ ] **Step 1: Write the failing test**

  Open `spec/game.test.ts` and replace the whole placeholder test (the one
  that currently calls `expect.fail(...)`) with:

  ```ts
  it("has a focused automated test for one game rule: hits(bat, pillar)", () => {
    // Spec line 5, paired with spec line 2 (the losing condition). A pure
    // box-vs-gap check: does the bat, fixed at TUNING.batX, touch this
    // pillar's stalactite or stalagmite?
    const pillar = { x: TUNING.batX, gapY: 300, gapHalf: 65 };

    // dead-centre in the gap: no hit
    expect(hits({ y: 300, vy: 0 }, pillar)).toBe(false);

    // grazing the stalactite (top): a hit
    const topOfGap = pillar.gapY - pillar.gapHalf;
    expect(hits({ y: topOfGap + TUNING.batRadius, vy: 0 }, pillar)).toBe(true);

    // grazing the stalagmite (bottom): a hit
    const bottomOfGap = pillar.gapY + pillar.gapHalf;
    expect(hits({ y: bottomOfGap - TUNING.batRadius, vy: 0 }, pillar)).toBe(true);

    // just past the pillar's trailing edge: no hit, even off-gap vertically
    const passed = { ...pillar, x: TUNING.batX - TUNING.pillarWidth };
    expect(hits({ y: topOfGap, vy: 0 }, passed)).toBe(false);
  });
  ```

  Add the import at the top of `spec/game.test.ts`, alongside the existing
  imports:

  ```ts
  import { hits, TUNING } from "../src/scripts/rules";
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm exec vitest run spec/game.test.ts`
  Expected: FAIL — `Cannot find module '../src/scripts/rules'` (the file
  doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

  Create `src/scripts/rules.ts`:

  ```ts
  // Pure game rules: no DOM, no canvas. Every tunable number lives in TUNING
  // so balancing the game is editing values here, not hunting through code.
  export const TUNING = {
    // flight
    gravity: 0.35, // px/tick^2, downward
    flapImpulse: 6.2, // px/tick, upward velocity a flap SETS (not adds)
    terminalVelocity: 8, // px/tick, fall speed cap
    batRadius: 14, // px, collision half-size
    batX: 120, // px, the bat's fixed screen x

    // light
    aura: 40, // px, floor radius — never fully blind
    maxSight: 220, // px, radius snapped to on a flap
    decayTicks: 48, // ticks for a ping to decay back to AURA (~0.8s @ 60Hz)

    // the cave
    playHeight: 600, // px, logical height of the play field
    floorMargin: 30, // px, gap centres never come within this of the edges
    gapSize: 130, // px, vertical opening in a pillar
    pillarWidth: 60, // px, horizontal thickness of a pillar
    pillarSpacing: 260, // px, distance between consecutive pillar centres
    gapWalkClamp: 90, // px, max step a gap centre takes between pillars
    scrollSpeed: 2.2, // px/tick, world scroll speed == distance per tick

    // endings
    milestoneDistance: 7900, // distance to the cave mouth (~60s clean flight)
  };

  export type Bat = { y: number; vy: number };
  export type Pillar = { x: number; gapY: number; gapHalf: number };
  export type Phase = "ready" | "flying" | "dead";

  /** Box-vs-gap collision: does `bat`, sat at TUNING.batX, touch `pillar`'s
   *  stalactite or stalagmite? `pillar.x` is in the same screen-space as
   *  TUNING.batX — the caller subtracts distance travelled before calling
   *  this, so a pillar already behind the bat correctly never hits. */
  export function hits(bat: Bat, pillar: Pillar): boolean {
    const halfWidth = TUNING.pillarWidth / 2;
    const overlapsX =
      TUNING.batX + TUNING.batRadius >= pillar.x - halfWidth &&
      TUNING.batX - TUNING.batRadius <= pillar.x + halfWidth;
    if (!overlapsX) return false;

    const topOfGap = pillar.gapY - pillar.gapHalf;
    const bottomOfGap = pillar.gapY + pillar.gapHalf;
    return bat.y - TUNING.batRadius <= topOfGap || bat.y + TUNING.batRadius >= bottomOfGap;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `pnpm exec vitest run spec/game.test.ts`
  Expected: this test PASSes. (The file's other tests still fail — they need
  `dist/`, which doesn't exist yet. That's expected until Task 8.)

- [ ] **Step 5: Commit**

  ```bash
  git add src/scripts/rules.ts spec/game.test.ts
  git commit -m "feat(rules): TUNING, core types, and the hits() losing rule"
  ```

---

### Task 2: `rules.ts` — `stepBat()` flight physics

**Files:**
- Modify: `src/scripts/rules.ts` (add `stepBat`)
- Create: `spec/rules.test.ts`

**Interfaces:**
- Consumes: `TUNING`, `type Bat` from Task 1.
- Produces: `stepBat(bat: Bat, flapped: boolean): Bat`.

- [ ] **Step 1: Write the failing test**

  Create `spec/rules.test.ts`:

  ```ts
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
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm exec vitest run spec/rules.test.ts`
  Expected: FAIL — `stepBat is not a function` / `Cannot find export 'stepBat'`.

- [ ] **Step 3: Write minimal implementation**

  Add to `src/scripts/rules.ts`, after `hits()`:

  ```ts
  /** Advances one fixed 60Hz tick. A flap SETS vy to a fixed impulse (it
   *  does not add to it, so mashing does not accumulate lift); otherwise
   *  gravity accelerates the fall, capped at TUNING.terminalVelocity. */
  export function stepBat(bat: Bat, flapped: boolean): Bat {
    const vy = flapped
      ? -TUNING.flapImpulse
      : Math.min(bat.vy + TUNING.gravity, TUNING.terminalVelocity);
    return { y: bat.y + vy, vy };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `pnpm exec vitest run spec/rules.test.ts`
  Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

  ```bash
  git add src/scripts/rules.ts spec/rules.test.ts
  git commit -m "feat(rules): stepBat flight physics"
  ```

---

### Task 3: `rules.ts` — `sightRadius()` light decay and `reachedMilestone()`

**Files:**
- Modify: `src/scripts/rules.ts` (add `sightRadius`, `reachedMilestone`)
- Modify: `spec/rules.test.ts` (add two more `describe` blocks)

**Interfaces:**
- Consumes: `TUNING` from Task 1.
- Produces: `sightRadius(ticksSinceFlap: number): number`,
  `reachedMilestone(distance: number): boolean`.

- [ ] **Step 1: Write the failing test**

  Append to `spec/rules.test.ts` (same file, new imports and new
  `describe` blocks):

  ```ts
  import { describe, expect, it } from "vitest";
  import { TUNING, reachedMilestone, sightRadius, stepBat } from "../src/scripts/rules";

  // ...(keep the existing "rules: stepBat" describe block above, add these below it)

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
  ```

  (Replace the file's existing single import line with the merged one shown
  above — `reachedMilestone` and `sightRadius` added alongside `stepBat`.)

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm exec vitest run spec/rules.test.ts`
  Expected: FAIL — `sightRadius`/`reachedMilestone` not exported.

- [ ] **Step 3: Write minimal implementation**

  Add to `src/scripts/rules.ts`, after `stepBat()`:

  ```ts
  /** 1 -> 0 ease-out: steep right after a flap, flattening out by
   *  decayTicks, clamped there. */
  function decay(ticksSinceFlap: number): number {
    const progress = Math.min(Math.max(ticksSinceFlap / TUNING.decayTicks, 0), 1);
    return (1 - progress) ** 2;
  }

  /** Visibility radius: MAX on the flap tick, easing back to the AURA
   *  floor. Never below AURA — the fairness guarantee the design calls
   *  out. */
  export function sightRadius(ticksSinceFlap: number): number {
    return TUNING.aura + (TUNING.maxSight - TUNING.aura) * decay(ticksSinceFlap);
  }

  export function reachedMilestone(distance: number): boolean {
    return distance >= TUNING.milestoneDistance;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `pnpm exec vitest run spec/rules.test.ts`
  Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

  ```bash
  git add src/scripts/rules.ts spec/rules.test.ts
  git commit -m "feat(rules): sightRadius light decay and reachedMilestone"
  ```

---

### Task 4: `world.ts` — seeded RNG, pillar generation, and the reachability test

This is the test that "stops dark from becoming cheap": the gap-to-gap step
must never exceed what a single full ping reveals.

**Files:**
- Create: `src/scripts/world.ts`
- Create: `spec/world.test.ts`

**Interfaces:**
- Consumes: `TUNING`, `type Pillar` from Task 1.
- Produces: `type WorldState = { rng: number; lastGapY: number; index: number
  }`, `initWorld(seed: number): WorldState`, `nextPillar(state: WorldState):
  { pillar: Pillar; state: WorldState }`, `generatePillars(seed: number,
  count: number): Pillar[]`.

- [ ] **Step 1: Write the failing test**

  Create `spec/world.test.ts`:

  ```ts
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
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm exec vitest run spec/world.test.ts`
  Expected: FAIL — `Cannot find module '../src/scripts/world'`.

- [ ] **Step 3: Write minimal implementation**

  Create `src/scripts/world.ts`:

  ```ts
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
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `pnpm exec vitest run spec/world.test.ts`
  Expected: PASS (all six tests).

- [ ] **Step 5: Commit**

  ```bash
  git add src/scripts/world.ts spec/world.test.ts
  git commit -m "feat(world): seeded pillar generation with a clamped gap walk"
  ```

---

### Task 5: `game.ts` — the state machine, fixed-tick `step()`, and persistence

The one piece of mutable state in the codebase, per the design's architecture
table. This task also rewrites `spec/game.test.ts`'s "can be lost" test,
which currently scans page text for end-of-play words — Echo's ending is
wordless and drawn on canvas, which the test file's own header comment
explicitly invites rewriting for.

**Files:**
- Create: `src/scripts/game.ts`
- Create: `spec/game-state.test.ts`
- Modify: `spec/game.test.ts` (rewrite the "can be lost" test)

**Interfaces:**
- Consumes: `TUNING`, `hits`, `stepBat`, `reachedMilestone` (Tasks 1–3);
  `type Bat`, `type Pillar`, `type Phase` (Task 1); `initWorld`, `nextPillar`,
  `type WorldState` (Task 4).
- Produces: `type Game = { phase: Phase; bat: Bat; pillars: Pillar[];
  distance: number; best: number; madeItOut: boolean; ticksSinceFlap: number;
  world: WorldState; pendingFlap: boolean }`, `createGame(seed?: number):
  Game`, `requestFlap(game: Game): void`, `step(game: Game): void`.

- [ ] **Step 1: Write the failing tests**

  Create `spec/game-state.test.ts`:

  ```ts
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
  ```

  Then, in `spec/game.test.ts`, replace the existing "can be lost" test body
  with:

  ```ts
  it("can be lost: play reaches an ending, and the player is told", () => {
    // The ending here is wordless and drawn on <canvas> (design: no
    // on-screen text during play, no HUD) — this asserts against the game's
    // own state machine instead of scanning the page for end-of-play words,
    // per this test file's own note above about canvas-drawn endings.
    // "Told" is render.ts's job (frozen last frame, the two numbers, the
    // chevron), judged by eye rather than a DOM scan.
    const game = createGame(1);
    requestFlap(game); // ready -> flying, the one flap that starts the run
    // never flap again: gravity alone is fatal, so this always terminates
    for (let i = 0; i < 600 && game.phase === "flying"; i++) step(game);
    expect(game.phase, "600 ticks of pure gravity never reached an ending").toBe("dead");
  });
  ```

  Add the import at the top of `spec/game.test.ts`:

  ```ts
  import { createGame, requestFlap, step } from "../src/scripts/game";
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `pnpm exec vitest run spec/game-state.test.ts spec/game.test.ts`
  Expected: FAIL — `Cannot find module '../src/scripts/game'`.

- [ ] **Step 3: Write minimal implementation**

  Create `src/scripts/game.ts`:

  ```ts
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
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `pnpm exec vitest run spec/game-state.test.ts spec/game.test.ts`
  Expected: `game-state.test.ts` fully PASSes. In `game.test.ts`, the "can be
  lost" and "focused rule" tests PASS; the other two DOM-based tests
  ("runs in this page's own JS", "teaches itself") still FAIL — they need
  `dist/`, which doesn't exist until Task 8. That's expected here.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scripts/game.ts spec/game-state.test.ts spec/game.test.ts
  git commit -m "feat(game): state machine, fixed-tick step(), and best persistence"
  ```

---

### Task 6: `input.ts` — one `flap()` intent, six bindings

No unit test for this module (architecture table: DOM event wiring, verified
by eye in Task 8's manual pass).

**Files:**
- Create: `src/scripts/input.ts`

**Interfaces:**
- Produces: `bindInput(target: HTMLElement, onFlap: () => void): () => void`
  (the returned function unbinds every listener).

- [ ] **Step 1: Write the implementation**

  Create `src/scripts/input.ts`:

  ```ts
  // Binds every input surface to a single `flap()` intent. Pointer Events
  // unify mouse click and touch in one listener. Space and ArrowUp must
  // preventDefault so the page doesn't scroll while playing.
  const FLAP_KEYS = new Set(["Enter", " ", "ArrowUp", "w", "W"]);
  const SCROLL_KEYS = new Set([" ", "ArrowUp"]);

  export function bindInput(target: HTMLElement, onFlap: () => void): () => void {
    const pointerHandler = (event: Event): void => {
      event.preventDefault();
      onFlap();
    };
    const keyHandler = (event: KeyboardEvent): void => {
      if (!FLAP_KEYS.has(event.key)) return;
      if (SCROLL_KEYS.has(event.key)) event.preventDefault();
      onFlap();
    };

    target.addEventListener("pointerdown", pointerHandler);
    window.addEventListener("keydown", keyHandler);

    return () => {
      target.removeEventListener("pointerdown", pointerHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }
  ```

- [ ] **Step 2: Typecheck**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scripts/input.ts
  git commit -m "feat(input): one flap() intent bound to click, touch, and keys"
  ```

---

### Task 7: `render.ts` — canvas drawing and the darkness mask

No unit test (architecture table: judged by eye). Verified visually in
Task 8's manual pass, not here — this task just needs to typecheck.

**Files:**
- Create: `src/scripts/render.ts`

**Interfaces:**
- Consumes: `TUNING`, `sightRadius` (Tasks 1, 3); `type Game` (Task 5).
- Produces: `render(ctx: CanvasRenderingContext2D, game: Game, width: number,
  height: number, reducedMotion: boolean, elapsedMs: number, drawBatY:
  number): void`.

- [ ] **Step 1: Write the implementation**

  Create `src/scripts/render.ts`:

  ```ts
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
  ```

- [ ] **Step 2: Typecheck**

  Run: `pnpm typecheck`
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/scripts/render.ts
  git commit -m "feat(render): canvas drawing and the darkness mask"
  ```

---

### Task 8: Wire it up — `main.ts`, `index.astro`, `styles.css`

This is where the game becomes playable, and where the spec-mandated
DOM/build contract tests (`spec/game.test.ts`, `spec/invariants.test.ts`) turn
green for the first time, since they run against `dist/`.

**Files:**
- Modify: `src/scripts/main.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/styles/styles.css`

**Interfaces:**
- Consumes: `createGame`, `requestFlap`, `step` (Task 5); `bindInput`
  (Task 6); `render` (Task 7); `TUNING` (Task 1).

- [ ] **Step 1: Rewrite `src/scripts/main.ts`**

  ```ts
  // Wiring: the canvas, the fixed-timestep loop, input, and nothing else.
  import { createGame, requestFlap, step } from "./game";
  import { bindInput } from "./input";
  import { render } from "./render";
  import { TUNING } from "./rules";

  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) throw new Error("no #game canvas in the page");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");

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
  ```

- [ ] **Step 2: Rewrite `src/pages/index.astro`**

  ```astro
  ---
  import "../styles/styles.css";
  ---
  <!doctype html>
  <html lang="en-AU">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Echo</title>
      <meta
        name="description"
        content="Echo: a one-button cave game where every flap is also the only light — a bat's-eye view of Flappy Bird, playable by feel alone."
      />

      <!--
        The link-preview card: public/card.png, 1200x630. The URL resolves
        against this page, like any link. No og:title/og:description:
        scrapers fall back to the <title> and description above.
      -->
      <meta property="og:type" content="website" />
      <meta property="og:image" content="./card.png" />
      <meta name="twitter:card" content="summary_large_image" />
    </head>
    <body>
      <header>
        <nav aria-label="Primary" class="visually-hidden">
          <a href="https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel">
            Source on GitHub
          </a>
        </nav>
      </header>
      <main>
        <h1 class="visually-hidden">Echo</h1>
        <canvas
          id="game"
          aria-label="Echo: a bat flying through a dark cave. Tap, click, or press Space, Enter, Up or W to flap."
        ></canvas>
      </main>
      <script src="../scripts/main.ts"></script>
    </body>
  </html>
  ```

- [ ] **Step 3: Rewrite `src/styles/styles.css`**

  ```css
  :root {
    color-scheme: dark;
  }

  body {
    margin: 0;
    background: #050507;
  }

  main {
    display: block;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* full-bleed canvas: breaks out of any centered max-width ancestor */
  #game {
    display: block;
    width: 100vw;
    height: 100dvh;
    margin-left: calc(50% - 50vw);
    margin-right: calc(50% - 50vw);
    touch-action: none;
    cursor: pointer;
  }
  ```

- [ ] **Step 4: Build and run every test**

  Run: `pnpm check`
  Expected: `pnpm typecheck`, `pnpm build`, and `vitest run` (all of
  `spec/*.test.ts`) all PASS — including, for the first time, the two
  DOM-based tests in `spec/game.test.ts` that need `dist/`
  ("runs in this page's own JS", "teaches itself") and all of
  `spec/invariants.test.ts`.

- [ ] **Step 5: Look at it**

  Run `pnpm dev`, open the printed local URL **with the Pages base path**
  (`/comp4020-crit5-fiardiel/`), and confirm by eye:
  - the `ready` screen shows the bat hovering with a faint aura, idle-bobbing,
    nothing scrolling;
  - a tap starts flight, fires a bright ping, and the world scrolls;
  - flying into a stalactite/stalagmite (or the top/bottom edge) freezes the
    frame, dims it, and shows two numbers plus a pulsing chevron;
  - a tap from the dead screen returns to `ready` (not straight into flying);
  - `Space`/`ArrowUp` flap without scrolling the page.

- [ ] **Step 6: Commit**

  ```bash
  git add src/scripts/main.ts src/pages/index.astro src/styles/styles.css
  git commit -m "feat: wire the game into the page — Echo is playable"
  ```

---

### Task 9: Playtest, tune, and finish

The design doc calls out the milestone distance and the whole `TUNING` band
as guesses until played (`docs/superpowers/specs/2026-08-30-echo-bat-game-design.md`,
"Risks" 1–2), and the spec separately requires one change that came from
playing rather than reading code. This task is that playtest, plus the
remaining non-code polish.

**Files:**
- Modify: `src/scripts/rules.ts` (only the `TUNING` values that the playtest
  changes — no new logic)
- Modify: `public/card.png` (replace the template placeholder image)

- [ ] **Step 1: Play it**

  With `pnpm dev` running, play at least 10 runs at the Pages base path, on
  the two viewports the course marks at (see the course's assessment page).
  Note anything that feels wrong against the design's own stated risks:
  milestone too far/near for ~60s of clean flight, decay too fast/slow to
  feel fair, gravity/flap feel, whether `dead -> ready` (not straight into
  `flying`) actually prevents panic-tap deaths.

- [ ] **Step 2: Change exactly one `TUNING` constant because of what you saw**

  Edit the specific value(s) in `src/scripts/rules.ts`'s `TUNING` object —
  nothing else. This is the process citation the spec wants: a change that
  came from playing the finished game, not from reading the code.

- [ ] **Step 3: Re-run the full check suite**

  Run: `pnpm check`
  Expected: still green — a `TUNING` value change alone cannot break a type
  or the build; the `spec/world.test.ts` reachability tests re-verify the new
  numbers still satisfy `gapWalkClamp <= maxSight` and the playable-band
  bounds automatically.

- [ ] **Step 4: Replace `public/card.png`**

  Capture a 1200x630 screenshot of the game's dark-cave look (a `flying`
  frame with a visible ping is the most representative shot) and save it over
  `public/card.png`, matching the existing dimensions. `CLAUDE.md` notes
  nothing in CI checks this — verify it by looking at the deployed page head
  once shipped, per that same file.

- [ ] **Step 5: Run the evidence gate**

  Run: `pnpm check:evidence`
  Expected: passes once `PROCESS.md`'s template boilerplate is replaced with
  the real citations for this build (including the Step 2 playtest change)
  and `reflections/crit-5.md` exists — both outside this plan's scope, since
  they're the user's own account of the process, but both gate the CI deploy
  per `CLAUDE.md`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/scripts/rules.ts public/card.png
  git commit -m "tune: adjust TUNING from playtest; replace the link-preview card"
  ```

## Self-review notes

- **Spec coverage:** every mechanically-checkable spec line from the design
  doc's table is answered by a task — `hits()` (Task 1), the state machine
  and endings (Task 5), no-instructions (Task 8's build satisfies the
  existing test), the reachability clamp (Task 4), fixed-timestep (Task 5/8),
  one input intent (Task 6), shipped invariants (Task 8). The three
  human-judgement lines (five-minute finish, opening-screen affordance,
  five-minute interest) are explicitly left to Task 9's playtest and the crit
  itself, per the design doc.
- **Type consistency:** `Bat`, `Pillar`, `Phase`, `WorldState`, and `Game`
  are each defined exactly once (Tasks 1, 4, 5) and every later task imports
  those exact names/shapes rather than redefining them.
- **No placeholders:** every step above ships real, complete code — nothing
  deferred to "later" except the two items (`PROCESS.md`, `reflections/`)
  that are explicitly the user's own process account, not code, and are
  called out as such in Task 9.
