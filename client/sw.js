// Service Worker do Vox (PWA — Porta da Cantina anime + shell offline)

// NOTA ARQUITETURAL: WebRTC DataChannels operam exclusivamente na thread principal (DOM/Window).

// O Service Worker atua no cache offline do shell e notificações de status, sem abrir WebRTC.

const CACHE_NAME = "vox-pwa-v7.171-device-merge-tombstone";

const SHELL_ASSETS = [

  "./",

  "./index.html",

  "./manifest.webmanifest",

  "./css/style.css",

  "./css/agora.css",

  "./icons/icon.svg",
  "./icons/logo-mark.png",


  "./icons/favicon-16.png",

  "./icons/favicon-32.png",

  "./icons/icon-white-192.png",

  "./icons/icon-mark-black-128.png",


  "./config/gateways.json",

  "./config/upload.json",

  "./config/signaling.json",

  "./config/oauth.example.json",

  "./js/app.js",

  "./js/color-mode.js",

  "./js/sky-theme.js",

  "./js/app/cantina-gate.js",
  "./js/app/read-first.js",
  "./js/app/storage-durability-flow.js",
  "./js/storage-persistence.js",

  "./js/app/context.js",

  "./js/app/inbox-backup-ui.js",
  "./js/app/init.js",
  "./js/app/init-frame-actions.js",
  "./js/app/init-network-sync.js",
  "./js/app/init-post-mutation.js",
  "./js/app/init-social-actions.js",
  "./js/app/frame-ui.js",

  "./js/app/post-media-lightbox.js",

  "./js/app/navigation.js",

  "./js/app/onboarding-side-effects.js",

  "./js/app/onboarding.js",
  "./js/app/onboarding-oauth-ui.js",
  "./js/app/onboarding-email.js",
  "./js/app/account-exit-banner.js",

  "./js/app/route-parse.js",

  "./js/app/route.js",
  "./js/app/action-runner.js",
  "./js/app/dm-badge-live.js",
  "./js/app/sidebar-circles-live.js",

  "./js/app/community-metadata.js",
  "./js/app/community-data.js",
  "./js/app/community-controls.js",
  "./js/app/community-listing-handlers.js",
  "./js/app/community-topic-screen.js",
  "./js/app/screens-community.js",
  "./js/app/screens-vote.js",

  "./js/app/compose-shared.js",
  "./js/app/compose-community.js",
  "./js/app/compose-community-kit.js",
  "./js/app/compose-topic.js",
  "./js/app/compose-listing.js",
  "./js/app/compose-proposal.js",
  "./js/app/compose-reply.js",
  "./js/app/compose-inline-replies.js",
  "./js/app/screens-compose.js",

  "./js/app/screens-dm.js",
  "./js/app/screens-dm-inbox.js",
  "./js/app/screens-dm-list.js",
  "./js/app/screens-dm-draft.js",
  "./js/app/screens-dm-thread.js",

  "./js/app/screens-home.js",

  "./js/app/screens-network.js",
  "./js/app/network-screen-linked.js",
  "./js/app/network-screen-moderation.js",
  "./js/app/network-screen-settings.js",
  "./js/app/network-screen-steward.js",
  "./js/app/own-posts-ui.js",
  "./js/own-posts.js",
  "./js/post-supersede.js",

  "./js/app/screens-people.js",

  "./js/app/screens-profile.js",
  "./js/app/profile-screen-account.js",
  "./js/app/profile-screen-data.js",
  "./js/app/profile-screen-lookups.js",
  "./js/app/profile-screen-settings.js",
  "./js/app/profile-screen-wallet.js",
  "./js/app/profile-vault-sync.js",

  "./js/app/screens-not-found.js",

  "./js/app/screens-status.js",

  "./js/render/status.js",

  "./js/render/diff-html.js",

  "./embed/frame-demo.html",
  "./embed/frame-demo.js",

  "./embed/demo.html",

  "./js/app/zap-modal.js",

  "./js/brcode.js",

  "./js/cache-node.js",
  "./js/cache-node-communities.js",
  "./js/cache-node-db.js",
  "./js/cache-node-dm.js",
  "./js/cache-node-posts.js",
  "./js/cache-node-sink.js",
  "./js/cache-node-tags.js",
  "./js/cache-node-tombstones.js",
  "./js/cache-node-tx.js",
  "./js/post-wire.js",

  "./js/central-memory.js",
  "./js/central-memory-hydrate.js",
  "./js/central-memory-urls.js",
  "./js/central-memory-directory.js",
  "./js/central-memory-bundle.js",
  "./js/central-memory-apply.js",
  "./js/memory-server-choice.js",

  "./js/community-mirror.js",

  "./js/community-seed-checklist.js",

  "./js/cache-manifest.js",

  "./js/composer-media.js",

  "./js/crypto-dm.js",
  "./js/dm-messenger.js",
  "./js/dm-outbox.js",
  "./js/chat-bridge.js",

  "./js/demo-seed.js",

  "./js/email-kit.js",

  "./js/frames.js",
  "./js/feature-flags.js",
  "./js/honest-errors.js",
  "./js/electoral-period.js",
  "./js/boot-color-mode.js",
  "./js/boot-short-url.js",
  "./js/boot-sw.js",
  "./js/app/dom-delegates.js",
  "./js/nostr-event.js",
  "./js/new-key-guard.js",
  "./js/community-updates.js",
  "./js/nostr-transport.js",

  "./js/open-frames-host.js",

  "./js/governance.js",

  "./js/handles.js",

  "./js/hashtags.js",

  "./js/i18n-pt-br.js",

  "./js/app/inline-composer.js",
  "./js/app/inline-composer-media.js",
  "./js/app/inline-composer-publish.js",
  "./js/app/inline-composer-state.js",
  "./js/app/inline-composer-tags.js",
  "./js/app/inline-composer-voice.js",
  "./js/permanence-notice.js",
  "./js/topic-permaweb.js",
  "./js/report.js",
  "./js/app/report-flow.js",
  "./js/report-review.js",
  "./js/app/report-dm.js",
  "./js/app/report-review-flow.js",
  "./js/app/dm-wire.js",
  "./js/render/review-banner.js",
  "./js/render/topic-badges.js",
  "./js/app-feedback.js",
  "./js/app/feedback-flow.js",
  "./js/age-gate.js",
  "./js/render/modal-host.js",
  "./js/render/focus-trap.js",

  "./js/posse-dispatch.js",
  "./js/explode-dispatch.js",
  "./js/explode-crosspost.js",
  "./js/explode-events.js",
  "./js/explode-intent.js",
  "./js/explode-ui.js",
  "./js/story-card.js",
  "./js/bsky-feed.js",
  "./js/linked-accounts.js",
  "./js/linked-accounts-bsky.js",
  "./js/linked-accounts-dispatch.js",
  "./js/linked-accounts-format.js",
  "./js/linked-accounts-store.js",
  "./js/linked-accounts-verify.js",
  "./js/bsky-oauth.js",
  "./js/social-login.js",
  "./js/render/linked-accounts-ui.js",

  "./js/render/markdown-body.js",

  "./embed/vox-embed.js",

  "./js/inbox.js",
  "./js/identity/inbox-backup.js",

  "./js/listing.js",

  "./js/listing-ui.js",

  "./js/identity/index.js",
  "./js/identity/keys.js",
  "./js/identity/local-account.js",
  "./js/identity/tab-sync.js",
  "./js/account-social-match.js",
  "./js/sig-format.js",
  "./js/signed-verify.js",
  "./js/aviso-roles.js",
  "./js/aviso-ics.js",
  "./js/natural-mod.js",

  "./js/identity/account-backup-wrap.js",

  "./js/contribution-attestation.js",

  "./js/voxels.js",

  "./js/contacts.js",
  "./js/contact-notify.js",
  "./js/app/contact-notify-flow.js",

  "./js/oauth-profile.js",

  "./js/vault/index.js",
  "./js/vault/envelope.js",
  "./js/vault/oauth-vault.js",
  "./js/vault/passphrase-vault.js",
  "./js/vault/mesh-vault.js",
  "./js/vault/vault-store.js",
  "./js/identity/keystore.js",
  "./js/identity/key-at-rest.js",
  "./js/identity/key-lock.js",
  "./js/identity/account-backup.js",
  "./js/identity/account-exit.js",
  "./js/identity/recovery-phrase.js",
  "./js/identity/identity-seed.js",
  "./js/identity/account-phrase.js",
  "./js/shamir-gf256.js",
  "./js/identity/guardians.js",
  "./js/identity/local-wipe.js",
  "./js/app/guardians-flow.js",
  "./js/app/screens-guardians.js",
  "./js/identity/guardian-return.js",
  "./js/app/mesh-vault-flow.js",
  "./js/app/mesh-vault-ui.js",
  "./js/app/screens-guardian-return.js",
  "./js/app/screens-phrase.js",
  "./js/identity/p256.js",
  "./js/data/bip39-pt.js",
  "./js/vault/vault-crypto.js",
  "./js/vault/vault-legacy.js",

  "./js/people-index.js",

  "./js/profile-card.js",

  "./js/mesh-profile.js",

  "./js/profile-directory.js",

  "./js/vox-welcome-profile.js",

  "./js/gateway-telemetry.js",

  "./js/signaling-telemetry.js",

  "./js/genesis.js",
  "./js/fetch-timeout.js",
  "./js/graphql.js",

  "./js/data/profiles-brazil-uf.js",
  "./js/data/test-route-ids.js",

  "./js/mock.js",

  "./js/moderation.js",
  "./js/moderation-log.js",

  "./js/reply-thread.js",

  "./js/community-topic-order.js",

  "./js/community-unread.js",

  "./js/peers.js",
  "./js/peers-base.js",
  "./js/peers-events.js",
  "./js/peers-settings.js",
  "./js/peers-relay.js",
  "./js/peers-transport.js",
  "./js/peers-transfer.js",
  "./js/peers-gossip.js",
  "./js/peers-channel.js",
  "./js/peer-sync.js",
  "./js/community-channel.js",
  "./js/render/channel-bar.js",
  "./js/render/community-toolbar.js",
  "./js/app/community-channel-flow.js",
  "./js/app/compose-poll.js",
  "./js/vox-link.js",
  "./js/invite-arrival.js",
  "./js/render/vox-link.js",
  "./js/app/vox-link-flow.js",
  "./js/rate-limit.js",
  "./js/supporter-mode.js",

  "./js/peers-gossip-profile.js",


  "./js/media-blob.js",
  "./js/media-lofi.js",
  "./js/perma-notary.js",

  "./js/peers-cache-manifest.js",

  "./js/peers-blob-affinity.js",

  "./js/post-ownership.js",

  "./js/gossip-retract-ui.js",

  "./js/pix-key.js",

  "./js/webrtc-peer.js",
  "./js/turn-credentials.js",
  "./js/nostr-signaling.js",

  "./js/render.js",

  "./js/render/util.js",
  "./js/shared/html.js",
  "./js/shared/local-advisory.js",
  "./js/shared/date-format.js",
  "./js/shared/raster-file-to-jpeg.js",
  "./js/shared/community-avatar-image.js",
  "./js/shared/signals.js",
  "./js/shared/state-machine.js",
  "./js/shared/async-dedupe.js",
  "./js/shared/persisted-signal.js",
  "./js/shared/keyed-list.js",
  "./js/shared/post-speech.js",
  "./js/shared/action-runner.js",
  "./js/shared/device-merge.js",
  "./js/short-id.js",

  "./js/render/shell.js",
  "./js/render/shell-nav.js",
  "./js/render/shell-chrome.js",
  "./js/render/shell-drawer.js",
  "./js/render/shell-layout.js",

  "./js/render/feed.js",

  "./js/app/post-more-menu.js",

  "./js/app/post-more-actions.js",

  "./js/render/ig-toolbar.js",

  "./js/render/photo-chrome.js",

  "./js/render/profile-note-bubble.js",

  "./js/render/profile-identity-meta.js",

  "./js/render/photo-tag-pins.js",

  "./js/render/repost-cite.js",

  "./js/profile-note.js",

  "./js/profile-identity-meta.js",

  "./js/repost.js",

  "./js/repost-draft.js",

  "./js/repost-index.js",

  "./js/render/repost-btn.js",

  "./js/app/repost-ui.js",

  "./js/photo-tags.js",

  "./js/app/profile-note-ui.js",

  "./js/app/profile-identity-meta-ui.js",

  "./js/app/photo-tag-ui.js",

  "./js/app/photo-tag-picker.js",

  "./js/app/photo-tag-persist.js",

  "./js/render/topic.js",

  "./js/render/community.js",
  "./js/render/proposal.js",
  "./js/render/compose-chrome.js",
  "./js/render/compose-steps.js",
  "./js/app/compose-stepper.js",
  "./js/app/vote-confirm.js",
  "./js/app/screens-guided.js",
  "./js/app/screens-sync.js",
  "./js/render/civic-block.js",
  "./js/civic-post.js",
  "./js/app/civic-actions.js",

  "./js/render/vote.js",

  "./js/render/profile.js",
  "./js/render/profile-compose-topic.js",
  "./js/render/profile-compose-wizards.js",
  "./js/render/profile-header.js",
  "./js/render/profile-settings.js",
  "./js/render/profile-tabs.js",
  "./js/render/profile-wallet.js",
  "./js/render/profile-sovereignty.js",

  "./js/render/profile-voxels.js",

  "./js/render/oauth-modals.js",
  "./js/render/genesis-entry.js",
  "./js/render/oauth-import.js",

  "./js/render/network.js",
  "./js/render/network-form.js",
  "./js/render/network-participation.js",
  "./js/render/network-sections.js",
  "./js/render/network-steward.js",

  "./js/render/dm.js",

  "./js/render/tag-polis.js",

  "./js/share.js",

  "./js/qr-url.js",

  "./js/qr-url-gf.js",

  "./js/qr-url-codec.js",

  "./js/qr-url-layout.js",

  "./js/steward-wizard.js",

  "./js/social.js",

  "./js/ans104.js",
  "./js/render/welcome-pact.js",
  "./js/arweave-lib.js",
  "./js/upload.js",

  "./js/wallet.js",

];

/**
 * PM-04: módulos escritos e testados, mas que nenhum ponto de entrada carrega (REV-02 decide plugar ou arquivar).
 * Ficam FORA do precache: a instalação não baixa código que nunca roda. O teste `shell-reachability`
 * exige que todo módulo inalcançável esteja aqui e que nada daqui esteja no SHELL_ASSETS.
 */
// eslint-disable-next-line no-unused-vars
const UNPLUGGED_MODULES = [
  "./js/labs/parado/airgap-webrtc.js",
  "./js/labs/parado/bridging-rank.js",
  "./js/labs/parado/chunked-transfer.js",
  "./js/labs/parado/civic-credential.js",
  "./js/labs/parado/identity-link.js",
  "./js/labs/parado/node-health-api.js",
  "./js/labs/parado/node-health-evaluator.js",
  "./js/labs/parado/node-health-model.js",
  "./js/labs/parado/node-health-state.js",
  "./js/labs/parado/node-health-ux.js",
  "./js/labs/parado/polis.js",
  "./js/labs/parado/node-health-badge.js",
  "./js/labs/parado/settings-guardian.js",
  "./js/labs/parado/seeder-guardian.js",
  "./js/labs/parado/testimonials.js",
  "./js/labs/parado/webxdc-crdt.js",
  "./js/labs/parado/webxdc-host.js",
  "./js/labs/parado/webxdc-loader.js",
  // GURPS: matemática pronta e testada; a tela de derivados ainda não a usa (spec pacote-gurps4e-v0, §3).
  "./js/dungeon/system-gurps-math.js",
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
  // Só GET passa pelo cache: POST/PUT/DELETE vão direto à rede (o Cache API não guarda nem casa outros métodos).
  if (event.request.method !== "GET") return;
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

  // Só páginas do próprio Vox mudam os ajustes do nó em segundo plano.
  if ((event.origin && event.origin !== self.location.origin) || !data || data.type !== "VOX_SETTINGS_UPDATED") return;

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

