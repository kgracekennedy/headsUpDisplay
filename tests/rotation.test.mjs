import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRotationDelayMs, getRotationRatio } from "../src/lib/rotation.mjs";

describe("rotation timing helpers", () => {
  it("returns the remaining delay without resetting elapsed time", () => {
    assert.equal(getRotationDelayMs(1000, 1500, 20000), 19500);
    assert.equal(getRotationDelayMs(1000, 21000, 20000), 0);
  });

  it("clamps progress ratio between zero and one", () => {
    assert.equal(getRotationRatio(1000, 1000, 20000), 0);
    assert.equal(getRotationRatio(1000, 11000, 20000), 0.5);
    assert.equal(getRotationRatio(1000, 25000, 20000), 1);
  });
});
