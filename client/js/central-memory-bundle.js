/**
 * @file Pacote local enviado à memória central: posts, lápides, manifestos e cartões mais novos que o cursor,
 * com os blobs de mídia sem repetir.
 *
 * O cursor ({@link syncCursor}) é lido aqui e gravado pela sincronização em `central-memory.js`.
 *
 * @module central-memory-bundle
 */
import * as cacheNode from "./cache-node.js";
import * as hydrate from "./central-memory-hydrate.js";
import * as mediaBlob from "./media-blob.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as profileDirectory from "./profile-directory.js";
import { syncLocalAccountsToProfileDirectory } from "./central-memory-directory.js";

/**
 * Cursor da sincronização: revisão e data do servidor e início da última sincronização local (ms).
 *
 * @type {{ lastServerRevision: number, lastServerTimestamp: number, lastLocalSyncMs: number }}
 */
export const syncCursor = { lastServerRevision: 0, lastServerTimestamp: 0, lastLocalSyncMs: 0 };

/**
 * Extrai o hash do blob de mídia de um post.
 * @param {object} post Post
 * @returns {string} Hash, ou texto vazio.
 */
function extractPostBlobHash(post) {
  if (!post || typeof post !== "object") return "";
  if (post.mediaRef && post.mediaRef.hash) return post.mediaRef.hash;
  if (post.mediaBlob && post.mediaBlob.hash) return post.mediaBlob.hash;
  return "";
}

/**
 * Resolve o blob de mídia de um post, do próprio post ou do cache.
 * @param {object} post Post
 * @param {string} hash Hash do blob
 * @returns {Promise<object|null>} Blob ou `null`.
 */
async function resolveBlobForPost(post, hash) {
  if (post.mediaBlob && post.mediaBlob.data) {
    return post.mediaBlob;
  }
  return mediaBlob.defaultBlobStorage.get(hash);
}

/**
 * Reúne os blobs locais dos posts, sem repetir.
 * @param {object[]} posts Posts
 * @returns {Promise<object[]>} Blobs.
 */
async function collectLocalBlobs(posts) {
  const blobs = [];
  const seen = new Set();
  for (const post of posts) {
    const hash = extractPostBlobHash(post);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    const stored = await resolveBlobForPost(post, hash);
    if (stored && stored.hash && stored.data) {
      blobs.push(stored);
    }
  }
  return blobs;
}

/**
 * Filtra os itens mais novos que a marca d'água.
 * @param {object[]} items Itens
 * @param {number} watermarkMs Marca d'água em ms
 * @returns {object[]} Itens novos.
 */
function filterDeltaItems(items, watermarkMs) {
  if (watermarkMs <= 0) return items;
  return items.filter((it) => hydrate.itemTimestamp(it) >= watermarkMs);
}

/**
 * Lista os hashes de blob conhecidos nos posts.
 * @param {object[]} posts Posts
 * @returns {string[]} Hashes.
 */
function listKnownBlobHashes(posts) {
  const hashes = new Set();
  for (const post of posts) {
    const h = extractPostBlobHash(post);
    if (h && mediaBlob.defaultBlobStorage.has(h)) hashes.add(h);
  }
  return [...hashes];
}

/**
 * Monta o pacote local (posts, lápides, blobs) para enviar à memória central.
 * @returns {Promise<object>} Pacote de sincronização.
 */
export async function buildLocalSyncBundle() {
  const [allPosts, allTombstones] = await Promise.all([
    cacheNode.getWirePosts(),
    cacheNode.getAllTombstones(),
  ]);
  syncLocalAccountsToProfileDirectory(allPosts);
  const posts = filterDeltaItems(allPosts, syncCursor.lastLocalSyncMs);
  const tombstones = filterDeltaItems(allTombstones, syncCursor.lastLocalSyncMs);
  const profiles = profileDirectory.listShareableProfileCards();
  const manifests = filterDeltaItems(manifestMesh.listKnownManifests(), syncCursor.lastLocalSyncMs);
  const blobs = await collectLocalBlobs(posts);
  return {
    posts,
    tombstones,
    profiles,
    manifests,
    blobs,
    includeBlobs: true,
    clientRevision: syncCursor.lastServerRevision,
    since: syncCursor.lastServerTimestamp,
    knownBlobs: listKnownBlobHashes(allPosts),
  };
}
