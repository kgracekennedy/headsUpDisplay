import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";
import { buildHouseholdData } from "../src/lib/data-model.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function readCsv(fileName) {
  const filePath = path.join(projectRoot, "data", "source", fileName);
  return parseCsv(await readFile(filePath, "utf8"));
}

export async function loadSourceData() {
  return buildHouseholdData(
    {
      appConfigRows: await readCsv("app_config.csv"),
      slideRows: await readCsv("slides.csv"),
      itemRows: await readCsv("slide_items.csv"),
      scheduleRows: await readCsv("schedule_groups.csv")
    },
    {
      generatedAt: "2026-07-02T00:00:00.000Z"
    }
  );
}
