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
