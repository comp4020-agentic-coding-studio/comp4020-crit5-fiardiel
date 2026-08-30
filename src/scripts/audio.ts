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
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;
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
  // Per the HTML media spec, assigning .src re-runs the load algorithm even
  // when the value is unchanged — so only assign it when it's actually
  // changing, to avoid an unnecessary re-buffer between tiers of the same
  // song.
  if (audio.src !== url) audio.src = url;
  audio.currentTime = startOffsetSec;
  const result = audio.play();
  const arm = (): void => {
    setTimeoutImpl(() => {
      audio.pause();
    }, durationSec * 1000);
  };
  if (result && typeof (result as Promise<void>).then === "function") {
    // Arm the stop timer off the play promise's resolution — i.e. when
    // playback actually begins — not at call time, otherwise the clip's
    // audible window is eaten by however long buffering takes. If play()
    // rejects (autoplay denied by the browser), there's nothing playing to
    // stop, so don't arm the timer; just swallow the rejection to avoid an
    // unhandled-rejection console error over a case that isn't actionable.
    (result as Promise<void>).then(arm, () => {});
  } else {
    // Some environments/mocks don't return a thenable from play() — fall
    // back to arming immediately.
    arm();
  }
}
