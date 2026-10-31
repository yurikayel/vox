/**
 * Purgador ativo de dados mock legados do IndexedDB local.
 * Garante que a rede permaneça 100% limpa, sem perfis ou comunidades sintéticas.
 */

import * as cacheNode from "./cache-node.js";
import { UF_ROUTE_IDS } from "./data/profiles-brazil-uf.js";

const SEED_KEY = "vox-demo-seeded-v12-uf27-common-names";
const PURGE_KEY = "vox-mock-purged-v1";

function markDemoPurgedInStorage() {
  try {
    window.localStorage.removeItem(SEED_KEY);
    window.localStorage.setItem(PURGE_KEY, "true");
  } catch {}
}

function isMockPost(p) {
  if (!p) return false;
  const id = String(p.id || "");
  const communityId = String(p.communityId || "");
  const author = String(p.author || "");
  if (id.startsWith("demo-") || communityId.startsWith("demo-")) return true;
  if (author.startsWith("vx_demo_")) return true;
  return Array.isArray(UF_ROUTE_IDS) && UF_ROUTE_IDS.includes(author);
}

async function purgeMockPosts() {
  let count = 0;
  try {
    const allPosts = await cacheNode.getLocalPosts({});
    for (const p of allPosts) {
      if (isMockPost(p)) {
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

export async function purgeMockDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  markDemoPurgedInStorage();
  const removedPosts = await purgeMockPosts();
  const removedCommunities = await purgeMockCommunities();
  return removedPosts + removedCommunities;
}

export async function ensureDemoSeed() {
  return purgeMockDemoSeed();
}

export async function resetDemoSeed() {
  return purgeMockDemoSeed();
}
