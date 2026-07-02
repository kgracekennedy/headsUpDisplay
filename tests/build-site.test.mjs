import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBuildVersion, injectBuildVersion } from "../scripts/build-site.mjs";

describe("build-site versioning", () => {
  it("creates a cache-safe build version string", () => {
    assert.equal(
      createBuildVersion(new Date("2026-07-02T15:04:05.678Z")),
      "20260702-150405678Z"
    );
  });

  it("injects the build version into template assets", () => {
    const template = 'const BUILD_VERSION = "__BUILD_VERSION__";';
    assert.equal(
      injectBuildVersion(template, "20260702-150405678Z"),
      'const BUILD_VERSION = "20260702-150405678Z";'
    );
  });
});
