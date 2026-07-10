import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSlidePillClassNames,
  getSlidePillState
} from "../src/lib/navigation-state.mjs";

describe("slide pill navigation state", () => {
  it("marks a selected in-rotation slide as warm and outlined", () => {
    const rotatingSlideIds = new Set(["slide_a", "slide_b"]);

    assert.equal(
      getSlidePillState("slide_a", "slide_a", rotatingSlideIds),
      "selected-rotating"
    );
    assert.equal(
      getSlidePillClassNames("slide_a", "slide_a", rotatingSlideIds),
      "slide-pill slide-pill--selected-rotating slide-pill--selected"
    );
  });

  it("keeps other in-rotation slides outlined while an in-rotation slide is selected", () => {
    const rotatingSlideIds = new Set(["slide_a", "slide_b"]);

    assert.equal(getSlidePillState("slide_b", "slide_a", rotatingSlideIds), "outlined");
  });

  it("marks a selected out-of-rotation slide as warm and outlined", () => {
    const rotatingSlideIds = new Set(["slide_a", "slide_b"]);

    assert.equal(
      getSlidePillState("slide_c", "slide_c", rotatingSlideIds),
      "selected-out-of-rotation"
    );
    assert.equal(
      getSlidePillClassNames("slide_c", "slide_c", rotatingSlideIds),
      "slide-pill slide-pill--selected-out-of-rotation slide-pill--selected"
    );
  });

  it("removes outline from in-rotation slides when an out-of-rotation slide is selected", () => {
    const rotatingSlideIds = new Set(["slide_a", "slide_b"]);

    assert.equal(getSlidePillState("slide_a", "slide_c", rotatingSlideIds), "neutral");
  });

  it("keeps unselected out-of-rotation slides neutral", () => {
    const rotatingSlideIds = new Set(["slide_a", "slide_b"]);

    assert.equal(getSlidePillState("slide_c", "slide_a", rotatingSlideIds), "neutral");
  });
});
