let target: (() => void) | null = null;
let pending = false;

/** L’écran Comptes enregistre son champ de recherche. */
export function bindSearchFocus(focus: () => void): () => void {
  target = focus;
  if (pending) {
    pending = false;
    queueMicrotask(focus);
  }
  return () => {
    if (target === focus) target = null;
  };
}

/** Vrai si un champ est déjà monté et a pris le focus. Sinon, le prochain écran Comptes le prendra. */
export function requestSearchFocus(): boolean {
  if (target) {
    target();
    return true;
  }
  pending = true;
  return false;
}

export function resetSearchFocus() {
  target = null;
  pending = false;
}
