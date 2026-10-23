/**
 * Semeador idempotente do Tour Demo (5 perfis educativos).
 * Persiste tópicos no IndexedDB local-posts sem assinar via gossip,
 * permitindo explorar a UI, comunidades e perfis sem gateways remotos.
 */

import * as cacheNode from "./cache-node.js";
import { MOCK_DEMO_COMMUNITY, MOCK_DEMO_TOPICS, MOCK_DEMO_REPLIES } from "./mock.js";

const SEED_KEY = "vox-demo-seeded-v1";

export async function ensureDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return;

  const alreadySeeded = window.localStorage.getItem(SEED_KEY);
  if (alreadySeeded) {
    const probe = await cacheNode.getLocalPost("demo-post-lia");
    if (probe) return;
  }

  await insertDemoItems();
  window.localStorage.setItem(SEED_KEY, "true");
}

async function insertDemoItems() {
  const baseTs = Date.now();

  // 1. Comunidade demo
  await cacheNode.saveLocalPost({
    id: MOCK_DEMO_COMMUNITY.id,
    type: "community",
    communityId: MOCK_DEMO_COMMUNITY.id,
    title: MOCK_DEMO_COMMUNITY.title,
    description: MOCK_DEMO_COMMUNITY.description,
    category: MOCK_DEMO_COMMUNITY.category,
    author: MOCK_DEMO_COMMUNITY.author,
    ts: baseTs - 600000,
  });

  // 2. Tópicos das 5 personas
  for (let i = 0; i < MOCK_DEMO_TOPICS.length; i++) {
    const t = MOCK_DEMO_TOPICS[i];
    await cacheNode.saveLocalPost({
      id: t.id,
      type: "topic",
      communityId: t.communityId,
      title: t.title,
      body: t.body,
      author: t.author,
      ts: baseTs - (5 - i) * 100000,
    });
  }

  // 3. Resposta demo na thread
  for (const r of MOCK_DEMO_REPLIES) {
    await cacheNode.saveLocalPost({
      id: r.id,
      type: "reply",
      communityId: r.communityId,
      replyTo: r.replyTo,
      body: r.body,
      author: r.author,
      ts: baseTs - 50000,
    });
  }
}

export async function resetDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SEED_KEY);
  await insertDemoItems();
  window.localStorage.setItem(SEED_KEY, "true");
}
