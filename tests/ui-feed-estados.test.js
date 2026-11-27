/**
 * @file Estados do feed da Ágora pelo cartão de estado (PR3 da UI v4): vazio de cada feed (com o "Seguindo" em 1 ação
 * primária + 1 secundária), "sem rede" e "erro" com "Tentar de novo", link secundário do cartão só para rota interna,
 * a folha `sv-estados.css` ligada no `index.html` e os botões do cartão ligados na tela.
 */
import "./setup.js";
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import { waitUntil } from "./helpers/wait-until.js";
import { renderFeed } from "../client/js/render/feed-chrome.js";
import { renderStateCard } from "../client/js/shared/state-card.js";
import * as home from "../client/js/app/screens-home.js";
import * as social from "../client/js/social.js";
import { __resetGatewayConfigForTests } from "../client/js/graphql-gateway.js";

const dom = installFakeDom();
const realFetch = globalThis.fetch;
const hadLocation = Object.hasOwn(globalThis, "location");
const realLocation = globalThis.location;

/* Nomes de outras redes e produtos, fragmentados para o teste não os citar. */
const TERCEIROS = new RegExp([["Blue", "sky"], ["AT ", "Protocol"], ["Foun", "dry"], ["Owl", "bear"], ["Roll", "20"]].map((p) => p.join("")).join("|"), "i");

const DISMISS_KEY = "vox-welcome-post-dismissed";
/* O post de boas-vindas aparece em todo feed menos o Cívico: dispensado, o feed sem posts locais fica mesmo vazio. */
beforeEach(() => {
  localStorage.setItem(DISMISS_KEY, "1");
  __resetGatewayConfigForTests();
});

afterEach(() => {
  localStorage.removeItem(DISMISS_KEY);
  __resetGatewayConfigForTests();
  globalThis.fetch = realFetch;
  delete globalThis.navigator.onLine;
  if (hadLocation) globalThis.location = realLocation;
  else delete globalThis.location;
  dom.reset();
});

/** Renderiza o feed sem posts e devolve só o cartão (tudo depois do chrome). */
function cartao(activeFeed, opts = {}) {
  const main = { innerHTML: "" };
  renderFeed(main, [], { activeFeed, ...opts });
  const at = main.innerHTML.indexOf('<div class="sv-state');
  assert.ok(at > 0, `${activeFeed}: o feed vazio desenha o cartão de estado`);
  return main.innerHTML.slice(at);
}
const contar = (html, re) => (html.match(re) || []).length;
const sem = (html) => html.replace(/<[^>]+>/g, " ");

test("os 4 feeds vazios usam o cartão de estado, sem o markup antigo `.empty`", () => {
  for (const feed of ["for-you", "civic", "following", "external", "all"]) {
    const html = cartao(feed);
    assert.match(html, /^<div class="sv-state sv-state--empty" role="status">/, feed);
    assert.doesNotMatch(html, /class="empty|following-empty|civic-empty|external-empty/, feed);
    assert.doesNotMatch(html, /style=/, `${feed}: sem estilo inline`);
    assert.doesNotMatch(sem(html), /Watch|Para você|soberana|Lo-Fi/, `${feed}: sem jargão`);
    assert.doesNotMatch(html, TERCEIROS, `${feed}: sem nome de outra rede`);
  }
});

test("Seguindo vazio: 1 botão primário (Encontrar pessoas) e 1 link secundário (feed Social)", () => {
  const html = cartao("following");
  assert.match(sem(html), /Você ainda não acompanha ninguém\. Toque em Acompanhar/);
  assert.equal(contar(html, /<button/g), 1);
  assert.match(html, /<button type="button" class="sv-state-action" data-feed-go="#\/pessoas">Encontrar pessoas<\/button>/);
  assert.equal(contar(html, /<a /g), 1);
  assert.match(html, /<a class="sv-state-link" href="#\/">Ver o feed Social<\/a>/);
  assert.ok(html.indexOf("<button") < html.indexOf("<a "), "o botão primário vem antes do link");
});

test("feed geral vazio: primário Criar publicação (abre o compositor) e secundário Encontrar pessoas", () => {
  const html = cartao("for-you");
  assert.equal(contar(html, /<button/g), 1);
  assert.match(html, /<button type="button" class="sv-state-action" data-click-target="#feed-inline-composer \.inline-composer-collapsed">Criar publicação<\/button>/);
  assert.match(html, /<a class="sv-state-link" href="#\/pessoas">Encontrar pessoas<\/a>/);
});

test("Cívico e Redes externas vazios só explicam: sem botão e sem link morto", () => {
  const civico = cartao("civic");
  const externo = cartao("external");
  for (const html of [civico, externo]) assert.doesNotMatch(html, /<button|<a /);
  assert.match(sem(civico), /Nenhum post cívico ainda/);
  assert.match(sem(externo), /Nenhum post de redes externas ainda/);
});

test("sem rede e erro: cartão próprio com Tentar de novo, e a falha vence o vazio em qualquer feed", () => {
  for (const feed of ["for-you", "following", "civic", "external"]) {
    const off = cartao(feed, { failure: "offline" });
    assert.match(off, /^<div class="sv-state sv-state--offline" role="status">/, feed);
    assert.match(sem(off), /Você está sem conexão\. O feed mostra só o que já está neste aparelho\./);
    assert.match(off, /<button type="button" class="sv-state-action" data-feed-retry="1">Tentar de novo<\/button>/);
    assert.equal(contar(off, /<button/g), 1);
    const err = cartao(feed, { failure: "error" });
    assert.match(err, /^<div class="sv-state sv-state--error" role="status">/, feed);
    assert.match(sem(err), /Não deu para carregar o feed agora\./);
    assert.match(err, /data-feed-retry="1">Tentar de novo<\/button>/);
    assert.doesNotMatch(off + err, /Você ainda não acompanha|Nenhuma publicação ainda|data-feed-go/, "o vazio não aparece junto da falha");
  }
});

test("com posts e falha, o cartão da falha vem acima da lista e não a esconde; sem falha não há cartão", () => {
  const posts = [{ id: "p1", title: "Primeiro post", author: "vx_demo_mg" }];
  for (const [failure, kind] of [["offline", "offline"], ["error", "error"]]) {
    const main = { innerHTML: "" };
    renderFeed(main, posts, { activeFeed: "for-you", failure });
    const html = main.innerHTML;
    assert.match(html, new RegExp(`<div class="sv-state sv-state--${kind}" role="status">`), failure);
    assert.match(html, /data-feed-retry="1">Tentar de novo<\/button>/, failure);
    assert.ok(html.indexOf("sv-state--") < html.indexOf('class="feed-container"'), `${failure}: o aviso vem antes da lista`);
    assert.ok(html.indexOf('class="feed-container"') > html.indexOf("feed-chrome"), failure);
    assert.match(html, /Primeiro post/, `${failure}: o post segue na lista`);
    assert.equal(contar(html, /sv-state sv-state--/g), 1, failure);
  }
  const main = { innerHTML: "" };
  renderFeed(main, posts, { activeFeed: "for-you" });
  assert.doesNotMatch(main.innerHTML, /sv-state/);
  assert.match(main.innerHTML, /feed-container/);
});

test("link secundário do cartão: só rota interna, com rótulo, escapado e depois do botão", () => {
  const html = renderStateCard({ kind: "empty", text: "x", action: { label: "Ir", data: { a: "b" } }, link: { label: "<i>Ver</i>", href: "#/a?b=1&c=2" } });
  assert.match(html, /<button[^>]*>Ir<\/button><a class="sv-state-link" href="#\/a\?b=1&amp;c=2">&lt;i&gt;Ver&lt;\/i&gt;<\/a><\/div>$/);
  assert.doesNotMatch(renderStateCard({ kind: "empty", text: "x" }), /<a /, "sem link não há <a>");
  for (const href of ["https://exemplo.org", "javascript:alert(1)", "//exemplo.org", "#", "#/a b", '#/"x', "", "https://x/#/a", "javascript:x//#/a"]) {
    assert.throws(() => renderStateCard({ kind: "empty", link: { label: "Ver", href } }), /rota interna/, href);
  }
  assert.throws(() => renderStateCard({ kind: "empty", link: { label: " ", href: "#/" } }), /sem rótulo/);
});

test("o index.html liga sv-estados.css com o id do carregador (sem folha duplicada) depois de sv-agora.css", () => {
  const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  const agora = html.indexOf('href="css/sv-agora.css"');
  const estados = html.indexOf('<link id="sv-estados-stylesheet" rel="stylesheet" href="css/sv-estados.css" />');
  assert.ok(estados > agora && agora > 0, "sv-estados.css vem depois de sv-agora.css, com id sv-estados-stylesheet");
});

/** Deixa o aparelho sem conexão (propriedade do navegador, só leitura no padrão). */
function semConexao() {
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
  globalThis.fetch = async () => { throw new Error("offline"); };
}

test("a Ágora sem conexão e sem posts mostra o cartão 'sem rede'; Seguindo sem ninguém segue sendo o vazio", async () => {
  semConexao();
  await home.showHome("civic");
  assert.match(dom.main.innerHTML, /sv-state--offline/);
  assert.match(dom.main.innerHTML, /data-feed-retry="1"/);
  await home.showHome("following");
  assert.match(dom.main.innerHTML, /sv-state--empty/, "ninguém acompanhado: a lista é local, não depende da rede");
  assert.doesNotMatch(dom.main.innerHTML, /sv-state--offline/);
});

test("online, com o gateway respondendo e sem posts, a Ágora mostra o vazio, não a falha", async () => {
  gateway([]);
  await home.showHome("civic");
  assert.match(dom.main.innerHTML, /sv-state--empty/);
  assert.doesNotMatch(dom.main.innerHTML, /sv-state--(offline|error)/);
});

test("'Tentar de novo' recarrega o feed e 'Encontrar pessoas' navega só para rota interna", async () => {
  semConexao();
  const botao = makeEl();
  dom.group(".feed-chrome ~ .sv-state", [botao]);
  await home.showHome("civic");
  globalThis.location = { hash: "" };

  const alvo = (seletor, dataset) => ({ closest: (s) => (s === seletor ? { dataset } : null) });
  botao.fire("click", { target: alvo("[data-feed-go]", { feedGo: "https://exemplo.org" }) });
  assert.equal(globalThis.location.hash, "", "endereço externo não navega");
  botao.fire("click", { target: alvo("[data-feed-go]", { feedGo: "#/pessoas" }) });
  assert.equal(globalThis.location.hash, "#/pessoas");

  dom.main.innerHTML = "MARCA-ANTIGA";
  botao.fire("click", { target: alvo("[data-feed-retry]", {}) });
  await waitUntil(() => !dom.main.innerHTML.includes("MARCA-ANTIGA"));
  assert.equal(dom.main.innerHTML.includes("MARCA-ANTIGA"), false, "a Ágora foi remontada");
  assert.match(dom.main.innerHTML, /sv-state--offline/);
});

test("'Tentar de novo' recarrega o MESMO feed: Seguindo (sem ninguém, sem rede) segue vazio e não vira o Para você", async () => {
  semConexao();
  const botao = makeEl();
  dom.group(".feed-chrome ~ .sv-state", [botao]);
  await home.showHome("following");
  assert.match(dom.main.innerHTML, /sv-state--empty/);
  dom.main.innerHTML = "MARCA-ANTIGA";
  botao.fire("click", { target: { closest: (s) => (s === "[data-feed-retry]" ? { dataset: {} } : null) } });
  await waitUntil(() => !dom.main.innerHTML.includes("MARCA-ANTIGA"));
  assert.match(dom.main.innerHTML, /sv-state--empty/, "recarregou Seguindo");
  assert.doesNotMatch(dom.main.innerHTML, /sv-state--offline/, "não trocou para o feed Para você (que, sem rede, mostra 'sem rede')");
});

test("Seguindo com alguém acompanhado e sem rede mostra 'sem rede', não 'você não acompanha ninguém'", async () => {
  semConexao();
  assert.equal(social.toggleWatch("vx_seguido_estado"), true);
  try {
    await home.showHome("following");
    assert.match(dom.main.innerHTML, /sv-state--offline/);
    assert.doesNotMatch(dom.main.innerHTML, /Você ainda não acompanha/);
  } finally {
    social.toggleWatch("vx_seguido_estado");
  }
});

test("se a montagem do feed falha e não sobra post, a Ágora mostra o cartão de erro com Tentar de novo", async () => {
  globalThis.fetch = async () => { throw new Error("rede indisponível"); };
  let valor = "";
  let gravacoes = 0;
  Object.defineProperty(dom.main, "innerHTML", {
    configurable: true,
    get: () => valor,
    set(v) {
      gravacoes += 1;
      if (gravacoes === 2) throw new Error("falha ao montar a lista"); // 1ª: carregando; 2ª: limpeza dentro do try
      valor = v;
    },
  });
  await home.showHome("civic");
  assert.match(valor, /sv-state--error/);
  assert.match(valor, /data-feed-retry="1">Tentar de novo<\/button>/);
  assert.doesNotMatch(valor, /sv-state--(empty|offline)/);
});

/** Um gateway configurado e online: `posts` é o que ele devolve; `null` deixa o gateway fora do ar (o aparelho segue online). */
function gateway(posts) {
  const resposta = (json) => ({ ok: true, status: 200, json: async () => json });
  globalThis.fetch = async (url) => {
    if (String(url).includes("gateways.json")) return resposta({ gateways: [{ label: "g1", graphql: "https://gw.test/graphql" }] });
    if (posts === null) throw new Error("gateway fora do ar");
    return resposta({ data: { transactions: { edges: posts } } });
  };
}

/** Acompanha alguém durante o teste e solta no fim. */
async function acompanhando(fn) {
  assert.equal(social.toggleWatch("vx_seguido_gateway"), true);
  try {
    await fn();
  } finally {
    social.toggleWatch("vx_seguido_gateway");
  }
}

test("Seguindo com alguém acompanhado e o gateway fora do ar (aparelho online) mostra o erro com Tentar de novo", async () => {
  gateway(null);
  await acompanhando(async () => {
    await home.showHome("following");
    assert.match(dom.main.innerHTML, /^[\s\S]*<div class="sv-state sv-state--error" role="status">/);
    assert.match(dom.main.innerHTML, /data-feed-retry="1">Tentar de novo<\/button>/);
    assert.doesNotMatch(dom.main.innerHTML, /Você ainda não acompanha|sv-state--empty/, "a busca falhou: o vazio seria falso");
  });
});

test("Seguindo com alguém acompanhado e o gateway sem posts diz que ninguém publicou, não que você não acompanha ninguém", async () => {
  gateway([]);
  await acompanhando(async () => {
    await home.showHome("following");
    assert.match(dom.main.innerHTML, /sv-state--empty/);
    assert.match(sem(dom.main.innerHTML), /As pessoas que você acompanha ainda não publicaram nada por aqui\./);
    assert.doesNotMatch(dom.main.innerHTML, /Você ainda não acompanha|sv-state--(error|offline)/);
  });
});

test("Seguindo sem ninguém acompanhado continua dizendo 'você ainda não acompanha ninguém', com o gateway fora ou não", async () => {
  for (const posts of [null, []]) {
    gateway(posts);
    await home.showHome("following");
    assert.match(sem(dom.main.innerHTML), /Você ainda não acompanha ninguém\. Toque em Acompanhar/);
    assert.doesNotMatch(dom.main.innerHTML, /sv-state--(error|offline)|ainda não publicaram/);
  }
});

test("o vazio de Seguindo troca o texto só quando há alguém acompanhado, e o resto do cartão fica igual", () => {
  const quieto = cartao("following", { watching: true });
  assert.match(sem(quieto), /^\s*As pessoas que você acompanha ainda não publicaram nada por aqui\.\s*Encontrar pessoas/);
  assert.equal(contar(quieto, /<button/g), 1);
  assert.match(quieto, /data-feed-go="#\/pessoas">Encontrar pessoas<\/button>/);
  assert.match(quieto, /<a class="sv-state-link" href="#\/">Ver o feed Social<\/a>/);
  assert.match(sem(cartao("following", { watching: false })), /Você ainda não acompanha ninguém/);
  assert.match(sem(cartao("for-you", { watching: true })), /Nenhuma publicação ainda/, "só o feed Seguindo troca o texto");
  assert.match(sem(cartao("following", { watching: true, failure: "error" })), /Não deu para carregar o feed agora/, "a falha vence também aqui");
});

test("'Tentar de novo' em Seguindo com o gateway fora recarrega o MESMO feed e segue mostrando o erro", async () => {
  gateway(null);
  const botao = makeEl();
  dom.group(".feed-chrome ~ .sv-state", [botao]);
  await acompanhando(async () => {
    await home.showHome("following");
    assert.match(dom.main.innerHTML, /sv-state--error/);
    dom.main.innerHTML = "MARCA-ANTIGA";
    botao.fire("click", { target: { closest: (s) => (s === "[data-feed-retry]" ? { dataset: {} } : null) } });
    await waitUntil(() => !dom.main.innerHTML.includes("MARCA-ANTIGA"));
    assert.match(dom.main.innerHTML, /sv-state--error/, "recarregou Seguindo (o feed Para você, com o plano B, não mostraria o cartão de erro)");
  });
});

/** Os posts da lista (o que está depois do aviso), sem o resto da página. */
const lista = (html) => html.slice(html.indexOf('class="feed-container"'));

test("Para você sem conexão: aviso 'sem rede' com Tentar de novo acima da lista local, que continua lá", async () => {
  localStorage.removeItem(DISMISS_KEY);
  semConexao();
  await home.showHome("for-you");
  const html = dom.main.innerHTML;
  assert.match(html, /<div class="sv-state sv-state--offline" role="status">/);
  assert.match(sem(html), /Você está sem conexão\. O feed mostra só o que já está neste aparelho\./);
  assert.match(html, /data-feed-retry="1">Tentar de novo<\/button>/);
  assert.ok(html.indexOf("sv-state--offline") < html.indexOf('class="feed-container"'), "o aviso vem antes da lista");
  assert.match(lista(html), /post-item|data-topic-id|class="post/, "o post de boas-vindas segue na lista");
  assert.doesNotMatch(html, /sv-state--(empty|error)/);
});

test("Para você online com os gateways fora do ar: aviso de erro com Tentar de novo acima da lista", async () => {
  localStorage.removeItem(DISMISS_KEY);
  gateway(null);
  await home.showHome("for-you");
  const html = dom.main.innerHTML;
  assert.match(html, /<div class="sv-state sv-state--error" role="status">/);
  assert.match(sem(html), /Não deu para carregar o feed agora\./);
  assert.match(html, /data-feed-retry="1">Tentar de novo<\/button>/);
  assert.ok(html.indexOf("sv-state--error") < html.indexOf('class="feed-container"'), "o aviso vem antes da lista");
  assert.doesNotMatch(html, /sv-state--(empty|offline)/);
});

test("Para você online com o gateway respondendo: sem aviso nenhum, só a lista", async () => {
  localStorage.removeItem(DISMISS_KEY);
  gateway([]);
  await home.showHome("for-you");
  assert.doesNotMatch(dom.main.innerHTML, /sv-state/);
  assert.match(dom.main.innerHTML, /class="feed-container"/);
});

test("'Tentar de novo' no aviso do Para você recarrega o MESMO feed e, voltando a rede, o aviso some", async () => {
  localStorage.removeItem(DISMISS_KEY);
  gateway(null);
  const botao = makeEl();
  dom.group(".feed-chrome ~ .sv-state", [botao]);
  await home.showHome("for-you");
  assert.match(dom.main.innerHTML, /sv-state--error/);
  gateway([]);
  dom.main.innerHTML = "MARCA-ANTIGA";
  botao.fire("click", { target: { closest: (s) => (s === "[data-feed-retry]" ? { dataset: {} } : null) } });
  await waitUntil(() => !dom.main.innerHTML.includes("MARCA-ANTIGA"));
  assert.doesNotMatch(dom.main.innerHTML, /sv-state/, "o aviso some quando a busca dá certo");
  assert.match(dom.main.innerHTML, /class="feed-container"/);
});
