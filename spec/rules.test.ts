import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES,
  LIVES_START,
  SCORES,
  TIERS,
  acknowledgeReveal,
  applyGuess,
  createInitialState,
  matchesTitle,
  normalizeTitle,
  scoreForTier,
  skipTier,
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

describe("DIFFICULTIES", () => {
  it("is Easy 5, Medium 10, Hard 20 songs, all at LIVES_START lives", () => {
    expect(DIFFICULTIES).toEqual([
      { id: "easy", label: "Easy", songs: 5, lives: LIVES_START },
      { id: "medium", label: "Medium", songs: 10, lives: LIVES_START },
      { id: "hard", label: "Hard", songs: 20, lives: LIVES_START },
    ]);
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
  it("createInitialState starts idle, full lives, zero score, at song 0 tier 0, no results, no reveal", () => {
    expect(createInitialState(5)).toEqual({
      totalSongs: 5,
      songIndex: 0,
      tier: 0,
      score: 0,
      lives: LIVES_START,
      phase: "idle",
      results: [],
      reveal: null,
    });
  });

  it("takes an explicit lives count for the chosen difficulty", () => {
    expect(createInitialState(20, 3).lives).toBe(3);
    expect(createInitialState(5, 7).lives).toBe(7);
  });

  it("start moves idle to playing, and is a no-op once already playing", () => {
    const playing = start(createInitialState(5));
    expect(playing.phase).toBe("playing");
    expect(start(playing)).toEqual(playing);
  });
});

describe("applyGuess", () => {
  it("a correct guess scores the current tier, records a hit, and pauses on a reveal naming the song and artist", () => {
    const state = start(createInitialState(3));
    const next = applyGuess(state, "Numb", "Numb", "Linkin Park");
    expect(next.score).toBe(5);
    expect(next.songIndex).toBe(1);
    expect(next.tier).toBe(0);
    expect(next.phase).toBe("reveal");
    expect(next.results).toEqual(["hit"]);
    expect(next.reveal).toEqual({ outcome: "hit", title: "Numb", artist: "Linkin Park", nextPhase: "playing" });

    const acked = acknowledgeReveal(next);
    expect(acked.phase).toBe("playing");
    expect(acked.reveal).toBeNull();
  });

  it("a wrong guess advances the tier without touching score, lives, song, or results", () => {
    const state = start(createInitialState(3));
    const next = applyGuess(state, "wrong", "Numb", "Linkin Park");
    expect(next.tier).toBe(1);
    expect(next.score).toBe(0);
    expect(next.lives).toBe(LIVES_START);
    expect(next.songIndex).toBe(0);
    expect(next.results).toEqual([]);
  });

  it("scores less on a later tier: correct on tier 2 (index 1) scores 4, not 5", () => {
    let state = start(createInitialState(3));
    state = applyGuess(state, "wrong", "Numb", "Linkin Park"); // tier 0 -> 1
    state = applyGuess(state, "Numb", "Numb", "Linkin Park"); // correct on tier 1
    expect(state.score).toBe(4);
  });

  it("missing the last tier costs a life, records a miss, and pauses on a reveal naming the song and the next phase", () => {
    let state = start(createInitialState(3));
    for (let i = 0; i < TIERS.length; i++) {
      state = applyGuess(state, "wrong", "Numb", "Linkin Park");
    }
    expect(state.lives).toBe(LIVES_START - 1);
    expect(state.phase).toBe("reveal");
    expect(state.results).toEqual(["miss"]);
    expect(state.reveal).toEqual({ outcome: "miss", title: "Numb", artist: "Linkin Park", nextPhase: "playing" });
    // songIndex/tier for the next song are already decided, but phase stays
    // "reveal" until acknowledged — nothing else advances early.
    expect(state.songIndex).toBe(1);
    expect(state.tier).toBe(0);

    const acked = acknowledgeReveal(state);
    expect(acked.phase).toBe("playing");
    expect(acked.reveal).toBeNull();
    expect(acked.songIndex).toBe(1);
  });

  it("further guesses during a reveal are a no-op until acknowledged", () => {
    let state = start(createInitialState(3));
    for (let i = 0; i < TIERS.length; i++) {
      state = applyGuess(state, "wrong", "Numb", "Linkin Park");
    }
    expect(state.phase).toBe("reveal");
    const stillRevealing = applyGuess(state, "Numb", "Numb", "Linkin Park");
    expect(stillRevealing).toEqual(state);
  });

  it("acknowledgeReveal is a no-op outside phase reveal", () => {
    const state = start(createInitialState(3));
    expect(acknowledgeReveal(state)).toEqual(state);
  });

  it("losing the last life reveals with nextPhase lost, and acknowledging ends the run", () => {
    let state = start(createInitialState(10));
    for (let song = 0; song < LIVES_START - 1; song++) {
      for (let tier = 0; tier < TIERS.length; tier++) {
        state = applyGuess(state, "wrong", "Numb", "Linkin Park");
      }
      state = acknowledgeReveal(state);
    }
    for (let tier = 0; tier < TIERS.length; tier++) {
      state = applyGuess(state, "wrong", "Numb", "Linkin Park");
    }
    expect(state.lives).toBe(0);
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.nextPhase).toBe("lost");
    state = acknowledgeReveal(state);
    expect(state.phase).toBe("lost");
  });

  it("correctly finishing the last song ends the run as won", () => {
    let state = start(createInitialState(2));
    state = applyGuess(state, "Numb", "Numb", "Linkin Park");
    state = acknowledgeReveal(state); // a hit pauses on a reveal too — carry on
    state = applyGuess(state, "Crawling", "Crawling", "Linkin Park");
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.nextPhase).toBe("won");
    state = acknowledgeReveal(state);
    expect(state.phase).toBe("won");
    expect(state.score).toBe(10);
    expect(state.results).toEqual(["hit", "hit"]);
  });

  it("running out of songs on a miss still ends the run as won — lives are the only fail state", () => {
    let state = start(createInitialState(1));
    for (let tier = 0; tier < TIERS.length; tier++) {
      state = applyGuess(state, "wrong", "Numb", "Linkin Park");
    }
    expect(state.lives).toBe(LIVES_START - 1);
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.nextPhase).toBe("won");
    state = acknowledgeReveal(state);
    expect(state.phase).toBe("won");
  });

  it("an empty (or whitespace-only) guess is a no-op", () => {
    const state = start(createInitialState(3));
    expect(applyGuess(state, "", "Numb", "Linkin Park")).toEqual(state);
    expect(applyGuess(state, "   ", "Numb", "Linkin Park")).toEqual(state);
  });

  it("does nothing once the run has already ended", () => {
    const won: ReturnType<typeof createInitialState> = { ...start(createInitialState(1)), phase: "won" };
    expect(applyGuess(won, "Numb", "Numb", "Linkin Park")).toEqual(won);
  });
});

describe("skipTier", () => {
  it("advances the tier exactly like a wrong guess, without touching score, lives, song, or results", () => {
    const state = start(createInitialState(3));
    const guessed = applyGuess(state, "wrong", "Numb", "Linkin Park");
    const skipped = skipTier(state, "Numb", "Linkin Park");
    expect(skipped).toEqual(guessed);
  });

  it("skipping the last tier costs a life and pauses on a reveal, exactly like a wrong guess", () => {
    let state = start(createInitialState(3));
    for (let i = 0; i < TIERS.length - 1; i++) {
      state = applyGuess(state, "wrong", "Numb", "Linkin Park");
    }
    const guessed = applyGuess(state, "wrong", "Numb", "Linkin Park");
    const skipped = skipTier(state, "Numb", "Linkin Park");
    expect(skipped).toEqual(guessed);
    expect(skipped.phase).toBe("reveal");
    expect(skipped.lives).toBe(LIVES_START - 1);
  });

  it("is a no-op outside phase playing", () => {
    const idle = createInitialState(3);
    expect(skipTier(idle, "Numb", "Linkin Park")).toEqual(idle);

    let revealing = start(createInitialState(3));
    for (let i = 0; i < TIERS.length; i++) {
      revealing = applyGuess(revealing, "wrong", "Numb", "Linkin Park");
    }
    expect(revealing.phase).toBe("reveal");
    expect(skipTier(revealing, "Numb", "Linkin Park")).toEqual(revealing);
  });
});
