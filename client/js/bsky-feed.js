/** @file Ingestão predatória soberana de feeds do Bluesky (AT Protocol) — 100% client-side via API pública. */

export const BSKY_SUBS_STORAGE_KEY = "vox-bsky-subs-v1";
export const BSKY_POST_CACHE_KEY = "vox-bsky-cached-posts-v1";
export const BSKY_PUBLIC_ENDPOINT = "https://public.api.bsky.app/xrpc";
export const BSKY_DEFAULT_SEEDS = ["lula.com.br", "brasildefato.com.br", "theintercept.com"];

export const BSKY_CIVIC_SUGGESTIONS = Object.freeze([
  { handle: "lula.com.br", label: "Lula" },
  { handle: "brasildefato.com.br", label: "Brasil de Fato" },
  { handle: "theintercept.com", label: "The Intercept" },
  { handle: "apublica.org", label: "Agência Pública" },
  { handle: "cartacapital.com.br", label: "CartaCapital" },
]);

export function loadBskySubscriptions() {
  if (typeof localStorage === "undefined") return [...BSKY_DEFAULT_SEEDS];
  try {
    const raw = localStorage.getItem(BSKY_SUBS_STORAGE_KEY);
    if (!raw) return [...BSKY_DEFAULT_SEEDS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...BSKY_DEFAULT_SEEDS];
  } catch {
    return [...BSKY_DEFAULT_SEEDS];
  }
}

export function saveBskySubscriptions(handles) {
  if (typeof localStorage === "undefined") return;
  const clean = Array.from(
    new Set(
      (Array.isArray(handles) ? handles : [])
        .map((h) => String(h || "").trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 50);
  localStorage.setItem(BSKY_SUBS_STORAGE_KEY, JSON.stringify(clean));
}

export function addBskySubscription(handle) {
  const current = loadBskySubscriptions();
  const clean = String(handle || "").trim().replace(/^@/, "").toLowerCase();
  if (!clean || current.includes(clean)) return current;
  const next = [clean, ...current];
  saveBskySubscriptions(next);
  return next;
}

export function removeBskySubscription(handle) {
  const current = loadBskySubscriptions();
  const clean = String(handle || "").trim().replace(/^@/, "").toLowerCase();
  const next = current.filter((h) => h !== clean);
  saveBskySubscriptions(next);
  return next;
}

export function getCachedBskyPosts() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(BSKY_POST_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cacheBskyPosts(posts) {
  if (typeof localStorage === "undefined" || !Array.isArray(posts) || !posts.length) return;
  try {
    const existing = getCachedBskyPosts();
    const map = new Map();
    for (const p of [...posts, ...existing]) {
      if (p?.id && !map.has(p.id)) map.set(p.id, p);
    }
    const merged = Array.from(map.values()).slice(0, 60);
    localStorage.setItem(BSKY_POST_CACHE_KEY, JSON.stringify(merged));
  } catch {}
}

export function getCachedBskyPostById(id) {
  if (!id) return null;
  return getCachedBskyPosts().find((p) => p.id === id) || null;
}

export function buildBskyAuthorFeedUrl(actor, limit = 20) {
  const a = encodeURIComponent(String(actor || "").trim().replace(/^@/, ""));
  return `${BSKY_PUBLIC_ENDPOINT}/app.bsky.feed.getAuthorFeed?actor=${a}&limit=${limit}`;
}

export function buildBskyFollowsUrl(actor, limit = 50) {
  const a = encodeURIComponent(String(actor || "").trim().replace(/^@/, ""));
  return `${BSKY_PUBLIC_ENDPOINT}/app.bsky.graph.getFollows?actor=${a}&limit=${limit}`;
}

export async function fetchBskyFollows(actor, limit = 50) {
  const clean = String(actor || "").trim().replace(/^@/, "");
  if (!clean) return [];
  try {
    const res = await fetch(buildBskyFollowsUrl(clean, limit), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const follows = Array.isArray(data?.follows) ? data.follows : [];
    return follows.map((f) => f?.handle).filter(Boolean);
  } catch {
    return [];
  }
}

export async function importBskyFollows(actor, limit = 50) {
  const follows = await fetchBskyFollows(actor, limit);
  if (!follows.length) return { added: 0, total: loadBskySubscriptions().length };
  const current = loadBskySubscriptions();
  const next = Array.from(new Set([...follows, ...current])).slice(0, 50);
  saveBskySubscriptions(next);
  return { added: next.length - current.length, total: next.length };
}

export function exportBskySubscriptionsJson() {
  const subs = loadBskySubscriptions();
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), subscriptions: subs }, null, 2);
}

export function importSubscriptionsList(rawText) {
  if (!rawText || typeof rawText !== "string") return 0;
  let handles = [];
  try {
    const parsed = JSON.parse(rawText);
    handles = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : [];
  } catch {
    handles = rawText.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
  }
  const clean = handles.map((h) => String(h).trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  if (!clean.length) return 0;
  const current = loadBskySubscriptions();
  const merged = Array.from(new Set([...clean, ...current])).slice(0, 50);
  saveBskySubscriptions(merged);
  return merged.length - current.length;
}

export function quoteExternalPostText(post) {
  const handle = post?.authorHandle || "@bluesky";
  const url = post?.externalUrl || "";
  const body = String(post?.body || post?.title || "").slice(0, 320);
  return `> 🌐 **Citação Soberana de ${handle}** ([Ver original](${url})):\n> "${body}"\n\n`;
}

export function extractPostImage(embed) {
  if (!embed) return "";
  if (Array.isArray(embed.images) && embed.images.length) {
    return embed.images[0].fullsize || embed.images[0].thumb || "";
  }
  if (embed.media && Array.isArray(embed.media.images) && embed.media.images.length) {
    return embed.media.images[0].fullsize || embed.media.images[0].thumb || "";
  }
  return embed.thumbnail || "";
}

export function normalizeBskyPost(item) {
  const p = item?.post;
  if (!p) return null;
  const r = p.record || {};
  const author = p.author || {};
  const uriParts = String(p.uri || "").split("/");
  const rkey = uriParts[uriParts.length - 1] || "";
  const handle = author.handle || "bluesky";
  const text = String(r.text || "").trim();

  return {
    id: `bsky_${p.cid || rkey}`,
    type: "topic",
    isExternal: true,
    externalSource: "bluesky",
    externalUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
    author: author.displayName || handle,
    authorDisplay: author.displayName || handle,
    authorHandle: `@${handle.replace(/^@/, "")}`,
    authorAvatar: author.avatar || "",
    title: text.slice(0, 90) || `Post de @${handle} no Bluesky`,
    body: text,
    image: extractPostImage(p.embed),
    likesCount: Number(p.likeCount) || 0,
    repliesCount: Number(p.replyCount) || 0,
    repostsCount: Number(p.repostCount) || 0,
    ts: new Date(r.createdAt || p.indexedAt || Date.now()).getTime(),
  };
}

export async function fetchBskyAuthorFeed(handle, limit = 15) {
  const clean = String(handle || "").trim().replace(/^@/, "");
  if (!clean) return [];
  try {
    const res = await fetch(buildBskyAuthorFeedUrl(clean, limit), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const feed = Array.isArray(data?.feed) ? data.feed : [];
    const posts = feed.map(normalizeBskyPost).filter(Boolean);
    cacheBskyPosts(posts);
    return posts;
  } catch {
    return [];
  }
}

export async function fetchAggregatedBskyFeed(handles = loadBskySubscriptions(), limitPerUser = 12) {
  const list = (Array.isArray(handles) ? handles : []).slice(0, 15);
  if (!list.length) return [];

  const results = await Promise.allSettled(list.map((h) => fetchBskyAuthorFeed(h, limitPerUser)));
  const posts = [];
  const seen = new Set();

  for (const r of results) {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
    for (const p of r.value) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        posts.push(p);
      }
    }
  }
  const sorted = posts.sort((a, b) => b.ts - a.ts);
  cacheBskyPosts(sorted);
  return sorted;
}
