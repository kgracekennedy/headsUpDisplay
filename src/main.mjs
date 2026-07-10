import { getUpcomingStarts, getActiveSlides } from "./lib/schedule.mjs";
import {
  getOrderedChecklistItems,
  hydrateProgress,
  isChecklistComplete,
  isSlideMinimized,
  normalizeProgressState,
  toggleSlideMinimized,
  toggleChecklistItem
} from "./lib/runtime-model.mjs";
import { getRotationDelayMs, getRotationRatio } from "./lib/rotation.mjs";
import {
  advanceReminderScrollTop,
  getReminderMaxScrollTop,
  isReminderScrollAtBottom,
  reminderNeedsAutoScroll
} from "./lib/reminder-scroll.mjs";
import { loadProgressState, saveProgressState } from "./lib/storage.mjs";
import { requestWakeLock, supportsWakeLock } from "./lib/wake-lock.mjs";

const BUILD_VERSION = "__BUILD_VERSION__";
const REMINDER_AUTO_SCROLL_SPEED_PX_PER_SEC = 22;
const REMINDER_AUTO_SCROLL_RESUME_MS = 4000;
const REMINDER_AUTO_SCROLL_LOOP_PAUSE_MS = 1500;
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
  progress: { version: 2, minimizedSlideIds: [], slides: {} },
  activeSlides: [],
  currentSlideId: null,
  rotationTimeout: null,
  rotationStartedAt: Date.now(),
  wakeLockSentinel: null,
  wakeLockMessage: supportsWakeLock()
    ? "The app will try to keep the display awake while it is open."
    : "This browser cannot keep the display awake automatically.",
  now: new Date(),
  touchPoint: null,
  lastPersistedProgress: "",
  lastStructuralSignature: null,
  lastRenderedSlideKey: null,
  meterAnimationFrame: null,
  reminderAutoScroll: {
    panel: null,
    cleanup: null,
    frameId: null,
    resumeTimeoutId: null,
    lastTimestamp: null,
    isPaused: false,
    isProgrammaticScroll: false
  }
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

function currentSlide() {
  return state.activeSlides.find((slide) => slide.id === state.currentSlideId) ?? null;
}

function rotatingSlides() {
  return state.activeSlides.filter(
    (slide) => !(slide.type === "checklist" && isSlideMinimized(state.progress, slide.id))
  );
}

function currentRotationIndex() {
  return Math.max(
    0,
    rotatingSlides().findIndex((slide) => slide.id === state.currentSlideId)
  );
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
  const activeRotationSlides = rotatingSlides();
  const shouldTrackRotation =
    Boolean(activeSlide) &&
    activeRotationSlides.length > 1 &&
    activeRotationSlides.some((slide) => slide.id === state.currentSlideId);
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

function clearReminderAutoScrollFrame() {
  if (!state.reminderAutoScroll.frameId) {
    return;
  }

  window.cancelAnimationFrame(state.reminderAutoScroll.frameId);
  state.reminderAutoScroll.frameId = null;
}

function clearReminderAutoScrollResumeTimer() {
  if (!state.reminderAutoScroll.resumeTimeoutId) {
    return;
  }

  window.clearTimeout(state.reminderAutoScroll.resumeTimeoutId);
  state.reminderAutoScroll.resumeTimeoutId = null;
}

function setReminderPanelScrollTop(panel, scrollTop) {
  state.reminderAutoScroll.isProgrammaticScroll = true;
  panel.scrollTop = scrollTop;
  state.reminderAutoScroll.isProgrammaticScroll = false;
}

function stopReminderAutoScroll({ detachPanel = false } = {}) {
  clearReminderAutoScrollFrame();
  clearReminderAutoScrollResumeTimer();
  state.reminderAutoScroll.lastTimestamp = null;
  state.reminderAutoScroll.isPaused = false;
  state.reminderAutoScroll.isProgrammaticScroll = false;

  if (!detachPanel) {
    return;
  }

  if (state.reminderAutoScroll.cleanup) {
    state.reminderAutoScroll.cleanup();
  }

  state.reminderAutoScroll.cleanup = null;
  state.reminderAutoScroll.panel = null;
}

function pauseReminderAutoScroll(delayMs, { resetToTop = false } = {}) {
  const panel = state.reminderAutoScroll.panel;

  clearReminderAutoScrollFrame();
  clearReminderAutoScrollResumeTimer();
  state.reminderAutoScroll.lastTimestamp = null;
  state.reminderAutoScroll.isPaused = true;

  if (!panel) {
    return;
  }

  state.reminderAutoScroll.resumeTimeoutId = window.setTimeout(() => {
    const currentPanel = state.reminderAutoScroll.panel;

    state.reminderAutoScroll.resumeTimeoutId = null;

    if (!currentPanel || document.hidden) {
      return;
    }

    if (!reminderNeedsAutoScroll(currentPanel)) {
      state.reminderAutoScroll.isPaused = false;
      setReminderPanelScrollTop(currentPanel, 0);
      return;
    }

    if (resetToTop) {
      setReminderPanelScrollTop(currentPanel, 0);
    }

    state.reminderAutoScroll.isPaused = false;
    startReminderAutoScroll();
  }, delayMs);
}

function startReminderAutoScroll() {
  const panel = state.reminderAutoScroll.panel;

  if (
    !panel ||
    document.hidden ||
    state.reminderAutoScroll.isPaused ||
    !reminderNeedsAutoScroll(panel)
  ) {
    return;
  }

  clearReminderAutoScrollFrame();
  state.reminderAutoScroll.lastTimestamp = null;

  const step = (timestamp) => {
    const currentPanel = state.reminderAutoScroll.panel;

    if (
      currentPanel !== panel ||
      !currentPanel ||
      document.hidden ||
      state.reminderAutoScroll.isPaused ||
      !reminderNeedsAutoScroll(currentPanel)
    ) {
      state.reminderAutoScroll.frameId = null;
      state.reminderAutoScroll.lastTimestamp = null;
      return;
    }

    const maxScrollTop = getReminderMaxScrollTop(currentPanel);

    if (isReminderScrollAtBottom(currentPanel.scrollTop, maxScrollTop)) {
      state.reminderAutoScroll.frameId = null;
      pauseReminderAutoScroll(REMINDER_AUTO_SCROLL_LOOP_PAUSE_MS, { resetToTop: true });
      return;
    }

    if (state.reminderAutoScroll.lastTimestamp === null) {
      state.reminderAutoScroll.lastTimestamp = timestamp;
      state.reminderAutoScroll.frameId = window.requestAnimationFrame(step);
      return;
    }

    const elapsedSeconds = (timestamp - state.reminderAutoScroll.lastTimestamp) / 1000;
    state.reminderAutoScroll.lastTimestamp = timestamp;

    const nextScrollTop = advanceReminderScrollTop(
      currentPanel.scrollTop,
      elapsedSeconds * REMINDER_AUTO_SCROLL_SPEED_PX_PER_SEC,
      maxScrollTop
    );

    setReminderPanelScrollTop(currentPanel, nextScrollTop);

    if (isReminderScrollAtBottom(nextScrollTop, maxScrollTop)) {
      state.reminderAutoScroll.frameId = null;
      pauseReminderAutoScroll(REMINDER_AUTO_SCROLL_LOOP_PAUSE_MS, { resetToTop: true });
      return;
    }

    state.reminderAutoScroll.frameId = window.requestAnimationFrame(step);
  };

  state.reminderAutoScroll.frameId = window.requestAnimationFrame(step);
}

function interruptReminderAutoScroll() {
  if (!state.reminderAutoScroll.panel) {
    return;
  }

  pauseReminderAutoScroll(REMINDER_AUTO_SCROLL_RESUME_MS);
}

function syncReminderAutoScroll({ forceRestart = false } = {}) {
  const activeSlide = currentSlide();
  const nextPanel =
    activeSlide?.type === "reminder"
      ? dom.stageBoard?.querySelector("[data-role='reminder-panel']")
      : null;

  if (nextPanel !== state.reminderAutoScroll.panel) {
    stopReminderAutoScroll({ detachPanel: true });

    if (!nextPanel) {
      return;
    }

    const handleUserScroll = () => {
      if (state.reminderAutoScroll.isProgrammaticScroll) {
        return;
      }

      interruptReminderAutoScroll();
    };
    const handleUserInteraction = () => {
      interruptReminderAutoScroll();
    };

    nextPanel.addEventListener("scroll", handleUserScroll, { passive: true });
    nextPanel.addEventListener("wheel", handleUserInteraction, { passive: true });
    nextPanel.addEventListener("touchstart", handleUserInteraction, { passive: true });
    nextPanel.addEventListener("pointerdown", handleUserInteraction, { passive: true });

    state.reminderAutoScroll.panel = nextPanel;
    state.reminderAutoScroll.cleanup = () => {
      nextPanel.removeEventListener("scroll", handleUserScroll);
      nextPanel.removeEventListener("wheel", handleUserInteraction);
      nextPanel.removeEventListener("touchstart", handleUserInteraction);
      nextPanel.removeEventListener("pointerdown", handleUserInteraction);
    };
  }

  if (!nextPanel) {
    return;
  }

  if (!reminderNeedsAutoScroll(nextPanel)) {
    stopReminderAutoScroll();
    setReminderPanelScrollTop(nextPanel, 0);
    return;
  }

  if (forceRestart) {
    stopReminderAutoScroll();
    startReminderAutoScroll();
    return;
  }

  if (
    !state.reminderAutoScroll.frameId &&
    !state.reminderAutoScroll.resumeTimeoutId &&
    !state.reminderAutoScroll.isPaused
  ) {
    startReminderAutoScroll();
  }
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
    const orderedCheckedItemIds = [
      ...(state.progress.slides[slide.id]?.orderedCheckedItemIds ?? [])
    ]
      .join(",");
    const completionState = isChecklistComplete(slide, state.progress) ? "complete" : "progress";
    const minimizedState = isSlideMinimized(state.progress, slide.id) ? "minimized" : "rotation";

    return [
      slide.id,
      slide.activeSchedule.instanceKey,
      activeItemIds,
      checkedItemIds,
      orderedCheckedItemIds,
      completionState,
      minimizedState
    ].join(":");
  });

  return JSON.stringify({
    activeSlides: slideStates,
    minimizedSlideIds: [...(state.progress.minimizedSlideIds ?? [])].sort(),
    currentSlideId: state.currentSlideId
  });
}

function buildChecklistMarkup(slide) {
  const progressEntry = state.progress.slides[slide.id] ?? { checkedItemIds: [] };
  const orderedItems = getOrderedChecklistItems(slide, state.progress);

  return orderedItems
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
      <div class="completion-copy">
        <p class="completion-label">${completionLabel}</p>
        <p class="completion-title">${escapeHtml(slide.celebrationTitle)}</p>
        <p class="completion-note">Tap any checked item to reopen the list.</p>
      </div>
      ${rewardMarkup}
    </section>
  `;
}

function renderChecklistSlide(slide, { animate = false } = {}) {
  const progressEntry = state.progress.slides[slide.id] ?? { checkedItemIds: [] };
  const checkedCount = progressEntry.checkedItemIds.length;
  const isComplete = isChecklistComplete(slide, state.progress);
  const minimized = isSlideMinimized(state.progress, slide.id);
  const transitionClass = animate ? " slide-card--transition" : "";
  const completionBanner = isComplete ? renderCelebrationPanel(slide) : "";
  const celebrationBackdrop = isComplete ? renderCelebrationBackdrop() : "";
  const rotationControlLabel = minimized ? "Show in rotation" : "Hide from rotation";
  const rotationStatusMarkup = minimized
    ? `<p class="slide-helper">This checklist is hidden from auto-rotation and stays available from the bottom row.</p>`
    : `<p class="slide-helper">This checklist is part of the regular heads-up rotation.</p>`;

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
          <div class="slide-actions">
            <button
              type="button"
              class="secondary-button"
              data-action="toggle-minimized"
              data-slide-id="${escapeHtml(slide.id)}"
              aria-pressed="${minimized ? "true" : "false"}"
            >
              ${rotationControlLabel}
            </button>
          </div>
          ${rotationStatusMarkup}
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
        <div class="reminder-panel" data-role="reminder-panel">
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

  const rotatingSlideIds = new Set(rotatingSlides().map((slide) => slide.id));

  return state.activeSlides
    .map((slide) => {
      const selected = slide.id === state.currentSlideId;
      const inRotation = rotatingSlideIds.has(slide.id);
      const complete = slide.type === "checklist" && isChecklistComplete(slide, state.progress);
      const minimized = slide.type === "checklist" && isSlideMinimized(state.progress, slide.id);
      const statusLabel = minimized
        ? "manual"
        : complete
          ? "complete"
          : slide.type;

      return `
        <button
          type="button"
          class="slide-pill${selected ? " slide-pill--selected" : ""}${inRotation ? " slide-pill--rotating" : ""}${minimized ? " slide-pill--manual" : ""}"
          data-action="select-slide"
          data-slide-id="${escapeHtml(slide.id)}"
          aria-pressed="${selected ? "true" : "false"}"
          aria-current="${selected ? "true" : "false"}"
        >
          <span>${escapeHtml(slide.title)}</span>
          <small>${escapeHtml(statusLabel)}</small>
        </button>
      `;
    })
    .join("");
}

function renderControls() {
  return "";
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

  const activeRotationSlides = rotatingSlides();
  const showingRotatingSlide = activeRotationSlides.some((slide) => slide.id === state.currentSlideId);

  dom.activePosition.textContent = activeSlide
    ? (
        showingRotatingSlide
          ? `${currentRotationIndex() + 1} / ${activeRotationSlides.length}`
          : "Pinned"
      )
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
  dom.controlRow.hidden = dom.controlRow.innerHTML.trim().length === 0;

  state.lastStructuralSignature = structuralSignature;
  state.lastRenderedSlideKey = slideKey;
  syncReminderAutoScroll({ forceRestart: true });
  updateLiveDisplay();
  return true;
}

function syncDerivedState() {
  const previousActiveSlideIds = state.activeSlides.map((slide) => slide.id).join("|");
  const previousCurrentSlideId = state.currentSlideId;

  state.activeSlides = getActiveSlides(state.data, state.now);
  state.progress = hydrateProgress(state.data, state.progress, state.now);
  persistProgressIfChanged();
  const activeRotationSlides = rotatingSlides();
  const defaultSlide = activeRotationSlides[0] ?? state.activeSlides[0] ?? null;

  if (state.activeSlides.length === 0) {
    state.currentSlideId = null;
  } else if (!state.activeSlides.some((slide) => slide.id === state.currentSlideId)) {
    state.currentSlideId = defaultSlide?.id ?? null;
    state.rotationStartedAt = Date.now();
  } else if (!state.currentSlideId && defaultSlide) {
    state.currentSlideId = defaultSlide.id;
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

  const activeRotationSlides = rotatingSlides();
  const isCurrentSlideInRotation = activeRotationSlides.some((slide) => slide.id === state.currentSlideId);

  if (document.hidden || activeRotationSlides.length <= 1 || !isCurrentSlideInRotation) {
    return;
  }

  const delayMs = getRotationDelayMs(state.rotationStartedAt, Date.now(), slideDurationMs());

  state.rotationTimeout = window.setTimeout(() => {
    moveSlide(1);
  }, delayMs);
}

function selectSlideById(slideId, { animateSlide = true } = {}) {
  if (state.activeSlides.length === 0) {
    state.currentSlideId = null;
    renderStructure({ force: true, animateSlide: false });
    return;
  }

  const nextSlide = state.activeSlides.find((slide) => slide.id === slideId) ?? null;

  if (!nextSlide) {
    return;
  }

  const currentSlideChanged = nextSlide.id !== state.currentSlideId;

  state.currentSlideId = nextSlide.id;
  state.rotationStartedAt = Date.now();
  renderStructure({ animateSlide: animateSlide && currentSlideChanged });
  scheduleRotation();
}

function moveSlide(offset) {
  const activeRotationSlides = rotatingSlides();

  if (activeRotationSlides.length === 0) {
    return;
  }

  const currentRotationSlideIndex = activeRotationSlides.findIndex(
    (slide) => slide.id === state.currentSlideId
  );
  const baseIndex = currentRotationSlideIndex >= 0
    ? currentRotationSlideIndex
    : offset >= 0
      ? -1
      : 0;
  const nextIndex =
    ((baseIndex + offset) % activeRotationSlides.length + activeRotationSlides.length) %
    activeRotationSlides.length;

  selectSlideById(activeRotationSlides[nextIndex].id, { animateSlide: true });
}

async function ensureWakeLock() {
  const { sentinel, message } = await requestWakeLock();
  state.wakeLockSentinel = sentinel;
  state.wakeLockMessage = message;

  if (sentinel) {
    sentinel.addEventListener("release", () => {
      state.wakeLockSentinel = null;
      state.wakeLockMessage = "Keep-awake turned off. The app will try again when it becomes active.";
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

  if (action === "toggle-minimized") {
    const slideId = target.dataset.slideId;
    const wasCurrentSlide = slideId === state.currentSlideId;

    state.progress = toggleSlideMinimized(state.progress, slideId);
    persistProgressIfChanged();

    if (wasCurrentSlide && !isSlideMinimized(state.progress, slideId)) {
      state.rotationStartedAt = Date.now();
    }

    renderStructure({ animateSlide: false });
    scheduleRotation();
    target.blur();
    return;
  }

  if (action === "select-slide") {
    selectSlideById(target.dataset.slideId, {
      animateSlide: true
    });
    target.blur();
    return;
  }

  target.blur();
}

function handleTouchStart(event) {
  const touch = event.changedTouches?.[0];

  if (!touch) {
    return;
  }

  state.touchPoint = {
    x: touch.clientX,
    y: touch.clientY,
    allowSwipeNavigation: !touch.target.closest("[data-role='reminder-panel']")
  };
}

function handleTouchEnd(event) {
  const touch = event.changedTouches?.[0];

  if (!touch || !state.touchPoint) {
    return;
  }

  if (!state.touchPoint.allowSwipeNavigation) {
    state.touchPoint = null;
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
      stopReminderAutoScroll();
      return;
    }

    state.now = new Date();
    const syncResult = syncDerivedState();
    renderStructure({ animateSlide: syncResult.currentSlideChanged });
    scheduleRotation();
    startMeterLoop();
    syncReminderAutoScroll({ forceRestart: true });

    if (!state.wakeLockSentinel) {
      ensureWakeLock();
    } else {
      updateStatusPanel();
    }
  });

  window.setInterval(handleLiveTick, 1000);
  window.addEventListener("resize", () => {
    syncReminderAutoScroll({ forceRestart: true });
  });
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
      state.progress = normalizeProgressState(savedProgress);
      state.lastPersistedProgress = JSON.stringify(state.progress);
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
