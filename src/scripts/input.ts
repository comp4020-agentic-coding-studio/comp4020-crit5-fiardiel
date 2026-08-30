// Binds every input surface to a single `flap()` intent. Pointer Events
// unify mouse click and touch in one listener. Space and ArrowUp must
// preventDefault so the page doesn't scroll while playing.
const FLAP_KEYS = new Set(["Enter", " ", "ArrowUp", "w", "W"]);
const SCROLL_KEYS = new Set([" ", "ArrowUp"]);

export function bindInput(target: HTMLElement, onFlap: () => void): () => void {
  const pointerHandler = (event: Event): void => {
    event.preventDefault();
    onFlap();
  };
  const keyHandler = (event: KeyboardEvent): void => {
    if (!FLAP_KEYS.has(event.key)) return;
    if (SCROLL_KEYS.has(event.key)) event.preventDefault();
    onFlap();
  };

  target.addEventListener("pointerdown", pointerHandler);
  window.addEventListener("keydown", keyHandler);

  return () => {
    target.removeEventListener("pointerdown", pointerHandler);
    window.removeEventListener("keydown", keyHandler);
  };
}
