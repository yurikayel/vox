/**
 * Purgador ativo de dados mock legados do IndexedDB local.
 * Garante que a rede permaneça 100% limpa, sem perfis ou comunidades sintéticas.
 */

import * as cacheNode from "./cache-node.js";
import { UF_ROUTE_IDS } from "./data/profiles-brazil-uf.js";

const SEED_KEY = "vox-demo-seeded-v12-uf27-common-names";
const PURGE_KEY = "vox-mock-purged-v1";

export async function purgeMockDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return 0;

  try {
    window.localStorage.removeItem(SEED_KEY);
    window.localStorage.setItem(PURGE_KEY, "true");
  } catch {}

  let removedCount = 0;
  try {
    const allPosts = await cacheNode.getLocalPosts({});
    for (const p of allPosts) {
      const isMockId = String(p.id || "").startsWith("demo-") || String(p.communityId || "").startsWith("demo-");
      const isMockAuthor = String(p.author || "").startsWith("vx_demo_") || (Array.isArray(UF_ROUTE_IDS) && UF_ROUTE_IDS.includes(p.author));
      if (isMockId || isMockAuthor) {
        await cacheNode.deleteLocalPost(p.id);
        removedCount++;
      }
    }
  } catch {}

  try {
    const communities = await cacheNode.getLocalCommunities();
    for (const c of communities) {
      if (String(c.id || "").startsWith("demo-")) {
        await cacheNode.deleteLocalPost(c.id);
        removedCount++;
      }
    }
  } catch {}

  return removedCount;
}

export async function ensureDemoSeed() {
  return purgeMockDemoSeed();
}

export async function resetDemoSeed() {
  return purgeMockDemoSeed();
}
