import {
  getActiveItemsForSlide,
  getActiveScheduleForGroup,
  getEffectiveModes,
  getOperationalDateKey,
  getScheduledChecklistItemsForSlide,
  getScheduleGroupMap,
  getActiveSlides,
  timeToMinutes
} from "./schedule.mjs";

export const PERSON_CHECKLIST_IDS = ["parents", "alexander", "lilja"];
export const KID_CHECKLIST_IDS = ["alexander", "lilja"];
export const SIGN_OFF_SECTION_IDS = ["am", "pm"];

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

function normalizeSectionSignOffs(sectionSignOffs) {
  if (typeof sectionSignOffs !== "object" || !sectionSignOffs) {
    return {};
  }

  const normalized = {};

  for (const [slideId, sections] of Object.entries(sectionSignOffs)) {
    if (typeof sections !== "object" || !sections) {
      continue;
    }

    for (const [sectionId, signOff] of Object.entries(sections)) {
      if (!SIGN_OFF_SECTION_IDS.includes(sectionId) || typeof signOff !== "object" || !signOff) {
        continue;
      }

      normalized[slideId] = {
        ...(normalized[slideId] ?? {}),
        [sectionId]: {
          dayKey: typeof signOff.dayKey === "string" ? signOff.dayKey : null,
          itemIds: Array.isArray(signOff.itemIds) ? [...signOff.itemIds] : [],
          signedOffAt: typeof signOff.signedOffAt === "string" ? signOff.signedOffAt : null
        }
      };
    }
  }

  return normalized;
}

export function normalizeProgressState(progressState) {
  const savedModes = progressState?.modes ?? {};

  return {
    version: typeof progressState?.version === "number" ? progressState.version : 5,
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
    signOffs: typeof progressState?.signOffs === "object" && progressState?.signOffs
      ? { ...progressState.signOffs }
      : {},
    sectionSignOffs: normalizeSectionSignOffs(progressState?.sectionSignOffs),
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

  const nextSectionSignOffs = {};

  for (const slide of data.slides) {
    if (!KID_CHECKLIST_IDS.includes(slide.id)) {
      continue;
    }

    const savedSlideSignOffs = normalizedState.sectionSignOffs[slide.id] ?? {};
    const nextSlideProgress = nextSlides[slide.id];

    if (!nextSlideProgress) {
      continue;
    }

    const activeItems = getActiveItemsForSlide(slide, now, modes);
    const activeSlide = { ...slide, activeItems };

    for (const sectionId of SIGN_OFF_SECTION_IDS) {
      const savedSignOff = savedSlideSignOffs[sectionId];

      if (!savedSignOff || savedSignOff.dayKey !== modes.dayKey) {
        continue;
      }

      const sectionItems = getChecklistSectionItems(activeSlide, sectionId);
      const signedItemIds = new Set(savedSignOff.itemIds ?? []);
      const allSectionItemsStillSigned =
        sectionItems.length > 0 && sectionItems.every((item) => signedItemIds.has(item.id));
      const allSectionItemsStillChecked = sectionItems.every((item) =>
        nextSlideProgress.checkedItemIds.includes(item.id)
      );

      if (allSectionItemsStillSigned && allSectionItemsStillChecked) {
        nextSectionSignOffs[slide.id] = {
          ...(nextSectionSignOffs[slide.id] ?? {}),
          [sectionId]: {
            dayKey: savedSignOff.dayKey,
            itemIds: sectionItems.map((item) => item.id).sort(),
            signedOffAt: savedSignOff.signedOffAt
          }
        };
      }
    }
  }

  return {
    version: 5,
    minimizedSlideIds: normalizedState.minimizedSlideIds.filter((slideId) =>
      data.slides.some((slide) => slide.id === slideId && slide.type === "checklist")
    ),
    modes,
    signOffs: {},
    sectionSignOffs: nextSectionSignOffs,
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

export function getChecklistSectionItems(activeSlide, sectionId) {
  if (activeSlide.type !== "checklist") {
    return [];
  }

  return activeSlide.activeItems.filter((item) => (item.section ?? "am") === sectionId);
}

export function isChecklistSectionChecked(activeSlide, progressState, sectionId) {
  const progressEntry = normalizeProgressEntry(progressState.slides[activeSlide.id]);
  const sectionItems = getChecklistSectionItems(activeSlide, sectionId);

  return (
    sectionItems.length > 0 &&
    sectionItems.every((item) => progressEntry.checkedItemIds.includes(item.id))
  );
}

export function getRequiredSignOffSections(activeSlide, now, modes = { dayMode: "school_day" }) {
  const requiredItems = getRequiredChecklistItems(activeSlide, now, modes);
  const requiredSectionIds = new Set(
    requiredItems
      .map((item) => item.section ?? "am")
      .filter((sectionId) => SIGN_OFF_SECTION_IDS.includes(sectionId))
  );

  return SIGN_OFF_SECTION_IDS.filter((sectionId) => requiredSectionIds.has(sectionId));
}

export function isChecklistSectionSignedOff(activeSlide, progressState, sectionId, modes = progressState?.modes) {
  if (!KID_CHECKLIST_IDS.includes(activeSlide.id)) {
    return false;
  }

  const signOff = progressState.sectionSignOffs?.[activeSlide.id]?.[sectionId];

  if (!signOff || signOff.dayKey !== modes?.dayKey) {
    return false;
  }

  const signedItemIds = new Set(signOff.itemIds ?? []);
  const sectionItems = getChecklistSectionItems(activeSlide, sectionId);

  return (
    sectionItems.length > 0 &&
    sectionItems.every((item) => signedItemIds.has(item.id)) &&
    isChecklistSectionChecked(activeSlide, progressState, sectionId)
  );
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
      const sectionActiveItems = activeSlide.activeItems.filter(
        (item) => (item.section ?? "am") === section.id
      );
      const checkedCount = sectionActiveItems.filter((item) => checkedItemIds.has(item.id)).length;
      const sectionChecked =
        sectionActiveItems.length > 0 && checkedCount === sectionActiveItems.length;
      const signedOff = isChecklistSectionSignedOff(activeSlide, progressState, section.id, modes);
      const hideCompletedParentAm =
        activeSlide.id === "parents" && section.id === "am" && sectionChecked;
      const hideSignedOffKidSection =
        KID_CHECKLIST_IDS.includes(activeSlide.id) &&
        SIGN_OFF_SECTION_IDS.includes(section.id) &&
        signedOff;
      const hideCheckedItems =
        section.hideChecked &&
        !(KID_CHECKLIST_IDS.includes(activeSlide.id) && sectionChecked && !signedOff);
      const items = getOrderedChecklistItems(
        {
          ...activeSlide,
          activeItems: sectionActiveItems
        },
        progressState
      ).filter((item) => !(hideCheckedItems && checkedItemIds.has(item.id)));

      return {
        ...section,
        checkedCount,
        totalCount: sectionActiveItems.length,
        isChecked: sectionChecked,
        isSignedOff: signedOff,
        items: hideCompletedParentAm || hideSignedOffKidSection ? [] : items
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
    version: 5,
    minimizedSlideIds: [...(progressState.minimizedSlideIds ?? [])],
    modes,
    signOffs: {
      ...(progressState.signOffs ?? {})
    },
    sectionSignOffs: {
      ...(progressState.sectionSignOffs ?? {})
    },
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
  delete nextState.signOffs[slideId];

  if (KID_CHECKLIST_IDS.includes(slideId)) {
    const toggledItem = activeSlide.activeItems.find((item) => item.id === itemId);
    const sectionId = toggledItem?.section ?? "am";

    if (SIGN_OFF_SECTION_IDS.includes(sectionId)) {
      nextState.sectionSignOffs[slideId] = {
        ...(nextState.sectionSignOffs[slideId] ?? {})
      };
      delete nextState.sectionSignOffs[slideId][sectionId];

      if (Object.keys(nextState.sectionSignOffs[slideId]).length === 0) {
        delete nextState.sectionSignOffs[slideId];
      }
    }
  }

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
    signOffs: {
      ...(progressState.signOffs ?? {})
    },
    sectionSignOffs: {
      ...(progressState.sectionSignOffs ?? {})
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

export function signOffSlide(data, progressState, slideId, now) {
  if (!KID_CHECKLIST_IDS.includes(slideId)) {
    return progressState;
  }

  const modes = getEffectiveModes(data, progressState, now);
  const activeSlide = getActiveSlides(data, now, modes).find((slide) => slide.id === slideId);

  if (!activeSlide || !isChecklistComplete(activeSlide, progressState, now, modes)) {
    return progressState;
  }

  return getRequiredSignOffSections(activeSlide, now, modes).reduce(
    (nextState, sectionId) => signOffChecklistSection(data, nextState, slideId, sectionId, now),
    progressState
  );
}

export function clearSlideSignOff(progressState, slideId) {
  const signOffs = { ...(progressState.signOffs ?? {}) };
  const sectionSignOffs = { ...(progressState.sectionSignOffs ?? {}) };
  delete signOffs[slideId];
  delete sectionSignOffs[slideId];

  return {
    ...progressState,
    signOffs,
    sectionSignOffs
  };
}

export function signOffChecklistSection(data, progressState, slideId, sectionId, now) {
  if (!KID_CHECKLIST_IDS.includes(slideId) || !SIGN_OFF_SECTION_IDS.includes(sectionId)) {
    return progressState;
  }

  const modes = getEffectiveModes(data, progressState, now);
  const activeSlide = getActiveSlides(data, now, modes).find((slide) => slide.id === slideId);

  if (!activeSlide || !isChecklistSectionChecked(activeSlide, progressState, sectionId)) {
    return progressState;
  }

  return {
    ...progressState,
    version: 5,
    modes,
    sectionSignOffs: {
      ...(progressState.sectionSignOffs ?? {}),
      [slideId]: {
        ...(progressState.sectionSignOffs?.[slideId] ?? {}),
        [sectionId]: {
          dayKey: modes.dayKey,
          itemIds: getChecklistSectionItems(activeSlide, sectionId).map((item) => item.id).sort(),
          signedOffAt: now.toISOString()
        }
      }
    }
  };
}

export function clearChecklistSectionSignOff(progressState, slideId, sectionId) {
  const sectionSignOffs = { ...(progressState.sectionSignOffs ?? {}) };
  sectionSignOffs[slideId] = { ...(sectionSignOffs[slideId] ?? {}) };
  delete sectionSignOffs[slideId][sectionId];

  if (Object.keys(sectionSignOffs[slideId]).length === 0) {
    delete sectionSignOffs[slideId];
  }

  return {
    ...progressState,
    sectionSignOffs
  };
}

export function isSlideSignedOff(activeSlide, progressState, now, modes = progressState?.modes) {
  if (!KID_CHECKLIST_IDS.includes(activeSlide.id)) {
    return false;
  }

  const requiredSignOffSections = getRequiredSignOffSections(activeSlide, now, modes);

  return (
    requiredSignOffSections.length > 0 &&
    isChecklistComplete(activeSlide, progressState, now, modes) &&
    requiredSignOffSections.every((sectionId) =>
      isChecklistSectionSignedOff(activeSlide, progressState, sectionId, modes)
    )
  );
}
