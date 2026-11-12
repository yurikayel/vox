/**
 * @file Orquestração E2E de avisos "adicionou você aos contatos" (envio, recepção e notificação).
 *
 * @module app/contact-notify-flow
 * @see client/js/contact-notify.js
 */

import * as contacts from "../contacts.js";
import * as contactNotify from "../contact-notify.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";

async function defaultSendDeps() {
  const [gql, peers, cryptoDm, localAccount, wire] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"),
    import("../local-account.js"), import("./dm-wire.js"),
  ]);
  return {
    getMe: () => localAccount.getRouteId(),
    getSenderMeta: () => ({
      displayName: localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "",
      avatarUrl: localAccount.getProfileEnrichment()?.avatarUrl || "",
    }),
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    sign: (body) => localAccount.signPayload(body),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    dispatch: (addr, env) => wire.dispatchSealedEnvelope(addr, env),
  };
}

/**
 * Envia aviso E2E cifrado para quem você acabou de adicionar aos contatos.
 *
 * @param {string} targetRouteId Rota da pessoa adicionada.
 * @param {object|null} [deps=null] Dependências injetáveis para teste.
 * @returns {Promise<string>} `"delivered"`, `"queued-relay"`, `"pending-retry"`, `"no-key"` ou `"skipped"`.
 */
export async function notifyContactAdded(targetRouteId, deps = null) {
  const target = String(targetRouteId || "").trim();
  if (!target || isWelcomeRouteId(target)) return "skipped";
  const d = deps || (await defaultSendDeps());
  const me = await Promise.resolve(d.getMe()).catch(() => "");
  if (!me || me === target) return "skipped";
  const pub = await d.getDmPub(target).catch(() => null);
  if (!pub) return "no-key";
  const meta = d.getSenderMeta() || {};
  const signed = await d.sign(contactNotify.buildContactAddedPayload({ to: target, ...meta }));
  const envelope = await d.seal(pub, contactNotify.serializeContactAddedDm(signed), { from: me, to: target });
  return d.dispatch(target, envelope);
}

/**
 * Adiciona contato na agenda local e, se for novo, envia aviso cifrado em segundo plano.
 *
 * @param {string} routeId Rota do contato.
 * @param {string} [label=""] Nome de exibição.
 * @param {object|null} [deps=null] Dependências opcionais para o envio.
 * @returns {boolean} `true` se o contato foi salvo.
 */
export function addContactAndNotify(routeId, label = "", deps = null) {
  const id = String(routeId || "").trim();
  if (!id) return false;
  const wasContact = contacts.hasContact(id);
  const ok = contacts.addContact(id, label);
  if (ok && !wasContact) void notifyContactAdded(id, deps).catch(() => {});
  return ok;
}

function defaultAlertUser(_entry, label) {
  void import("../share.js").then((s) => s.showToast(`${label} adicionou você aos contatos.`)).catch(() => {});
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Vox", { body: `${label} adicionou você aos contatos.` });
    } catch {}
  }
  if (typeof document !== "undefined" && typeof CustomEvent === "function") {
    document.dispatchEvent(new CustomEvent("vox:contact-added-received"));
  }
}

async function defaultReceiveDeps() {
  const [localAccount, profileDirectory, context, util] = await Promise.all([
    import("../local-account.js"), import("../profile-directory.js"), import("./context.js"), import("../short-id.js"),
  ]);
  return {
    verify: (signed) => localAccount.verifyPayload(signed),
    getSelves: async () => [await context.getActiveUser().catch(() => ""), await localAccount.getRouteId().catch(() => "")],
    resolveLabel: (entry) => entry.name || profileDirectory.getAuthorDisplaySync(entry.routeId) || util.shortId(entry.routeId),
    alertUser: defaultAlertUser,
    storage: globalThis.localStorage,
  };
}

/**
 * Processa um aviso `contact_added` decifrado: confere assinatura, registra e notifica o usuário.
 *
 * @param {{from?: string}} env Envelope recebido.
 * @param {string} rawText Texto decifrado.
 * @param {object|null} [deps=null] Dependências injetáveis para teste.
 * @returns {Promise<boolean>} `true` se o payload era um aviso válido (mesmo repetido).
 */
export async function receiveContactAddedDm(env, rawText, deps = null) {
  const signed = contactNotify.parseContactAddedDm(rawText);
  if (!signed) return false;
  if (env?.from && env.from !== signed.author) return true;
  const d = deps || (await defaultReceiveDeps());
  const selves = (await d.getSelves().catch(() => [])).filter(Boolean);
  if (!selves.includes(signed.to) || signed.author === signed.to) return true;
  if (!(await Promise.resolve(d.verify(signed)).catch(() => false))) return true;
  const { added, entry } = contactNotify.recordIncomingContactNotice(signed, d.storage);
  if (added && entry) d.alertUser(entry, d.resolveLabel(entry));
  return true;
}

/**
 * Lista os avisos pendentes filtrando quem já foi adicionado de volta aos contatos.
 *
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {Array<{routeId: string, name: string, avatarUrl: string, ts: number}>} Avisos para exibir em Pessoas.
 */
export function listPendingAddedYouNotices(storage = globalThis.localStorage) {
  return contactNotify.listIncomingContactNotices(storage).filter((n) => !contacts.hasContact(n.routeId));
}
