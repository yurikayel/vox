// Service Worker do Vox (PWA — Porta da Cantina anime + shell offline)
// NOTA ARQUITETURAL: WebRTC DataChannels operam exclusivamente na thread principal (DOM/Window).
// O Service Worker atua no cache offline do shell e notificações de status, sem abrir WebRTC.
const CACHE_NAME = "vox-pwa-v6.8-gossip-retract";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./icons/icon.svg",
  "./images/cantina-gate.jpg",
  "./images/avatars/helena.jpg",
  "./images/avatars/juliana.jpg",
  "./images/avatars/yara.jpg",
  "./images/avatars/mei.jpg",
  "./images/avatars/fernanda.jpg",
  "./images/avatars/salma.jpg",
  "./images/avatars/lucas.jpg",
  "./images/avatars/andre.jpg",
  "./images/avatars/kaue.jpg",
  "./images/avatars/raj.jpg",
  "./images/posts/tour-helena.jpg",
  "./images/posts/tour-juliana.jpg",
  "./images/posts/tour-yara.jpg",
  "./images/posts/tour-mei.jpg",
  "./images/posts/tour-fernanda.jpg",
  "./images/posts/tour-salma.jpg",
  "./images/posts/tour-lucas.jpg",
  "./images/posts/tour-andre.jpg",
  "./images/posts/tour-kaue.jpg",
  "./images/posts/tour-raj.jpg",
  "./config/gateways.json",
  "./config/upload.json",
  "./config/signaling.json",
  "./js/app.js",
  "./js/brcode.js",
  "./js/cache-node.js",
  "./js/composer-media.js",
  "./js/crypto-dm.js",
  "./js/demo-seed.js",
  "./js/frames.js",
  "./js/governance.js",
  "./js/handles.js",
  "./js/hashtags.js",
  "./js/i18n-pt-br.js",
  "./js/inline-composer.js",
  "./js/inbox.js",
  "./js/listing.js",
  "./js/local-account.js",
  "./js/graphql.js",
  "./js/mock.js",
  "./js/moderation.js",
  "./js/peers.js",
  "./js/post-ownership.js",
  "./js/pix-key.js",
  "./js/webrtc-peer.js",
  "./js/render.js",
  "./js/share.js",
  "./js/social.js",
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
