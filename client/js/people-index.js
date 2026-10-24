/** Índice local de pessoas para busca (V-DIS-13). */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as mock from "./mock.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "./vox-welcome-profile.js";
import * as profileDirectory from "./profile-directory.js";

export async function buildPeopleIndex() {
  const map = new Map();

  const welcome = getWelcomeProfile();
  map.set(WELCOME_ROUTE_ID, {
    routeId: WELCOME_ROUTE_ID,
    name: welcome.name,
    handle: welcome.handle,
    source: "system",
  });

  for (const c of contacts.listContacts()) {
    map.set(c.routeId, {
      routeId: c.routeId,
      name: c.label || profileDirectory.getAuthorDisplaySync(c.routeId) || c.routeId,
      handle: "",
      source: "contact",
    });
  }

  const posts = await cacheNode.getLocalPosts({});
  for (const p of posts) {
    const author = p.author || p.owner;
    if (!author || map.has(author)) continue;
    map.set(author, {
      routeId: author,
      name: profileDirectory.getAuthorDisplaySync(author) || author.slice(0, 14),
      handle: mock.getAuthorHandle(author),
      source: "local-post",
    });
  }

  for (const [routeId, prof] of Object.entries(mock.MOCK_DEMO_PROFILES || {})) {
    if (!map.has(routeId)) {
      map.set(routeId, { routeId, name: prof.name, handle: prof.handle || "", source: "demo" });
    }
  }

  return Array.from(map.values());
}

export async function searchPeople(query) {
  const q = String(query || "").trim().toLowerCase();
  const all = await buildPeopleIndex();
  if (!q) return all.slice(0, 50);
  return all.filter((p) => {
    const hay = `${p.name} ${p.handle} ${p.routeId}`.toLowerCase();
    return hay.includes(q);
  });
}

export function extractRecentAuthors(topics, limit = 8) {
  const out = [];
  const seen = new Set();
  for (const t of topics || []) {
    const author = t.author || t.owner;
    if (!author || seen.has(author)) continue;
    seen.add(author);
    out.push({
      routeId: author,
      name: profileDirectory.getAuthorDisplaySync(author) || author.slice(0, 14),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseConnectTarget(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const connectMatch = raw.match(/#\/connect\/([^/?#]+)/i) || raw.match(/connect\/([^/?#]+)/i);
  if (connectMatch) return decodeURIComponent(connectMatch[1]);
  if (raw.startsWith("vx_")) return raw.split(/\s/)[0];
  return null;
}
