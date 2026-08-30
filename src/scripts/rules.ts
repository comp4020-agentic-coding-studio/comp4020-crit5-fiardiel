// Task 2 replaces this stub with the real state machine: the tier ladder,
// scoring, title-matching, and win/loss transitions. This file only needs
// to type-check and be importable for now — spec/game.test.ts already
// imports these exact names and calls them with these exact argument
// shapes, since it was written to the target contract before this file's
// real implementation exists (see the plan's "Starting point" section).
// Two of its four tests are expected to stay red until Task 2 lands.

export type Phase = "idle" | "playing" | "won" | "lost";

export interface GameState {
  phase: Phase;
}

export const LIVES_START = 0;
export const TIERS: number[] = [];
export const SCORES: number[] = [];

export function createInitialState(_totalSongs: number): GameState {
  return { phase: "idle" };
}

export function start(state: GameState): GameState {
  return state;
}

export function scoreForTier(_tier: number): number {
  return 0;
}

export function normalizeTitle(s: string): string {
  return s;
}

export function matchesTitle(_guess: string, _title: string): boolean {
  return false;
}

export function applyGuess(state: GameState, _guess: string, _correctTitle: string): GameState {
  return state;
}
