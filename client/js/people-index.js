/** Índice local de pessoas para busca (V-DIS + V-MESH P1/P2). */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as handles from "./handles.js";
import * as mock from "./mock.js";
import { getWelcomeProfile, WELCOME_ROUTE_ID } from "./vox-welcome-profile.js";
import * as profileDirectory from "./profile-directory.js";
import * as localAccount from "./local-account.js";
import { shortId } from "./render/util.js";

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

function indexLocalAndVaultAccounts(map) {
  const myId = localAccount.getCachedRouteIdSync();
  if (myId) {
    const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
    upsert(
      map,
      {
        routeId: myId,
        name: myName || myId.slice(0, 14),
        handle: handles.getCachedAddressHandle(myId) || "",
        source: "self",
      },
      ["self", "contact", "vault", "mesh-card", "mesh-author"],
    );
  }

  if (typeof localAccount.listVaultAccountsSync === "function") {
    for (const v of localAccount.listVaultAccountsSync()) {
      if (!v?.routeId) continue;
      upsert(
        map,
        {
          routeId: v.routeId,
          name: v.displayName || profileDirectory.getAuthorDisplaySync(v.routeId) || v.routeId.slice(0, 14),
          handle: handles.getCachedAddressHandle(v.routeId) || "",
          source: "vault",
        },
        ["self", "contact", "vault", "mesh-card", "mesh-author"],
      );
    }
  }
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

  indexLocalAndVaultAccounts(map);

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

  return Array.from(map.values());
}

export async function buildPeopleSections() {
  const all = await buildPeopleIndex();
  const contactsList = all.filter(
    (p) => p.source === "contact" || p.source === "system" || p.source === "self" || p.source === "vault",
  );
  const mesh = all.filter(
    (p) => p.source === "mesh-author" || p.source === "mesh-card" || p.source === "route-direct",
  );
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

function resolveDirectRouteQuery(cleanQ, all) {
  const cleanQl = cleanQ.toLowerCase();
  if (cleanQl.startsWith("vx_") && cleanQl.length >= 6) {
    const already = all.some((p) => (p.routeId || "").toLowerCase().includes(cleanQl));
    if (!already) {
      const disp = profileDirectory.getAuthorDisplaySync(cleanQ);
      all.push({
        routeId: cleanQ,
        name: disp || cleanQ.slice(0, 14),
        handle: handles.getCachedAddressHandle(cleanQ) || "",
        source: "route-direct",
      });
    }
  }
}

function matchesPerson(p, ql, cleanQl, handleRoute) {
  if (handleRoute && p.routeId === handleRoute) return true;
  const pRoute = (p.routeId || "").toLowerCase();
  const pShort = shortId(p.routeId).toLowerCase();
  const pName = (p.name || "").toLowerCase();
  const pHandle = (p.handle || "").toLowerCase();

  if (cleanQl && (pRoute.startsWith(cleanQl) || pRoute.includes(cleanQl) || pShort.startsWith(cleanQl) || pShort.includes(cleanQl))) {
    return true;
  }
  if (pName.includes(ql) || (cleanQl && pName.includes(cleanQl))) return true;
  if (pHandle && (pHandle.includes(ql) || (cleanQl && pHandle.includes(cleanQl)))) return true;
  return false;
}

export async function searchPeople(query) {
  const q = String(query || "").trim();
  const all = await buildPeopleIndex();
  if (!q) return all.slice(0, 50);

  const cleanQ = q.replace(/^@/, "").trim();
  let handleRoute = "";
  if (q.startsWith("@") || cleanQ) {
    const mapped = handles.getCachedHandleMapping(q.startsWith("@") ? q : `@${cleanQ}`);
    if (mapped) handleRoute = mapped;
  }
  if (handleRoute && !all.some((p) => p.routeId === handleRoute)) {
    all.push({
      routeId: handleRoute,
      name: profileDirectory.getAuthorDisplaySync(handleRoute) || handleRoute.slice(0, 14),
      handle: handles.getCachedAddressHandle(handleRoute) || handles.normalizeSlug(cleanQ),
      source: "handle-cache",
    });
  }

  resolveDirectRouteQuery(cleanQ, all);

  const ql = q.toLowerCase();
  const cleanQl = cleanQ.toLowerCase();
  const results = all.filter((p) => matchesPerson(p, ql, cleanQl, handleRoute));

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
  const clean = raw.replace(/^@/, "").trim();
  if (clean.startsWith("vx_")) return clean.split(/\s/)[0];
  return null;
}
