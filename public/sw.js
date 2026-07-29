const CACHE_NAME = "presenca-embaixador-v1";

function withScope(path) {
  const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
  return `${scopePath}${path}`;
}

const APP_ENTRY = withScope("/");
const APP_SHELL = [APP_ENTRY, withScope("/manifest.webmanifest"), withScope("/logo-er.png")];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_ENTRY, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(APP_ENTRY);
          return (
            cached ||
            new Response("Aplicativo offline indisponível neste momento.", {
              status: 503,
              headers: { "Content-Type": "text/plain;charset=utf-8" },
            })
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }

        return response;
      });
    }),
  );
});
