/**
 * @file Cobertura T7 de `qr-url.js`: QR de links do Vox, SVG, sheet modal e delegação de cliques/Escape,
 * com DOM em memória.
 */
import "./setup.js";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import * as qr from "../client/js/qr-url.js";
import { connectShareUrl, topicShareUrl, communityShareUrl } from "../client/js/share.js";
import { installFakeDocument } from "./helpers/cov-t7-fake-dom.mjs";

const URL_TOPIC = "https://vox.test/#/t/abc123";
let dom;

before(() => {
  dom = installFakeDocument();
});
after(() => dom.restore());

/**
 * Alvo de clique falso com `closest` resolvendo por seletor.
 * @param {{ id?: string, dataset?: object, closeBtn?: boolean, share?: object|null }} spec Descreve o alvo.
 * @returns {object} Alvo que imita `event.target`.
 */
function target({ id = "", dataset = {}, closeBtn = false, share = null } = {}) {
  const btn = share ? { dataset: share, hasAttribute: () => false } : null;
  return {
    id,
    closest: (sel) => {
      if (sel === "[data-qr-url-close]") return closeBtn ? {} : null;
      return btn;
    },
    dataset,
  };
}

test("encodeVoxUrl/decodeQrModules - ida e volta preserva a URL e escolhe versão e máscara válidas", () => {
  const enc = qr.encodeVoxUrl(URL_TOPIC);
  assert.equal(enc.url, URL_TOPIC);
  assert.equal(enc.size, enc.version * 4 + 17);
  assert.equal(enc.modules.length, enc.size);
  assert.ok(enc.mask >= 0 && enc.mask <= 7);
  assert.equal(qr.decodeQrModules(enc.modules), URL_TOPIC);
});

test("encodeVoxUrl - rejeita URL que não é de compartilhamento do Vox", () => {
  assert.throws(() => qr.encodeVoxUrl("https://exemplo.com/"), /expected Vox share URL/);
  assert.equal(qr.isVoxShareUrl(URL_TOPIC), true);
  assert.equal(qr.isVoxShareUrl("https://exemplo.com/"), false);
});

test("decodeQrModules - grade de tamanho inválido é recusada", () => {
  const bad = Array.from({ length: 20 }, () => Array(20).fill(false));
  assert.throws(() => qr.decodeQrModules(bad), /unsupported version/);
});

test("modulesToSvg - uma <rect> por módulo escuro mais fundo e margem de 4 módulos", () => {
  const svg = qr.modulesToSvg([[true, false], [false, true]]);
  assert.match(svg, /viewBox="0 0 10 10"/);
  assert.match(svg, /<rect width="10" height="10" fill="#fff"\/>/);
  assert.equal((svg.match(/<rect x=/g) || []).length, 2);
  assert.match(svg, /<rect x="4" y="4" width="1" height="1"\/>/);
  assert.match(svg, /<rect x="5" y="5" width="1" height="1"\/>/);
  assert.ok(svg.endsWith("</svg>"));
});

test("openQrUrlSheet - cria o sheet uma vez, preenche SVG/texto/URL e abre; closeQrUrlSheet fecha", () => {
  qr.openQrUrlSheet(URL_TOPIC);
  const root = dom.document.getElementById("qr-url-sheet");
  assert.equal(root.hidden, false);
  assert.equal(root.getAttribute("aria-hidden"), "false");
  assert.equal(root.classList.contains("is-open"), true);
  assert.equal(root.getAttribute("role"), "dialog");
  assert.match(root.querySelector(".qr-url-svg").innerHTML, /^<svg /);
  assert.equal(root.querySelector(".qr-url-copy").textContent, qr.QR_URL_HONEST_COPY);
  assert.equal(root.querySelector(".qr-url-href").textContent, URL_TOPIC);
  qr.openQrUrlSheet(connectShareUrl("vx_ana"));
  assert.equal(dom.document.body.children.filter((c) => c.id === "qr-url-sheet").length, 1);
  qr.closeQrUrlSheet();
  assert.equal(root.hidden, true);
  assert.equal(root.getAttribute("aria-hidden"), "true");
  assert.equal(root.classList.contains("is-open"), false);
});

test("closeQrUrlSheet - sem sheet no DOM não faz nada", () => {
  const saved = dom.document.body.children;
  dom.document.body.children = [];
  assert.doesNotThrow(() => qr.closeQrUrlSheet());
  dom.document.body.children = saved;
});

test("attachQrUrlHandlers - clique em botão de compartilhar abre o QR do link certo", () => {
  qr.attachQrUrlHandlers();
  qr.attachQrUrlHandlers();
  assert.equal(dom.document.listeners.click.length, 1);
  const root = () => dom.document.getElementById("qr-url-sheet");
  const click = (t) => {
    let prevented = false;
    dom.document.dispatch("click", { target: t, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(click(target({ share: { qrShare: "topic", qrId: "tp9" } })), true);
  assert.equal(root().querySelector(".qr-url-href").textContent, topicShareUrl("tp9"));
  click(target({ share: { qrShare: "community", qrId: "c1" } }));
  assert.equal(root().querySelector(".qr-url-href").textContent, communityShareUrl("c1"));
  click(target({ share: { qrShare: "connect", qrId: "vx_b" } }));
  assert.equal(root().querySelector(".qr-url-href").textContent, connectShareUrl("vx_b"));
  click(target({ share: { qrShare: "connect", qrId: "vx_b", qrInvite: "1" } }));
  assert.match(root().querySelector(".qr-url-href").textContent, /#\/connect\/vx_b\?convite=/);
  click(target({ share: { qrUrl: URL_TOPIC } }));
  assert.equal(root().querySelector(".qr-url-href").textContent, URL_TOPIC);
});

test("attachQrUrlHandlers - clique sem link, em fechar, no fundo ou fora de botão; Escape fecha", () => {
  const root = () => dom.document.getElementById("qr-url-sheet");
  const click = (t) => {
    let prevented = false;
    dom.document.dispatch("click", { target: t, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  qr.openQrUrlSheet(URL_TOPIC);
  assert.equal(click(target({ share: { qrShare: "desconhecido" } })), false);
  assert.equal(root().hidden, false);
  assert.equal(click(target({})), false);
  assert.equal(click(target({ closeBtn: true })), false);
  assert.equal(root().hidden, true);
  qr.openQrUrlSheet(URL_TOPIC);
  click(target({ id: "qr-url-sheet" }));
  assert.equal(root().hidden, true);
  qr.openQrUrlSheet(URL_TOPIC);
  dom.document.dispatch("keydown", { key: "Enter" });
  assert.equal(root().hidden, false);
  dom.document.dispatch("keydown", { key: "Escape" });
  assert.equal(root().hidden, true);
});
