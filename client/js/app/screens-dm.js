/** @file Direct messages list and thread. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as handles from "../handles.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as listingUi from "../listing-ui.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as brcode from "../brcode.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as oauthProfile from "../oauth-profile.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";

export async function pollInboxMessages(user) {
  if (!user) return 0;
  try {
    const sealedList = await inbox.pullMine(user);
    let count = 0;
    for (const env of sealedList) {
      try {
        const text = await cryptoDm.open(env);
        await cacheNode.saveDmMessage({
          id: env.id,
          peerAddress: env.from,
          from: env.from,
          to: env.to,
          text,
          ts: env.ts || Date.now(),
          status: "received",
        });
        await inbox.deleteSealed(user, env.id);
        count++;
      } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

export async function showDmList() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Mensagens"));

  if (!user) {
    main.innerHTML = `<div class="card"><h2>Mensagens Diretas</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }

  await ensureOnboardingSideEffects(user);
  await pollInboxMessages(user);
  const convs = await cacheNode.getDmConversations();
  render.renderDmList(main, convs, user, { contactList: contacts.listContacts() });

  document.getElementById("btn-copy-my-dm-link")?.addEventListener("click", () => {
    const link = `${window.location.origin}${window.location.pathname}#/dm/${encodeURIComponent(user)}`;
    navigator.clipboard.writeText(link);
    share.showToast("Link copiado! Manda para quem quiser te escrever.");
  });

  document.getElementById("form-new-dm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = document.getElementById("dm-peer-input")?.value.trim();
    const peer = peopleIndex.parseConnectTarget(raw) || raw;
    if (peer) location.hash = `#/dm/${encodeURIComponent(peer)}`;
  });

  document.getElementById("btn-pull-inbox")?.addEventListener("click", async () => {
    const pulled = await pollInboxMessages(user);
    share.showToast(pulled > 0 ? `${pulled} nova(s) mensagem(ns)!` : "Inbox verificado: sem novas mensagens.");
    showDmList();
  });
}

export async function handleSendDmSubmit(user, peerAddress, peerDmPub) {
  const input = document.getElementById("dm-message-input");
  const text = input?.value.trim();
  if (!text) return;
  const btn = document.getElementById("btn-send-dm");
  if (btn) btn.disabled = true;

  try {
    const envelope = await cryptoDm.seal(peerDmPub, text, { from: user, to: peerAddress });
    let status = "sent";
    const transport = peers.sendDirectMessageTransport(peerAddress, envelope);
    if (transport === "rtc") {
      status = "delivered";
    } else {
      try {
        await inbox.pushSealed(peerAddress, envelope);
        status = "queued-relay";
      } catch {
        status = "pending-retry";
      }
    }

    await cacheNode.saveDmMessage({
      id: envelope.id,
      peerAddress,
      from: user,
      to: peerAddress,
      text,
      ts: envelope.ts,
      status,
    });
    if (input) input.value = "";
    showDmThread(peerAddress);
  } catch (err) {
    share.showToast(`Erro ao cifrar: ${err.message}`, "error");
    if (btn) btn.disabled = false;
  }
}

export async function showDmThread(peerAddress) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Conversa"));

  if (!user) {
    main.innerHTML = `<div class="card"><h2>Conversa Direta</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }

  await pollInboxMessages(user);
  const messages = await cacheNode.getDmMessages(peerAddress);
  const isRtcOnline = peers.isAddressConnectedRtc(peerAddress);
  let peerDmPub = gql.getCachedUserDmPub(peerAddress) || peers.getPeerDmPub(peerAddress);
  if (!peerDmPub) peerDmPub = await gql.fetchUserDmPub(peerAddress);

  render.renderDmThread(main, peerAddress, messages, user, {
    isRtcOnline,
    hasDmPub: Boolean(peerDmPub),
  });

  const c = document.getElementById("dm-thread-container");
  if (c) c.scrollTop = c.scrollHeight;

  document.getElementById("btn-save-manual-dmpub")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(document.getElementById("input-manual-dmpub")?.value.trim());
      gql.cacheUserDmPub(peerAddress, parsed);
      share.showToast("Chave Dm-Pub salva localmente!");
      showDmThread(peerAddress);
    } catch {
      share.showToast("JSON inválido.", "error");
    }
  });

  if (peerDmPub) {
    document.getElementById("form-send-dm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendDmSubmit(user, peerAddress, peerDmPub);
    });
  }
}

export function initDmListeners() {
  peers.onDirectMessage(async (envelope) => {
    const user = await getActiveUser();
    if (!user || envelope.to !== user) return;
    try {
      const text = await cryptoDm.open(envelope);
      await cacheNode.saveDmMessage({
        id: envelope.id,
        peerAddress: envelope.from,
        from: envelope.from,
        to: envelope.to,
        text,
        ts: envelope.ts || Date.now(),
        status: "received",
      });
      const cur = parseRoute();
      if (cur.name === "dm-thread" && cur.address === envelope.from) {
        showDmThread(envelope.from);
      } else {
        share.showToast(`Nova mensagem de ${envelope.from.slice(0, 8)}…`);
      }
    } catch {}
  });
}
