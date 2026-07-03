import { getActiveItemsForSlide, getActiveScheduleForGroup, getScheduleGroupMap, getActiveSlides } from "./schedule.mjs";

function normalizeProgressEntry(entry) {
  return {
    checkedItemIds: Array.isArray(entry?.checkedItemIds) ? [...entry.checkedItemIds] : [],
    instanceKey: typeof entry?.instanceKey === "string" ? entry.instanceKey : null,
    completedAt: typeof entry?.completedAt === "string" ? entry.completedAt : null
  };
}

export function hydrateProgress(data, persistedState, now) {
  const scheduleGroupMap = getScheduleGroupMap(data);
  const previousSlides = persistedState?.slides ?? {};
  const nextSlides = {};

  for (const slide of data.slides) {
    if (slide.type !== "checklist") {
      continue;
    }

    const saved = normalizeProgressEntry(previousSlides[slide.id]);
    const scheduleGroup = scheduleGroupMap.get(slide.scheduleGroupId);
    const activeSchedule = getActiveScheduleForGroup(scheduleGroup, now);
    const activeItems = getActiveItemsForSlide(slide, now);
    const activeItemIds = new Set(activeItems.map((item) => item.id));

    let checkedItemIds = saved.checkedItemIds.filter((itemId) => activeItemIds.has(itemId));

    if (activeSchedule && saved.instanceKey !== activeSchedule.instanceKey) {
      checkedItemIds = [];
    }

    const isComplete =
      activeItems.length > 0 && activeItems.every((item) => checkedItemIds.includes(item.id));

    nextSlides[slide.id] = {
      checkedItemIds,
      instanceKey: activeSchedule?.instanceKey ?? saved.instanceKey,
      completedAt: isComplete ? saved.completedAt ?? now.toISOString() : null
    };
  }

  return {
    version: 1,
    slides: nextSlides
  };
}

export function isChecklistComplete(activeSlide, progressState) {
  if (activeSlide.type !== "checklist") {
    return false;
  }

  const progressEntry = progressState.slides[activeSlide.id];

  if (!progressEntry || activeSlide.activeItems.length === 0) {
    return false;
  }

  return activeSlide.activeItems.every((item) => progressEntry.checkedItemIds.includes(item.id));
}

export function getOrderedChecklistItems(activeSlide, progressState) {
  if (activeSlide.type !== "checklist") {
    return activeSlide.activeItems;
  }

  const checkedItemIds = new Set(progressState.slides[activeSlide.id]?.checkedItemIds ?? []);
  const pendingItems = [];
  const completedItems = [];

  for (const item of activeSlide.activeItems) {
    if (checkedItemIds.has(item.id)) {
      completedItems.push(item);
    } else {
      pendingItems.push(item);
    }
  }

  return [...pendingItems, ...completedItems];
}

export function toggleChecklistItem(data, progressState, slideId, itemId, now) {
  const activeSlide = getActiveSlides(data, now).find((slide) => slide.id === slideId);

  if (!activeSlide || activeSlide.type !== "checklist") {
    return progressState;
  }

  const itemExists = activeSlide.activeItems.some((item) => item.id === itemId);

  if (!itemExists) {
    return progressState;
  }

  const nextState = {
    version: progressState.version,
    slides: {
      ...progressState.slides
    }
  };
  const currentEntry = normalizeProgressEntry(progressState.slides[slideId]);
  const checkedItemIds = new Set(currentEntry.checkedItemIds);

  if (checkedItemIds.has(itemId)) {
    checkedItemIds.delete(itemId);
  } else {
    checkedItemIds.add(itemId);
  }

  const nextChecked = [...checkedItemIds];
  const isComplete =
    activeSlide.activeItems.length > 0 &&
    activeSlide.activeItems.every((item) => nextChecked.includes(item.id));

  nextState.slides[slideId] = {
    checkedItemIds: nextChecked,
    instanceKey: activeSlide.activeSchedule.instanceKey,
    completedAt: isComplete ? now.toISOString() : null
  };

  return nextState;
}
