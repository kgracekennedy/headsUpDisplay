import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";
import { buildHouseholdData } from "../src/lib/data-model.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceDataDirectory = path.join(projectRoot, "data", "source");
const generatedDataDirectory = path.join(projectRoot, "data", "generated");
const distDirectory = path.join(projectRoot, "dist");

async function readCsvTable(fileName) {
  const filePath = path.join(sourceDataDirectory, fileName);
  const fileContents = await readFile(filePath, "utf8");
  return parseCsv(fileContents);
}

async function copyFile(sourcePath, destinationPath) {
  const contents = await readFile(sourcePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, contents);
}

async function copyTree(sourcePath, destinationPath) {
  const sourceStats = await stat(sourcePath);

  if (sourceStats.isDirectory()) {
    await mkdir(destinationPath, { recursive: true });
    const entries = await readdir(sourcePath, { withFileTypes: true });

    for (const entry of entries) {
      await copyTree(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name));
    }

    return;
  }

  await copyFile(sourcePath, destinationPath);
}

async function copyDirectoryContents(sourceDirectory, destinationDirectory) {
  const entries = ["index.html", "styles.css", "main.mjs", "lib"];

  for (const entry of entries) {
    await copyTree(path.join(sourceDirectory, entry), path.join(destinationDirectory, entry));
  }
}

async function copyPublicAssets() {
  const publicDirectory = path.join(projectRoot, "public");
  const entries = ["manifest.webmanifest", "sw.js", "icon.svg", "apple-touch-icon.svg"];

  for (const entry of entries) {
    await copyTree(path.join(publicDirectory, entry), path.join(distDirectory, entry));
  }
}

export async function buildSite() {
  const tables = {
    appConfigRows: await readCsvTable("app_config.csv"),
    slideRows: await readCsvTable("slides.csv"),
    itemRows: await readCsvTable("slide_items.csv"),
    scheduleRows: await readCsvTable("schedule_groups.csv")
  };
  const householdData = buildHouseholdData(tables);
  const serializedData = `${JSON.stringify(householdData, null, 2)}\n`;

  await mkdir(distDirectory, { recursive: true });
  await mkdir(path.join(distDirectory, "data"), { recursive: true });
  await mkdir(generatedDataDirectory, { recursive: true });
  await copyDirectoryContents(path.join(projectRoot, "src"), distDirectory);
  await copyPublicAssets();
  await writeFile(path.join(distDirectory, "data", "household-data.json"), serializedData, "utf8");
  await writeFile(path.join(generatedDataDirectory, "household-data.json"), serializedData, "utf8");

  console.log(`Built headsUpDisplay into ${distDirectory}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  buildSite().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
