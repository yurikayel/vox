/**
 * ADR-035 — camadas do cliente: classificação dos módulos, leitura dos imports pela árvore sintática e a regra de
 * qual camada pode importar qual.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bypassesDoor, importSpecifiers, isAllowedImport, layerOf, layerViolations, resolveSpecifier } from "../scripts/layers-lib.mjs";

test("camadas - app.js e app/ são app; render.js e render/ são render; labs/ e dungeon/ são labs; o resto é base", () => {
  assert.equal(layerOf("app.js"), "app");
  assert.equal(layerOf("app/route.js"), "app");
  assert.equal(layerOf("render.js"), "render");
  assert.equal(layerOf("render/feed.js"), "render");
  assert.equal(layerOf("dungeon/dungeon-controller.js"), "labs");
  assert.equal(layerOf("labs/x.js"), "labs");
  assert.equal(layerOf("peers.js"), "base");
  assert.equal(layerOf("shared/html.js"), "base");
  assert.equal(layerOf("data/x.js"), "base");
});

test("camadas - só se importa para baixo; laboratório só é carregado por app e por ele mesmo", () => {
  assert.equal(isAllowedImport("app/route.js", "render/feed.js"), true);
  assert.equal(isAllowedImport("app/screens-labs.js", "dungeon/dungeon-controller.js"), true);
  assert.equal(isAllowedImport("render/feed.js", "peers.js"), true);
  assert.equal(isAllowedImport("dungeon/dungeon-controller.js", "shared/html.js"), true);
  assert.equal(isAllowedImport("render/feed.js", "app/context.js"), false);
  assert.equal(isAllowedImport("peers.js", "render/feed.js"), false);
  assert.equal(isAllowedImport("peers.js", "app/route.js"), false);
  assert.equal(isAllowedImport("render/voxpedia.js", "dungeon/dungeon-controller.js"), false);
  assert.equal(isAllowedImport("dungeon/dungeon-controller.js", "app/context.js"), false);
});

test("camadas - lê import estático, reexportação e import() literal; ignora pacote e texto em comentário ou string", () => {
  const code = `
    import { a } from "./a.js";
    import "./side.js";
    export { b } from "../render/b.js";
    export * from "./c.js";
    const later = () => import("./app/late.js");
    import x from "espree";
    // import { no } from "./comentario.js";
    const s = "import('./texto.js')";
  `;
  assert.deepEqual(importSpecifiers(code).sort(), ["../render/b.js", "./a.js", "./app/late.js", "./c.js", "./side.js"]);
});

test("camadas - resolve caminho relativo a client/js e descarta o que sai da pasta", () => {
  assert.equal(resolveSpecifier("render/post-more-menu.js", "../app/context.js"), "app/context.js");
  assert.equal(resolveSpecifier("moderation.js", "./app/natural-mod-flow.js"), "app/natural-mod-flow.js");
  assert.equal(resolveSpecifier("peers.js", "../config/x.js"), null);
});

test("camadas - um import que sobe de camada, inclusive por import(), aparece como violação", () => {
  const code = `import { ctx } from "../app/context.js"; import { esc } from "./util.js"; const f = () => import("../app/zap.js");`;
  assert.deepEqual(layerViolations("render/menu.js", code), ["render/menu.js → app/context.js", "render/menu.js → app/zap.js"]);
  assert.deepEqual(layerViolations("app/screen.js", code), []);
});

test("contexto vault/ - fora da pasta só pelas portas index.js e envelope.js; dentro, livre", () => {
  assert.equal(bypassesDoor("email-kit.js", "vault/index.js"), false);
  assert.equal(bypassesDoor("key-lock.js", "vault/envelope.js"), false);
  assert.equal(bypassesDoor("vault/passphrase-vault.js", "vault/vault-store.js"), false);
  assert.equal(bypassesDoor("email-kit.js", "vault/vault-crypto.js"), true);
  assert.equal(bypassesDoor("app/screens-sync.js", "vault/passphrase-vault.js"), true);
  assert.deepEqual(layerViolations("email-kit.js", `import { x } from "./vault/vault-store.js";`), ["email-kit.js → vault/vault-store.js"]);
});
