import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const load = (f) => fs.readFileSync(new URL(`../client/js/${f}`, import.meta.url), "utf8");

function runShortUrl({ search = "", hash = "", hostname = "vox.example" } = {}) {
  const location = { search, hash, hostname };
  vm.runInNewContext(load("boot-short-url.js"), { window: { location }, URLSearchParams });
  return location.hash;
}

test("boot-short-url - ?h=slug vira #/h/slug em minúsculas, sem @", () => {
  assert.equal(runShortUrl({ search: "?h=@Maria" }), "#/h/maria");
  assert.equal(runShortUrl({ search: "?handle=Joao", hash: "#/" }), "#/h/joao");
});

test("boot-short-url - slug é escapado para não injetar na rota", () => {
  assert.equal(runShortUrl({ search: "?h=a%2Fb%23c" }), "#/h/a%2Fb%23c");
});

test("boot-short-url - hash já existente não é sobrescrito", () => {
  assert.equal(runShortUrl({ search: "?h=maria", hash: "#/feed" }), "#/feed");
  assert.equal(runShortUrl({ hostname: "maria.comunidade.org", hash: "#/feed" }), "#/feed");
});

test("boot-short-url - subdomínio vira slug; www, vox* e hospedagem não", () => {
  assert.equal(runShortUrl({ hostname: "Maria.comunidade.org" }), "#/h/maria");
  assert.equal(runShortUrl({ hostname: "www.comunidade.org" }), "");
  assert.equal(runShortUrl({ hostname: "voxbr.comunidade.org" }), "");
  assert.equal(runShortUrl({ hostname: "app.pages.dev" }), "");
  assert.equal(runShortUrl({ hostname: "comunidade.org" }), "");
});

test("boot-short-url - ?h= vazio cai no caminho do subdomínio", () => {
  assert.equal(runShortUrl({ search: "?h=", hostname: "ana.comunidade.org" }), "#/h/ana");
});

function runColorMode(getItem) {
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => (attrs[k] = v), style: {} } };
  vm.runInNewContext(load("boot-color-mode.js"), { localStorage: { getItem }, document: doc });
  return { attrs, style: doc.documentElement.style };
}

test("boot-color-mode - light e dark salvos são aplicados", () => {
  for (const m of ["light", "dark"]) {
    const r = runColorMode(() => m);
    assert.equal(r.attrs["data-color-mode"], m);
    assert.equal(r.style.colorScheme, m);
  }
});

test("boot-color-mode - valor inválido ou ausente não toca no documento", () => {
  for (const v of ["sepia", "", null]) assert.deepEqual(runColorMode(() => v).attrs, {});
});

test("boot-color-mode - storage que lança não quebra o boot", () => {
  const boom = () => {
    throw new Error("bloqueado");
  };
  assert.doesNotThrow(() => runColorMode(boom));
});
