/**
 * @file PM-72 — os próprios posts para levar embora: na forma assinada (a que a rede confere) e com a mídia.
 * Serve ao arquivo "Baixar meus posts" e ao backup no e-mail. Voltar passa pelas mesmas conferências de um
 * post que chega pela malha: autor é esta conta, assinatura confere, nada mais novo guardado, mídia bate com o hash.
 * Com o Arweave desligado, isto e as cópias de quem segue são o que preserva os posts fora deste aparelho.
 */

import * as cacheNode from "./cache-node.js";
import * as localAccount from "./local-account.js";
import * as mediaBlob from "./media-blob.js";
import { isBeforeGenesisMs } from "./genesis.js";
import { isSupersededLocally } from "./post-supersede.js";

/** Tipo do arquivo "Baixar meus posts". */
export const OWN_POSTS_TYPE = "vox-meus-posts";
/** Versão do arquivo. */
export const OWN_POSTS_VERSION = 1;

const DEFAULT_DEPS = Object.freeze({
  store: cacheNode,
  verify: (post) => localAccount.verifyPayload(post),
  isSuperseded: (post) => isSupersededLocally(post),
  blobForPost: (post, blob) => mediaBlob.blobForPost(post, blob),
  save: (post) => cacheNode.saveLocalPost(post),
});

/**
 * Posts desta conta, na forma assinada, cada um com a mídia guardada (ou `null`).
 * @param {string} me rota da conta (`vx_…`)
 * @param {{ filter?: (post: object) => boolean, store?: object }} [opts] `filter` recorta (o período do backup)
 * @returns {Promise<Array<{ post: object, blob: object | null }>>}
 */
export async function collectOwnPostEntries(me, { filter = () => true, store = cacheNode } = {}) {
  if (!me) return [];
  const screen = new Map((await store.getAllLocalPosts()).map((p) => [p.id, p]));
  const entries = [];
  for (const post of await store.getWirePosts()) {
    if ((post.author || post.owner) !== me || !filter(post)) continue;
    entries.push({ post, blob: mediaBlob.blobFromLocalPost(screen.get(post.id) || {}) });
  }
  return entries;
}

async function restoreEntry(entry, me, d) {
  const post = entry?.post;
  if (!post?.id || !post.sig || post.author !== me || isBeforeGenesisMs(post.ts || 0)) return false;
  if (await d.isSuperseded(post)) return false;
  if (!(await d.verify(post))) return false;
  const blob = await d.blobForPost(post, entry.blob || null);
  return d.save(mediaBlob.withLocalMedia(post, blob));
}

/**
 * Devolve ao aparelho os posts que conferem; o resto fica de fora e é contado.
 * @param {Array<{ post: object, blob?: object | null }>} entries
 * @param {string} me rota da conta atual
 * @param {object} [deps] para testes
 * @returns {Promise<{ restored: number, skipped: number }>}
 */
export async function restoreOwnPostEntries(entries, me, deps = DEFAULT_DEPS) {
  const d = { ...DEFAULT_DEPS, ...deps };
  let restored = 0;
  let skipped = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (await restoreEntry(entry, me, d)) restored++;
    else skipped++;
  }
  return { restored, skipped };
}

/**
 * Arquivo "Baixar meus posts": JSON legível, sem cifra (os posts já são públicos na rede).
 * @param {string} me
 * @param {Array<{ post: object, blob: object | null }>} entries
 * @param {number} [now]
 * @returns {{ name: string, text: string, count: number }}
 */
export function buildOwnPostsFile(me, entries, now = Date.now()) {
  const body = { type: OWN_POSTS_TYPE, v: OWN_POSTS_VERSION, author: me, exportedAt: now, count: entries.length, entries };
  const day = new Date(now).toISOString().slice(0, 10);
  return { name: `vox-meus-posts-${day}.json`, text: JSON.stringify(body), count: entries.length };
}

/**
 * Lê o arquivo. Lança com mensagem para a pessoa se não for um arquivo de posts do Vox.
 * @param {string} text
 * @returns {{ author: string, entries: Array<object> }}
 */
export function parseOwnPostsFile(text) {
  let body = null;
  try {
    body = JSON.parse(String(text || ""));
  } catch {
    body = null;
  }
  if (body?.type !== OWN_POSTS_TYPE || typeof body.author !== "string" || !Array.isArray(body.entries)) {
    throw new Error("Este arquivo não é um arquivo de posts do Vox.");
  }
  return { author: body.author, entries: body.entries };
}

/**
 * Monta o arquivo com os posts desta conta.
 * @param {number} [now]
 * @returns {Promise<{ name: string, text: string, count: number }>}
 */
export async function exportOwnPosts(now = Date.now()) {
  const me = await localAccount.getRouteId();
  return buildOwnPostsFile(me, await collectOwnPostEntries(me), now);
}

/**
 * Restaura de um arquivo. Posts de outra conta não entram.
 * @param {string} text
 * @returns {Promise<{ restored: number, skipped: number }>}
 */
export async function importOwnPosts(text) {
  const { author, entries } = parseOwnPostsFile(text);
  const me = await localAccount.getRouteId();
  if (author !== me) throw new Error("Estes posts são de outra conta. Entre nela primeiro (Perfil → Restaurar Backup).");
  return restoreOwnPostEntries(entries, me);
}
