import { getUpcomingStarts, getActiveSlides } from "./lib/schedule.mjs";
import { hydrateProgress, isChecklistComplete, toggleChecklistItem } from "./lib/runtime-model.mjs";
import { loadProgressState, saveProgressState } from "./lib/storage.mjs";
import { requestWakeLock, supportsWakeLock } from "./lib/wake-lock.mjs";

const appElement = document.getElementById("app");
const state = {
  data: null,
  progress: { version: 1, slides: {} },
  activeSlides: [],
  currentSlideId: null,
  rotationTimeout: null,
  rotationStartedAt: Date.now(),
  wakeLockSentinel: null,
  wakeLockMessage: supportsWakeLock()
    ? "Tap any control if the browser needs a wake-lock permission gesture."
    : "Wake lock is not available here. Install the app and set Auto-Lock to Never if needed.",
  now: new Date(),
  touchPoint: null,
  lastPersistedProgress: ""
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatClock(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    timeZone
  }).format(date);
}

function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(date);
}

function persistProgressIfChanged() {
  const serialized = JSON.stringify(state.progress);

  if (serialized === state.lastPersistedProgress) {
    return;
  }

  saveProgressState(state.progress);
  state.lastPersistedProgress = serialized;
}

function currentIndex() {
  return Math.max(
    0,
    state.activeSlides.findIndex((slide) => slide.id === state.currentSlideId)
  );
}

function currentSlide() {
  return state.activeSlides[currentIndex()] ?? null;
}

function slideDurationMs() {
  return (state.data?.config.defaultSlideDurationSec ?? 20) * 1000;
}

function selectSlideByIndex(index) {
  if (state.activeSlides.length === 0) {
    state.currentSlideId = null;
    render();
    return;
  }

  const normalizedIndex = ((index % state.activeSlides.length) + state.activeSlides.length) % state.activeSlides.length;
  state.currentSlideId = state.activeSlides[normalizedIndex].id;
  state.rotationStartedAt = Date.now();
  scheduleRotation();
  render();
}

function moveSlide(offset) {
  selectSlideByIndex(currentIndex() + offset);
}

function syncDerivedState() {
  state.activeSlides = getActiveSlides(state.data, state.now);
  state.progress = hydrateProgress(state.data, state.progress, state.now);
  persistProgressIfChanged();

  if (state.activeSlides.length === 0) {
    state.currentSlideId = null;
    return;
  }

  if (!state.activeSlides.some((slide) => slide.id === state.currentSlideId)) {
    state.currentSlideId = state.activeSlides[0].id;
    state.rotationStartedAt = Date.now();
  }
}

function scheduleRotation() {
  if (state.rotationTimeout) {
    window.clearTimeout(state.rotationTimeout);
    state.rotationTimeout = null;
  }

  if (document.hidden || state.activeSlides.length <= 1) {
    return;
  }

  state.rotationTimeout = window.setTimeout(() => {
    moveSlide(1);
  }, slideDurationMs());
}

function renderChecklistSlide(slide) {
  const progressEntry = state.progress.slides[slide.id] ?? { checkedItemIds: [] };
  const isComplete = isChecklistComplete(slide, state.progress);

  if (isComplete) {
    return `
      <article class="slide-card slide-card--celebration" style="${themeStyle(slide)}">
        <div class="celebration-shape"></div>
        <p class="eyebrow">Reward unlocked</p>
        <h2>${escapeHtml(slide.celebrationTitle)}</h2>
        <p class="celebration-copy">${escapeHtml(slide.rewardMessage || "Checklist complete.")}</p>
        <div class="slide-stats">
          <span class="stat-chip">Held until the next schedule reset</span>
          <span class="stat-chip">Completed</span>
        </div>
      </article>
    `;
  }

  const itemMarkup = slide.activeItems
    .map((item) => {
      const checked = progressEntry.checkedItemIds.includes(item.id);
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
            <span class="check-item__mark">${checked ? "✓" : ""}</span>
            <span class="check-item__text">${escapeHtml(item.text)}</span>
          </button>
        </li>
      `;
    })
    .join("");

  return `
    <article class="slide-card" style="${themeStyle(slide)}">
      <p class="eyebrow">${escapeHtml(slide.ownerLabel || "Checklist")}</p>
      <h2>${escapeHtml(slide.title)}</h2>
      <div class="slide-stats">
        <span class="stat-chip">${slide.activeItems.length} active item${slide.activeItems.length === 1 ? "" : "s"}</span>
        <span class="stat-chip">${escapeHtml(slide.activeSchedule.groupLabel)}</span>
      </div>
      <ul class="checklist">
        ${itemMarkup}
      </ul>
    </article>
  `;
}

function renderReminderSlide(slide) {
  return `
    <article class="slide-card slide-card--reminder" style="${themeStyle(slide)}">
      <p class="eyebrow">${escapeHtml(slide.ownerLabel || "Reminder")}</p>
      <h2>${escapeHtml(slide.title)}</h2>
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
    </article>
  `;
}

function themeStyle(slide) {
  return [
    `--slide-start:${slide.colors.backgroundStart}`,
    `--slide-end:${slide.colors.backgroundEnd}`,
    `--slide-accent:${slide.colors.accent}`,
    `--slide-text:${slide.colors.text}`
  ].join(";");
}

function renderUpcomingState() {
  const upcoming = getUpcomingStarts(state.data, state.now, 4);

  return `
    <article class="slide-card slide-card--idle">
      <p class="eyebrow">Off-hours</p>
      <h2>No slides are active right now</h2>
      <p class="idle-copy">
        The rotation only shows slides whose schedule window is active. Update
        <code>data/source/schedule_groups.csv</code> if the family rhythm changes.
      </p>
      <div class="upcoming-list">
        ${upcoming
          .map(
            (entry) => `
              <div class="upcoming-item">
                <strong>${escapeHtml(entry.title)}</strong>
                <span>${escapeHtml(entry.ownerLabel || "Household")}</span>
                <span>${escapeHtml(formatClock(entry.startsAt, state.data.config.timezone))}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderNavigation() {
  if (state.activeSlides.length === 0) {
    return "";
  }

  return `
    <nav class="slide-strip" aria-label="Active slides">
      ${state.activeSlides
        .map((slide, index) => {
          const selected = slide.id === state.currentSlideId;
          const complete = slide.type === "checklist" && isChecklistComplete(slide, state.progress);
          return `
            <button
              type="button"
              class="slide-pill ${selected ? "slide-pill--selected" : ""}"
              data-action="select-slide"
              data-slide-index="${index}"
              aria-pressed="${selected ? "true" : "false"}"
            >
              <span>${escapeHtml(slide.title)}</span>
              <small>${complete ? "reward" : slide.type}</small>
            </button>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderControls() {
  if (state.activeSlides.length === 0) {
    return `
      <div class="control-row">
        <button type="button" class="control-button" data-action="request-wake-lock">
          ${supportsWakeLock() ? "Try keep-awake mode" : "Wake-lock unavailable"}
        </button>
      </div>
    `;
  }

  return `
    <div class="control-row">
      <button type="button" class="control-button" data-action="prev-slide">Previous</button>
      <button type="button" class="control-button" data-action="next-slide">Next</button>
      <button type="button" class="control-button" data-action="request-wake-lock">
        Keep display awake
      </button>
    </div>
  `;
}

function render() {
  if (!state.data) {
    return;
  }

  const activeSlide = currentSlide();
  const elapsed = Date.now() - state.rotationStartedAt;
  const meterRatio = activeSlide ? Math.min(1, elapsed / slideDurationMs()) : 0;
  const activePosition = activeSlide ? `${currentIndex() + 1} / ${state.activeSlides.length}` : "0 / 0";

  appElement.innerHTML = `
    <div class="chrome-panel">
      <div>
        <p class="eyebrow">Heads Up Display</p>
        <h1>${escapeHtml(state.data.config.appTitle)}</h1>
      </div>
      <div class="status-stack">
        <div class="clock-panel">${escapeHtml(formatClock(state.now, state.data.config.timezone))}</div>
        <div class="wake-note">${escapeHtml(state.wakeLockMessage)}</div>
      </div>
    </div>
    <div class="stage-shell">
      <div class="rotation-meter" aria-hidden="true">
        <span style="width:${Math.round(meterRatio * 100)}%"></span>
      </div>
      <div class="stage-meta">
        <div>
          <span class="meta-label">Active now</span>
          <strong>${escapeHtml(activePosition)}</strong>
        </div>
        <div>
          <span class="meta-label">Window</span>
          <strong>${activeSlide ? `${escapeHtml(formatTime(activeSlide.activeSchedule.startsAt, state.data.config.timezone))} - ${escapeHtml(formatTime(activeSlide.activeSchedule.endsAt, state.data.config.timezone))}` : "Waiting"}</strong>
        </div>
        <div>
          <span class="meta-label">Interaction</span>
          <strong>Swipe or tap to jump fast</strong>
        </div>
      </div>
      <section class="stage-board" id="stage-board">
        ${activeSlide ? (activeSlide.type === "checklist" ? renderChecklistSlide(activeSlide) : renderReminderSlide(activeSlide)) : renderUpcomingState()}
      </section>
    </div>
    ${renderNavigation()}
    ${renderControls()}
  `;
}

async function ensureWakeLock() {
  const { sentinel, message } = await requestWakeLock();
  state.wakeLockSentinel = sentinel;
  state.wakeLockMessage = message;

  if (sentinel) {
    sentinel.addEventListener("release", () => {
      state.wakeLockSentinel = null;
      state.wakeLockMessage = "Wake lock released. Tap Keep display awake to request it again.";
      render();
    });
  }

  render();
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");

  if (!target) {
    return;
  }

  if (!state.wakeLockSentinel) {
    ensureWakeLock();
  }

  const { action } = target.dataset;

  if (action === "toggle-item") {
    state.progress = toggleChecklistItem(
      state.data,
      state.progress,
      target.dataset.slideId,
      target.dataset.itemId,
      state.now
    );
    persistProgressIfChanged();
    render();
    return;
  }

  if (action === "select-slide") {
    selectSlideByIndex(Number.parseInt(target.dataset.slideIndex ?? "0", 10));
    return;
  }

  if (action === "prev-slide") {
    moveSlide(-1);
    return;
  }

  if (action === "next-slide") {
    moveSlide(1);
    return;
  }

  if (action === "request-wake-lock") {
    ensureWakeLock();
  }
}

function handleTouchStart(event) {
  const touch = event.changedTouches?.[0];

  if (!touch) {
    return;
  }

  state.touchPoint = {
    x: touch.clientX,
    y: touch.clientY
  };
}

function handleTouchEnd(event) {
  const touch = event.changedTouches?.[0];

  if (!touch || !state.touchPoint) {
    return;
  }

  const deltaX = touch.clientX - state.touchPoint.x;
  const deltaY = touch.clientY - state.touchPoint.y;
  state.touchPoint = null;

  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) {
    return;
  }

  moveSlide(deltaX < 0 ? 1 : -1);
}

function installEventListeners() {
  appElement.addEventListener("click", handleClick);
  appElement.addEventListener("touchstart", handleTouchStart, { passive: true });
  appElement.addEventListener("touchend", handleTouchEnd, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.rotationTimeout) {
        window.clearTimeout(state.rotationTimeout);
        state.rotationTimeout = null;
      }
      return;
    }

    state.now = new Date();
    syncDerivedState();
    scheduleRotation();

    if (!state.wakeLockSentinel) {
      ensureWakeLock();
    } else {
      render();
    }
  });

  window.setInterval(() => {
    state.now = new Date();
    syncDerivedState();
    scheduleRotation();
    render();
  }, 1000);
}

async function loadHouseholdData() {
  const response = await fetch("./data/household-data.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Unable to load household data: ${response.status}`);
  }

  return response.json();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
}

async function initialize() {
  try {
    state.data = await loadHouseholdData();
    state.progress = loadProgressState() ?? state.progress;
    syncDerivedState();
    installEventListeners();
    render();
    scheduleRotation();
    registerServiceWorker();
    ensureWakeLock();
  } catch (error) {
    appElement.innerHTML = `
      <div class="loading-state">
        <p class="eyebrow">Heads Up Display</p>
        <h1>Unable to load the family board.</h1>
        <p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>
      </div>
    `;
  }
}

initialize();
