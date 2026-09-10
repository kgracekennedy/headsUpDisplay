import { getActiveSlides } from "./lib/schedule.mjs";
import {
  getModeLabel,
  getVisibleChecklistSections,
  hydrateProgress,
  isChecklistComplete,
  setDayMode,
  setSeasonMode,
  toggleChecklistItem
} from "./lib/runtime-model.mjs";

const app = document.getElementById("review-app");
const state = {
  data: null,
  progress: { version: 3, minimizedSlideIds: [], modes: {}, slides: {} },
  now: new Date(),
  activeSlides: [],
  selectedSlideId: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function toDateInputValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function toTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dateFromControls() {
  const dateValue = app.querySelector("[data-role='review-date']")?.value ?? toDateInputValue(state.now);
  const timeValue = app.querySelector("[data-role='review-time']")?.value ?? toTimeInputValue(state.now);
  const [year, month, day] = dateValue.split("-").map((part) => Number.parseInt(part, 10));
  const [hours, minutes] = timeValue.split(":").map((part) => Number.parseInt(part, 10));

  return new Date(year, month - 1, day, hours, minutes);
}

function sync() {
  state.progress = hydrateProgress(state.data, state.progress, state.now);
  state.activeSlides = getActiveSlides(state.data, state.now, state.progress.modes);

  if (!state.activeSlides.some((slide) => slide.id === state.selectedSlideId)) {
    state.selectedSlideId = state.activeSlides[0]?.id ?? null;
  }
}

function renderChecklist(slide) {
  const complete = isChecklistComplete(slide, state.progress, state.now);
  const sections = getVisibleChecklistSections(slide, state.progress, state.now);

  return `
    <div class="review-slide-card">
      <div class="review-slide-header">
        <div>
          <p class="eyebrow">${escapeHtml(slide.ownerLabel || "Checklist")}</p>
          <h2>${escapeHtml(slide.title)}</h2>
        </div>
        <strong>${complete ? "Complete" : "In progress"}</strong>
      </div>
      ${sections
        .map(
          (section) => `
            <section class="checklist-section">
              <h3>${escapeHtml(section.title)}</h3>
              <ul class="checklist">
                ${section.items
                  .map((item) => {
                    const checked = state.progress.slides[slide.id]?.checkedItemIds?.includes(item.id);

                    return `
                      <li>
                        <button
                          type="button"
                          class="check-item ${checked ? "check-item--done" : ""}"
                          data-action="toggle-item"
                          data-slide-id="${escapeHtml(slide.id)}"
                          data-item-id="${escapeHtml(item.id)}"
                          aria-pressed="${checked ? "true" : "false"}"
                        >
                          <span class="check-item__mark">${checked ? "&#10003;" : ""}</span>
                          <span class="check-item__text">${escapeHtml(item.text)}</span>
                        </button>
                      </li>
                    `;
                  })
                  .join("")}
              </ul>
            </section>
          `
        )
        .join("")}
      ${
        slide.activeHelpers?.length
          ? `
              <div class="helper-panel">
                <p class="helper-title">Helper text active for this slide</p>
                <ul>${slide.activeHelpers.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>
              </div>
            `
          : ""
      }
    </div>
  `;
}

function renderReminder(slide) {
  return `
    <div class="review-slide-card">
      <div class="review-slide-header">
        <div>
          <p class="eyebrow">${escapeHtml(slide.ownerLabel || "Reminder")}</p>
          <h2>${escapeHtml(slide.title)}</h2>
        </div>
        <strong>${slide.activeItems.length} line${slide.activeItems.length === 1 ? "" : "s"}</strong>
      </div>
      <ul class="reminder-list">
        ${slide.activeItems
          .map(
            (item) => `
              <li>
                <span class="reminder-bullet"></span>
                <span>${escapeHtml(item.text)}</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

function render() {
  sync();

  const selectedSlide = state.activeSlides.find((slide) => slide.id === state.selectedSlideId) ?? null;
  const dayMode = state.progress.modes.dayMode;
  const seasonMode = state.progress.modes.seasonMode;

  app.innerHTML = `
    <section class="review-panel">
      <div>
        <p class="eyebrow">Review Simulator</p>
        <h1>Heads Up Display states</h1>
      </div>
      <label>
        Date
        <input type="date" data-role="review-date" value="${toDateInputValue(state.now)}" />
      </label>
      <label>
        Time
        <input type="time" data-role="review-time" value="${toTimeInputValue(state.now)}" />
      </label>
      <button type="button" class="secondary-button" data-action="toggle-day-mode">
        ${escapeHtml(getModeLabel(dayMode))}
      </button>
      <button type="button" class="secondary-button" data-action="toggle-season-mode">
        ${seasonMode === "summer_camp" ? "Summer Camp" : "School Year"}
      </button>
    </section>
    <section class="review-panel">
      <label>
        Slide
        <select data-role="review-slide">
          ${state.activeSlides
            .map(
              (slide) => `
                <option value="${escapeHtml(slide.id)}" ${slide.id === state.selectedSlideId ? "selected" : ""}>
                  ${escapeHtml(slide.title)}
                </option>
              `
            )
            .join("")}
        </select>
      </label>
    </section>
    ${selectedSlide ? (selectedSlide.type === "checklist" ? renderChecklist(selectedSlide) : renderReminder(selectedSlide)) : "<section class=\"review-slide-card\"><h2>No active slides</h2></section>"}
  `;
}

async function loadData() {
  const response = await fetch("./data/household-data.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Unable to load household data: ${response.status}`);
  }

  return response.json();
}

app.addEventListener("change", (event) => {
  const target = event.target;

  if (target.matches("[data-role='review-date'], [data-role='review-time']")) {
    state.now = dateFromControls();
    render();
    return;
  }

  if (target.matches("[data-role='review-slide']")) {
    state.selectedSlideId = target.value;
    render();
  }
});

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

  if (target.dataset.action === "toggle-item") {
    state.progress = toggleChecklistItem(
      state.data,
      state.progress,
      target.dataset.slideId,
      target.dataset.itemId,
      state.now
    );
    render();
  }
});

loadData()
  .then((data) => {
    state.data = data;
    render();
  })
  .catch((error) => {
    app.innerHTML = `
      <section class="loading-state">
        <p class="eyebrow">Review Simulator</p>
        <h1>Unable to load data.</h1>
        <p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>
      </section>
    `;
  });
