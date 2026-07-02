import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSourceData } from "./helpers.mjs";

describe("buildHouseholdData", () => {
  it("builds the expected seeded slide set", async () => {
    const data = await loadSourceData();

    assert.equal(data.config.appTitle, "Family Heads Up Display");
    assert.equal(data.slides.length, 10);
    assert.equal(data.scheduleGroups.length, 8);
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
});
