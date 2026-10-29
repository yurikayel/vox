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

function resolveCommunityTab(subPath, rawQueryTab) {
  let tab = (rawQueryTab || "").toLowerCase();
  if (!tab && (subPath === "listings" || subPath === "classificados" || subPath === "feira")) tab = "listings";
  if (!tab && (subPath === "governance" || subPath === "governanca")) tab = "governance";
  if (!tab && (subPath === "members" || subPath === "membros" || subPath === "online")) tab = "members";
  if (tab === "listings") return "listings";
  if (tab === "governance" || tab === "governanca") return "governance";
  if (tab === "members" || tab === "membros" || tab === "online") return "members";
  return "posts";
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

function parseEntityRoute(parts, query) {
  if (parts[0] === "connect" && parts[1]) return { name: "connect", routeId: decodeURIComponent(parts[1]) };
  if (parts[0] === "pix" && parts[1]) return { name: "pix-lookup", query: decodeURIComponent(parts[1]) };
  if (parts[0] === "h" && parts[1]) return { name: "handle-lookup", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "tag" && parts[1]) return { name: "tag-feed", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "dm") return parts[1] ? { name: "dm-thread", address: decodeURIComponent(parts[1]) } : { name: "dm-list" };
  if (parts[0] === "t" && parts[1]) {
    return { name: "topic", id: decodeURIComponent(parts[1]), communityId: query.get("c") || "" };
  }
  if (parts[0] === "u" && parts[1]) {
    const raw = decodeURIComponent(parts[1]);
    if (raw.startsWith("@")) return { name: "handle-lookup", slug: raw.slice(1) };
    return { name: "profile", address: raw, tab: (query.get("tab") || "posts").toLowerCase() };
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
  if (parts[0] === "communities") return { name: "communities" };
  if (parts[0] === "people" || parts[0] === "pessoas") return { name: "people", query: query.get("q") || "" };
  if (parts[0] === "perfil") return { name: "perfil", tab: (query.get("tab") || "posts").toLowerCase() };
  if (parts[0] === "status") return { name: "status" };
  if (parts[0] === "wallet") return { name: "wallet" };
  if (parts[0] === "voxpedia" || (parts[0] === "ajuda" && parts[1] === "voxpedia")) return { name: "voxpedia" };
  if (parts[0] === "ajuda" && parts[1] === "teste") return { name: "ajuda-teste" };

  return (
    parseSettingsRoute(parts) ||
    parseEntityRoute(parts, query) ||
    parseCommunityRoute(parts, query) ||
    parseLabsHash(parts) ||
    parseComposeRoute(parts, query) ||
    { name: "home" }
  );
}
