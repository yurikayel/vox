// Service Worker do Vox (Fase 3.1)
const CACHE_NAME = "vox-pwa-v3.1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./icons/icon.svg",
  "./config/gateways.json",
  "./config/upload.json",
  "./js/app.js",
  "./js/cache-node.js",
  "./js/graphql.js",
  "./js/mock.js",
  "./js/moderation.js",
  "./js/peers.js",
  "./js/render.js",
  "./js/share.js",
  "./js/upload.js",
  "./js/wallet.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Requisições externas (gateways GraphQL, Arweave HTTP) passam direto pela rede
  if (url.origin !== self.location.origin) {
    return;
  }

  // App shell: cache-first com fallback de rede
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Atualiza cache em segundo plano (stale-while-revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "VOX_SETTINGS_UPDATED") return;

  const settings = data.settings || {};
  if (settings.backgroundRelay && typeof Notification !== "undefined" && Notification.permission === "granted") {
    self.registration
      .showNotification("Vox — Nó Leve em Segundo Plano", {
        body: "Participação distribuída ativa (somente Wi-Fi com teto diário).",
        icon: "./icons/icon.svg",
        tag: "vox-relay-status",
        silent: true,
        renotify: false,
      })
      .catch(() => {});
  } else {
    self.registration
      .getNotifications({ tag: "vox-relay-status" })
      .then((notifications) => {
        notifications.forEach((n) => n.close());
      })
      .catch(() => {});
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate("./#/settings/network");
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("./#/settings/network");
      }
    })
  );
});
