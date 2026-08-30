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
  livesOut.setAttribute("aria-label", `${state.lives} lives left`);
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

// Bumped on every call to playCurrentTier() and on restart(), so a stale
// in-flight fetch from an earlier tier/run can recognize it's been
// superseded and drop its result instead of restarting or truncating
// whatever the player has since moved on to.
let playToken = 0;

async function playCurrentTier(): Promise<void> {
  const token = ++playToken;
  const song = currentSong();
  if (!song) return;
  const tier = state.tier; // captured with the song, before the await —
                            // otherwise a stale song could pair with a tier
                            // duration that has since moved on.
  let url: string | null;
  try {
    url = await fetchPreviewUrl(song.artist, song.title);
  } catch {
    // A real network failure (offline, DNS, …) — treat the same as "no
    // preview found": no clip plays this round. This function is always
    // called fire-and-forget (`void playCurrentTier()`), so an uncaught
    // throw here would otherwise become an unhandled promise rejection.
    return;
  }
  if (token !== playToken) return; // superseded by a later call — drop it
  if (!url) return;
  playClip(clip, url, song.startOffsetSec, TIERS[tier]);
}

function restart(): void {
  playToken++;
  clip.pause();
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
