import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSourceData } from "./helpers.mjs";

describe("buildHouseholdData", () => {
  it("builds the expected seeded slide set", async () => {
    const data = await loadSourceData();

    assert.equal(data.config.appTitle, "Family Heads Up Display");
    assert.equal(data.config.defaultSlideDurationSec, 15);
    assert.equal(data.slides.length, 12);
    assert.equal(data.scheduleGroups.length, 11);
  });

  it("keeps reminder rows with comma-containing text intact", async () => {
    const data = await loadSourceData();
    const sundayResetReminder = data.slides.find((slide) => slide.id === "sunday_reset_reminder");

    assert.ok(sundayResetReminder);
    assert.equal(sundayResetReminder.items.length, 3);
    assert.equal(
      sundayResetReminder.items[1].text,
      "Prep camp bins, coffee, and hand towels before bed."
    );
  });

  it("allows first and third week monthly recurrence rules", async () => {
    const data = await loadSourceData();
    const orchidsItem = data.slides
      .find((slide) => slide.id === "parents_am")
      .items.find((item) => item.id === "parents_am_feed_orchids");

    assert.ok(orchidsItem);
    assert.equal(orchidsItem.weekPattern, "first_and_third_weeks_of_month");
  });

  it("includes the breakfast, PT, and bedtime reminder slides", async () => {
    const data = await loadSourceData();
    const breakfastReminder = data.slides.find((slide) => slide.id === "healthy_breakfast_reminder");
    const ptReminder = data.slides.find((slide) => slide.id === "mommy_pt_reminder");
    const bedtimeReminder = data.slides.find((slide) => slide.id === "kids_bedtime_reminder");

    assert.ok(breakfastReminder);
    assert.equal(breakfastReminder.items.length, 5);
    assert.ok(ptReminder);
    assert.equal(ptReminder.items.length, 13);
    assert.equal(ptReminder.items[9].text, "Sæla carry");
    assert.ok(bedtimeReminder);
    assert.equal(bedtimeReminder.items.length, 5);
  });
});
