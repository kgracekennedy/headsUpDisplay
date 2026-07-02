import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv } from "../src/lib/csv.mjs";

describe("parseCsv", () => {
  it("supports quoted commas and escaped quotes", () => {
    const rows = parseCsv('slide_id,text\nreminder_1,"Laundry, screens, and ""rewards"""');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].slide_id, "reminder_1");
    assert.equal(rows[0].text, 'Laundry, screens, and "rewards"');
  });

  it("keeps multiline values together", () => {
    const rows = parseCsv('slide_id,text\nreminder_2,"Line one\nLine two"');

    assert.equal(rows[0].text, "Line one\nLine two");
  });
});
