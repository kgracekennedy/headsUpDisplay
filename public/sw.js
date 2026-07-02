const BUILD_VERSION = "__BUILD_VERSION__";
const CACHE_PREFIX = "heads-up-display";
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;
const CORE_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./main.mjs",
  "./data/household-data.json",
  "./manifest.webmanifest",
  "./icon.svg",
  "./apple-touch-icon.svg",
  "./lib/csv.mjs",
  "./lib/data-model.mjs",
  "./lib/rotation.mjs",
  "./lib/runtime-model.mjs",
  "./lib/schedule.mjs",
  "./lib/storage.mjs",
  "./lib/wake-lock.mjs"
];

function isCacheableResponse(response) {
  return Boolean(response) && response.ok;
}

async function putInCache(cache, request, response) {
  if (!isCacheableResponse(response)) {
    return;
  }

  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    await putInCache(cache, request, response);
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(`${CACHE_PREFIX}-`) && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});
