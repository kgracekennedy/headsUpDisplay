import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceReminderScrollTop,
  getReminderMaxScrollTop,
  isReminderScrollAtBottom,
  reminderNeedsAutoScroll
} from "../src/lib/reminder-scroll.mjs";

describe("reminder scroll helpers", () => {
  it("detects when reminder content overflows", () => {
    assert.equal(reminderNeedsAutoScroll({ scrollHeight: 500, clientHeight: 300 }), true);
    assert.equal(reminderNeedsAutoScroll({ scrollHeight: 300, clientHeight: 300 }), false);
  });

  it("computes a non-negative max scroll top", () => {
    assert.equal(getReminderMaxScrollTop({ scrollHeight: 500, clientHeight: 300 }), 200);
    assert.equal(getReminderMaxScrollTop({ scrollHeight: 300, clientHeight: 500 }), 0);
  });

  it("advances scrolling without overshooting the bottom", () => {
    assert.equal(advanceReminderScrollTop(10, 25, 100), 35);
    assert.equal(advanceReminderScrollTop(95, 25, 100), 100);
    assert.equal(advanceReminderScrollTop(40, -10, 100), 40);
  });

  it("recognizes when the panel has reached the bottom", () => {
    assert.equal(isReminderScrollAtBottom(199.5, 200), true);
    assert.equal(isReminderScrollAtBottom(180, 200), false);
  });
});
