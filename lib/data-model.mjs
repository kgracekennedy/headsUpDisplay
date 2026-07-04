const VALID_SLIDE_TYPES = new Set(["checklist", "reminder"]);
const VALID_ITEM_TYPES = new Set(["check_item", "text_line"]);
const VALID_WEEK_PATTERNS = new Set([
  "all",
  "odd_weeks",
  "even_weeks",
  "every_other_from_anchor",
  "first_and_third_weeks_of_month"
]);

function asBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "") {
    return fallback;
  }

  return ["true", "1", "yes", "y"].includes(normalized);
}

function asInteger(value, fallback, fieldName) {
  const trimmed = String(value ?? "").trim();

  if (trimmed === "") {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${fieldName}: ${value}`);
  }

  return parsed;
}

function asRequiredText(value, fieldName) {
  const trimmed = String(value ?? "").trim();

  if (trimmed === "") {
    throw new Error(`Missing required value for ${fieldName}.`);
  }

  return trimmed;
}

function asOptionalText(value) {
  return String(value ?? "").trim();
}

function asColor(value, fallback) {
  const trimmed = asOptionalText(value);

  if (trimmed === "") {
    return fallback;
  }

  if (!/^#[0-9a-f]{6}$/i.test(trimmed)) {
    throw new Error(`Invalid color value: ${value}`);
  }

  return trimmed;
}

function asWeekPattern(value) {
  const normalized = asOptionalText(value).toLowerCase() || "all";

  if (!VALID_WEEK_PATTERNS.has(normalized)) {
    throw new Error(`Unsupported week pattern: ${value}`);
  }

  return normalized;
}

function asTime(value, fieldName) {
  const trimmed = asRequiredText(value, fieldName);

  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid time for ${fieldName}: ${value}`);
  }

  const [hoursText, minutesText] = trimmed.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Out-of-range time for ${fieldName}: ${value}`);
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function mapConfigRows(rows) {
  const settings = new Map();

  for (const row of rows) {
    const key = asRequiredText(row.key, "app_config.key");
    settings.set(key, asOptionalText(row.value));
  }

  return {
    appTitle: asRequiredText(settings.get("app_title"), "app_title"),
    timezone: asRequiredText(settings.get("timezone"), "timezone"),
    defaultSlideDurationSec: asInteger(
      settings.get("default_slide_duration_sec"),
      20,
      "default_slide_duration_sec"
    ),
    dataVersion: asInteger(settings.get("data_version"), 1, "data_version")
  };
}

function normalizeScheduleRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!asBoolean(row.active, true)) {
      continue;
    }

    const groupId = asRequiredText(row.schedule_group_id, "schedule_groups.schedule_group_id");
    const existingGroup = groups.get(groupId) ?? {
      id: groupId,
      label: asRequiredText(row.label, `schedule_groups.label for ${groupId}`),
      rules: []
    };

    existingGroup.rules.push({
      sortOrder: asInteger(row.sort_order, 999, `schedule_groups.sort_order for ${groupId}`),
      daySelector: asRequiredText(row.day_selector, `schedule_groups.day_selector for ${groupId}`),
      startTime: asTime(row.start_time, `schedule_groups.start_time for ${groupId}`),
      endTime: asTime(row.end_time, `schedule_groups.end_time for ${groupId}`),
      weekPattern: asWeekPattern(row.week_pattern),
      anchorDate: asOptionalText(row.anchor_date),
      notes: asOptionalText(row.notes)
    });

    groups.set(groupId, existingGroup);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rules: group.rules.sort((left, right) => left.sortOrder - right.sortOrder)
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeItemRows(rows) {
  const itemsBySlideId = new Map();

  for (const row of rows) {
    if (!asBoolean(row.active, true)) {
      continue;
    }

    const slideId = asRequiredText(row.slide_id, "slide_items.slide_id");
    const itemType = asRequiredText(row.item_type, `slide_items.item_type for ${slideId}`);

    if (!VALID_ITEM_TYPES.has(itemType)) {
      throw new Error(`Unsupported item_type for ${slideId}: ${itemType}`);
    }

    const nextItems = itemsBySlideId.get(slideId) ?? [];
    nextItems.push({
      id: asRequiredText(row.item_id, `slide_items.item_id for ${slideId}`),
      sortOrder: asInteger(row.sort_order, 999, `slide_items.sort_order for ${slideId}`),
      type: itemType,
      text: asRequiredText(row.text, `slide_items.text for ${slideId}`),
      daySelector: asOptionalText(row.day_selector) || "All",
      weekPattern: asWeekPattern(row.week_pattern),
      anchorDate: asOptionalText(row.anchor_date),
      notes: asOptionalText(row.notes)
    });
    itemsBySlideId.set(slideId, nextItems);
  }

  return itemsBySlideId;
}

export function buildHouseholdData(tables, options = {}) {
  const config = mapConfigRows(tables.appConfigRows ?? []);
  const scheduleGroups = normalizeScheduleRows(tables.scheduleRows ?? []);
  const scheduleGroupIds = new Set(scheduleGroups.map((group) => group.id));
  const itemsBySlideId = normalizeItemRows(tables.itemRows ?? []);

  const slides = (tables.slideRows ?? [])
    .filter((row) => asBoolean(row.active, true))
    .map((row) => {
      const slideType = asRequiredText(row.slide_type, `slides.slide_type for ${row.slide_id}`);

      if (!VALID_SLIDE_TYPES.has(slideType)) {
        throw new Error(`Unsupported slide_type for ${row.slide_id}: ${slideType}`);
      }

      const slideId = asRequiredText(row.slide_id, "slides.slide_id");
      const scheduleGroupId = asRequiredText(
        row.schedule_group_id,
        `slides.schedule_group_id for ${slideId}`
      );

      if (!scheduleGroupIds.has(scheduleGroupId)) {
        throw new Error(`Unknown schedule group ${scheduleGroupId} referenced by ${slideId}.`);
      }

      const slideItems = (itemsBySlideId.get(slideId) ?? []).sort(
        (left, right) => left.sortOrder - right.sortOrder
      );

      if (slideItems.length === 0) {
        throw new Error(`Slide ${slideId} has no items.`);
      }

      return {
        id: slideId,
        sortOrder: asInteger(row.sort_order, 999, `slides.sort_order for ${slideId}`),
        type: slideType,
        title: asRequiredText(row.title, `slides.title for ${slideId}`),
        ownerLabel: asOptionalText(row.owner_label),
        scheduleGroupId,
        colors: {
          backgroundStart: asColor(row.background_start, "#1f2937"),
          backgroundEnd: asColor(row.background_end, "#111827"),
          accent: asColor(row.accent_color, "#f59e0b"),
          text: asColor(row.text_color, "#f9fafb")
        },
        rewardMessage: asOptionalText(row.reward_message),
        celebrationTitle:
          asOptionalText(row.celebration_title) ||
          `${asRequiredText(row.title, `slides.title for ${slideId}`)} complete`,
        notes: asOptionalText(row.notes),
        items: slideItems
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const result = {
    version: config.dataVersion,
    config: {
      appTitle: config.appTitle,
      timezone: config.timezone,
      defaultSlideDurationSec: config.defaultSlideDurationSec
    },
    scheduleGroups,
    slides
  };

  if (options.generatedAt) {
    result.generatedAt = options.generatedAt;
  }

  return result;
}
