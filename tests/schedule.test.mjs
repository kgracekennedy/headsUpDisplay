import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getActiveScheduleForGroup, weekPatternMatches } from "../src/lib/schedule.mjs";
import { loadSourceData } from "./helpers.mjs";

describe("schedule evaluation", () => {
  it("keeps cross-midnight evening schedules active after midnight", async () => {
    const data = await loadSourceData();
    const parentsEvening = data.scheduleGroups.find((group) => group.id === "parents_pm");
    const activeSchedule = getActiveScheduleForGroup(parentsEvening, new Date("2026-07-07T01:00:00"));

    assert.ok(activeSchedule);
    assert.equal(activeSchedule.startsAt.getFullYear(), 2026);
    assert.equal(activeSchedule.startsAt.getMonth(), 6);
    assert.equal(activeSchedule.startsAt.getDate(), 6);
    assert.equal(activeSchedule.startsAt.getHours(), 16);
    assert.equal(activeSchedule.endsAt.getDate(), 7);
    assert.equal(activeSchedule.endsAt.getHours(), 2);
  });

  it("supports alternating cleaner weeks from an anchor date", async () => {
    const data = await loadSourceData();
    const cleanerPrep = data.scheduleGroups.find((group) => group.id === "cleaner_monday");

    assert.equal(
      getActiveScheduleForGroup(cleanerPrep, new Date("2026-07-06T18:00:00")),
      null
    );
    assert.ok(getActiveScheduleForGroup(cleanerPrep, new Date("2026-07-13T18:00:00")));
  });

  it("supports first and third Saturday monthly rules", async () => {
    const rule = {
      weekPattern: "first_and_third_weeks_of_month"
    };

    assert.equal(weekPatternMatches(rule, new Date("2026-07-04T18:00:00")), true);
    assert.equal(weekPatternMatches(rule, new Date("2026-07-11T18:00:00")), false);
    assert.equal(weekPatternMatches(rule, new Date("2026-07-18T18:00:00")), true);
    assert.equal(weekPatternMatches(rule, new Date("2026-07-25T18:00:00")), false);
  });
});
