/** @file Postagem direta e criação de registros via AT Protocol no Bluesky. */

import { BSKY_DEFAULT_PDS } from "./linked-accounts-format.js";

/**
 * Texto do post no Bluesky (título, corpo e link canônico, até 295 caracteres): o mesmo por App Password e por OAuth.
 * @param {{title?: string, body?: string, canonicalUrl?: string}} post Post a formatar.
 * @returns {string} Texto formatado com no máximo 295 caracteres.
 */
export function bskyPostText(post) {
  const title = String(post?.title || "").trim();
  const body = String(post?.body || "").trim();
  const url = String(post?.canonicalUrl || "").trim();
  return [title, body !== title ? body : "", url].filter(Boolean).join("\n\n").slice(0, 295);
}

/**
 * Cria o registro do post no repositório do Bluesky.
 * @param {string} pdsUrl Endereço do PDS
 * @param {object} session Sessão
 * @param {object} post Post
 * @returns {Promise<object>} Resposta da criação.
 */
async function createBskyPostRecord(pdsUrl, session, post) {
  const rawText = bskyPostText(post);
  const recRes = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: { $type: "app.bsky.feed.post", text: rawText, createdAt: new Date().toISOString() },
    }),
  });
  return { ok: recRes.ok, uri: recRes.ok ? (await recRes.json())?.uri : "" };
}

/**
 * Posta no Bluesky com App Password: abre sessão no PDS e cria o registro `app.bsky.feed.post` (texto cortado em 295
 * caracteres: título, corpo e link).
 * @param {string} handle Usuário no Bluesky.
 * @param {string} appPassword App Password da conta.
 * @param {{title?: string, body?: string, canonicalUrl?: string}} post Post a replicar.
 * @param {string} [pdsUrl=BSKY_DEFAULT_PDS] Servidor de dados da conta.
 * @returns {Promise<{ok: boolean, uri?: string, reason?: string}>} `uri` do registro criado, ou o motivo da falha
 *   (`missing_credentials`, `auth_failed` ou erro de rede).
 */
export async function postToBlueskyAtProto(handle, appPassword, post, pdsUrl = BSKY_DEFAULT_PDS) {
  const identifier = String(handle || "").trim().replace(/^@/, "");
  const password = String(appPassword || "").trim();
  if (!identifier || !password) return { ok: false, reason: "missing_credentials" };

  try {
    const sessRes = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (!sessRes.ok) return { ok: false, reason: "auth_failed" };
    const session = await sessRes.json();
    return await createBskyPostRecord(pdsUrl, session, post);
  } catch (err) {
    return { ok: false, reason: err?.message || "network_error" };
  }
}
