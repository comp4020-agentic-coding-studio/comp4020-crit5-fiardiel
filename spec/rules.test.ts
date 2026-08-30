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
