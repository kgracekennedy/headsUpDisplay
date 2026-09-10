import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getActiveSlides } from "../src/lib/schedule.mjs";
import {
  clearChecklistSectionSignOff,
  getRequiredChecklistItems,
  getVisibleChecklistSections,
  hydrateProgress,
  isChecklistSectionSignedOff,
  isChecklistComplete,
  isSlideSignedOff,
  isSlideMinimized,
  setDayMode,
  setSeasonMode,
  signOffChecklistSection,
  signOffSlide,
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

  it("requires parent sign off before a kid checklist is treated as signed off", async () => {
    const data = await loadSourceData();
    const pm = new Date("2026-09-23T16:30:00");
    let progress = hydrateProgress(data, { version: 4, slides: {} }, pm);
    const alexander = getActiveSlides(data, pm, progress.modes).find((slide) => slide.id === "alexander");
    const requiredItems = getRequiredChecklistItems(alexander, pm, progress.modes);

    for (const item of requiredItems) {
      progress = toggleChecklistItem(data, progress, "alexander", item.id, pm);
    }

    assert.equal(isChecklistComplete(alexander, progress, pm), true);
    assert.equal(isSlideSignedOff(alexander, progress, pm), false);

    progress = signOffSlide(data, progress, "alexander", pm);
    assert.equal(isSlideSignedOff(alexander, progress, pm), true);

    progress = toggleChecklistItem(data, progress, "alexander", requiredItems[0].id, pm);
    assert.equal(isSlideSignedOff(alexander, progress, pm), false);
  });

  it("hides parent AM tasks after the AM section is checked", async () => {
    const data = await loadSourceData();
    const morning = new Date("2026-09-23T07:30:00");
    let progress = hydrateProgress(data, { version: 5, slides: {} }, morning);
    const parents = getActiveSlides(data, morning, progress.modes).find((slide) => slide.id === "parents");
    const amItems = parents.activeItems.filter((item) => item.section === "am");

    for (const item of amItems) {
      progress = toggleChecklistItem(data, progress, "parents", item.id, morning);
    }

    const sections = getVisibleChecklistSections(parents, progress, morning);

    assert.equal(sections.some((section) => section.id === "am"), false);
  });

  it("keeps kid AM tasks visible until AM parent sign off", async () => {
    const data = await loadSourceData();
    const morning = new Date("2026-09-23T07:30:00");
    let progress = hydrateProgress(data, { version: 5, slides: {} }, morning);
    const lilja = getActiveSlides(data, morning, progress.modes).find((slide) => slide.id === "lilja");
    const amItems = lilja.activeItems.filter((item) => item.section === "am");

    for (const item of amItems) {
      progress = toggleChecklistItem(data, progress, "lilja", item.id, morning);
    }

    assert.equal(getVisibleChecklistSections(lilja, progress, morning).some((section) => section.id === "am"), true);
    assert.equal(isChecklistSectionSignedOff(lilja, progress, "am"), false);

    progress = signOffChecklistSection(data, progress, "lilja", "am", morning);

    assert.equal(isChecklistSectionSignedOff(lilja, progress, "am"), true);
    assert.equal(getVisibleChecklistSections(lilja, progress, morning).some((section) => section.id === "am"), false);
  });

  it("requires both kid AM and PM section sign offs for PM reward", async () => {
    const data = await loadSourceData();
    const pm = new Date("2026-09-23T16:30:00");
    let progress = hydrateProgress(data, { version: 5, slides: {} }, pm);
    const lilja = getActiveSlides(data, pm, progress.modes).find((slide) => slide.id === "lilja");
    const requiredItems = getRequiredChecklistItems(lilja, pm, progress.modes);

    for (const item of requiredItems) {
      progress = toggleChecklistItem(data, progress, "lilja", item.id, pm);
    }

    progress = signOffChecklistSection(data, progress, "lilja", "am", pm);
    assert.equal(isSlideSignedOff(lilja, progress, pm), false);

    progress = signOffChecklistSection(data, progress, "lilja", "pm", pm);
    assert.equal(isSlideSignedOff(lilja, progress, pm), true);

    progress = clearChecklistSectionSignOff(progress, "lilja", "pm");
    assert.equal(isSlideSignedOff(lilja, progress, pm), false);
  });

  it("clears a morning sign off when PM tasks become newly required", async () => {
    const data = await loadSourceData();
    const morning = new Date("2026-09-23T07:30:00");
    const afternoon = new Date("2026-09-23T16:30:00");
    let progress = hydrateProgress(data, { version: 4, slides: {} }, morning);
    const morningAlexander = getActiveSlides(data, morning, progress.modes).find(
      (slide) => slide.id === "alexander"
    );

    for (const item of getRequiredChecklistItems(morningAlexander, morning, progress.modes)) {
      progress = toggleChecklistItem(data, progress, "alexander", item.id, morning);
    }

    progress = signOffSlide(data, progress, "alexander", morning);
    assert.equal(isSlideSignedOff(morningAlexander, progress, morning), true);

    progress = hydrateProgress(data, progress, afternoon);
    const afternoonAlexander = getActiveSlides(data, afternoon, progress.modes).find(
      (slide) => slide.id === "alexander"
    );

    assert.equal(isSlideSignedOff(afternoonAlexander, progress, afternoon), false);
  });
});
