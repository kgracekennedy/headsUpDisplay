import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getActiveSlides } from "../src/lib/schedule.mjs";
import {
  getRequiredChecklistItems,
  getVisibleChecklistSections,
  hydrateProgress,
  isChecklistComplete,
  isSlideMinimized,
  setDayMode,
  setSeasonMode,
  toggleSlideMinimized,
  toggleChecklistItem
} from "../src/lib/runtime-model.mjs";
import { loadSourceData } from "./helpers.mjs";

describe("runtime checklist behavior", () => {
  it("builds combined person slides for a weekday school morning", async () => {
    const data = await loadSourceData();
    const morning = new Date("2026-09-23T07:30:00");
    const progress = hydrateProgress(data, { version: 3, slides: {} }, morning);
    const activeSlides = getActiveSlides(data, morning, progress.modes);
    const slideIds = activeSlides.map((slide) => slide.id);
    const alexander = activeSlides.find((slide) => slide.id === "alexander");

    assert.deepEqual(slideIds.slice(0, 4), ["parents", "alexander", "lilja", "healthy_breakfast_reminder"]);
    assert.equal(progress.modes.dayMode, "school_day");
    assert.equal(progress.modes.seasonMode, "school_year");
    assert.ok(alexander);
    assert.ok(alexander.activeItems.some((item) => item.id === "alexander_am_backpack"));
    assert.ok(!alexander.activeItems.some((item) => item.id === "alexander_am_khan"));
  });

  it("uses non-school mode for weekend Khan Academy tasks", async () => {
    const data = await loadSourceData();
    const saturday = new Date("2026-09-26T09:00:00");
    const progress = hydrateProgress(data, { version: 3, slides: {} }, saturday);
    const alexander = getActiveSlides(data, saturday, progress.modes).find((slide) => slide.id === "alexander");

    assert.equal(progress.modes.dayMode, "non_school_day");
    assert.ok(alexander.activeItems.some((item) => item.id === "alexander_am_khan"));
    assert.ok(!alexander.activeItems.some((item) => item.id === "alexander_am_backpack"));
  });

  it("carries incomplete AM tasks into PM as leftovers and hides completed AM tasks", async () => {
    const data = await loadSourceData();
    const pm = new Date("2026-09-23T15:30:00");
    let progress = hydrateProgress(data, { version: 3, slides: {} }, pm);
    let alexander = getActiveSlides(data, pm, progress.modes).find((slide) => slide.id === "alexander");

    progress = toggleChecklistItem(data, progress, "alexander", "alexander_am_dressed", pm);
    alexander = getActiveSlides(data, pm, progress.modes).find((slide) => slide.id === "alexander");

    const sections = getVisibleChecklistSections(alexander, progress, pm);
    const leftover = sections.find((section) => section.title === "Leftover AM Tasks");

    assert.ok(leftover);
    assert.ok(!leftover.items.some((item) => item.id === "alexander_am_dressed"));
    assert.ok(leftover.items.some((item) => item.id === "alexander_am_teeth"));
    assert.ok(sections.some((section) => section.title === "PM Tasks"));
  });

  it("requires AM, PM, and anytime tasks for PM completion", async () => {
    const data = await loadSourceData();
    const pm = new Date("2026-09-23T16:30:00");
    let progress = hydrateProgress(data, { version: 3, slides: {} }, pm);
    const parents = getActiveSlides(data, pm, progress.modes).find((slide) => slide.id === "parents");
    const requiredItems = getRequiredChecklistItems(parents, pm, progress.modes);

    for (const item of requiredItems.filter((item) => item.id !== "parents_anytime_mommy_french")) {
      progress = toggleChecklistItem(data, progress, "parents", item.id, pm);
    }

    assert.equal(isChecklistComplete(parents, progress, pm), false);

    progress = toggleChecklistItem(data, progress, "parents", "parents_anytime_mommy_french", pm);
    assert.equal(isChecklistComplete(parents, progress, pm), true);
  });

  it("switches day mode manually and resets it at the 2 AM day boundary", async () => {
    const data = await loadSourceData();
    const beforeReset = new Date("2026-09-23T20:00:00");
    const afterReset = new Date("2026-09-24T02:15:00");
    let progress = hydrateProgress(data, { version: 3, slides: {} }, beforeReset);

    progress = setDayMode(data, progress, "non_school_day", beforeReset);
    assert.equal(progress.modes.dayMode, "non_school_day");

    progress = hydrateProgress(data, progress, afterReset);
    assert.equal(progress.modes.dayMode, "school_day");
  });

  it("persists season mode across day resets", async () => {
    const data = await loadSourceData();
    const firstDay = new Date("2026-09-23T20:00:00");
    const nextDay = new Date("2026-09-24T07:00:00");
    let progress = hydrateProgress(data, { version: 3, slides: {} }, firstDay);

    progress = setSeasonMode(data, progress, "summer_camp", firstDay);
    progress = hydrateProgress(data, progress, nextDay);

    assert.equal(progress.modes.seasonMode, "summer_camp");
  });

  it("keeps minimized checklists out of rotation state until they are restored", async () => {
    const data = await loadSourceData();
    const morning = new Date("2026-09-23T07:30:00");
    let progress = hydrateProgress(data, { version: 3, slides: {} }, morning);

    progress = toggleSlideMinimized(progress, "alexander");
    assert.equal(isSlideMinimized(progress, "alexander"), true);

    progress = hydrateProgress(data, progress, morning);
    assert.equal(isSlideMinimized(progress, "alexander"), true);

    progress = toggleSlideMinimized(progress, "alexander");
    assert.equal(isSlideMinimized(progress, "alexander"), false);
  });
});
