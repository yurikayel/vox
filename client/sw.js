// Service Worker do Vox (PWA — Porta da Cantina anime + shell offline)

// NOTA ARQUITETURAL: WebRTC DataChannels operam exclusivamente na thread principal (DOM/Window).

// O Service Worker atua no cache offline do shell e notificações de status, sem abrir WebRTC.

const CACHE_NAME = "vox-pwa-v7.36-real-network-audio-video-upload";

const SHELL_ASSETS = [

  "./",

  "./index.html",

  "./manifest.webmanifest",

  "./css/style.css",

  "./css/agora.css",

  "./icons/icon.svg",
  "./icons/logo-mark.png",

  "./icons/favicon.png",

  "./icons/favicon-16.png",

  "./icons/favicon-32.png",

  "./icons/icon-white-512.png",

  "./icons/icon-white-192.png",

  "./icons/icon-mark-black-128.png",

  "./icons/profile-vox-official-512.png",

  "./images/cantina-gate.jpg",

  "./config/gateways.json",

  "./config/upload.json",

  "./config/signaling.json",

  "./config/oauth.example.json",

  "./js/app.js",

  "./js/color-mode.js",

  "./js/sky-theme.js",

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

  "./js/app/screens-ajuda-teste.js",

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

  "./js/central-memory.js",

  "./js/community-mirror.js",

  "./js/community-seed-checklist.js",

  "./js/cache-manifest.js",

  "./js/composer-media.js",

  "./js/crypto-dm.js",
  "./js/dm-messenger.js",
  "./js/chat-bridge.js",

  "./js/demo-seed.js",

  "./js/frames.js",
  "./js/feature-flags.js",
  "./js/boot-color-mode.js",
  "./js/boot-short-url.js",
  "./js/boot-sw.js",
  "./js/dom-delegates.js",
  "./js/nostr-event.js",
  "./js/nostr-transport.js",

  "./js/open-frames-host.js",

  "./js/governance.js",

  "./js/handles.js",

  "./js/hashtags.js",

  "./js/i18n-pt-br.js",

  "./js/inline-composer.js",
  "./js/permanence-notice.js",
  "./js/report.js",
  "./js/app/report-flow.js",

  "./js/posse-dispatch.js",
  "./js/explode-dispatch.js",
  "./js/story-card.js",
  "./js/bsky-feed.js",
  "./js/linked-accounts.js",
  "./js/bsky-oauth.js",
  "./js/social-login.js",
  "./js/render/linked-accounts-ui.js",

  "./js/render/markdown-body.js",

  "./embed/vox-embed.js",

  "./js/inbox.js",

  "./js/listing.js",

  "./js/listing-ui.js",

  "./js/local-account.js",

  "./js/account-backup-wrap.js",

  "./js/contribution-attestation.js",

  "./js/voxels.js",

  "./js/contacts.js",

  "./js/oauth-profile.js",

  "./js/oauth-vault.js",

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

  "./js/reply-thread.js",

  "./js/community-topic-order.js",

  "./js/community-unread.js",

  "./js/peers.js",
  "./js/rate-limit.js",
  "./js/supporter-mode.js",

  "./js/peers-gossip-profile.js",

  "./js/polis.js",

  "./js/media-blob.js",
  "./js/media-lofi.js",
  "./js/perma-notary.js",
  "./js/civic-credential.js",

  "./js/peers-cache-manifest.js",

  "./js/peers-blob-affinity.js",

  "./js/post-ownership.js",

  "./js/gossip-retract-ui.js",

  "./js/pix-key.js",

  "./js/webrtc-peer.js",
  "./js/seeder-guardian.js",
  "./js/nostr-signaling.js",
  "./js/render/settings-guardian.js",
  "./js/node-health-model.js",
  "./js/node-health-evaluator.js",
  "./js/node-health-api.js",
  "./js/node-health-ux.js",
  "./js/node-health-state.js",
  "./js/render/node-health-badge.js",

  "./js/render.js",

  "./js/render/util.js",

  "./js/render/shell.js",

  "./js/render/feed.js",

  "./js/render/post-more-menu.js",

  "./js/render/post-more-actions.js",

  "./js/render/ig-toolbar.js",

  "./js/render/photo-chrome.js",

  "./js/render/profile-note-bubble.js",

  "./js/render/photo-tag-pins.js",

  "./js/render/repost-cite.js",

  "./js/profile-note.js",

  "./js/repost.js",

  "./js/repost-draft.js",

  "./js/repost-index.js",

  "./js/render/repost-btn.js",

  "./js/app/repost-ui.js",

  "./js/photo-tags.js",

  "./js/app/profile-note-ui.js",

  "./js/app/photo-tag-ui.js",

  "./js/app/photo-tag-picker.js",

  "./js/app/photo-tag-persist.js",

  "./js/render/topic.js",

  "./js/render/community.js",
  "./js/render/compose-chrome.js",
  "./js/render/compose-steps.js",
  "./js/app/compose-stepper.js",
  "./js/app/vote-confirm.js",
  "./js/render/guided-setup.js",
  "./js/app/screens-guided.js",
  "./js/render/civic-block.js",
  "./js/civic-post.js",
  "./js/app/civic-actions.js",

  "./js/render/vote.js",

  "./js/render/profile.js",

  "./js/render/profile-voxels.js",

  "./js/render/oauth-modals.js",

  "./js/render/network.js",

  "./js/render/dm.js",

  "./js/render/tag-polis.js",

  "./js/render/voxpedia.js",

  "./js/render/ajuda-teste.js",

  "./js/share.js",

  "./js/qr-url.js",

  "./js/qr-url-gf.js",

  "./js/qr-url-codec.js",

  "./js/qr-url-layout.js",

  "./js/steward-wizard.js",

  "./js/social.js",

  "./js/ans104.js",
  "./js/identity-link.js",
  "./js/render/welcome-pact.js",
  "./js/upload.js",

  "./js/wallet.js",
  "./js/idb-store.js",
  "./js/vox-identity.js",
  "./js/storage-persistence.js",
  "./js/webxdc-loader.js",
  "./js/webxdc-host.js",
  "./js/webxdc-crdt.js",
  "./js/kit-genesis.js",
  "./js/chunked-transfer.js",
  "./js/airgap-webrtc.js",
  "./js/testimonials.js",
  "./js/bridging-rank.js",

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

function handleSignalingFetch(event) {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
}

function handleAppShellFetch(event) {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
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
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/config/signaling.json")) {
    handleSignalingFetch(event);
    return;
  }
  // LAN-08: o kill-switch nunca sai do cache do SW — sempre rede (offline, o cliente usa o último estado salvo).
  if (url.pathname.endsWith("/config/flags.json")) return;
  handleAppShellFetch(event);
});

self.addEventListener("message", (event) => {

  const data = event.data;

  if (!data || data.type !== "VOX_SETTINGS_UPDATED") return;

  const settings = data.settings || {};

  if (settings.backgroundRelay && typeof Notification !== "undefined" && Notification.permission === "granted") {

    self.registration

      .showNotification("Vox · Nó Leve em Segundo Plano", {

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

