const DAY_INDEX = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseCompactSelector(value) {
  const normalized = value.toUpperCase();

  if (normalized === "MTWRF") {
    return new Set([1, 2, 3, 4, 5]);
  }

  if (normalized === "SASU") {
    return new Set([6, 0]);
  }

  return null;
}

export function daySelectorMatches(selector, date) {
  const normalized = String(selector ?? "").trim();

  if (normalized === "" || /^all$/i.test(normalized)) {
    return true;
  }

  if (/^weekdays$/i.test(normalized)) {
    return date.getDay() >= 1 && date.getDay() <= 5;
  }

  if (/^weekends$/i.test(normalized)) {
    return date.getDay() === 0 || date.getDay() === 6;
  }

  const compactMatch = parseCompactSelector(normalized.replace(/\s+/g, ""));

  if (compactMatch) {
    return compactMatch.has(date.getDay());
  }

  const tokens = normalized
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  return tokens.some((token) => DAY_INDEX[token] === date.getDay());
}

function weeksBetween(anchorDate, date) {
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(date).getTime() - startOfDay(anchorDate).getTime()) / millisecondsPerWeek);
}

function weekOfMonth(date) {
  return Math.ceil(date.getDate() / 7);
}

export function parseAnchorDate(value) {
  const normalized = String(value ?? "").trim();

  if (normalized === "") {
    return null;
  }

  let year;
  let month;
  let day;
  let match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    year = Number.parseInt(match[1], 10);
    month = Number.parseInt(match[2], 10);
    day = Number.parseInt(match[3], 10);
  } else {
    match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (!match) {
      return null;
    }

    month = Number.parseInt(match[1], 10);
    day = Number.parseInt(match[2], 10);
    year = Number.parseInt(match[3], 10);
  }

  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function weekPatternMatches(rule, date) {
  const pattern = String(rule.weekPattern ?? "all").trim().toLowerCase();

  if (pattern === "all") {
    return true;
  }

  const weekNumber = Math.ceil(
    ((startOfDay(date).getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7
  );

  if (pattern === "odd_weeks") {
    return weekNumber % 2 === 1;
  }

  if (pattern === "even_weeks") {
    return weekNumber % 2 === 0;
  }

  if (pattern === "every_other_from_anchor") {
    if (!rule.anchorDate) {
      return false;
    }

    const anchorDate = parseAnchorDate(rule.anchorDate);

    if (!anchorDate) {
      return false;
    }

    return weeksBetween(anchorDate, date) % 2 === 0;
  }

  if (pattern === "first_and_third_weeks_of_month") {
    const ordinalWeek = weekOfMonth(date);
    return ordinalWeek === 1 || ordinalWeek === 3;
  }

  return false;
}

export function timeToMinutes(timeText) {
  const [hoursText, minutesText] = String(timeText).split(":");
  return Number.parseInt(hoursText, 10) * 60 + Number.parseInt(minutesText, 10);
}

export function getOperationalDateKey(date) {
  const operationalDate = new Date(date);
  operationalDate.setHours(operationalDate.getHours() - 2);

  return [
    operationalDate.getFullYear(),
    String(operationalDate.getMonth() + 1).padStart(2, "0"),
    String(operationalDate.getDate()).padStart(2, "0")
  ].join("-");
}

export function getSchoolDayOff(data, now) {
  const dayKey = getOperationalDateKey(now);

  return (data.schoolDaysOff ?? []).find((day) => day.date === dayKey) ?? null;
}

export function getDefaultDayMode(data, now) {
  const operationalDate = new Date(now);
  operationalDate.setHours(operationalDate.getHours() - 2);

  if (operationalDate.getDay() === 0 || operationalDate.getDay() === 6) {
    return "non_school_day";
  }

  if (getSchoolDayOff(data, now)) {
    return "non_school_day";
  }

  return "school_day";
}

export function getEffectiveModes(data, progressState, now) {
  const dayKey = getOperationalDateKey(now);
  const defaultDayMode = getDefaultDayMode(data, now);
  const savedModes = progressState?.modes ?? {};
  const savedDayMode =
    savedModes.dayKey === dayKey &&
    (savedModes.dayMode === "school_day" || savedModes.dayMode === "non_school_day")
      ? savedModes.dayMode
      : defaultDayMode;
  const seasonMode =
    savedModes.seasonMode === "summer_camp" || savedModes.seasonMode === "school_year"
      ? savedModes.seasonMode
      : "school_year";

  return {
    dayKey,
    defaultDayMode,
    dayMode: savedDayMode,
    seasonMode
  };
}

function buildDateAtMinutes(date, minutes) {
  const next = startOfDay(date);
  next.setMinutes(minutes);
  return next;
}

export function getActiveScheduleForGroup(group, now) {
  for (const rule of group.rules) {
    const startMinutes = timeToMinutes(rule.startTime);
    const endMinutes = timeToMinutes(rule.endTime);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const crossesMidnight = endMinutes <= startMinutes;
    const currentDayMatches =
      daySelectorMatches(rule.daySelector, now) && weekPatternMatches(rule, now);

    if (!crossesMidnight) {
      if (currentDayMatches && currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        const startsAt = buildDateAtMinutes(now, startMinutes);
        const endsAt = buildDateAtMinutes(now, endMinutes);

        return {
          groupId: group.id,
          groupLabel: group.label,
          rule,
          startsAt,
          endsAt,
          instanceKey: startsAt.toISOString()
        };
      }

      continue;
    }

    if (currentDayMatches && currentMinutes >= startMinutes) {
      const startsAt = buildDateAtMinutes(now, startMinutes);
      const endsAt = buildDateAtMinutes(addDays(now, 1), endMinutes);

      return {
        groupId: group.id,
        groupLabel: group.label,
        rule,
        startsAt,
        endsAt,
        instanceKey: startsAt.toISOString()
      };
    }

    const previousDay = addDays(now, -1);
    const previousDayMatches =
      daySelectorMatches(rule.daySelector, previousDay) && weekPatternMatches(rule, previousDay);

    if (previousDayMatches && currentMinutes < endMinutes) {
      const startsAt = buildDateAtMinutes(previousDay, startMinutes);
      const endsAt = buildDateAtMinutes(now, endMinutes);

      return {
        groupId: group.id,
        groupLabel: group.label,
        rule,
        startsAt,
        endsAt,
        instanceKey: startsAt.toISOString()
      };
    }
  }

  return null;
}

function itemModeMatches(item, modes) {
  const dayMode = item.dayMode ?? "all";
  const seasonMode = item.seasonMode ?? "all";

  return (
    (dayMode === "all" || dayMode === modes.dayMode) &&
    (seasonMode === "all" || seasonMode === modes.seasonMode)
  );
}

export function getActiveItemsForSlide(slide, now, modes = { dayMode: "school_day", seasonMode: "school_year" }) {
  return slide.items.filter(
    (item) =>
      (slide.type !== "checklist" || item.type === "check_item") &&
      item.section !== "helper" &&
      itemModeMatches(item, modes) &&
      daySelectorMatches(item.daySelector, now) &&
      weekPatternMatches(item, now)
  );
}

export function getScheduledChecklistItemsForSlide(slide, now) {
  return slide.items.filter(
    (item) =>
      item.type === "check_item" &&
      item.section !== "helper" &&
      daySelectorMatches(item.daySelector, now) &&
      weekPatternMatches(item, now)
  );
}

export function getActiveHelperItemsForSlide(slide, now, modes = { dayMode: "school_day", seasonMode: "school_year" }) {
  return slide.items.filter(
    (item) =>
      item.section === "helper" &&
      itemModeMatches(item, modes) &&
      daySelectorMatches(item.daySelector, now) &&
      weekPatternMatches(item, now)
  );
}

export function formatRuleLabel(rule) {
  return `${rule.daySelector} ${rule.startTime}-${rule.endTime}`;
}

export function getScheduleGroupMap(data) {
  return new Map(data.scheduleGroups.map((group) => [group.id, group]));
}

export function getActiveSlides(data, now, modes = { dayMode: "school_day", seasonMode: "school_year" }) {
  const scheduleGroupMap = getScheduleGroupMap(data);

  return data.slides
    .map((slide) => {
      const scheduleGroup = scheduleGroupMap.get(slide.scheduleGroupId);
      const activeSchedule = getActiveScheduleForGroup(scheduleGroup, now);

      if (!activeSchedule) {
        return null;
      }

      const activeItems = getActiveItemsForSlide(slide, now, modes);
      const activeHelpers = getActiveHelperItemsForSlide(slide, now, modes);

      if (activeItems.length === 0 && activeHelpers.length === 0) {
        return null;
      }

      return {
        ...slide,
        activeSchedule,
        activeItems,
        activeHelpers
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getUpcomingStarts(data, now, maxResults = 3) {
  const results = [];

  for (const slide of data.slides) {
    const scheduleGroup = data.scheduleGroups.find((group) => group.id === slide.scheduleGroupId);

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const candidateDate = addDays(now, dayOffset);

      for (const rule of scheduleGroup.rules) {
        if (!daySelectorMatches(rule.daySelector, candidateDate) || !weekPatternMatches(rule, candidateDate)) {
          continue;
        }

        const startsAt = buildDateAtMinutes(candidateDate, timeToMinutes(rule.startTime));

        if (startsAt <= now) {
          continue;
        }

        results.push({
          slideId: slide.id,
          title: slide.title,
          ownerLabel: slide.ownerLabel,
          startsAt
        });
      }
    }
  }

  return results
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
    .filter((result, index, allResults) => {
      const previous = allResults[index - 1];
      return (
        !previous ||
        previous.slideId !== result.slideId ||
        previous.startsAt.getTime() !== result.startsAt.getTime()
      );
    })
    .slice(0, maxResults);
}
