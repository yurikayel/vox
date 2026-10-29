/** Índice local de pessoas para busca (V-DIS + V-MESH P1/P2). */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as handles from "./handles.js";
import * as mock from "./mock.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "./vox-welcome-profile.js";
import * as profileDirectory from "./profile-directory.js";

const MESH_POST_TYPES = new Set(["topic", "reply", "membership"]);
export const PEOPLE_SEARCH_OK_METRIC = "vox-metric-people-search-ok";

function upsert(map, entry, preferSources = []) {
  const existing = map.get(entry.routeId);
  if (!existing) {
    map.set(entry.routeId, entry);
    return;
  }
  const rank = (s) => {
    const i = preferSources.indexOf(s);
    return i >= 0 ? i : 99;
  };
  if (rank(entry.source) < rank(existing.source)) {
    map.set(entry.routeId, { ...existing, ...entry, source: entry.source });
  }
}

async function indexMeshAuthors(map) {
  const posts = await cacheNode.getLocalPosts({});
  for (const p of posts) {
    if (!MESH_POST_TYPES.has(p.type)) continue;
    const author = p.author || p.owner;
    if (!author) continue;
    upsert(
      map,
      {
        routeId: author,
        name: profileDirectory.getAuthorDisplaySync(author) || author.slice(0, 14),
        handle: mock.getAuthorHandle(author),
        source: "mesh-author",
      },
      ["contact", "mesh-card", "mesh-author"],
    );
  }
}

function indexMeshCards(map) {
  for (const card of profileDirectory.listDiscoverableProfileCards()) {
    const routeId = card.routeId;
    upsert(
      map,
      {
        routeId,
        name: card.name || profileDirectory.getAuthorDisplaySync(routeId) || routeId.slice(0, 14),
        handle: card.handle || mock.getAuthorHandle(routeId),
        source: "mesh-card",
      },
      ["contact", "mesh-card", "mesh-author"],
    );
  }
}

function indexDemo() {
  // Perfis mock removidos: nenhuma conta sintética é indexada no diretório
}

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

  await indexMeshAuthors(map);
  indexMeshCards(map);

  const meshOrContactCount =
    [...map.values()].filter((p) => p.source === "contact" || p.source === "mesh-author" || p.source === "mesh-card")
      .length;

  indexDemo(map, meshOrContactCount > 0);

  return Array.from(map.values());
}

export async function buildPeopleSections() {
  const all = await buildPeopleIndex();
  const contactsList = all.filter((p) => p.source === "contact" || p.source === "system");
  const mesh = all.filter((p) => p.source === "mesh-author" || p.source === "mesh-card");
  const tour = all.filter((p) => p.source === "demo");
  return { contacts: contactsList, mesh, tour, all };
}

export function recordPeopleSearchOk() {
  try {
    localStorage.setItem(PEOPLE_SEARCH_OK_METRIC, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export async function searchPeople(query) {
  const q = String(query || "").trim();
  const all = await buildPeopleIndex();
  if (!q) return all.slice(0, 50);

  let handleRoute = "";
  if (q.startsWith("@")) {
    const mapped = handles.getCachedHandleMapping(q);
    if (mapped) handleRoute = mapped;
  }
  if (handleRoute && !all.some((p) => p.routeId === handleRoute)) {
    all.push({
      routeId: handleRoute,
      name: profileDirectory.getAuthorDisplaySync(handleRoute) || handleRoute.slice(0, 14),
      handle: handles.getCachedAddressHandle(handleRoute) || handles.normalizeSlug(q),
      source: "handle-cache",
    });
  }

  const ql = q.toLowerCase();
  const results = all.filter((p) => {
    if (handleRoute && p.routeId === handleRoute) return true;
    const hay = `${p.name} ${p.handle} ${p.routeId}`.toLowerCase();
    return hay.includes(ql);
  });
  if (results.length > 0) recordPeopleSearchOk();
  return results;
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
