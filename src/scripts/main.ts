import { fetchPreviewUrl, playClip } from "./audio";
import {
  DIFFICULTIES,
  TIERS,
  acknowledgeReveal,
  applyGuess,
  createInitialState,
  skipTier,
  start,
  type Difficulty,
  type DifficultyId,
} from "./rules";
import { SONGS, shuffledSongs, type Song } from "./songs";

const formEl = document.querySelector<HTMLFormElement>("#guess-form");
const inputEl = document.querySelector<HTMLInputElement>("#guess");
const suggestionsEl = document.querySelector<HTMLUListElement>("#suggestions");
const audioEl = document.querySelector<HTMLAudioElement>("#clip");
const scoreEl = document.querySelector<HTMLElement>("#score");
const livesEl = document.querySelector<HTMLElement>("#lives");
const idleEl = document.querySelector<HTMLElement>("#idle-screen");
const playEl = document.querySelector<HTMLElement>("#play-screen");
const endEl = document.querySelector<HTMLElement>("#end-screen");
const endMessageEl = document.querySelector<HTMLElement>("#end-message");
const tierPipsEl = document.querySelector<HTMLElement>("#tier-pips");
const progressBarEl = document.querySelector<HTMLElement>("#progress-bar");
const playClipEl = document.querySelector<HTMLButtonElement>("#play-clip");
const skipEl = document.querySelector<HTMLButtonElement>("#skip");
const quitEl = document.querySelector<HTMLButtonElement>("#quit");
const revealPanelEl = document.querySelector<HTMLElement>("#reveal-panel");
const revealMessageEl = document.querySelector<HTMLElement>("#reveal-message");
const revealLivesEl = document.querySelector<HTMLElement>("#reveal-lives");
const difficultyButtons = document.querySelectorAll<HTMLButtonElement>(".difficulty");

if (
  !formEl || !inputEl || !suggestionsEl || !audioEl || !scoreEl || !livesEl ||
  !idleEl || !playEl || !endEl || !endMessageEl || !tierPipsEl || !progressBarEl ||
  !playClipEl || !skipEl || !quitEl || !revealPanelEl || !revealMessageEl || !revealLivesEl ||
  difficultyButtons.length === 0
) {
  throw new Error("song game: expected page markup is missing");
}

// Re-bind to explicitly-typed consts: narrowing from the guard above doesn't
// carry into the closures below (see this task's plan entry).
const guessForm: HTMLFormElement = formEl;
const guessInput: HTMLInputElement = inputEl;
const suggestionsList: HTMLUListElement = suggestionsEl;
const clip: HTMLAudioElement = audioEl;
const scoreOut: HTMLElement = scoreEl;
const livesOut: HTMLElement = livesEl;
const idleScreen: HTMLElement = idleEl;
const playScreen: HTMLElement = playEl;
const endScreen: HTMLElement = endEl;
const endMessage: HTMLElement = endMessageEl;
const tierPips: HTMLElement = tierPipsEl;
const progressBar: HTMLElement = progressBarEl;
const playClipButton: HTMLButtonElement = playClipEl;
const skipButton: HTMLButtonElement = skipEl;
const quitButton: HTMLButtonElement = quitEl;
const revealPanel: HTMLElement = revealPanelEl;
const revealMessage: HTMLElement = revealMessageEl;
const revealLives: HTMLElement = revealLivesEl;

const ALL_TITLES: readonly string[] = SONGS.map((s) => s.title);
const MAX_SUGGESTIONS = 6;

let order: Song[] = [];
let state = createInitialState(0);

// Caches the current song's resolved preview URL so the free play-clip
// button and every later tier of the same song play instantly instead of
// re-hitting iTunes. Keyed by songIndex and reset on every difficulty
// pick/restart — songIndex only ever increases within a run, so a stale
// entry can't leak forward into the next song.
let urlCache: { songIndex: number; url: string | null } | null = null;

function currentSong(): Song | undefined {
  return order[state.songIndex];
}

function renderTierPips(): void {
  tierPips.innerHTML = "";
  TIERS.forEach((seconds, i) => {
    const pip = document.createElement("span");
    pip.className = i < state.tier ? "pip pip-spent" : i === state.tier ? "pip pip-current" : "pip";
    pip.textContent = `${seconds}s`;
    tierPips.appendChild(pip);
  });
  tierPips.setAttribute("aria-label", `Attempt ${state.tier + 1} of ${TIERS.length}`);
}

function renderProgressBar(): void {
  progressBar.innerHTML = "";
  // While revealing, the song just finished (already popped onto `results`)
  // is the one to highlight, not `songIndex` — that's already advanced to
  // the next song's index.
  const currentIndex = state.phase === "reveal" ? state.results.length - 1 : state.songIndex;
  for (let i = 0; i < state.totalSongs; i++) {
    const seg = document.createElement("span");
    const result = state.results[i];
    let cls = "seg";
    if (result === "hit") cls += " seg-hit";
    else if (result === "miss") cls += " seg-miss";
    else if (i === currentIndex) cls += " seg-current";
    seg.className = cls;
    progressBar.appendChild(seg);
  }
  progressBar.setAttribute(
    "aria-label",
    `Song ${Math.min(state.songIndex + 1, state.totalSongs)} of ${state.totalSongs}`,
  );
}

function renderSuggestions(): void {
  suggestionsList.innerHTML = "";
  const open = state.phase === "playing" && currentSuggestions.length > 0;
  suggestionsList.hidden = !open;
  guessInput.setAttribute("aria-expanded", String(open));
  if (!open) {
    guessInput.removeAttribute("aria-activedescendant");
    return;
  }
  currentSuggestions.forEach((title, i) => {
    const li = document.createElement("li");
    li.id = `suggestion-${i}`;
    li.setAttribute("role", "option");
    li.textContent = title;
    li.className = i === activeSuggestionIndex ? "suggestion-active" : "";
    li.setAttribute("aria-selected", String(i === activeSuggestionIndex));
    // mousedown (not click) fires before the input blurs, so a suggestion
    // can be picked without the browser tearing down focus mid-interaction.
    li.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectSuggestion(title);
    });
    suggestionsList.appendChild(li);
  });
  if (activeSuggestionIndex >= 0) {
    guessInput.setAttribute("aria-activedescendant", `suggestion-${activeSuggestionIndex}`);
  } else {
    guessInput.removeAttribute("aria-activedescendant");
  }
}

function render(): void {
  scoreOut.textContent = String(state.score);
  livesOut.textContent = "♥".repeat(state.lives);
  livesOut.setAttribute("aria-label", `${state.lives} lives left`);

  idleScreen.hidden = state.phase !== "idle";
  playScreen.hidden = !(state.phase === "playing" || state.phase === "reveal");
  endScreen.hidden = state.phase !== "won" && state.phase !== "lost";

  guessForm.hidden = state.phase === "reveal";
  revealPanel.hidden = state.phase !== "reveal";
  playClipButton.hidden = state.phase !== "playing";
  skipButton.hidden = state.phase !== "playing";
  guessInput.disabled = state.phase !== "playing";

  renderTierPips();
  renderProgressBar();
  renderSuggestions();

  if (state.phase === "playing") {
    guessInput.focus();
  }
  if (state.phase === "reveal" && state.reveal) {
    const isHit = state.reveal.outcome === "hit";
    revealMessage.textContent = `${isHit ? "✓" : "✗"} "${state.reveal.title}" — ${state.reveal.artist}`;
    revealMessage.classList.toggle("reveal-hit", isHit);
    revealMessage.classList.toggle("reveal-miss", !isHit);
    if (isHit) {
      revealLives.textContent = "";
    } else {
      // state.lives is already the post-loss count (rules.ts decrements before
      // entering "reveal"), so "before" is always one more heart than that —
      // except the lost-the-run case, where lives was exactly 1 going in.
      const before = state.reveal.nextPhase === "lost" ? 1 : state.lives + 1;
      const after = state.lives > 0 ? "♥".repeat(state.lives) : "none left";
      revealLives.textContent = `You lost a life — ${"♥".repeat(before)} → ${after}`;
    }
  }
  if (state.phase === "won" || state.phase === "lost") {
    endMessage.textContent =
      state.phase === "won"
        ? `You win — final score ${state.score}. Tap to play again.`
        : `Out of lives — final score ${state.score}. Tap to play again.`;
  }
}

// Bumped on every call to playCurrentTier() and on a run's start/end, so a
// stale in-flight fetch from an earlier tier/run can recognize it's been
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
  const songIndex = state.songIndex;
  let url: string | null;
  if (urlCache && urlCache.songIndex === songIndex) {
    url = urlCache.url;
  } else {
    try {
      url = await fetchPreviewUrl(song.artist, song.title);
    } catch {
      // A real network failure (offline, DNS, …) — treat the same as "no
      // preview found": no clip plays this round. This function is always
      // called fire-and-forget (`void playCurrentTier()`), so an uncaught
      // throw here would otherwise become an unhandled promise rejection.
      return;
    }
    if (token !== playToken) return; // superseded while the fetch was in flight
    urlCache = { songIndex, url };
  }
  if (token !== playToken) return; // superseded by a later call — drop it
  if (!url) return;
  playClip(clip, url, song.startOffsetSec, TIERS[tier]);
}

function beginRun(difficulty: Difficulty): void {
  playToken++;
  urlCache = null;
  clip.pause();
  order = shuffledSongs(SONGS).slice(0, difficulty.songs);
  state = start(createInitialState(order.length, difficulty.lives));
  render();
  void playCurrentTier();
}

function returnToPicker(): void {
  playToken++;
  urlCache = null;
  clip.pause();
  order = [];
  state = createInitialState(0);
  render();
}

function dismissReveal(): void {
  if (state.phase !== "reveal") return;
  state = acknowledgeReveal(state);
  render();
  if (state.phase === "playing") void playCurrentTier();
}

// Shared by a submitted guess and a skip: both may advance the tier or the
// song (or neither, on a wrong-but-not-last-tier guess never reaching here
// unchanged — callers only invoke this after state has actually moved).
// Renders the new state, then auto-plays the next clip only when the tier
// or song actually changed and the run is still "playing" — a reveal pauses
// here until dismissed, matching dismissReveal's own resume logic.
function afterAdvance(prevSongIndex: number, prevTier: number): void {
  render();
  if (state.phase !== "playing") return;
  if (state.songIndex !== prevSongIndex || state.tier !== prevTier) {
    void playCurrentTier();
  }
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const id = button.dataset.difficulty as DifficultyId | undefined;
    const difficulty = DIFFICULTIES.find((d) => d.id === id);
    if (!difficulty) return;
    beginRun(difficulty);
  });
});

playClipButton.addEventListener("click", () => {
  if (state.phase !== "playing") return;
  void playCurrentTier();
});

skipButton.addEventListener("click", () => {
  if (state.phase !== "playing") return;
  const song = currentSong();
  if (!song) return;

  guessInput.value = "";
  currentSuggestions = [];
  activeSuggestionIndex = -1;

  const prevSongIndex = state.songIndex;
  const prevTier = state.tier;
  state = skipTier(state, song.title, song.artist);
  afterAdvance(prevSongIndex, prevTier);
});

quitButton.addEventListener("click", returnToPicker);

// --- Autocomplete: suggestions drawn from the full song list, never just
// this run's songs — narrowing to the run's own titles would hand over the
// answer. Substring match (not a prefix match / native <datalist>, which
// Safari and Firefox only match from the start of the string) against every
// title. Enter selects a highlighted suggestion instead of submitting; the
// form's submit handler only ever sees an actual guess. ---

let currentSuggestions: string[] = [];
let activeSuggestionIndex = -1;

function updateSuggestions(): void {
  const query = guessInput.value.trim().toLowerCase();
  currentSuggestions =
    query.length === 0
      ? []
      : ALL_TITLES.filter((title) => title.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
  activeSuggestionIndex = -1;
  renderSuggestions();
}

function selectSuggestion(title: string): void {
  guessInput.value = title;
  currentSuggestions = [];
  activeSuggestionIndex = -1;
  renderSuggestions();
  guessInput.focus();
}

guessInput.addEventListener("input", updateSuggestions);

guessInput.addEventListener("keydown", (event) => {
  if (currentSuggestions.length === 0) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
    renderSuggestions();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeSuggestionIndex =
      activeSuggestionIndex <= 0 ? currentSuggestions.length - 1 : activeSuggestionIndex - 1;
    renderSuggestions();
  } else if (event.key === "Escape") {
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    renderSuggestions();
  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    // A highlighted suggestion consumes this Enter to select it — the form
    // never sees a submit event for it.
    event.preventDefault();
    event.stopPropagation();
    selectSuggestion(currentSuggestions[activeSuggestionIndex]);
  }
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.phase !== "playing") return;

  const guess = guessInput.value;
  guessInput.value = "";
  currentSuggestions = [];
  activeSuggestionIndex = -1;
  renderSuggestions();

  const song = currentSong();
  if (!song) return;

  const prevSongIndex = state.songIndex;
  const prevTier = state.tier;
  state = applyGuess(state, guess, song.title, song.artist);
  afterAdvance(prevSongIndex, prevTier);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (state.phase === "reveal") {
    event.preventDefault();
    dismissReveal();
  } else if (state.phase === "won" || state.phase === "lost") {
    returnToPicker();
  }
});

revealPanel.addEventListener("click", dismissReveal);
endScreen.addEventListener("click", returnToPicker);

render();
