import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { routeTitle } from "../client/js/app/route-parse.js";
import { announceRoute } from "../client/js/app/route.js";
import { renderTopic } from "../client/js/render/topic.js";

function fakeDoc(h1) {
  const doc = { title: "Vox", querySelector: (sel) => (sel.includes("h1") ? h1 : null) };
  return doc;
}

function fakeH1() {
  const attrs = new Map();
  return {
    focused: 0,
    hasAttribute: (k) => attrs.has(k),
    setAttribute: (k, v) => attrs.set(k, v),
    getAttribute: (k) => attrs.get(k),
    focus() { this.focused += 1; },
  };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

describe("a11y: título e foco por rota", () => {
  it("cada rota tem título 'Tela · Vox'", () => {
    assert.equal(routeTitle({ name: "dm-list" }), "Mensagens · Vox");
    assert.equal(routeTitle({ name: "wallet" }), "Carteira · Vox");
    assert.equal(routeTitle({ name: "nao-existe" }), "Ágora · Vox");
  });

  it("announceRoute muda document.title e foca o h1 com tabindex -1", () => {
    const h1 = fakeH1();
    const doc = fakeDoc(h1);
    assert.equal(announceRoute({ name: "status" }, doc), true);
    assert.equal(doc.title, "Saúde do nó · Vox");
    assert.equal(h1.getAttribute("tabindex"), "-1");
    assert.equal(h1.focused, 1);
  });

  it("sem h1 só o título muda", () => {
    const doc = fakeDoc(null);
    assert.equal(announceRoute({ name: "vote" }, doc), false);
    assert.equal(doc.title, "Votação · Vox");
  });
});

describe("a11y: botões só com ícone", () => {
  it("botão de ocultar resposta (moderação) tem aria-label", () => {
    const main = {};
    const topic = { title: "t", author: "a", ts: 1 };
    renderTopic(main, "t1", topic, [{ id: "r1", author: "b", ts: 2, body: "oi" }], { isMod: true });
    const btn = main.innerHTML.match(/<button[^>]*btn-mod-hide[^>]*data-type="reply"[^>]*>/);
    assert.ok(btn, "botão de moderar resposta não renderizou");
    assert.match(btn[0], /aria-label="[^"]+"/);
  });

  it("nenhum <button> de um símbolo só fica sem aria-label", () => {
    const re = /<button\b([^>]*)>\s*(?:<span[^>]*>)?\s*[^\sA-Za-zÀ-ú0-9<]{1,3}\s*(?:<\/span>)?\s*<\/button>/g;
    const bad = [];
    for (const f of walk("client/js")) {
      for (const m of readFileSync(f, "utf8").matchAll(re)) {
        if (!/aria-label=/.test(m[1])) bad.push(`${f}: ${m[0].slice(0, 80)}`);
      }
    }
    assert.deepEqual(bad, []);
  });
});
