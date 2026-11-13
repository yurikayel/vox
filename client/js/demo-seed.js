/**
 * Purgador ativo de dados mock legados do IndexedDB local.
 * Garante que a rede permaneça 100% limpa, sem perfis ou comunidades sintéticas.
 */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as profileDirectory from "./profile-directory.js";
import { UF_ROUTE_IDS } from "./data/profiles-brazil-uf.js";
import { isBeforeGenesisMs, isTestRouteId } from "./genesis.js";

const SEED_KEY = "vox-demo-seeded-v12-uf27-common-names";
const PURGE_KEY = "vox-mock-purged-v1";

function markDemoPurgedInStorage() {
  try {
    window.localStorage.removeItem(SEED_KEY);
    window.localStorage.setItem(PURGE_KEY, "true");
  } catch {}
}

function isOldOrMockPost(p) {
  if (!p) return false;
  const id = String(p.id || "");
  const communityId = String(p.communityId || "");
  const author = String(p.author || "");
  if (id.startsWith("demo-") || communityId.startsWith("demo-")) return true;
  if (author.startsWith("vx_demo_") || isTestRouteId(author)) return true;
  if (Array.isArray(UF_ROUTE_IDS) && UF_ROUTE_IDS.includes(author)) return true;
  const ts = p.ts || p.timestamp || 0;
  return isBeforeGenesisMs(ts);
}

function isTestAccount(routeId) {
  return routeId === "vx_WAqxgW" || isTestRouteId(routeId);
}

/** Cartões de conta de teste ou anteriores à gênese; o diretório é quem grava a chave dele. */
function purgeOldProfileCards() {
  profileDirectory.removeProfileCardsWhere((c, id) => {
    const ts = c?.updatedAt || c?.timestamp || c?.ts || 0;
    return isTestAccount(id) || isBeforeGenesisMs(ts);
  });
}

/** Contas de teste na agenda; a agenda é quem grava a chave dela. */
function purgeTestContacts() {
  for (const c of contacts.listContacts()) {
    if (isTestAccount(c?.routeId)) contacts.removeContact(c.routeId);
  }
}

async function purgeMockPosts() {
  let count = 0;
  try {
    const allPosts = await cacheNode.getLocalPosts({});
    for (const p of allPosts) {
      if (isOldOrMockPost(p)) {
        await cacheNode.deleteLocalPost(p.id);
        count++;
      }
    }
  } catch {}
  return count;
}

async function purgeMockCommunities() {
  let count = 0;
  try {
    const communities = await cacheNode.getLocalCommunities();
    for (const c of communities) {
      if (String(c.id || "").startsWith("demo-")) {
        await cacheNode.deleteLocalPost(c.id);
        count++;
      }
    }
  } catch {}
  return count;
}

/**
 * Purgador geral de dados legados, posts de teste e perfis anteriores à gênese.
 * @returns {Promise<number>} Quantidade de itens removidos.
 */
export async function purgeMockDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  markDemoPurgedInStorage();
  purgeOldProfileCards();
  purgeTestContacts();
  const removedPosts = await purgeMockPosts();
  const removedCommunities = await purgeMockCommunities();
  return removedPosts + removedCommunities;
}

/**
 * Purgador idempotente de seed de demonstração.
 * @returns {Promise<number>} Quantidade de itens removidos.
 */
export async function ensureDemoSeed() {
  return purgeMockDemoSeed();
}

/**
 * Reinicialização do purgador de seed de demonstração.
 * @returns {Promise<number>} Quantidade de itens removidos.
 */
export async function resetDemoSeed() {
  return purgeMockDemoSeed();
}
