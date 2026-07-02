const STORAGE_KEY = "heads-up-display-state";

export function loadProgressState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.warn("Unable to load saved checklist progress.", error);
    return null;
  }
}

export function saveProgressState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save checklist progress.", error);
  }
}
