/**
 * @file Pacote `5e`: id e nome sem a marca do jogo, aviso de não afiliação em todo pacote, o id antigo fora do
 * registro (sem alias nem migração: nenhuma ficha foi criada com ele) e o formato do id do pacote.
 * A marca e o id antigo ficam em fragmentos para este teste não os citar em claro.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSystemPack, listSystemPackIds, validateSystemPack } from "../client/js/dungeon/system-pack.js";
import { PACK_5E } from "../client/js/dungeon/system-pack-5e.js";

const MARCA = new RegExp([["D", "&D"], ["Dun", "geons"]].map((p) => p.join("")).join("|"), "i");
const ID_ANTIGO = ["dnd", "5e", "2024"].join("");
const withId = (id) => ({ ...structuredClone(PACK_5E), id });
const idOk = (id) => !validateSystemPack(withId(id)).errors.includes("id inválido");

test("5e: id e nome visível do pacote não levam a marca do jogo", () => {
  assert.equal(PACK_5E.id, "5e");
  assert.equal(PACK_5E.name, "5e (SRD 5.2)");
  assert.equal(getSystemPack("5e"), PACK_5E);
});

test("nenhuma string de nenhum pacote cita a marca do jogo", () => {
  for (const id of listSystemPackIds()) {
    assert.doesNotMatch(JSON.stringify(getSystemPack(id)), MARCA, `pacote ${id} cita a marca`);
  }
});

test("todo pacote registrado traz o aviso de não afiliação em license.notice", () => {
  for (const id of listSystemPackIds()) {
    const notice = getSystemPack(id).license.notice;
    assert.equal(typeof notice, "string", `pacote ${id}: sem license.notice`);
    assert.ok(notice.trim().length > 0, `pacote ${id}: license.notice vazio`);
  }
});

test("o id antigo do pacote já não resolve", () => {
  assert.equal(getSystemPack(ID_ANTIGO), null);
  assert.ok(!listSystemPackIds().includes(ID_ANTIGO));
});

test("id do pacote: minúscula ou dígito na frente, depois minúscula, dígito, hífen ou sublinhado, até 32", () => {
  for (const ok of ["5e", "t20", "gurps4e", "a", "9", "a-b_c", "a".repeat(32), "5".repeat(32)]) assert.ok(idOk(ok), `deveria aceitar ${ok}`);
  const bad = ["", "A", "5E", "aB", "-a", "_a", "a b", "a.b", "a/b", "a!", "é", "a\n", "a".repeat(33), "5".repeat(33), null, 5, undefined];
  for (const id of bad) assert.equal(idOk(id), false, `deveria recusar ${JSON.stringify(id)}`);
});
