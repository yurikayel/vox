/**
 * @file Pacote `5e`: id e nome sem a marca do jogo, aviso de não afiliação em todo pacote e o id antigo fora do
 * registro (sem alias nem migração: nenhuma ficha foi criada com ele).
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSystemPack, listSystemPackIds } from "../client/js/dungeon/system-pack.js";
import { PACK_5E } from "../client/js/dungeon/system-pack-5e.js";

const MARCA = /D&D|Dungeons/i;

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
  assert.equal(getSystemPack(["dnd5e", "2024"].join("-")), null);
  assert.ok(!listSystemPackIds().includes(["dnd5e", "2024"].join("-")));
});
