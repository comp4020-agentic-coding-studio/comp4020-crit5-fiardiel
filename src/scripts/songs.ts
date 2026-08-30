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
