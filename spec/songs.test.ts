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
