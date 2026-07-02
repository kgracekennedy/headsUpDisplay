import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build-site.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDirectory = path.join(projectRoot, "dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(requestUrl) {
  const normalizedPath = new URL(requestUrl, "http://localhost").pathname;
  const requestedPath = normalizedPath === "/" ? "/index.html" : normalizedPath;
  return path.join(distDirectory, requestedPath);
}

async function main() {
  const port = Number.parseInt(process.env.PORT ?? "4173", 10);

  await buildSite();

  const server = http.createServer(async (request, response) => {
    const filePath = resolveRequestPath(request.url ?? "/");

    try {
      const fileStats = await stat(filePath);

      if (!fileStats.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream"
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`Serving ${distDirectory} at http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
