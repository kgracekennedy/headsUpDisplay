import { getActiveItemsForSlide, getActiveScheduleForGroup, getScheduleGroupMap, getActiveSlides } from "./schedule.mjs";

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
  return {
    version: typeof progressState?.version === "number" ? progressState.version : 2,
    minimizedSlideIds: Array.isArray(progressState?.minimizedSlideIds)
      ? [...progressState.minimizedSlideIds]
      : [],
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
    let orderedCheckedItemIds = saved.orderedCheckedItemIds.filter((itemId) =>
      activeItemIds.has(itemId)
    );

    if (activeSchedule && saved.instanceKey !== activeSchedule.instanceKey) {
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
      instanceKey: activeSchedule?.instanceKey ?? saved.instanceKey,
      completedAt: isComplete ? saved.completedAt ?? now.toISOString() : null
    };
  }

  return {
    version: normalizedState.version,
    minimizedSlideIds: normalizedState.minimizedSlideIds.filter((slideId) =>
      data.slides.some((slide) => slide.id === slideId && slide.type === "checklist")
    ),
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
    minimizedSlideIds: [...(progressState.minimizedSlideIds ?? [])],
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
  const isComplete =
    activeSlide.activeItems.length > 0 &&
    activeSlide.activeItems.every((item) => nextChecked.includes(item.id));

  nextState.slides[slideId] = {
    checkedItemIds: nextChecked,
    orderedCheckedItemIds,
    instanceKey: activeSlide.activeSchedule.instanceKey,
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
    minimizedSlideIds: [...minimizedSlideIds]
  };
}
