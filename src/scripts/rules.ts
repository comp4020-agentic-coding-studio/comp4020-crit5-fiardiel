// Pure game logic: the reveal ladder, scoring, title matching, and the
// win/loss/round state machine. No DOM, no fetch, no dependency on where
// song data comes from — see the design note in this task's plan entry for
// why applyGuess takes `correctTitle`/`correctArtist` as parameters instead
// of reading a Song object.

export const TIERS: readonly number[] = [0.1, 0.5, 2, 8, 15];
export const SCORES: readonly number[] = [5, 4, 3, 2, 1];
export const LIVES_START = 3;

export type DifficultyId = "easy" | "medium" | "hard";

export interface Difficulty {
  readonly id: DifficultyId;
  readonly label: string;
  readonly songs: number;
  readonly lives: number;
}

// The difficulty picker IS the run's start gesture (see main.ts) — tapping
// one both unlocks audio autoplay and chooses `songs`/`lives` for the run.
export const DIFFICULTIES: readonly Difficulty[] = [
  { id: "easy", label: "Easy", songs: 5, lives: LIVES_START },
  { id: "medium", label: "Medium", songs: 10, lives: LIVES_START },
  { id: "hard", label: "Hard", songs: 20, lives: LIVES_START },
];

export type Phase = "idle" | "playing" | "reveal" | "won" | "lost";
export type RoundResult = "hit" | "miss";

/** Held only while phase === "reveal": what to show, and where to go once
 *  the player acknowledges it (tap, Enter, or the Continue button) —
 *  computed once, up front, so acknowledging is a pure phase swap with no
 *  further branching. `outcome` distinguishes a correct guess (title/artist
 *  are the song just won) from a miss (title/artist are the song that got
 *  away) — both pause here so the player always sees a confirmation before
 *  the run moves on. */
export interface Reveal {
  readonly outcome: "hit" | "miss";
  readonly title: string;
  readonly artist: string;
  readonly nextPhase: "playing" | "won" | "lost";
}

export interface GameState {
  readonly totalSongs: number;
  readonly songIndex: number;
  readonly tier: number;
  readonly score: number;
  readonly lives: number;
  readonly phase: Phase;
  readonly results: readonly RoundResult[];
  readonly reveal: Reveal | null;
}

export function createInitialState(totalSongs: number, lives: number = LIVES_START): GameState {
  return {
    totalSongs,
    songIndex: 0,
    tier: 0,
    score: 0,
    lives,
    phase: "idle",
    results: [],
    reveal: null,
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
 * Shared by a wrong guess and a skipped tier — both are "this tier is
 * over, unsolved" and advance the state machine identically:
 * - Tier remains: advance to the next (longer) tier's clip.
 * - Last tier: lose a life, record a "miss", and move to phase "reveal"
 *   instead of directly to the next song/won/lost — `reveal.nextPhase`
 *   already holds where `acknowledgeReveal` sends it, so the reveal itself
 *   changes nothing else about the state. songIndex reaching totalSongs ->
 *   "won" (whether the last song was a hit or a miss — lives are the only
 *   fail state). lives reaching 0 -> "lost", checked first so losing the
 *   last life always wins over running out of songs.
 */
function missTier(state: GameState, correctTitle: string, correctArtist: string): GameState {
  const nextTier = state.tier + 1;
  if (nextTier < TIERS.length) {
    return { ...state, tier: nextTier };
  }

  const lives = state.lives - 1;
  const results = [...state.results, "miss" as const];
  if (lives <= 0) {
    return {
      ...state,
      lives: 0,
      results,
      phase: "reveal",
      reveal: { outcome: "miss", title: correctTitle, artist: correctArtist, nextPhase: "lost" },
    };
  }
  const songIndex = state.songIndex + 1;
  const nextPhase: Phase = songIndex >= state.totalSongs ? "won" : "playing";
  return {
    ...state,
    lives,
    songIndex,
    tier: 0,
    results,
    phase: "reveal",
    reveal: { outcome: "miss", title: correctTitle, artist: correctArtist, nextPhase },
  };
}

/**
 * Advances the state machine by one guess.
 * - Wrong on phase !== "playing": no-op (guards stray input after the run ends
 *   or while a reveal is pending acknowledgement).
 * - Empty/whitespace-only guess: no-op (spec: pressing Enter empty does nothing).
 * - Correct: score the current tier, record a "hit", and pause on a reveal
 *   naming the song and artist just won — exactly like a miss, so the player
 *   always sees a confirmation before the run advances to the next song (or
 *   to "won", on the last one). `acknowledgeReveal` carries out the already-
 *   decided songIndex/tier reset once the player continues.
 * - Wrong: see missTier.
 */
export function applyGuess(
  state: GameState,
  guess: string,
  correctTitle: string,
  correctArtist: string = "",
): GameState {
  if (state.phase !== "playing") return state;
  if (guess.trim().length === 0) return state;

  if (matchesTitle(guess, correctTitle)) {
    const score = state.score + scoreForTier(state.tier);
    const songIndex = state.songIndex + 1;
    const results = [...state.results, "hit" as const];
    const nextPhase: Phase = songIndex >= state.totalSongs ? "won" : "playing";
    return {
      ...state,
      score,
      songIndex,
      tier: 0,
      results,
      phase: "reveal",
      reveal: { outcome: "hit", title: correctTitle, artist: correctArtist, nextPhase },
    };
  }

  return missTier(state, correctTitle, correctArtist);
}

/**
 * Gives up on the current tier without guessing — advances exactly as a
 * wrong guess would (see missTier), including costing a life and pausing
 * on a reveal if this was the last tier. A no-op outside phase "playing".
 */
export function skipTier(state: GameState, correctTitle: string, correctArtist: string = ""): GameState {
  if (state.phase !== "playing") return state;
  return missTier(state, correctTitle, correctArtist);
}

/** The only way out of phase "reveal": swap in the phase decided back when
 *  the miss happened, and clear the reveal. A no-op outside "reveal". */
export function acknowledgeReveal(state: GameState): GameState {
  if (state.phase !== "reveal" || !state.reveal) return state;
  return { ...state, phase: state.reveal.nextPhase, reveal: null };
}
