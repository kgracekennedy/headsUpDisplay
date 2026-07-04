import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSourceData } from "./helpers.mjs";

describe("buildHouseholdData", () => {
  it("builds the expected seeded slide set", async () => {
    const data = await loadSourceData();

    assert.equal(data.config.appTitle, "Family Heads Up Display");
    assert.equal(data.config.defaultSlideDurationSec, 15);
    assert.equal(data.slides.length, 12);
    assert.equal(data.scheduleGroups.length, 10);
  });

  it("keeps reminder rows with comma-containing text intact", async () => {
    const data = await loadSourceData();
    const weekendReminder = data.slides.find((slide) => slide.id === "weekend_screen_reminder");

    assert.ok(weekendReminder);
    assert.equal(weekendReminder.items.length, 3);
    assert.equal(
      weekendReminder.items[0].text,
      "Screens open after rooms, laundry, and reading are done."
    );
  });

  it("allows first and third week monthly recurrence rules", async () => {
    const data = await loadSourceData();
    const orchidsItem = data.slides
      .find((slide) => slide.id === "parents_pm")
      .items.find((item) => item.id === "parents_pm_feed_orchids");

    assert.ok(orchidsItem);
    assert.equal(orchidsItem.weekPattern, "first_and_third_weeks_of_month");
  });

  it("includes the new breakfast and bedtime reminder slides", async () => {
    const data = await loadSourceData();
    const breakfastReminder = data.slides.find((slide) => slide.id === "healthy_breakfast_reminder");
    const bedtimeReminder = data.slides.find((slide) => slide.id === "kids_bedtime_reminder");

    assert.ok(breakfastReminder);
    assert.equal(breakfastReminder.items.length, 4);
    assert.ok(bedtimeReminder);
    assert.equal(bedtimeReminder.items.length, 5);
  });
});
