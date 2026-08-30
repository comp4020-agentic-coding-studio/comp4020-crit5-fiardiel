# Song-Guess Game ("One More Second") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Echo (the bat-cave game) with "One More Second," a guess-the-song
game: one clip per round on a fixed reveal ladder (0.1s → 0.5s → 2s → 8s → 15s),
scored 5/4/3/2/1 by the tier you guess correctly on, 3 lives, as this repo's
crit-5 submission.

**Architecture:** Four small, independently-testable modules feeding a single
page. `songs.ts` is static data. `rules.ts` is the pure state machine (no DOM,
no network) — tier ladder, scoring, title matching, win/loss transitions.
`audio.ts` isolates the only two impure operations (an iTunes Search API
`fetch`, and driving an `<audio>` element) behind small, mockable functions.
`main.ts` is wiring only: it reads `rules.ts`'s state, calls `audio.ts` to play
clips, and reflects state into `index.astro`'s markup. This mirrors the
existing repo's Echo-build harness shape (pure logic / impure edge / DOM
wiring, each its own file and test) — see
`.superpowers/sdd/2026-08-30-echo-bat-game-implementation/task-8-report.md`
for the one non-obvious TS gotcha that shape ran into (below, Task 4).

**Tech Stack:** Astro (`build.format: "file"`), TypeScript strict
(`astro check`), Vitest, iTunes Search API (`itunes.apple.com/search`, no
auth, CORS-enabled, plain `fetch`) for preview clips, static `<audio>`
element for playback. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-song-guess-game-design.md` — read
it alongside this plan; this plan argues from it and doesn't repeat its
rationale (copyright posture, UI rationale, tuning-knob candidates).

## Starting point

`spec/game.test.ts` — this week's checkable contract — is already rewritten
and committed (commit `12b3cc2`), replacing Echo's contract with this game's:
a losing condition, first-party JS (now permitting a script-driven `<audio>`,
not banning it outright), no tutorial content, and one focused rule test on
`matchesTitle`. It currently fails on the two assertions that need
`src/scripts/rules.ts` (`applyGuess`/`createInitialState`/`start`/`TIERS`/
`LIVES_START` don't exist yet) — this is intentional, the same "stake out the
target contract before the code exists" move `spec/README.md` and the
`60518b5` precedent both establish. **Task 1 does not need to touch this
file.** Task 2 is what turns it fully green.

## Global Constraints

- Static site only — no backend, no server-side code. All audio comes from a
  client-side `fetch` to the iTunes Search API at play-time; nothing is
  bundled, rehosted, or precomputed server-side.
- No tutorial/how-to-play content anywhere, on screen or off — no
  instructions text, no help panel, no README-as-manual. `spec/game.test.ts`
  enforces this with a word/element scan against the built page.
- The reveal ladder `TIERS = [0.1, 0.5, 2, 8, 15]` (seconds) and scoring
  `SCORES = [5, 4, 3, 2, 1]` are identical for every song and every round —
  no per-song or per-round difficulty variation.
- `LIVES_START = 3`. Losing the third life ends the run as `"lost"`. Running
  out of songs while any lives remain ends the run as `"won"` — lives are the
  **only** fail state (spec: "no timer, no other fail state"), so exhausting
  the song list on a miss is still a win, not a draw or a loss.
- Exactly two controls for the whole game: the ▶ start button (shown once, at
  the very beginning of a run) and the guess text input (every action after
  that, including advancing tiers on a wrong guess). No skip button, no round
  counter, no tier/difficulty readout on screen.
- `pnpm check` (typecheck + build + vitest) must be green after every task,
  with one accepted exception: `spec/game.test.ts`'s `rules.ts`-dependent
  assertions ("can be lost", "matchesTitle") stay red across Task 1 (they
  need Task 2's `src/scripts/rules.ts`) — this is the same kind of
  incremental staking Echo's own build used (see its plan, Tasks 1 and 6).
  Every other task, including Task 1's other two assertions, must be green.
- Don't touch `spec/invariants.test.ts` or `astro.config.ts` — both are
  correct and generic as they stand.
- Reuse this repo's established conventions: `.visually-hidden` utility class
  (already in `src/styles/styles.css`), dark `color-scheme`, and the
  `<if (!x) throw>` + re-bind-to-typed-`const` pattern for narrowing DOM
  queries across closures in `main.ts` (Task 4 explains why).

---

### Task 1: Clear Echo's game-specific code; add the song list

**Files:**
- Delete: `src/scripts/game.ts`, `src/scripts/input.ts`, `src/scripts/render.ts`, `src/scripts/world.ts`, `src/scripts/rules.ts`
- Delete: `spec/game-state.test.ts`, `spec/world.test.ts`, `spec/rules.test.ts`
- Create: `src/scripts/songs.ts`
- Test: `spec/songs.test.ts`
- Modify: `src/pages/index.astro` (minimal placeholder — real UI lands in Task 4)
- Modify: `src/scripts/main.ts` (empty stub — real wiring lands in Task 4)
- Leave untouched: `src/styles/styles.css`, `spec/invariants.test.ts`, `spec/game.test.ts`

**Interfaces:**
- Produces (for Tasks 2-4): from `src/scripts/songs.ts` —
  ```ts
  export interface Song {
    title: string;
    artist: string;
    startOffsetSec: number;
  }
  export const SONGS: Song[];
  export function shuffledSongs(source?: Song[], rng?: () => number): Song[];
  ```
- The placeholder `index.astro` adds an empty `<audio id="clip"></audio>`
  ahead of schedule (Task 4 is what makes it do anything). This is
  deliberate: it's what lets `spec/game.test.ts`'s "runs in this page's own
  JS" assertion (which requires an `<audio>` element with no static `src`)
  pass from this task onward instead of staying red until Task 4.

- [ ] **Step 1: Delete Echo's game-specific files**

```bash
git rm src/scripts/game.ts src/scripts/input.ts src/scripts/render.ts src/scripts/world.ts src/scripts/rules.ts
git rm spec/game-state.test.ts spec/world.test.ts spec/rules.test.ts
```

- [ ] **Step 2: Write the failing test for `songs.ts`**

Create `spec/songs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SONGS, shuffledSongs } from "../src/scripts/songs";

describe("SONGS", () => {
  it("has songs from both artists, no duplicate titles", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(20);
    const titles = SONGS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(SONGS.some((s) => s.artist === "Linkin Park")).toBe(true);
    expect(SONGS.some((s) => s.artist === "My Chemical Romance")).toBe(true);
  });

  it("every song has a non-empty title and artist, and a numeric start offset", () => {
    for (const song of SONGS) {
      expect(song.title.length).toBeGreaterThan(0);
      expect(song.artist.length).toBeGreaterThan(0);
      expect(Number.isFinite(song.startOffsetSec)).toBe(true);
      expect(song.startOffsetSec).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("shuffledSongs", () => {
  it("returns every song exactly once, in an order the rng determines", () => {
    const fixedRng = (() => {
      const seq = [0.9, 0.1, 0.5, 0.99, 0.01, 0.33, 0.66];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const shuffled = shuffledSongs(SONGS, fixedRng);
    expect(shuffled).toHaveLength(SONGS.length);
    const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
    expect([...shuffled].sort(byTitle)).toEqual([...SONGS].sort(byTitle));
  });

  it("does not mutate its input array", () => {
    const copy = [...SONGS];
    shuffledSongs(SONGS, () => 0.42);
    expect(SONGS).toEqual(copy);
  });

  it("defaults to SONGS and Math.random when called with no arguments", () => {
    const shuffled = shuffledSongs();
    expect(shuffled).toHaveLength(SONGS.length);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run spec/songs.test.ts`
Expected: FAIL — `Cannot find module '../src/scripts/songs'`

- [ ] **Step 4: Write `src/scripts/songs.ts`**

```ts
// Static song list for this run — no live chart, no scraping. `startOffsetSec`
// lets a per-song tuning pass skip a silent intro/count-in so the 0.1s/0.5s
// clips land on something recognizable; 0 until tuned (see the design spec's
// "Tuning knobs" section).
export interface Song {
  title: string;
  artist: string;
  startOffsetSec: number;
}

export const SONGS: Song[] = [
  { title: "One Step Closer", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Crawling", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Papercut", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Points of Authority", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "In the End", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Faint", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Numb", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Breaking the Habit", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Somewhere I Belong", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "What I've Done", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Bleed It Out", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "New Divide", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Burn It Down", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Castle of Glass", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Waiting for the End", artist: "Linkin Park", startOffsetSec: 0 },
  { title: "Helena", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Welcome to the Black Parade", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "I'm Not Okay", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Teenagers", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Famous Last Words", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Na Na Na", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "The Ghost of You", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Sing", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Mama", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Disenchanted", artist: "My Chemical Romance", startOffsetSec: 0 },
  { title: "Thank You for the Venom", artist: "My Chemical Romance", startOffsetSec: 0 },
];

/** Fisher-Yates, rng injectable for tests. Never mutates `source`. */
export function shuffledSongs(source: Song[] = SONGS, rng: () => number = Math.random): Song[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run spec/songs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Replace `src/pages/index.astro` with a minimal, buildable placeholder**

```astro
---
import "../styles/styles.css";
---
<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>One More Second</title>
    <meta
      name="description"
      content="One More Second: guess the song from a clip that starts at a tenth of a second and grows longer with every wrong answer."
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
      <h1 class="visually-hidden">One More Second</h1>
      <!-- Real markup (score/lives, ▶ button, guess input, end screen) lands
           in Task 4. This <audio> exists early, unused, purely so this
           week's contract test's "an <audio> element exists with no static
           src" assertion is satisfiable from this task onward. -->
      <audio id="clip"></audio>
      <p>One More Second is being built.</p>
    </main>
    <script src="../scripts/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Replace `src/scripts/main.ts` with a stub**

```ts
console.log("One More Second: loading…");
```

Not `export {};` — verified empirically (esbuild, the bundler Astro/Vite
uses under the hood) that a side-effect-free `export {};` module gets
tree-shaken down to a literal 0-byte output file even as an entry point,
which would fail `spec/game.test.ts`'s "first-party script shipped"
assertion (`scripts.trim().length > 0`) for a reason that has nothing to do
with the game. A `console.log` is a side effect, so the bundler keeps it.

- [ ] **Step 8: Run the full check**

Run: `pnpm check`
Expected: `astro check` 0 errors; `astro build` succeeds; `vitest run` reports
`spec/songs.test.ts`, `spec/invariants.test.ts`, and two of
`spec/game.test.ts`'s four tests ("runs in this page's own JS", "teaches
itself") passing. The other two `spec/game.test.ts` tests ("can be lost",
"matchesTitle") FAIL with `rules.ts` import errors — expected per the Global
Constraints exception above; nothing to fix in this task.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: clear Echo's game code, add the song list

Deletes Echo's rules/game/input/render/world modules and their tests —
this week's game is a different genre. Adds src/scripts/songs.ts (the
static 26-song Linkin Park + My Chemical Romance list) and reduces
index.astro/main.ts to a minimal, buildable placeholder; the real UI
and wiring land in Task 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `rules.ts` — the pure game state machine

**Files:**
- Create: `src/scripts/rules.ts`
- Test: `spec/rules.test.ts`
- Modify: none (this task turns `spec/game.test.ts` fully green but does not edit it)

**Interfaces:**
- Consumes: nothing from Task 1 — deliberately decoupled from `songs.ts` (see
  design note below).
- Produces (for Task 4, and already relied on by the committed
  `spec/game.test.ts`):
  ```ts
  export const TIERS: readonly number[];   // [0.1, 0.5, 2, 8, 15], seconds
  export const SCORES: readonly number[];  // [5, 4, 3, 2, 1]
  export const LIVES_START: number;        // 3

  export type Phase = "idle" | "playing" | "won" | "lost";

  export interface GameState {
    readonly totalSongs: number;
    readonly songIndex: number; // 0-based index of the current song in the run
    readonly tier: number;      // 0-based index into TIERS for the current attempt
    readonly score: number;
    readonly lives: number;
    readonly phase: Phase;
  }

  export function createInitialState(totalSongs: number): GameState;
  export function start(state: GameState): GameState;
  export function scoreForTier(tier: number): number;
  export function normalizeTitle(s: string): string;
  export function matchesTitle(guess: string, title: string): boolean;
  export function applyGuess(state: GameState, guess: string, correctTitle: string): GameState;
  ```

**Design note — why `applyGuess` takes `correctTitle` as an argument:**
`rules.ts` has no DOM, no fetch, and (deliberately) no dependency on
`songs.ts`'s `Song` type — it only knows "how many songs are in this run"
(`totalSongs`, a plain number) and scores/matches against whatever title the
caller passes it. `main.ts` (Task 4) is what looks up
`order[state.songIndex].title` from the shuffled `Song[]` and hands it to
`applyGuess`. This keeps `rules.ts` a closed, fully unit-testable module with
zero knowledge of where song data comes from.

**Design note — the "won on a miss" case:** the spec states lives are the
*only* fail state ("no timer, no other fail state") and a win is "finishing
every song... without running out of lives." Read literally, running out of
songs on the final miss (with lives still `> 0`) isn't covered by either
sentence. Since there is no other way for a run to end, and lives weren't
exhausted, this plan treats it as `"won"` — the tests below assert this
explicitly so a reviewer can see the choice, not just infer it.

- [ ] **Step 1: Write the failing tests**

Create `spec/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LIVES_START,
  SCORES,
  TIERS,
  applyGuess,
  createInitialState,
  matchesTitle,
  normalizeTitle,
  scoreForTier,
  start,
} from "../src/scripts/rules";

describe("TIERS and SCORES", () => {
  it("is the fixed five-step reveal ladder in seconds", () => {
    expect(TIERS).toEqual([0.1, 0.5, 2, 8, 15]);
  });

  it("SCORES pairs 5/4/3/2/1 points with TIERS 1-5", () => {
    expect(SCORES).toEqual([5, 4, 3, 2, 1]);
    expect(SCORES).toHaveLength(TIERS.length);
  });
});

describe("scoreForTier", () => {
  it("returns the points for a tier index, 0 outside the ladder", () => {
    expect(scoreForTier(0)).toBe(5);
    expect(scoreForTier(1)).toBe(4);
    expect(scoreForTier(2)).toBe(3);
    expect(scoreForTier(3)).toBe(2);
    expect(scoreForTier(4)).toBe(1);
    expect(scoreForTier(5)).toBe(0);
    expect(scoreForTier(-1)).toBe(0);
  });
});

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation, collapses whitespace, drops a leading 'the '", () => {
    expect(normalizeTitle("Numb")).toBe("numb");
    expect(normalizeTitle("I'm Not Okay")).toBe("im not okay");
    expect(normalizeTitle("The Black Parade")).toBe("black parade");
    expect(normalizeTitle("  Welcome   to the   Black Parade  ")).toBe("welcome to the black parade");
    expect(normalizeTitle("Bleed It Out!!!")).toBe("bleed it out");
  });
});

describe("matchesTitle", () => {
  it("matches case- and punctuation-insensitively, ignoring a leading 'the'", () => {
    expect(matchesTitle("numb", "Numb")).toBe(true);
    expect(matchesTitle("black parade", "The Black Parade")).toBe(true);
    expect(matchesTitle("the black parade", "Black Parade")).toBe(true);
    expect(matchesTitle("bleed it out!!!", "Bleed It Out")).toBe(true);
  });

  it("rejects a wrong, partial, or empty guess", () => {
    expect(matchesTitle("Crawling", "Numb")).toBe(false);
    expect(matchesTitle("", "Numb")).toBe(false);
    expect(matchesTitle("Black", "Welcome to the Black Parade")).toBe(false);
  });
});

describe("createInitialState / start", () => {
  it("createInitialState starts idle, full lives, zero score, at song 0 tier 0", () => {
    expect(createInitialState(5)).toEqual({
      totalSongs: 5,
      songIndex: 0,
      tier: 0,
      score: 0,
      lives: LIVES_START,
      phase: "idle",
    });
  });

  it("start moves idle to playing, and is a no-op once already playing", () => {
    const playing = start(createInitialState(5));
    expect(playing.phase).toBe("playing");
    expect(start(playing)).toEqual(playing);
  });
});

describe("applyGuess", () => {
  it("a correct guess scores the current tier and advances to the next song", () => {
    const state = start(createInitialState(3));
    const next = applyGuess(state, "Numb", "Numb");
    expect(next.score).toBe(5);
    expect(next.songIndex).toBe(1);
    expect(next.tier).toBe(0);
    expect(next.phase).toBe("playing");
  });

  it("a wrong guess advances the tier without touching score, lives, or song", () => {
    const state = start(createInitialState(3));
    const next = applyGuess(state, "wrong", "Numb");
    expect(next.tier).toBe(1);
    expect(next.score).toBe(0);
    expect(next.lives).toBe(LIVES_START);
    expect(next.songIndex).toBe(0);
  });

  it("scores less on a later tier: correct on tier 2 (index 1) scores 4, not 5", () => {
    let state = start(createInitialState(3));
    state = applyGuess(state, "wrong", "Numb"); // tier 0 -> 1
    state = applyGuess(state, "Numb", "Numb"); // correct on tier 1
    expect(state.score).toBe(4);
  });

  it("missing the last tier costs a life and moves to the next song", () => {
    let state = start(createInitialState(3));
    for (let i = 0; i < TIERS.length; i++) {
      state = applyGuess(state, "wrong", "Numb");
    }
    expect(state.lives).toBe(LIVES_START - 1);
    expect(state.songIndex).toBe(1);
    expect(state.tier).toBe(0);
    expect(state.phase).toBe("playing");
  });

  it("losing the last life ends the run as lost", () => {
    let state = start(createInitialState(10));
    for (let song = 0; song < LIVES_START; song++) {
      for (let tier = 0; tier < TIERS.length; tier++) {
        state = applyGuess(state, "wrong", "Numb");
      }
    }
    expect(state.lives).toBe(0);
    expect(state.phase).toBe("lost");
  });

  it("correctly finishing the last song ends the run as won", () => {
    let state = start(createInitialState(2));
    state = applyGuess(state, "Numb", "Numb");
    state = applyGuess(state, "Crawling", "Crawling");
    expect(state.phase).toBe("won");
    expect(state.score).toBe(10);
  });

  it("running out of songs on a miss still ends the run as won — lives are the only fail state", () => {
    let state = start(createInitialState(1));
    for (let tier = 0; tier < TIERS.length; tier++) {
      state = applyGuess(state, "wrong", "Numb");
    }
    expect(state.lives).toBe(LIVES_START - 1);
    expect(state.phase).toBe("won");
  });

  it("an empty (or whitespace-only) guess is a no-op", () => {
    const state = start(createInitialState(3));
    expect(applyGuess(state, "", "Numb")).toEqual(state);
    expect(applyGuess(state, "   ", "Numb")).toEqual(state);
  });

  it("does nothing once the run has already ended", () => {
    const won: ReturnType<typeof createInitialState> = { ...start(createInitialState(1)), phase: "won" };
    expect(applyGuess(won, "Numb", "Numb")).toEqual(won);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run spec/rules.test.ts spec/game.test.ts`
Expected: FAIL — `Cannot find module '../src/scripts/rules'`

- [ ] **Step 3: Write `src/scripts/rules.ts`**

```ts
// Pure game logic: the reveal ladder, scoring, title matching, and the
// win/loss/round state machine. No DOM, no fetch, no dependency on where
// song data comes from — see the design note in this task's plan entry for
// why applyGuess takes `correctTitle` as a parameter instead of reading a
// Song object.

export const TIERS: readonly number[] = [0.1, 0.5, 2, 8, 15];
export const SCORES: readonly number[] = [5, 4, 3, 2, 1];
export const LIVES_START = 3;

export type Phase = "idle" | "playing" | "won" | "lost";

export interface GameState {
  readonly totalSongs: number;
  readonly songIndex: number;
  readonly tier: number;
  readonly score: number;
  readonly lives: number;
  readonly phase: Phase;
}

export function createInitialState(totalSongs: number): GameState {
  return {
    totalSongs,
    songIndex: 0,
    tier: 0,
    score: 0,
    lives: LIVES_START,
    phase: "idle",
  };
}

export function start(state: GameState): GameState {
  if (state.phase !== "idle") return state;
  return { ...state, phase: "playing" };
}

export function scoreForTier(tier: number): number {
  return SCORES[tier] ?? 0;
}

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/, "");
}

export function matchesTitle(guess: string, title: string): boolean {
  const g = normalizeTitle(guess);
  if (g.length === 0) return false;
  return g === normalizeTitle(title);
}

/**
 * Advances the state machine by one guess.
 * - Wrong on phase !== "playing": no-op (guards stray input after the run ends).
 * - Empty/whitespace-only guess: no-op (spec: pressing Enter empty does nothing).
 * - Correct: score the current tier, advance to the next song (tier resets to 0).
 * - Wrong, tier remains: advance to the next tier's clip.
 * - Wrong on the last tier: lose a life, advance to the next song (tier resets to 0).
 * Ending: songIndex reaching totalSongs -> "won" (whether the last song was a
 * hit or a miss — lives are the only fail state). lives reaching 0 -> "lost",
 * checked before the songs-remaining check so losing the last life always wins.
 */
export function applyGuess(state: GameState, guess: string, correctTitle: string): GameState {
  if (state.phase !== "playing") return state;
  if (guess.trim().length === 0) return state;

  if (matchesTitle(guess, correctTitle)) {
    const score = state.score + scoreForTier(state.tier);
    const songIndex = state.songIndex + 1;
    const phase: Phase = songIndex >= state.totalSongs ? "won" : "playing";
    return { ...state, score, songIndex, tier: 0, phase };
  }

  const nextTier = state.tier + 1;
  if (nextTier < TIERS.length) {
    return { ...state, tier: nextTier };
  }

  const lives = state.lives - 1;
  if (lives <= 0) {
    return { ...state, lives: 0, phase: "lost" };
  }
  const songIndex = state.songIndex + 1;
  const phase: Phase = songIndex >= state.totalSongs ? "won" : "playing";
  return { ...state, lives, songIndex, tier: 0, phase };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run spec/rules.test.ts spec/game.test.ts`
Expected: PASS — all of `spec/rules.test.ts` (13 tests) and all four of
`spec/game.test.ts`'s tests, including "can be lost" and "matchesTitle".

- [ ] **Step 5: Run the full check**

Run: `pnpm check`
Expected: 0 errors, build succeeds, all tests pass — `spec/game.test.ts` is
now fully green, no exceptions remaining.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/rules.ts spec/rules.test.ts
git commit -m "feat: implement the game state machine — rules.ts

Fixed reveal ladder, 5/4/3/2/1 scoring, strict-but-normalized title
matching, and the idle/playing/won/lost state machine (3 lives, losing
the third ends the run; lives are the only fail state, so running out
of songs on a miss still counts as won). This turns spec/game.test.ts
fully green — 'can be lost' and the focused matchesTitle rule test
both now exercise real code.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `audio.ts` — iTunes preview lookup and clip playback

**Files:**
- Create: `src/scripts/audio.ts`
- Test: `spec/audio.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 — independent of `songs.ts`/`rules.ts`,
  takes plain strings/numbers so it stays testable without a real network or
  a real `<audio>` element.
- Produces (for Task 4):
  ```ts
  export function fetchPreviewUrl(
    artist: string,
    title: string,
    fetchImpl?: typeof fetch,
  ): Promise<string | null>;

  export interface ClipPlayer {
    play(): Promise<void> | void;
    pause(): void;
    currentTime: number;
    src: string;
  }

  export function playClip(
    audio: ClipPlayer,
    url: string,
    startOffsetSec: number,
    durationSec: number,
    setTimeoutImpl?: typeof setTimeout,
  ): void;
  ```
  `ClipPlayer` is the minimal shape of `HTMLAudioElement` this module
  actually uses — a real `<audio>` element satisfies it structurally; tests
  pass a plain object instead, no jsdom/document needed.

- [ ] **Step 1: Write the failing tests**

Create `spec/audio.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPreviewUrl, playClip } from "../src/scripts/audio";

describe("fetchPreviewUrl", () => {
  it("queries the iTunes Search API with artist+title and returns previewUrl", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ previewUrl: "https://example.com/clip.m4a" }] }),
    });
    const url = await fetchPreviewUrl("Linkin Park", "Numb", fakeFetch as unknown as typeof fetch);
    expect(url).toBe("https://example.com/clip.m4a");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const calledUrl = fakeFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("itunes.apple.com/search");
    expect(calledUrl).toContain("media=music");
    expect(calledUrl).toContain(encodeURIComponent("Linkin Park Numb"));
  });

  it("returns null when the response isn't ok", async () => {
    const notOk = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await fetchPreviewUrl("X", "Y", notOk as unknown as typeof fetch)).toBeNull();
  });

  it("returns null when there are no results or no previewUrl", async () => {
    const empty = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    expect(await fetchPreviewUrl("X", "Y", empty as unknown as typeof fetch)).toBeNull();

    const noPreview = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{}] }) });
    expect(await fetchPreviewUrl("X", "Y", noPreview as unknown as typeof fetch)).toBeNull();
  });
});

describe("playClip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeks to the start offset, plays, and stops itself after durationSec", () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn(), pause: vi.fn(), currentTime: 0, src: "" };

    playClip(audio, "https://example.com/clip.m4a", 12, 2);

    expect(audio.src).toBe("https://example.com/clip.m4a");
    expect(audio.currentTime).toBe(12);
    expect(audio.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1999);
    expect(audio.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });

  it("pauses whatever was already playing before starting the new clip", () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn(), pause: vi.fn(), currentTime: 0, src: "old.m4a" };
    playClip(audio, "new.m4a", 0, 0.1);
    // one defensive pause before the seek/play, one scheduled stop:
    expect(audio.pause).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run spec/audio.test.ts`
Expected: FAIL — `Cannot find module '../src/scripts/audio'`

- [ ] **Step 3: Write `src/scripts/audio.ts`**

```ts
// The only two impure operations in the game: looking up a preview clip URL
// (network) and driving playback (a real <audio> element). Isolated here so
// rules.ts stays a pure, synchronous module. Both functions take their
// side-effecting dependency as a parameter (fetchImpl, setTimeoutImpl) so
// tests never need a real network or a real DOM element.

interface ITunesSearchResponse {
  results?: Array<{ previewUrl?: string }>;
}

export async function fetchPreviewUrl(
  artist: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&limit=1`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const data = (await res.json()) as ITunesSearchResponse;
  return data.results?.[0]?.previewUrl ?? null;
}

/** The minimal HTMLAudioElement surface this module needs — lets tests pass
 *  a plain object instead of a real DOM element. */
export interface ClipPlayer {
  play(): Promise<void> | void;
  pause(): void;
  currentTime: number;
  src: string;
}

export function playClip(
  audio: ClipPlayer,
  url: string,
  startOffsetSec: number,
  durationSec: number,
  setTimeoutImpl: typeof setTimeout = setTimeout,
): void {
  audio.pause();
  audio.src = url;
  audio.currentTime = startOffsetSec;
  const result = audio.play();
  if (result && typeof (result as Promise<void>).catch === "function") {
    (result as Promise<void>).catch(() => {
      // Autoplay can be rejected by the browser; nothing to recover — the
      // player just stays silent for this clip. Swallowing avoids an
      // unhandled-rejection console error over a case that isn't actionable.
    });
  }
  setTimeoutImpl(() => {
    audio.pause();
  }, durationSec * 1000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run spec/audio.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full check**

Run: `pnpm check`
Expected: 0 errors, build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/audio.ts spec/audio.test.ts
git commit -m "feat: implement audio.ts — iTunes preview lookup and clip playback

fetchPreviewUrl hits the iTunes Search API (no auth, CORS-enabled) for
a song's previewUrl. playClip seeks an <audio>-shaped object to a
start offset and stops it after the current tier's duration. Both
take their side effect (fetch, setTimeout) as a parameter, so the
tests use fakes instead of a real network or DOM element.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire it into the page — final integration

**Files:**
- Modify: `src/scripts/main.ts` (full rewrite — DOM wiring)
- Modify: `src/pages/index.astro` (full rewrite — real markup)
- Modify: `src/styles/styles.css` (full rewrite — real styling)

**Interfaces:**
- Consumes: `Song`, `SONGS`, `shuffledSongs` from `./songs`; `TIERS`,
  `createInitialState`, `start`, `applyGuess` from `./rules`;
  `fetchPreviewUrl`, `playClip` from `./audio`. All four are already built
  and tested (Tasks 1-3) — this task only wires them together, no new logic.

**A known TypeScript narrowing gotcha (from Echo's own Task 8 — see
`.superpowers/sdd/2026-08-30-echo-bat-game-implementation/task-8-report.md`):**
`if (!x) throw` narrows `x` to non-null only in the scope where the check
appears — it does **not** carry into functions/closures declared later in the
file. Querying several elements up top and using them inside event-listener
closures below hits this immediately under this repo's strict `astro check`.
The fix (used below): re-bind each guarded value to a new `const` with an
explicit type annotation right after the guard — a static type holds inside
closures where a narrowed one doesn't.

- [ ] **Step 1: Write `src/scripts/main.ts`**

```ts
import { fetchPreviewUrl, playClip } from "./audio";
import { applyGuess, createInitialState, start, TIERS } from "./rules";
import { SONGS, shuffledSongs } from "./songs";

const startEl = document.querySelector<HTMLButtonElement>("#start");
const formEl = document.querySelector<HTMLFormElement>("#guess-form");
const inputEl = document.querySelector<HTMLInputElement>("#guess");
const audioEl = document.querySelector<HTMLAudioElement>("#clip");
const scoreEl = document.querySelector<HTMLElement>("#score");
const livesEl = document.querySelector<HTMLElement>("#lives");
const idleEl = document.querySelector<HTMLElement>("#idle-screen");
const playEl = document.querySelector<HTMLElement>("#play-screen");
const endEl = document.querySelector<HTMLElement>("#end-screen");
const endMessageEl = document.querySelector<HTMLElement>("#end-message");

if (
  !startEl || !formEl || !inputEl || !audioEl || !scoreEl || !livesEl ||
  !idleEl || !playEl || !endEl || !endMessageEl
) {
  throw new Error("song game: expected page markup is missing");
}

// Re-bind to explicitly-typed consts: narrowing from the guard above doesn't
// carry into the closures below (see this task's plan entry).
const startButton: HTMLButtonElement = startEl;
const guessForm: HTMLFormElement = formEl;
const guessInput: HTMLInputElement = inputEl;
const clip: HTMLAudioElement = audioEl;
const scoreOut: HTMLElement = scoreEl;
const livesOut: HTMLElement = livesEl;
const idleScreen: HTMLElement = idleEl;
const playScreen: HTMLElement = playEl;
const endScreen: HTMLElement = endEl;
const endMessage: HTMLElement = endMessageEl;

let order = shuffledSongs(SONGS);
let state = createInitialState(order.length);

function currentSong() {
  return order[state.songIndex];
}

function render(): void {
  scoreOut.textContent = String(state.score);
  livesOut.textContent = "♥".repeat(state.lives);
  idleScreen.hidden = state.phase !== "idle";
  playScreen.hidden = state.phase !== "playing";
  endScreen.hidden = state.phase === "idle" || state.phase === "playing";
  if (state.phase === "playing") {
    guessInput.focus();
  }
  if (state.phase === "won" || state.phase === "lost") {
    endMessage.textContent =
      state.phase === "won"
        ? `You win — final score ${state.score}. Tap to play again.`
        : `Out of lives — final score ${state.score}. Tap to play again.`;
  }
}

async function playCurrentTier(): Promise<void> {
  const song = currentSong();
  if (!song) return;
  const url = await fetchPreviewUrl(song.artist, song.title);
  if (!url) return;
  playClip(clip, url, song.startOffsetSec, TIERS[state.tier]);
}

function restart(): void {
  order = shuffledSongs(SONGS);
  state = createInitialState(order.length);
  render();
}

startButton.addEventListener("click", () => {
  state = start(state);
  render();
  void playCurrentTier();
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.phase !== "playing") return;

  const guess = guessInput.value;
  guessInput.value = "";
  const song = currentSong();
  if (!song) return;

  const prevSongIndex = state.songIndex;
  const prevTier = state.tier;
  state = applyGuess(state, guess, song.title);
  render();

  if (state.phase !== "playing") return;
  if (state.songIndex !== prevSongIndex || state.tier !== prevTier) {
    void playCurrentTier();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (state.phase === "won" || state.phase === "lost")) {
    restart();
  }
});

endScreen.addEventListener("click", restart);

render();
```

- [ ] **Step 2: Write `src/pages/index.astro`**

```astro
---
import "../styles/styles.css";
---
<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>One More Second</title>
    <meta
      name="description"
      content="One More Second: guess the song from a clip that starts at a tenth of a second and grows longer with every wrong answer. 3 lives, 26 Linkin Park and My Chemical Romance songs."
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
      <p id="hud" aria-live="polite">
        <span id="score">0</span> pts &middot; <span id="lives">&hearts;&hearts;&hearts;</span>
      </p>
    </header>
    <main>
      <h1 class="visually-hidden">One More Second</h1>
      <audio id="clip"></audio>

      <section id="idle-screen">
        <button id="start" type="button" aria-label="Start">&#9654;</button>
      </section>

      <section id="play-screen" hidden>
        <form id="guess-form" autocomplete="off">
          <input
            id="guess"
            type="text"
            placeholder="song title…"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </form>
      </section>

      <section id="end-screen" hidden>
        <p id="end-message"></p>
      </section>
    </main>
    <script src="../scripts/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Write `src/styles/styles.css`**

```css
:root {
  color-scheme: dark;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: #050507;
  color: #f2f2f5;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}

main {
  display: block;
  flex: 1;
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

#hud {
  margin: 0;
  padding: 1rem;
  text-align: center;
  font-size: 1.1rem;
  letter-spacing: 0.02em;
}

#lives {
  color: #ff5d7a;
}

#idle-screen,
#play-screen,
#end-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 1rem;
  text-align: center;
}

/* An id selector otherwise outweighs the UA stylesheet's [hidden] rule, so
   the sections above would stay visible even with the `hidden` attribute
   set — main.ts toggles `.hidden` as a property, this is what makes it work. */
#idle-screen[hidden],
#play-screen[hidden],
#end-screen[hidden] {
  display: none;
}

#start {
  font-size: 4rem;
  line-height: 1;
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  border: 2px solid #f2f2f5;
  background: transparent;
  color: #f2f2f5;
  cursor: pointer;
}

#start:hover,
#start:focus-visible {
  background: #f2f2f5;
  color: #050507;
}

#guess-form {
  width: min(90vw, 24rem);
}

#guess {
  width: 100%;
  box-sizing: border-box;
  padding: 0.9rem 1rem;
  font-size: 1.25rem;
  border-radius: 0.5rem;
  border: 2px solid #f2f2f5;
  background: #16161a;
  color: #f2f2f5;
}

#guess:focus {
  outline: 2px solid #7dd3fc;
  outline-offset: 2px;
}

#end-screen {
  cursor: pointer;
}

#end-message {
  font-size: 1.4rem;
  max-width: 28rem;
}

@media (width <= 480px) {
  #start {
    width: 5rem;
    height: 5rem;
    font-size: 3rem;
  }

  #guess {
    font-size: 1.1rem;
  }
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm check`
Expected: `astro check` 0 errors/warnings; `astro build` succeeds; `vitest
run` all tests pass, including all four `spec/game.test.ts` assertions and
`spec/invariants.test.ts`, now checked against the real built page.

- [ ] **Step 5: Look at it in a browser**

Run `pnpm dev` (or use whatever dev server is already running), open the
page, and confirm by eye:
1. Only the ▶ button is visible before you click it — no text, no input.
2. Clicking ▶ plays a very short clip and reveals the guess input, focused.
3. Typing a wrong title and pressing Enter clears the input and plays a
   longer clip of the same song (score/lives unchanged).
4. Typing the right title (try "numb", lowercase, no special formatting)
   scores points, updates the HUD, and moves to a new song's first clip.
5. Missing all 5 tiers on a song costs a life (one heart disappears) and
   moves on to the next song.
6. Losing the third life shows the end screen with a final score; clicking
   it or pressing Enter returns to the ▶ screen.

If anything here disagrees with the automated tests, the automated tests are
missing a case — fix the test, not just the UI.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/main.ts src/pages/index.astro src/styles/styles.css
git commit -m "feat: wire the game into the page — One More Second is playable

main.ts binds the ▶ button, the guess form, and the score/lives HUD to
rules.ts's state machine and audio.ts's playback, re-shuffling the
song order each run. index.astro carries the real markup (audio, ▶
button, guess input, end screen) and styles.css the real dark-theme
styling. This is the first commit where spec/game.test.ts is green
against real, played gameplay rather than a placeholder page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Playtest, tune, and finish

**Files:**
- Modify exactly one tuning value, in exactly one of:
  `src/scripts/songs.ts` (a `startOffsetSec`), `src/scripts/rules.ts`
  (`TIERS`, `matchesTitle`/`normalizeTitle`, or `LIVES_START`) — per the
  design spec's "Tuning knobs" section.
- Replace: `public/card.png` (1200x630 link-preview card for the new game)
- Modify: `PROCESS.md` (remove template boilerplate, cite real commits)
- Create: `reflections/crit-5.md`

**Interfaces:** none — this task doesn't add code, it exercises and tunes
what Tasks 1-4 built.

- [ ] **Step 1: Play a full run**

Run `pnpm dev`, open the page, and play at least one run to completion (a
win or a loss) plus a couple of individual rounds, paying attention to:
- Is the 0.1s/0.5s clip on any song silent, or a count-in rather than a
  hook, because of a missing `startOffsetSec`?
- Does strict title matching reject a guess that felt correct (e.g. missing
  punctuation you didn't type on purpose, or a minor wording difference)?
- Does the ladder (`[0.1, 0.5, 2, 8, 15]`) feel right, or is the first tier
  imperceptible rather than merely hard?
- Do 3 lives make a run end too fast, or drag on?

- [ ] **Step 2: Change exactly one tuning value based on what you noticed**

Pick the single change that most improved what you noticed in Step 1. For
example, if a song's opening is silent:

```ts
// src/scripts/songs.ts
{ title: "In the End", artist: "Linkin Park", startOffsetSec: 8 },
```

Or if strict matching felt unfair rather than skillful, loosen
`matchesTitle` in `src/scripts/rules.ts` (e.g. accept a guess that is a
prefix of the normalized title of length ≥ 4) — update `spec/rules.test.ts`
to cover the new behavior if you do.

- [ ] **Step 3: Re-run the full check**

Run: `pnpm check`
Expected: still all green. If you changed `matchesTitle`, re-run
`pnpm exec vitest run spec/rules.test.ts spec/game.test.ts` specifically to
confirm the focused rule test still passes.

- [ ] **Step 4: Replace the link-preview card**

Replace `public/card.png` (1200x630) with an image representing One More
Second, not Echo. Confirm `src/pages/index.astro`'s `og:image` still points
at `./card.png` (it does, unchanged since Task 4).

- [ ] **Step 5: Update `PROCESS.md` and write `reflections/crit-5.md`**

Remove `PROCESS.md`'s template placeholders (`YOUR-ORG/YOUR-REPO`, the
template comment) and cite real commits from this build — the pivot from
Echo, the Spotify-preview-API dead end, the audio-autoplay-gesture fix, and
the tuning change from Step 2 are all real, citable moments. Write
`reflections/crit-5.md` per `reflections/README.md`'s format.

- [ ] **Step 6: Run the evidence check and commit**

Run: `pnpm check:evidence`
Expected: PASS — CLAUDE.md present, `reflections/crit-5.md` present, every
cited commit hash resolves.

```bash
git add -A
git commit -m "chore: playtest tuning, link-preview card, and process evidence

Played a full run; <describe the one tuning change and why>. Replaced
public/card.png for One More Second and filled in PROCESS.md /
reflections/crit-5.md with real citations.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
