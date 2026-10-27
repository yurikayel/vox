// Service Worker do Vox (PWA ? Porta da Cantina anime + shell offline)
// NOTA ARQUITETURAL: WebRTC DataChannels operam exclusivamente na thread principal (DOM/Window).
// O Service Worker atua no cache offline do shell e notifica��es de status, sem abrir WebRTC.
const CACHE_NAME = "vox-pwa-v6.87-mofn-lab";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./icons/icon.svg",
  "./icons/favicon.png",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/icon-white-512.png",
  "./icons/icon-white-192.png",
  "./icons/profile-vox-official-512.png",
  "./images/cantina-gate.jpg",
  "./config/gateways.json",
  "./config/upload.json",
  "./config/signaling.json",
  "./config/oauth.example.json",
  "./js/app.js",
  "./js/color-mode.js",
  "./js/app/cantina-gate.js",
  "./js/app/context.js",
  "./js/app/init.js",
  "./js/app/post-media-lightbox.js",
  "./js/app/navigation.js",
  "./js/app/onboarding-side-effects.js",
  "./js/app/onboarding.js",
  "./js/app/route-parse.js",
  "./js/app/route.js",
  "./js/app/screens-community.js",
  "./js/app/screens-compose.js",
  "./js/app/screens-dm.js",
  "./js/app/screens-home.js",
  "./js/app/screens-network.js",
  "./js/app/screens-people.js",
  "./js/app/screens-profile.js",
  "./js/app/screens-voxpedia.js",
  "./js/app/screens-status.js",
  "./js/app/screens-labs.js",
  "./js/labs/collective-mofn.js",
  "./js/labs/mofn-lab.js",
  "./js/render/status.js",
  "./js/render/diff-html.js",
  "./embed/frame-demo.html",
  "./embed/demo.html",
  "./js/app/zap-modal.js",
  "./js/brcode.js",
  "./js/cache-node.js",
  "./js/community-mirror.js",
  "./js/community-seed-checklist.js",
  "./js/cache-manifest.js",
  "./js/composer-media.js",
  "./js/crypto-dm.js",
  "./js/demo-seed.js",
  "./js/frames.js",
  "./js/open-frames-host.js",
  "./js/governance.js",
  "./js/handles.js",
  "./js/hashtags.js",
  "./js/i18n-pt-br.js",
  "./js/inline-composer.js",
  "./js/posse-dispatch.js",
  "./js/render/markdown-body.js",
  "./embed/vox-embed.js",
  "./js/inbox.js",
  "./js/listing.js",
  "./js/listing-ui.js",
  "./js/local-account.js",
  "./js/contacts.js",
  "./js/oauth-profile.js",
  "./js/people-index.js",
  "./js/profile-card.js",
  "./js/mesh-profile.js",
  "./js/profile-directory.js",
  "./js/vox-welcome-profile.js",
  "./js/gateway-telemetry.js",
  "./js/graphql.js",
  "./js/data/profiles-brazil-uf.js",
  "./js/mock.js",
  "./js/moderation.js",
  "./js/peers.js",
  "./js/peers-gossip-profile.js",
  "./js/polis.js",
  "./js/media-blob.js",
  "./js/peers-cache-manifest.js",
  "./js/peers-blob-affinity.js",
  "./js/post-ownership.js",
  "./js/gossip-retract-ui.js",
  "./js/pix-key.js",
  "./js/webrtc-peer.js",
  "./js/render.js",
  "./js/render/util.js",
  "./js/render/shell.js",
  "./js/render/feed.js",
  "./js/render/post-more-menu.js",
  "./js/render/topic.js",
  "./js/render/community.js",
  "./js/render/profile.js",
  "./js/render/oauth-modals.js",
  "./js/render/network.js",
  "./js/render/dm.js",
  "./js/render/tag-polis.js",
  "./js/render/voxpedia.js",
  "./js/share.js",
  "./js/steward-wizard.js",
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

  // Requisi��es externas (gateways GraphQL, Arweave HTTP) passam direto pela rede
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
      .showNotification("Vox ? N� Leve em Segundo Plano", {
        body: "Participa��o distribu�da ativa (somente Wi-Fi com teto di�rio).",
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
