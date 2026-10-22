import * as gql from "./graphql.js";
import * as render from "./render.js";
import * as mock from "./mock.js";

// Fase 2: WebCrypto Ed25519 sign + Turbo upload — not implemented.

function parseRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (!parts.length) return { name: "home" };
  if (parts[0] === "c" && parts[1]) return { name: "community", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "t" && parts[1]) return { name: "topic", id: decodeURIComponent(parts[1]) };
  return { name: "home" };
}

async function showHome() {
  const main = render.renderShell({
    title: "Comunidades",
    subtitle: "Estilo Orkut — leitura no permaweb",
  });
  render.renderLoading(main);
  try {
    const { items, gateway, demo } = await gql.fetchCommunities().catch(async () => mock.mockCommunities());
    main.innerHTML = "";
    if (demo) render.renderDemoBanner(main);
    else render.renderGatewayBanner(main, gateway);
    render.renderHome(main, items);
  } catch (e) {
    main.innerHTML = "";
    const fb = mock.mockCommunities();
    render.renderDemoBanner(main);
    render.renderError(main, String(e.message || e));
    render.renderHome(main, fb.items);
  }
}

async function showCommunity(communityId) {
  const main = render.renderShell({
    title: "Comunidade",
    subtitle: communityId,
  });
  render.renderLoading(main);
  try {
    const { items, gateway, demo } = await gql.fetchTopics(communityId).catch(() => mock.mockTopics(communityId));
    main.innerHTML = "";
    if (demo) render.renderDemoBanner(main);
    else render.renderGatewayBanner(main, gateway);
    render.renderCommunity(main, communityId, items, {});
  } catch (e) {
    main.innerHTML = "";
    const fb = mock.mockTopics(communityId);
    render.renderDemoBanner(main);
    render.renderError(main, String(e.message || e));
    render.renderCommunity(main, communityId, fb.items, {});
  }
}

async function showTopic(topicId) {
  const main = render.renderShell({
    title: "Tópico",
    subtitle: topicId,
  });
  render.renderLoading(main);
  let topic = { title: "Tópico", owner: "" };
  let replies = [];
  let demo = false;
  try {
    const res = await gql.fetchReplies(topicId);
    replies = res.items;
    demo = res.demo;
    main.innerHTML = "";
    render.renderGatewayBanner(main, res.gateway);
  } catch (e) {
    const fb = mock.mockReplies(topicId);
    replies = fb.items;
    demo = true;
    main.innerHTML = "";
    render.renderDemoBanner(main);
    render.renderError(main, String(e.message || e));
    if (fb.items.length) {
      topic = { title: "Como funciona a Fase 1?", owner: "demo-owner" };
    }
  }
  render.renderTopic(main, topicId, topic, replies);
}

async function route() {
  const r = parseRoute();
  if (r.name === "home") return showHome();
  if (r.name === "community") return showCommunity(r.id);
  if (r.name === "topic") return showTopic(r.id);
  return showHome();
}

window.addEventListener("hashchange", () => route());
route();
