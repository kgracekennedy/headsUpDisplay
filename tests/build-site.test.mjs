import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBuildVersion, injectBuildVersion } from "../scripts/build-site.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

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

  it("keeps the settings page in the static build and service worker cache", async () => {
    const buildScript = await readFile(path.join(projectRoot, "scripts", "build-site.mjs"), "utf8");
    const serviceWorker = await readFile(path.join(projectRoot, "public", "sw.js"), "utf8");

    assert.match(buildScript, /"settings\.html"/);
    assert.match(buildScript, /"settings\.mjs"/);
    assert.match(serviceWorker, /\.\/settings\.html/);
    assert.match(serviceWorker, /\.\/settings\.mjs/);
  });
});
