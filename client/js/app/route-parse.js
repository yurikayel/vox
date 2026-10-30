/**
 * @module app/route-parse
 * Parser puro de `location.hash` e query `?h=` / `?labs=` — sem DOM side effects.
 */

function parseSearchHints() {
  if (typeof window === "undefined" || !window.location?.search) return null;
  const q = new URLSearchParams(window.location.search);
  const paramHandle = q.get("h");
  if (paramHandle) return { name: "handle-lookup", slug: paramHandle };
  if (q.get("labs") === "mofn") return { name: "labs-mofn" };
  return null;
}

function parseLabsHash(parts) {
  if (parts[0] !== "labs") return null;
  if (parts[1] === "mofn") return { name: "labs-mofn" };
  if (parts[1] === "frames") return { name: "labs-frames" };
  return null;
}

function parseSettingsRoute(parts) {
  if (parts[0] !== "settings") return null;
  if (parts[1] === "linked-accounts") return { name: "linked-accounts" };
  if (parts[1] === "network" && parts[2] === "steward") return { name: "steward-wizard" };
  return { name: "network-settings" };
}

const COMMUNITY_TAB_MAP = {
  listings: "listings",
  classificados: "listings",
  feira: "listings",
  governance: "governance",
  governanca: "governance",
  members: "members",
  membros: "members",
  online: "members",
};

function resolveCommunityTab(subPath, rawQueryTab) {
  const qTab = (rawQueryTab || "").toLowerCase();
  if (COMMUNITY_TAB_MAP[qTab]) return COMMUNITY_TAB_MAP[qTab];
  const sPath = (subPath || "").toLowerCase();
  return COMMUNITY_TAB_MAP[sPath] || "posts";
}

function parseCommunityRoute(parts, query) {
  if (parts[0] !== "c" || !parts[1]) return null;
  if (parts[2] === "proposal" && parts[3]) {
    return {
      name: "proposal",
      communityId: decodeURIComponent(parts[1]),
      proposalId: decodeURIComponent(parts[3]),
    };
  }
  return {
    name: "community",
    id: decodeURIComponent(parts[1]),
    tab: resolveCommunityTab(parts[2], query.get("tab")),
  };
}

function parseComposeRoute(parts, query) {
  if (parts[0] !== "compose") return null;
  if (parts[1] === "community") return { name: "compose-community" };
  if (parts[1] === "listing") return { name: "compose-listing", communityId: query.get("c") || "" };
  if (parts[1] === "proposal") return { name: "compose-proposal", communityId: query.get("c") || "" };
  if (parts[1] === "topic") return { name: "compose-topic", communityId: query.get("c") || "" };
  if (parts[1] === "reply") {
    return { name: "compose-reply", topicId: query.get("t") || "", communityId: query.get("c") || "" };
  }
  return null;
}

function parseUserProfileRoute(rawParam, query) {
  if (rawParam.startsWith("@")) return { name: "handle-lookup", slug: rawParam.slice(1) };
  return { name: "profile", address: rawParam, tab: (query.get("tab") || "posts").toLowerCase() };
}

function parseEntityRoute(parts, query) {
  const [root, param] = parts;
  if (!param) {
    if (root === "dm") return { name: "dm-list" };
    return null;
  }
  const decoded = decodeURIComponent(param);
  if (root === "connect") return { name: "connect", routeId: decoded };
  if (root === "pix") return { name: "pix-lookup", query: decoded };
  if (root === "h") return { name: "handle-lookup", slug: decoded };
  if (root === "tag") return { name: "tag-feed", slug: decoded };
  if (root === "dm") return { name: "dm-thread", address: decoded };
  if (root === "t") return { name: "topic", id: decoded, communityId: query.get("c") || "" };
  if (root === "u") return parseUserProfileRoute(decoded, query);
  return null;
}

const STATIC_ROUTES = {
  communities: () => ({ name: "communities" }),
  perfil: (_parts, query) => ({ name: "perfil", tab: (query.get("tab") || "posts").toLowerCase() }),
  status: () => ({ name: "status" }),
  wallet: () => ({ name: "wallet" }),
  voxpedia: () => ({ name: "voxpedia" }),
};

function parseStaticRoute(parts, query) {
  const root = parts[0];
  if (STATIC_ROUTES[root]) return STATIC_ROUTES[root](parts, query);
  if (root === "people" || root === "pessoas") {
    return { name: "people", query: query.get("q") || "" };
  }
  if (root === "ajuda") {
    if (parts[1] === "voxpedia") return { name: "voxpedia" };
    if (parts[1] === "teste") return { name: "ajuda-teste" };
  }
  return null;
}

export function parseRoute() {
  const fromSearch = parseSearchHints();
  if (fromSearch) return fromSearch;

  const hash = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = hash.split("?");
  const parts = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const query = new URLSearchParams(queryPart || "");

  if (!parts.length) return { name: "home", feed: (query.get("feed") || "for-you").toLowerCase() };

  return (
    parseStaticRoute(parts, query) ||
    parseSettingsRoute(parts) ||
    parseEntityRoute(parts, query) ||
    parseCommunityRoute(parts, query) ||
    parseLabsHash(parts) ||
    parseComposeRoute(parts, query) ||
    { name: "home" }
  );
}
