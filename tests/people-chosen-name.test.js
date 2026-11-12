import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { hasChosenName, isListedPerson } from "../client/js/people-index.js";
import { resolvePeopleSearchBody } from "../client/js/render/oauth-modals.js";

test("diretório: par da malha só com a chave não entra na lista", () => {
  assert.equal(hasChosenName({ routeId: "vx_6ir2sF_M-JEabc", name: "vx_6ir2sF_M-JE" }), false);
  assert.equal(hasChosenName({ routeId: "Wmp0V7S-po7C2rXYZ", name: "Wmp0V7S-po7C2r" }), false);
  assert.equal(hasChosenName({ routeId: "vx_abc", name: "" }), false);
});

test("diretório: par com nome escolhido aparece", () => {
  assert.equal(hasChosenName({ routeId: "vx_Mr2Hym123", name: "Yuri Kayel" }), true);
});

test("diretório: conta do cofre ou contato só com a chave também fica fora; o próprio perfil e o Vox ficam", () => {
  assert.equal(isListedPerson({ routeId: "vx_zV5igDrUAzPxx", name: "vx_zV5igDrUAzP", source: "vault" }), false);
  assert.equal(isListedPerson({ routeId: "vx_ebodpdyzS9qxx", name: "", source: "contact" }), false);
  assert.equal(isListedPerson({ routeId: "vx_me", name: "vx_me", source: "self" }), true);
  assert.equal(isListedPerson({ routeId: "vx_voxbrasil_welcome", name: "Vox", source: "system" }), true);
  assert.equal(isListedPerson({ routeId: "vx_x", name: "Maria", source: "vault" }), true);
});

test("diretório: a linha mostra nome e @, não a chave vx_", () => {
  const html = resolvePeopleSearchBody({ all: [{ routeId: "vx_abcdefghijklmnop", name: "Maria Souza", handle: "maria", source: "mesh-card" }] }, [], "");
  assert.ok(html.includes("Maria Souza") && html.includes("@maria"));
  assert.ok(!html.includes("Chave:"), "a chave fica no perfil, não no diretório");
});

test("diretório: a própria conta sem nome aparece como Você, com convite para escolher nome", async () => {
  const localAccount = await import("../client/js/local-account.js");
  const me = await localAccount.getRouteId();
  const html = resolvePeopleSearchBody({ all: [{ routeId: me, name: me.slice(0, 14), source: "self" }] }, [], "");
  assert.ok(html.includes(">Você</a>") && html.includes("Escolher nome"));
  assert.ok(!html.includes(`>${me.slice(0, 14)}<`), "sem a chave como nome visível");
});
