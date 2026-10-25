/**
 * @module app/route-parse
 * Parser puro de `location.hash` e query `?h=` — sem DOM side effects.
 */

/**
 * @returns {Record<string, string> & { name: string }}
 */
export function parseRoute() {
  if (typeof window !== "undefined" && window.location?.search) {
    const q = new URLSearchParams(window.location.search);
    const paramHandle = q.get("h");
    if (paramHandle) return { name: "handle-lookup", slug: paramHandle };
  }

  const hash = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = hash.split("?");
  const parts = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const query = new URLSearchParams(queryPart || "");

  if (!parts.length) return { name: "home", feed: (query.get("feed") || "for-you").toLowerCase() };
  if (parts[0] === "communities") return { name: "communities" };
  if (parts[0] === "people") return { name: "people", query: query.get("q") || "" };
  if (parts[0] === "connect" && parts[1]) {
    return { name: "connect", routeId: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "perfil") return { name: "perfil", tab: (query.get("tab") || "posts").toLowerCase() };
  if (parts[0] === "pix" && parts[1]) {
    return { name: "pix-lookup", query: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "settings" && parts[1] === "network") {
    if (parts[2] === "steward") return { name: "steward-wizard" };
    return { name: "network-settings" };
  }
  if (parts[0] === "h" && parts[1]) {
    return { name: "handle-lookup", slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "tag" && parts[1]) {
    return { name: "tag-feed", slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "dm") {
    if (parts[1]) return { name: "dm-thread", address: decodeURIComponent(parts[1]) };
    return { name: "dm-list" };
  }
  if (parts[0] === "c" && parts[1]) {
    if (parts[2] === "proposal" && parts[3]) {
      return {
        name: "proposal",
        communityId: decodeURIComponent(parts[1]),
        proposalId: decodeURIComponent(parts[3]),
      };
    }
    let tab = (query.get("tab") || "").toLowerCase();
    if (!tab && (parts[2] === "listings" || parts[2] === "classificados" || parts[2] === "feira")) {
      tab = "listings";
    }
    if (!tab && (parts[2] === "governance" || parts[2] === "governanca")) {
      tab = "governance";
    }
    let finalTab = "posts";
    if (tab === "listings") finalTab = "listings";
    else if (tab === "governance" || tab === "governanca") finalTab = "governance";

    return {
      name: "community",
      id: decodeURIComponent(parts[1]),
      tab: finalTab,
    };
  }
  if (parts[0] === "t" && parts[1]) {
    return {
      name: "topic",
      id: decodeURIComponent(parts[1]),
      communityId: query.get("c") || "",
    };
  }
  if (parts[0] === "u" && parts[1]) {
    const raw = decodeURIComponent(parts[1]);
    if (raw.startsWith("@")) {
      return { name: "handle-lookup", slug: raw.slice(1) };
    }
    return { name: "profile", address: raw, tab: (query.get("tab") || "posts").toLowerCase() };
  }
  if (parts[0] === "status") return { name: "status" };
  if (parts[0] === "labs" && parts[1] === "frames") return { name: "labs-frames" };
  if (parts[0] === "voxpedia") return { name: "voxpedia" };
  if (parts[0] === "ajuda" && parts[1] === "voxpedia") return { name: "voxpedia" };
  if (parts[0] === "wallet") return { name: "wallet" };
  if (parts[0] === "compose") {
    if (parts[1] === "community") return { name: "compose-community" };
    if (parts[1] === "listing") return { name: "compose-listing", communityId: query.get("c") || "" };
    if (parts[1] === "proposal") return { name: "compose-proposal", communityId: query.get("c") || "" };
    if (parts[1] === "topic") return { name: "compose-topic", communityId: query.get("c") || "" };
    if (parts[1] === "reply") {
      return {
        name: "compose-reply",
        topicId: query.get("t") || "",
        communityId: query.get("c") || "",
      };
    }
  }
  return { name: "home" };
}
