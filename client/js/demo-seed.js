/**
 * Semeador idempotente do Tour Demo (10 perfis educativos).
 * Persiste tópicos, feira e propostas de governança no IndexedDB local-posts sem assinar via gossip,
 * permitindo explorar a UI, comunidades, classificados e deliberações sem gateways remotos.
 */

import * as cacheNode from "./cache-node.js";
import {
  MOCK_DEMO_COMMUNITY,
  MOCK_DEMO_COMMUNITY_FEIRA,
  MOCK_DEMO_TOPICS,
  MOCK_DEMO_LISTINGS,
  MOCK_DEMO_REPLIES,
  MOCK_DEMO_PROPOSALS,
  MOCK_DEMO_VOTES,
} from "./mock.js";

const SEED_KEY = "vox-demo-seeded-v6";

export async function ensureDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return;

  const alreadySeeded = window.localStorage.getItem(SEED_KEY);
  if (alreadySeeded) {
    const probe = await cacheNode.getLocalPost("demo-post-helena");
    const probeListing = await cacheNode.getLocalPost("demo-listing-helena");
    const probeProposal = await cacheNode.getLocalPost("demo-prop-feira");
    const existing = await cacheNode.getLocalPosts({ type: "topic", communityId: MOCK_DEMO_COMMUNITY.id });
    if (probe && probe.image && probeListing && probeProposal && existing.length >= 10) return;
  }

  await insertDemoItems();
  window.localStorage.setItem(SEED_KEY, "true");
}

async function insertDemoItems() {
  const baseTs = Date.now();
  await seedCommunities(baseTs);
  await seedTopics(baseTs);
  await seedListings(baseTs);
  await seedReplies(baseTs);
  await seedMemberships(baseTs);
  await seedProposals(baseTs);
  await seedVotes(baseTs);
}

async function seedCommunities(baseTs) {
  const comms = [MOCK_DEMO_COMMUNITY, MOCK_DEMO_COMMUNITY_FEIRA];
  for (let i = 0; i < comms.length; i++) {
    const c = comms[i];
    await cacheNode.saveLocalPost({
      id: c.id,
      type: "community",
      communityId: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      author: c.author,
      commercialEnabled: Boolean(c.commercialEnabled),
      ts: baseTs - (1200000 - i * 60000),
    });
  }
}

async function seedTopics(baseTs) {
  for (let i = 0; i < MOCK_DEMO_TOPICS.length; i++) {
    const t = MOCK_DEMO_TOPICS[i];
    await cacheNode.saveLocalPost({
      id: t.id,
      type: "topic",
      communityId: t.communityId,
      title: t.title,
      body: t.body,
      author: t.author,
      image: t.image || "",
      imageAlt: t.imageAlt || "",
      externalPain: t.externalPain || "",
      voxResolution: t.voxResolution || "now",
      likesCount: t.likesCount || 0,
      repliesCount: t.repliesCount || 0,
      ts: t.ts || (baseTs - (10 - i) * 100000),
    });
  }
}

async function seedListings(baseTs) {
  for (let i = 0; i < MOCK_DEMO_LISTINGS.length; i++) {
    const l = MOCK_DEMO_LISTINGS[i];
    await cacheNode.saveLocalPost({
      id: l.id,
      type: "listing",
      communityId: l.communityId,
      title: l.title,
      body: l.body,
      priceLabel: l.priceLabel || "",
      locationLabel: l.locationLabel || "",
      contactPix: l.contactPix || "",
      listingStatus: l.listingStatus || "available",
      image: l.image || "",
      imageAlt: l.imageAlt || "",
      author: l.author,
      likesCount: l.likesCount || 0,
      repliesCount: l.repliesCount || 0,
      ts: l.ts || (baseTs - (4 - i) * 60000),
    });
  }
}

async function seedReplies(baseTs) {
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

async function seedMemberships(baseTs) {
  const demoAuthors = [
    "vx_demo_helena",
    "vx_demo_juliana",
    "vx_demo_lucas",
    "vx_demo_raj",
    "vx_demo_yara",
    "vx_demo_carlos",
    "vx_demo_ana",
    "vx_demo_mateus",
    "vx_demo_bia",
    "vx_demo_fernando",
  ];
  for (let i = 0; i < demoAuthors.length; i++) {
    const author = demoAuthors[i];
    await cacheNode.saveLocalPost({
      id: `mem_demo-aprenda-vox_${author}`,
      type: "membership",
      communityId: "demo-aprenda-vox",
      author,
      joinedAt: baseTs - (120 * 3600 * 1000 - i * 1000),
      ts: baseTs - (120 * 3600 * 1000 - i * 1000),
    });
  }
}

async function seedProposals(baseTs) {
  for (const p of MOCK_DEMO_PROPOSALS) {
    await cacheNode.saveLocalPost({
      ...p,
      ts: p.createdAt || (baseTs - 86400000),
    });
  }
}

async function seedVotes() {
  for (const propId of Object.keys(MOCK_DEMO_VOTES)) {
    const list = MOCK_DEMO_VOTES[propId];
    for (const v of list) {
      await cacheNode.saveLocalPost({
        ...v,
      });
    }
  }
}

export async function resetDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SEED_KEY);
  await insertDemoItems();
  window.localStorage.setItem(SEED_KEY, "true");
}
