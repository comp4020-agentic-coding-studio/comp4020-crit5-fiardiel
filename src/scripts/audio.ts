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
