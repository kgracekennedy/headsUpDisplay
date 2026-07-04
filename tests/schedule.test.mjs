import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getActiveScheduleForGroup,
  parseAnchorDate,
  weekPatternMatches
} from "../src/lib/schedule.mjs";
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

  it("supports all-day reminder windows", async () => {
    const data = await loadSourceData();
    const mommyPt = data.scheduleGroups.find((group) => group.id === "mommy_pt_anytime");

    assert.ok(getActiveScheduleForGroup(mommyPt, new Date("2026-07-07T00:15:00")));
    assert.ok(getActiveScheduleForGroup(mommyPt, new Date("2026-07-07T14:30:00")));
    assert.ok(getActiveScheduleForGroup(mommyPt, new Date("2026-07-07T23:45:00")));
  });

  it("accepts ISO and spreadsheet-style anchor dates", () => {
    const julySixth = new Date("2026-07-06T18:00:00");
    const julyThirteenth = new Date("2026-07-13T18:00:00");

    assert.equal(
      weekPatternMatches(
        { weekPattern: "every_other_from_anchor", anchorDate: "2026-06-29" },
        julySixth
      ),
      false
    );
    assert.equal(
      weekPatternMatches(
        { weekPattern: "every_other_from_anchor", anchorDate: "6/29/2026" },
        julySixth
      ),
      false
    );
    assert.equal(
      weekPatternMatches(
        { weekPattern: "every_other_from_anchor", anchorDate: "06/29/2026" },
        julyThirteenth
      ),
      true
    );
    assert.equal(
      weekPatternMatches(
        { weekPattern: "every_other_from_anchor", anchorDate: "not-a-date" },
        julyThirteenth
      ),
      false
    );
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

  it("parses valid anchor dates and rejects invalid ones", () => {
    assert.deepEqual(parseAnchorDate("2026-06-29"), new Date(2026, 5, 29));
    assert.deepEqual(parseAnchorDate("6/29/2026"), new Date(2026, 5, 29));
    assert.deepEqual(parseAnchorDate("06/29/2026"), new Date(2026, 5, 29));
    assert.equal(parseAnchorDate("2026-02-31"), null);
    assert.equal(parseAnchorDate("29/06/2026"), null);
  });
});
