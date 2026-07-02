import { getUpcomingStarts, getActiveSlides } from "./lib/schedule.mjs";
import { hydrateProgress, isChecklistComplete, toggleChecklistItem } from "./lib/runtime-model.mjs";
import { getRotationDelayMs, getRotationRatio } from "./lib/rotation.mjs";
import { loadProgressState, saveProgressState } from "./lib/storage.mjs";
import { requestWakeLock, supportsWakeLock } from "./lib/wake-lock.mjs";

const BUILD_VERSION = "20260702-193210015Z";
const appElement = document.getElementById("app");
const dom = {
  appTitle: null,
  clockPanel: null,
  wakeNote: null,
  meterFill: null,
  activePosition: null,
  windowText: null,
  stageBoard: null,
  slideStrip: null,
  controlRow: null
};
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
  lastPersistedProgress: "",
  lastStructuralSignature: null,
  lastRenderedSlideKey: null,
  meterAnimationFrame: null
};
let hasReloadedForServiceWorkerUpdate = false;

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

function getSlideKey(slide) {
  return slide ? slide.id : "idle";
}

function ensureShellRendered() {
  if (dom.stageBoard) {
    return;
  }

  appElement.innerHTML = `
    <div class="chrome-panel">
      <div>
        <p class="eyebrow">Heads Up Display</p>
        <h1 data-role="app-title"></h1>
      </div>
      <div class="status-stack">
        <div class="clock-panel" data-role="clock-panel"></div>
        <div class="wake-note" data-role="wake-note"></div>
      </div>
    </div>
    <div class="stage-shell">
      <div class="rotation-meter" aria-hidden="true">
        <span data-role="meter-fill"></span>
      </div>
      <div class="stage-meta">
        <div>
          <span class="meta-label">Active now</span>
          <strong data-role="active-position">0 / 0</strong>
        </div>
        <div>
          <span class="meta-label">Window</span>
          <strong data-role="window-text">Waiting</strong>
        </div>
        <div>
          <span class="meta-label">Interaction</span>
          <strong>Swipe or tap to jump fast</strong>
        </div>
      </div>
      <section class="stage-board" data-role="stage-board"></section>
    </div>
    <nav class="slide-strip" data-role="slide-strip" aria-label="Active slides"></nav>
    <div class="control-row" data-role="control-row"></div>
  `;

  dom.appTitle = appElement.querySelector("[data-role='app-title']");
  dom.clockPanel = appElement.querySelector("[data-role='clock-panel']");
  dom.wakeNote = appElement.querySelector("[data-role='wake-note']");
  dom.meterFill = appElement.querySelector("[data-role='meter-fill']");
  dom.activePosition = appElement.querySelector("[data-role='active-position']");
  dom.windowText = appElement.querySelector("[data-role='window-text']");
  dom.stageBoard = appElement.querySelector("[data-role='stage-board']");
  dom.slideStrip = appElement.querySelector("[data-role='slide-strip']");
  dom.controlRow = appElement.querySelector("[data-role='control-row']");
}

function updateStatusPanel() {
  if (!state.data || !dom.clockPanel || !dom.wakeNote) {
    return;
  }

  dom.clockPanel.textContent = formatClock(state.now, state.data.config.timezone);
  dom.wakeNote.textContent = state.wakeLockMessage;
}

function updateMeter() {
  if (!dom.meterFill) {
    return;
  }

  const activeSlide = currentSlide();
  const shouldTrackRotation = Boolean(activeSlide) && state.activeSlides.length > 1;
  const ratio = shouldTrackRotation
    ? getRotationRatio(state.rotationStartedAt, Date.now(), slideDurationMs())
    : 0;

  dom.meterFill.style.width = `${(ratio * 100).toFixed(2)}%`;
}

function updateLiveDisplay() {
  updateStatusPanel();
  updateMeter();
}

function startMeterLoop() {
  stopMeterLoop();

  const step = () => {
    updateMeter();

    if (document.hidden) {
      state.meterAnimationFrame = null;
      return;
    }

    state.meterAnimationFrame = window.requestAnimationFrame(step);
  };

  state.meterAnimationFrame = window.requestAnimationFrame(step);
}

function stopMeterLoop() {
  if (!state.meterAnimationFrame) {
    return;
  }

  window.cancelAnimationFrame(state.meterAnimationFrame);
  state.meterAnimationFrame = null;
}

function buildStructuralSignature() {
  const slideStates = state.activeSlides.map((slide) => {
    const activeItemIds = slide.activeItems.map((item) => item.id).join(",");

    if (slide.type !== "checklist") {
      return `${slide.id}:reminder:${slide.activeSchedule.instanceKey}:${activeItemIds}`;
    }

    const checkedItemIds = [...(state.progress.slides[slide.id]?.checkedItemIds ?? [])]
      .sort()
      .join(",");
    const completionState = isChecklistComplete(slide, state.progress) ? "complete" : "progress";

    return [
      slide.id,
      slide.activeSchedule.instanceKey,
      activeItemIds,
      checkedItemIds,
      completionState
    ].join(":");
  });

  return JSON.stringify({
    activeSlides: slideStates,
    currentSlideId: state.currentSlideId
  });
}

function buildChecklistMarkup(slide) {
  const progressEntry = state.progress.slides[slide.id] ?? { checkedItemIds: [] };

  return slide.activeItems
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
            <span class="check-item__mark">${checked ? "&#10003;" : ""}</span>
            <span class="check-item__text">${escapeHtml(item.text)}</span>
          </button>
        </li>
      `;
    })
    .join("");
}

function renderCelebrationBackdrop() {
  const fireworkMarkup = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six"
  ]
    .map(
      (suffix) =>
        `<span class="celebration-firework celebration-firework--${suffix}"></span>`
    )
    .join("");
  const confettiMarkup = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve"
  ]
    .map(
      (suffix) =>
        `<span class="celebration-confetti celebration-confetti--${suffix}"></span>`
    )
    .join("");

  return `
    <div class="celebration-overlay" aria-hidden="true">
      <span class="celebration-glow celebration-glow--left"></span>
      <span class="celebration-glow celebration-glow--center"></span>
      <span class="celebration-glow celebration-glow--right"></span>
      ${fireworkMarkup}
      ${confettiMarkup}
    </div>
  `;
}

function renderCelebrationPanel(slide) {
  const rewardMarkup = slide.rewardMessage
    ? `
        <div class="reward-block">
          <p class="reward-label">Reward</p>
          <p class="reward-text">${escapeHtml(slide.rewardMessage)}</p>
        </div>
      `
    : "";
  const completionLabel = slide.rewardMessage ? "Reward unlocked" : "Checklist complete";

  return `
    <section class="completion-banner">
      <p class="completion-label">${completionLabel}</p>
      <p class="completion-title">${escapeHtml(slide.celebrationTitle)}</p>
      ${rewardMarkup}
      <p class="completion-note">Tap any checked item to reopen the list.</p>
    </section>
  `;
}

function renderChecklistSlide(slide, { animate = false } = {}) {
  const progressEntry = state.progress.slides[slide.id] ?? { checkedItemIds: [] };
  const checkedCount = progressEntry.checkedItemIds.length;
  const isComplete = isChecklistComplete(slide, state.progress);
  const transitionClass = animate ? " slide-card--transition" : "";
  const completionBanner = isComplete ? renderCelebrationPanel(slide) : "";
  const celebrationBackdrop = isComplete ? renderCelebrationBackdrop() : "";

  return `
    <article class="slide-card slide-card--checklist${transitionClass}${isComplete ? " slide-card--completed" : ""}" style="${themeStyle(slide)}">
      ${celebrationBackdrop}
      <div class="checklist-layout">
        <div class="checklist-summary">
          <div>
            <p class="eyebrow">${escapeHtml(slide.ownerLabel || "Checklist")}</p>
            <h2>${escapeHtml(slide.title)}</h2>
          </div>
          <div class="slide-stats">
            <span class="stat-chip">${checkedCount} / ${slide.activeItems.length} checked</span>
            <span class="stat-chip">${escapeHtml(slide.activeSchedule.groupLabel)}</span>
          </div>
          ${completionBanner}
        </div>
        <div class="checklist-panel">
          <ul class="checklist">
            ${buildChecklistMarkup(slide)}
          </ul>
        </div>
      </div>
    </article>
  `;
}

function renderReminderSlide(slide, { animate = false } = {}) {
  const transitionClass = animate ? " slide-card--transition" : "";
  const itemCountLabel = `${slide.activeItems.length} reminder${slide.activeItems.length === 1 ? "" : "s"}`;

  return `
    <article class="slide-card slide-card--reminder${transitionClass}" style="${themeStyle(slide)}">
      <div class="reminder-layout">
        <div class="reminder-summary">
          <div>
            <p class="eyebrow">${escapeHtml(slide.ownerLabel || "Reminder")}</p>
            <h2>${escapeHtml(slide.title)}</h2>
          </div>
          <div class="slide-stats">
            <span class="stat-chip">${escapeHtml(itemCountLabel)}</span>
            <span class="stat-chip">${escapeHtml(slide.activeSchedule.groupLabel)}</span>
          </div>
        </div>
        <div class="reminder-panel">
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
      </div>
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

function renderUpcomingState({ animate = false } = {}) {
  const upcoming = getUpcomingStarts(state.data, state.now, 4);
  const transitionClass = animate ? " slide-card--transition" : "";

  return `
    <article class="slide-card slide-card--idle${transitionClass}">
      <div class="idle-layout">
        <div class="idle-summary">
          <div>
            <p class="eyebrow">Off-hours</p>
            <h2>No slides are active right now</h2>
          </div>
          <p class="idle-copy">
            The rotation only shows slides whose schedule window is active. Update
            <code>data/source/schedule_groups.csv</code> if the family rhythm changes.
          </p>
        </div>
        <div class="idle-panel">
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
        </div>
      </div>
    </article>
  `;
}

function renderNavigation() {
  if (state.activeSlides.length === 0) {
    return "";
  }

  return state.activeSlides
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
          <small>${complete ? "complete" : slide.type}</small>
        </button>
      `;
    })
    .join("");
}

function renderControls() {
  if (state.activeSlides.length === 0) {
    return `
      <button type="button" class="control-button" data-action="request-wake-lock">
        ${supportsWakeLock() ? "Try keep-awake mode" : "Wake-lock unavailable"}
      </button>
    `;
  }

  return `
    <button type="button" class="control-button" data-action="prev-slide">Previous</button>
    <button type="button" class="control-button" data-action="next-slide">Next</button>
    <button type="button" class="control-button" data-action="request-wake-lock">
      Keep display awake
    </button>
  `;
}

function renderStructure({ force = false, animateSlide = false } = {}) {
  if (!state.data) {
    return false;
  }

  ensureShellRendered();
  dom.appTitle.textContent = state.data.config.appTitle;

  const activeSlide = currentSlide();
  const structuralSignature = buildStructuralSignature();
  const slideKey = getSlideKey(activeSlide);
  const shouldAnimate = animateSlide && state.lastRenderedSlideKey !== null && state.lastRenderedSlideKey !== slideKey;

  if (!force && structuralSignature === state.lastStructuralSignature) {
    updateLiveDisplay();
    return false;
  }

  dom.activePosition.textContent = activeSlide
    ? `${currentIndex() + 1} / ${state.activeSlides.length}`
    : "0 / 0";
  dom.windowText.textContent = activeSlide
    ? `${formatTime(activeSlide.activeSchedule.startsAt, state.data.config.timezone)} - ${formatTime(activeSlide.activeSchedule.endsAt, state.data.config.timezone)}`
    : "Waiting";
  dom.stageBoard.innerHTML = activeSlide
    ? (
        activeSlide.type === "checklist"
          ? renderChecklistSlide(activeSlide, { animate: shouldAnimate })
          : renderReminderSlide(activeSlide, { animate: shouldAnimate })
      )
    : renderUpcomingState({ animate: shouldAnimate });
  dom.slideStrip.innerHTML = renderNavigation();
  dom.controlRow.innerHTML = renderControls();

  state.lastStructuralSignature = structuralSignature;
  state.lastRenderedSlideKey = slideKey;
  updateLiveDisplay();
  return true;
}

function syncDerivedState() {
  const previousActiveSlideIds = state.activeSlides.map((slide) => slide.id).join("|");
  const previousCurrentSlideId = state.currentSlideId;

  state.activeSlides = getActiveSlides(state.data, state.now);
  state.progress = hydrateProgress(state.data, state.progress, state.now);
  persistProgressIfChanged();

  if (state.activeSlides.length === 0) {
    state.currentSlideId = null;
  } else if (!state.activeSlides.some((slide) => slide.id === state.currentSlideId)) {
    state.currentSlideId = state.activeSlides[0].id;
    state.rotationStartedAt = Date.now();
  }

  return {
    activeSlidesChanged: previousActiveSlideIds !== state.activeSlides.map((slide) => slide.id).join("|"),
    currentSlideChanged: previousCurrentSlideId !== state.currentSlideId
  };
}

function scheduleRotation() {
  if (state.rotationTimeout) {
    window.clearTimeout(state.rotationTimeout);
    state.rotationTimeout = null;
  }

  if (document.hidden || state.activeSlides.length <= 1) {
    return;
  }

  const delayMs = getRotationDelayMs(state.rotationStartedAt, Date.now(), slideDurationMs());

  state.rotationTimeout = window.setTimeout(() => {
    moveSlide(1);
  }, delayMs);
}

function selectSlideByIndex(index, { animateSlide = true } = {}) {
  if (state.activeSlides.length === 0) {
    state.currentSlideId = null;
    renderStructure({ force: true, animateSlide: false });
    return;
  }

  const normalizedIndex =
    ((index % state.activeSlides.length) + state.activeSlides.length) % state.activeSlides.length;
  const nextSlideId = state.activeSlides[normalizedIndex].id;
  const currentSlideChanged = nextSlideId !== state.currentSlideId;

  state.currentSlideId = nextSlideId;
  state.rotationStartedAt = Date.now();
  renderStructure({ animateSlide: animateSlide && currentSlideChanged });
  scheduleRotation();
}

function moveSlide(offset) {
  selectSlideByIndex(currentIndex() + offset, { animateSlide: true });
}

async function ensureWakeLock() {
  const { sentinel, message } = await requestWakeLock();
  state.wakeLockSentinel = sentinel;
  state.wakeLockMessage = message;

  if (sentinel) {
    sentinel.addEventListener("release", () => {
      state.wakeLockSentinel = null;
      state.wakeLockMessage = "Wake lock released. Tap Keep display awake to request it again.";
      updateStatusPanel();
    });
  }

  updateStatusPanel();
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
    renderStructure({ animateSlide: false });
    return;
  }

  if (action === "select-slide") {
    selectSlideByIndex(Number.parseInt(target.dataset.slideIndex ?? "0", 10), {
      animateSlide: true
    });
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

function handleLiveTick() {
  state.now = new Date();
  const syncResult = syncDerivedState();
  renderStructure({ animateSlide: syncResult.currentSlideChanged });

  if (syncResult.activeSlidesChanged || syncResult.currentSlideChanged) {
    scheduleRotation();
  }
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

      stopMeterLoop();
      return;
    }

    state.now = new Date();
    const syncResult = syncDerivedState();
    renderStructure({ animateSlide: syncResult.currentSlideChanged });
    scheduleRotation();
    startMeterLoop();

    if (!state.wakeLockSentinel) {
      ensureWakeLock();
    } else {
      updateStatusPanel();
    }
  });

  window.setInterval(handleLiveTick, 1000);
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

  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerAtLoad || hasReloadedForServiceWorkerUpdate) {
      return;
    }

    hasReloadedForServiceWorkerUpdate = true;
    window.location.reload();
  });

  try {
    const registration = await navigator.serviceWorker.register(
      `./sw.js?build=${encodeURIComponent(BUILD_VERSION)}`,
      { updateViaCache: "none" }
    );

    registration.update().catch(() => {});
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
}

async function initialize() {
  try {
    state.data = await loadHouseholdData();

    const savedProgress = loadProgressState();

    if (savedProgress) {
      state.progress = savedProgress;
      state.lastPersistedProgress = JSON.stringify(savedProgress);
    }

    syncDerivedState();
    ensureShellRendered();
    installEventListeners();
    renderStructure({ force: true, animateSlide: false });
    scheduleRotation();
    startMeterLoop();
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
