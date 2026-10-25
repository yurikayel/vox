/**
 * Semeador idempotente — 27 perfis UF demo no IndexedDB local.
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
  MOCK_DEMO_TOPIC_COUNT,
} from "./mock.js";
import { UF_ROUTE_IDS } from "./data/profiles-brazil-uf.js";

const SEED_KEY = "vox-demo-seeded-v12-uf27-common-names";

export async function ensureDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return;

  const alreadySeeded = window.localStorage.getItem(SEED_KEY);
  if (alreadySeeded) {
    const probe = await cacheNode.getLocalPost("demo-post-mg");
    const probeListing = await cacheNode.getLocalPost("demo-listing-mg");
    const probeProposal = await cacheNode.getLocalPost("demo-prop-feira");
    const probeInteraction = await cacheNode.getLocalPost("demo-reply-ce-ma-0");
    const existing = await cacheNode.getLocalPosts({ type: "topic", communityId: MOCK_DEMO_COMMUNITY.id });
    if (probe && probeListing && probeProposal && probeInteraction && existing.length >= MOCK_DEMO_TOPIC_COUNT) {
      return;
    }
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
  for (let i = 0; i < 2; i++) {
    const c = i === 0 ? MOCK_DEMO_COMMUNITY : MOCK_DEMO_COMMUNITY_FEIRA;
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
      ts: t.ts || (baseTs - (MOCK_DEMO_TOPICS.length - i) * 100000),
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
  const demoAuthors = UF_ROUTE_IDS.slice(0, 12);
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
    await cacheNode.saveLocalPost({ ...p, ts: p.createdAt || (baseTs - 86400000) });
  }
}

async function seedVotes() {
  for (const propId of Object.keys(MOCK_DEMO_VOTES)) {
    for (const v of MOCK_DEMO_VOTES[propId]) {
      await cacheNode.saveLocalPost({ ...v });
    }
  }
}

export async function resetDemoSeed() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SEED_KEY);
  await insertDemoItems();
  window.localStorage.setItem(SEED_KEY, "true");
}
