import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getActiveScheduleForGroup,
  getDefaultDayMode,
  getSchoolDayOff,
  parseAnchorDate,
  weekPatternMatches
} from "../src/lib/schedule.mjs";
import { loadSourceData } from "./helpers.mjs";

describe("schedule evaluation", () => {
  it("keeps cross-midnight evening schedules active after midnight", async () => {
    const data = await loadSourceData();
    const personDay = data.scheduleGroups.find((group) => group.id === "person_day");
    const activeSchedule = getActiveScheduleForGroup(personDay, new Date("2026-09-24T01:00:00"));

    assert.ok(activeSchedule);
    assert.equal(activeSchedule.startsAt.getFullYear(), 2026);
    assert.equal(activeSchedule.startsAt.getMonth(), 8);
    assert.equal(activeSchedule.startsAt.getDate(), 23);
    assert.equal(activeSchedule.startsAt.getHours(), 5);
    assert.equal(activeSchedule.endsAt.getDate(), 24);
    assert.equal(activeSchedule.endsAt.getHours(), 2);
  });

  it("supports alternating Tuesday cleaner weeks from an anchor date", async () => {
    const data = await loadSourceData();
    const cleanerPrep = data.scheduleGroups.find((group) => group.id === "cleaner_tuesday");

    assert.equal(
      getActiveScheduleForGroup(cleanerPrep, new Date("2026-09-15T08:00:00")),
      null
    );
    assert.ok(getActiveScheduleForGroup(cleanerPrep, new Date("2026-09-22T08:00:00")));
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

  it("uses generated holiday dates as non-school days", async () => {
    const data = await loadSourceData();
    const holidayDates = [
      ["2026-09-07T09:00:00", "Labor Day"],
      ["2026-09-21T09:00:00", "Yom Kippur"],
      ["2026-10-12T09:00:00", "Indigenous People's Day"],
      ["2026-11-11T09:00:00", "Veterans Day"],
      ["2026-11-26T09:00:00", "Thanksgiving"],
      ["2026-11-27T09:00:00", "Day after Thanksgiving"],
      ["2026-12-24T09:00:00", "Christmas Eve"],
      ["2026-12-25T09:00:00", "Christmas"],
      ["2027-01-01T09:00:00", "New Year's Day"],
      ["2026-04-03T09:00:00", "Good Friday"],
      ["2026-05-25T09:00:00", "Memorial Day"],
      ["2026-06-19T09:00:00", "Juneteenth"]
    ];

    for (const [dateText, label] of holidayDates) {
      const date = new Date(dateText);
      assert.equal(getDefaultDayMode(data, date), "non_school_day", label);
      assert.equal(getSchoolDayOff(data, date)?.label, label);
    }
  });

  it("uses Monday through Friday for school vacation weeks", async () => {
    const data = await loadSourceData();
    const presidentsWeek = ["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20"];
    const patriotsWeek = ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"];

    for (const dateKey of [...presidentsWeek, ...patriotsWeek]) {
      assert.equal(getDefaultDayMode(data, new Date(`${dateKey}T09:00:00`)), "non_school_day");
    }

    assert.equal(getDefaultDayMode(data, new Date("2026-02-23T09:00:00")), "school_day");
    assert.equal(getDefaultDayMode(data, new Date("2026-04-27T09:00:00")), "school_day");
  });

  it("does not add observed weekdays for exact-date holidays", async () => {
    const data = await loadSourceData();

    assert.equal(getSchoolDayOff(data, new Date("2028-06-19T09:00:00"))?.label, "Juneteenth");
    assert.equal(getSchoolDayOff(data, new Date("2028-06-16T09:00:00")), null);
    assert.equal(getSchoolDayOff(data, new Date("2028-11-11T09:00:00"))?.label, "Veterans Day");
    assert.equal(getSchoolDayOff(data, new Date("2028-11-10T09:00:00")), null);
  });

  it("keeps holiday greetings available to the HUD", async () => {
    const data = await loadSourceData();

    assert.equal(getSchoolDayOff(data, new Date("2026-09-07T09:00:00"))?.greeting, "Happy Labor Day");
    assert.equal(getSchoolDayOff(data, new Date("2026-12-25T09:00:00"))?.greeting, "Merry Christmas");
  });

  it("parses valid anchor dates and rejects invalid ones", () => {
    assert.deepEqual(parseAnchorDate("2026-06-29"), new Date(2026, 5, 29));
    assert.deepEqual(parseAnchorDate("6/29/2026"), new Date(2026, 5, 29));
    assert.deepEqual(parseAnchorDate("06/29/2026"), new Date(2026, 5, 29));
    assert.equal(parseAnchorDate("2026-02-31"), null);
    assert.equal(parseAnchorDate("29/06/2026"), null);
  });
});
