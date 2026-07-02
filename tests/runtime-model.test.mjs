import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getActiveSlides } from "../src/lib/schedule.mjs";
import { hydrateProgress, isChecklistComplete, toggleChecklistItem } from "../src/lib/runtime-model.mjs";
import { loadSourceData } from "./helpers.mjs";

describe("runtime checklist behavior", () => {
  it("filters active slides and checklist items for a weekday morning", async () => {
    const data = await loadSourceData();
    const activeSlides = getActiveSlides(data, new Date("2026-07-07T07:30:00"));
    const slideIds = activeSlides.map((slide) => slide.id);
    const alexanderMorning = activeSlides.find((slide) => slide.id === "alexander_am");

    assert.deepEqual(slideIds, [
      "parents_am",
      "alexander_am",
      "lilja_am",
      "weekday_launch_reminder"
    ]);
    assert.ok(alexanderMorning);
    assert.ok(alexanderMorning.activeItems.some((item) => item.id === "alexander_am_backpack"));
    assert.ok(!alexanderMorning.activeItems.some((item) => item.id === "alexander_am_fold_laundry"));
  });

  it("resets checklist progress when a new schedule window starts", async () => {
    const data = await loadSourceData();
    const firstMorning = new Date("2026-07-07T07:30:00");
    const nextMorning = new Date("2026-07-08T07:30:00");

    let progress = hydrateProgress(data, { version: 1, slides: {} }, firstMorning);
    const alexanderSlide = getActiveSlides(data, firstMorning).find((slide) => slide.id === "alexander_am");

    for (const item of alexanderSlide.activeItems) {
      progress = toggleChecklistItem(data, progress, "alexander_am", item.id, firstMorning);
    }

    assert.equal(isChecklistComplete(alexanderSlide, progress), true);

    progress = hydrateProgress(data, progress, nextMorning);

    const refreshedSlide = getActiveSlides(data, nextMorning).find((slide) => slide.id === "alexander_am");
    assert.equal(isChecklistComplete(refreshedSlide, progress), false);
    assert.deepEqual(progress.slides.alexander_am.checkedItemIds, []);
  });

  it("allows a completed checklist item to be unchecked directly", async () => {
    const data = await loadSourceData();
    const morning = new Date("2026-07-07T07:30:00");
    let progress = hydrateProgress(data, { version: 1, slides: {} }, morning);
    const alexanderSlide = getActiveSlides(data, morning).find((slide) => slide.id === "alexander_am");

    for (const item of alexanderSlide.activeItems) {
      progress = toggleChecklistItem(data, progress, "alexander_am", item.id, morning);
    }

    assert.equal(isChecklistComplete(alexanderSlide, progress), true);

    progress = toggleChecklistItem(
      data,
      progress,
      "alexander_am",
      alexanderSlide.activeItems[0].id,
      morning
    );

    const refreshedSlide = getActiveSlides(data, morning).find((slide) => slide.id === "alexander_am");
    assert.equal(isChecklistComplete(refreshedSlide, progress), false);
    assert.equal(
      progress.slides.alexander_am.checkedItemIds.includes(alexanderSlide.activeItems[0].id),
      false
    );
  });
});
