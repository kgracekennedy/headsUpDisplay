import {
  getActiveScheduleForGroup,
  getEffectiveModes,
  getOperationalDateKey,
  getScheduledChecklistItemsForSlide,
  getScheduleGroupMap,
  getActiveSlides,
  timeToMinutes
} from "./schedule.mjs";

function normalizeProgressEntry(entry) {
  return {
    checkedItemIds: Array.isArray(entry?.checkedItemIds) ? [...entry.checkedItemIds] : [],
    orderedCheckedItemIds: Array.isArray(entry?.orderedCheckedItemIds)
      ? [...entry.orderedCheckedItemIds]
      : Array.isArray(entry?.checkedItemIds)
        ? [...entry.checkedItemIds]
        : [],
    instanceKey: typeof entry?.instanceKey === "string" ? entry.instanceKey : null,
    completedAt: typeof entry?.completedAt === "string" ? entry.completedAt : null
  };
}

export function normalizeProgressState(progressState) {
  const savedModes = progressState?.modes ?? {};

  return {
    version: typeof progressState?.version === "number" ? progressState.version : 3,
    minimizedSlideIds: Array.isArray(progressState?.minimizedSlideIds)
      ? [...progressState.minimizedSlideIds]
      : [],
    modes: {
      dayKey: typeof savedModes.dayKey === "string" ? savedModes.dayKey : null,
      dayMode:
        savedModes.dayMode === "school_day" || savedModes.dayMode === "non_school_day"
          ? savedModes.dayMode
          : null,
      seasonMode:
        savedModes.seasonMode === "summer_camp" || savedModes.seasonMode === "school_year"
          ? savedModes.seasonMode
          : "school_year"
    },
    slides: typeof progressState?.slides === "object" && progressState?.slides
      ? { ...progressState.slides }
      : {}
  };
}

export function hydrateProgress(data, persistedState, now) {
  const normalizedState = normalizeProgressState(persistedState);
  const scheduleGroupMap = getScheduleGroupMap(data);
  const previousSlides = normalizedState.slides;
  const nextSlides = {};
  const modes = getEffectiveModes(data, normalizedState, now);

  for (const slide of data.slides) {
    if (slide.type !== "checklist") {
      continue;
    }

    const saved = normalizeProgressEntry(previousSlides[slide.id]);
    const scheduleGroup = scheduleGroupMap.get(slide.scheduleGroupId);
    const activeSchedule = getActiveScheduleForGroup(scheduleGroup, now);
    const activeItems = getScheduledChecklistItemsForSlide(slide, now);
    const activeItemIds = new Set(activeItems.map((item) => item.id));

    let checkedItemIds = saved.checkedItemIds.filter((itemId) => activeItemIds.has(itemId));
    let orderedCheckedItemIds = saved.orderedCheckedItemIds.filter((itemId) =>
      activeItemIds.has(itemId)
    );

    if (activeSchedule && saved.instanceKey !== modes.dayKey) {
      checkedItemIds = [];
      orderedCheckedItemIds = [];
    }

    if (orderedCheckedItemIds.length !== checkedItemIds.length) {
      const orderedSet = new Set(orderedCheckedItemIds);
      const missingCheckedIds = checkedItemIds.filter((itemId) => !orderedSet.has(itemId));
      orderedCheckedItemIds = [...orderedCheckedItemIds, ...missingCheckedIds];
    }

    const isComplete =
      activeItems.length > 0 && activeItems.every((item) => checkedItemIds.includes(item.id));

    nextSlides[slide.id] = {
      checkedItemIds,
      orderedCheckedItemIds,
      instanceKey: activeSchedule ? modes.dayKey : saved.instanceKey,
      completedAt: isComplete ? saved.completedAt ?? now.toISOString() : null
    };
  }

  return {
    version: 3,
    minimizedSlideIds: normalizedState.minimizedSlideIds.filter((slideId) =>
      data.slides.some((slide) => slide.id === slideId && slide.type === "checklist")
    ),
    modes,
    slides: nextSlides
  };
}

export function getPmStartMinutes(activeSlide, modes = { dayMode: "school_day" }) {
  const configured =
    modes.dayMode === "non_school_day"
      ? activeSlide.pmStartNonSchool
      : activeSlide.pmStartSchool;

  return timeToMinutes(configured || "16:00");
}

export function isPmTime(activeSlide, now, modes = { dayMode: "school_day" }) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= getPmStartMinutes(activeSlide, modes);
}

export function getRequiredChecklistItems(activeSlide, now, modes = { dayMode: "school_day" }) {
  if (activeSlide.type !== "checklist") {
    return [];
  }

  const pmStarted = isPmTime(activeSlide, now, modes);

  return activeSlide.activeItems.filter((item) => {
    const section = item.section ?? "am";
    return section === "anytime" || section === "am" || (pmStarted && section === "pm");
  });
}

export function isChecklistComplete(activeSlide, progressState, now = null, modes = progressState?.modes) {
  if (activeSlide.type !== "checklist") {
    return false;
  }

  const progressEntry = progressState.slides[activeSlide.id];
  const requiredItems = now
    ? getRequiredChecklistItems(activeSlide, now, modes)
    : activeSlide.activeItems;

  if (!progressEntry || requiredItems.length === 0) {
    return false;
  }

  return requiredItems.every((item) => progressEntry.checkedItemIds.includes(item.id));
}

export function getVisibleChecklistSections(activeSlide, progressState, now = new Date(), modes = progressState?.modes) {
  if (activeSlide.type !== "checklist") {
    return [];
  }

  const progressEntry = normalizeProgressEntry(progressState.slides[activeSlide.id]);
  const checkedItemIds = new Set(progressEntry.checkedItemIds);
  const pmStarted = isPmTime(activeSlide, now, modes);
  const sectionSpecs = pmStarted
    ? [
        { id: "am", title: "Leftover AM Tasks", hideChecked: true },
        { id: "pm", title: "PM Tasks", hideChecked: false },
        { id: "anytime", title: "Anytime Tasks", hideChecked: false }
      ]
    : [
        { id: "am", title: "AM Tasks", hideChecked: false },
        { id: "anytime", title: "Anytime Tasks", hideChecked: false }
      ];

  return sectionSpecs
    .map((section) => {
      const items = getOrderedChecklistItems(
        {
          ...activeSlide,
          activeItems: activeSlide.activeItems.filter((item) => (item.section ?? "am") === section.id)
        },
        progressState
      ).filter((item) => !(section.hideChecked && checkedItemIds.has(item.id)));

      return {
        ...section,
        items
      };
    })
    .filter((section) => section.items.length > 0);
}

export function getOrderedChecklistItems(activeSlide, progressState) {
  if (activeSlide.type !== "checklist") {
    return activeSlide.activeItems;
  }

  const progressEntry = normalizeProgressEntry(progressState.slides[activeSlide.id]);
  const checkedItemIds = new Set(progressEntry.checkedItemIds);
  const pendingItems = [];
  const completedItemsById = new Map();

  for (const item of activeSlide.activeItems) {
    if (checkedItemIds.has(item.id)) {
      completedItemsById.set(item.id, item);
    } else {
      pendingItems.push(item);
    }
  }

  const completedItems = progressEntry.orderedCheckedItemIds
    .map((itemId) => completedItemsById.get(itemId))
    .filter(Boolean);

  return [...pendingItems, ...completedItems];
}

export function toggleChecklistItem(data, progressState, slideId, itemId, now) {
  const modes = getEffectiveModes(data, progressState, now);
  const activeSlide = getActiveSlides(data, now, modes).find((slide) => slide.id === slideId);

  if (!activeSlide || activeSlide.type !== "checklist") {
    return progressState;
  }

  const itemExists = activeSlide.activeItems.some((item) => item.id === itemId);

  if (!itemExists) {
    return progressState;
  }

  const nextState = {
    version: 3,
    minimizedSlideIds: [...(progressState.minimizedSlideIds ?? [])],
    modes,
    slides: {
      ...progressState.slides
    }
  };
  const currentEntry = normalizeProgressEntry(progressState.slides[slideId]);
  const checkedItemIds = new Set(currentEntry.checkedItemIds);
  const orderedCheckedItemIds = currentEntry.orderedCheckedItemIds.filter(
    (checkedItemId) => checkedItemId !== itemId
  );

  if (checkedItemIds.has(itemId)) {
    checkedItemIds.delete(itemId);
  } else {
    checkedItemIds.add(itemId);
    orderedCheckedItemIds.push(itemId);
  }

  const nextChecked = [...checkedItemIds];
  const requiredItems = getRequiredChecklistItems(activeSlide, now, modes);
  const isComplete =
    requiredItems.length > 0 && requiredItems.every((item) => nextChecked.includes(item.id));

  nextState.slides[slideId] = {
    checkedItemIds: nextChecked,
    orderedCheckedItemIds,
    instanceKey: modes.dayKey,
    completedAt: isComplete ? now.toISOString() : null
  };

  return nextState;
}

export function isSlideMinimized(progressState, slideId) {
  return (progressState.minimizedSlideIds ?? []).includes(slideId);
}

export function toggleSlideMinimized(progressState, slideId) {
  const minimizedSlideIds = new Set(progressState.minimizedSlideIds ?? []);

  if (minimizedSlideIds.has(slideId)) {
    minimizedSlideIds.delete(slideId);
  } else {
    minimizedSlideIds.add(slideId);
  }

  return {
    version: progressState.version,
    slides: {
      ...progressState.slides
    },
    modes: {
      ...(progressState.modes ?? {})
    },
    minimizedSlideIds: [...minimizedSlideIds]
  };
}

export function setDayMode(data, progressState, dayMode, now) {
  const normalizedState = normalizeProgressState(progressState);
  const dayKey = getOperationalDateKey(now);
  const nextDayMode = dayMode === "non_school_day" ? "non_school_day" : "school_day";

  return hydrateProgress(
    data,
    {
      ...normalizedState,
      modes: {
        ...normalizedState.modes,
        dayKey,
        dayMode: nextDayMode
      }
    },
    now
  );
}

export function setSeasonMode(data, progressState, seasonMode, now) {
  const normalizedState = normalizeProgressState(progressState);
  const nextSeasonMode = seasonMode === "summer_camp" ? "summer_camp" : "school_year";
  const modes = getEffectiveModes(data, normalizedState, now);

  return hydrateProgress(
    data,
    {
      ...normalizedState,
      modes: {
        ...modes,
        seasonMode: nextSeasonMode
      }
    },
    now
  );
}

export function getModeLabel(mode) {
  return mode === "non_school_day" ? "Non-school day" : "School day";
}
