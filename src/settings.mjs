import { getActiveSlides } from "./lib/schedule.mjs";
import {
  KID_CHECKLIST_IDS,
  PERSON_CHECKLIST_IDS,
  clearSlideSignOff,
  getModeLabel,
  hydrateProgress,
  isChecklistComplete,
  isSlideMinimized,
  isSlideSignedOff,
  setDayMode,
  setSeasonMode,
  signOffSlide,
  toggleSlideMinimized
} from "./lib/runtime-model.mjs";
import { loadProgressState, saveProgressState } from "./lib/storage.mjs";

const app = document.getElementById("settings-app");
const state = {
  data: null,
  progress: { version: 4, minimizedSlideIds: [], modes: {}, signOffs: {}, slides: {} },
  now: new Date(),
  activeSlides: []
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function sync() {
  state.progress = hydrateProgress(state.data, state.progress, state.now);
  state.activeSlides = getActiveSlides(state.data, state.now, state.progress.modes);
  saveProgressState(state.progress);
}

function findActiveSlide(slideId) {
  return state.activeSlides.find((slide) => slide.id === slideId) ?? null;
}

function renderPersonSettings(slide) {
  const activeSlide = findActiveSlide(slide.id);
  const minimized = isSlideMinimized(state.progress, slide.id);
  const isKid = KID_CHECKLIST_IDS.includes(slide.id);
  const complete = activeSlide ? isChecklistComplete(activeSlide, state.progress, state.now) : false;
  const signedOff = activeSlide ? isSlideSignedOff(activeSlide, state.progress, state.now) : false;
  const signOffControl = isKid
    ? `
        <button
          type="button"
          class="secondary-button"
          data-action="${signedOff ? "clear-signoff" : "signoff"}"
          data-slide-id="${escapeHtml(slide.id)}"
          ${!complete && !signedOff ? "disabled" : ""}
        >
          ${signedOff ? "Show Task View" : "Parent Sign Off"}
        </button>
      `
    : "";

  return `
    <article class="settings-card">
      <div>
        <h2>${escapeHtml(slide.title)}</h2>
        <p>${activeSlide ? (complete ? "Checklist complete" : "Tasks in progress") : "Not active right now"}</p>
      </div>
      <div class="settings-actions">
        <button
          type="button"
          class="secondary-button"
          data-action="toggle-rotation"
          data-slide-id="${escapeHtml(slide.id)}"
          aria-pressed="${minimized ? "true" : "false"}"
        >
          ${minimized ? "Show In Rotation" : "Hide From Rotation"}
        </button>
        ${signOffControl}
      </div>
    </article>
  `;
}

function render() {
  sync();

  const personSlides = PERSON_CHECKLIST_IDS
    .map((slideId) => state.data.slides.find((slide) => slide.id === slideId))
    .filter(Boolean);
  const seasonLabel = state.progress.modes.seasonMode === "summer_camp" ? "Summer Camp" : "School Year";

  app.innerHTML = `
    <section class="review-panel settings-hero">
      <div>
        <p class="eyebrow">Heads Up Display</p>
        <h1>Settings</h1>
      </div>
      <a class="secondary-button settings-link" href="./">Open HUD</a>
    </section>
    <section class="settings-grid">
      <article class="settings-card">
        <div>
          <h2>Day Mode</h2>
          <p>${escapeHtml(getModeLabel(state.progress.modes.dayMode))}</p>
        </div>
        <button type="button" class="secondary-button" data-action="toggle-day-mode">
          Switch To ${state.progress.modes.dayMode === "school_day" ? "Non-school Day" : "School Day"}
        </button>
      </article>
      <article class="settings-card">
        <div>
          <h2>Season</h2>
          <p>${escapeHtml(seasonLabel)}</p>
        </div>
        <button type="button" class="secondary-button" data-action="toggle-season-mode">
          Switch To ${state.progress.modes.seasonMode === "summer_camp" ? "School Year" : "Summer Camp"}
        </button>
      </article>
    </section>
    <section class="settings-list">
      ${personSlides.map((slide) => renderPersonSettings(slide)).join("")}
    </section>
  `;
}

async function loadData() {
  const response = await fetch("./data/household-data.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Unable to load household data: ${response.status}`);
  }

  return response.json();
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");

  if (!target) {
    return;
  }

  if (target.dataset.action === "toggle-day-mode") {
    const nextDayMode = state.progress.modes.dayMode === "school_day" ? "non_school_day" : "school_day";
    state.progress = setDayMode(state.data, state.progress, nextDayMode, state.now);
    render();
    return;
  }

  if (target.dataset.action === "toggle-season-mode") {
    const nextSeasonMode =
      state.progress.modes.seasonMode === "summer_camp" ? "school_year" : "summer_camp";
    state.progress = setSeasonMode(state.data, state.progress, nextSeasonMode, state.now);
    render();
    return;
  }

  if (target.dataset.action === "toggle-rotation") {
    state.progress = toggleSlideMinimized(state.progress, target.dataset.slideId);
    render();
    return;
  }

  if (target.dataset.action === "signoff") {
    state.progress = signOffSlide(state.data, state.progress, target.dataset.slideId, state.now);
    render();
    return;
  }

  if (target.dataset.action === "clear-signoff") {
    state.progress = clearSlideSignOff(state.progress, target.dataset.slideId);
    render();
  }
});

loadData()
  .then((data) => {
    state.data = data;

    const savedProgress = loadProgressState();

    if (savedProgress) {
      state.progress = savedProgress;
    }

    render();
  })
  .catch((error) => {
    app.innerHTML = `
      <section class="loading-state">
        <p class="eyebrow">Heads Up Display</p>
        <h1>Unable to load settings.</h1>
        <p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>
      </section>
    `;
  });
