/**
 * @file Ação clicável salva sem `tag` e sem `damage` (ficha antiga ou gravada por outra versão) carrega com os padrões
 * certos: `tag` "acao", `damage` vazio e `roll` "1d20"; o resto (rótulo, rolagem, id) fica como estava.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { getSystemPack } from "../client/js/dungeon/system-pack.js";
import { createCampaign, ensureSheetMeta } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const salva = (clickable_actions, system = "5e") => ({ system: { id: system, version: 1 }, sheet_meta: { clickable_actions } });
const carregadas = (sheet) => ensureSheetMeta(sheet).sheet_meta.clickable_actions;

test("ação sem tag e sem dano carrega com tag acao e dano vazio, e mantém rótulo, rolagem e id", () => {
  const [a] = carregadas(salva([{ id: "act-espada", label: "Espada", roll: "1d20+3" }]));
  assert.deepEqual(a, { id: "act-espada", label: "Espada", roll: "1d20+3", damage: "", tag: "acao" });
});

test("ação sem rolagem carrega com 1d20; tag e dano nulos valem o padrão", () => {
  const [a] = carregadas(salva([{ id: "act-gesto", label: "Gesto", tag: null, damage: null }]));
  assert.equal(a.roll, "1d20");
  assert.equal(a.tag, "acao");
  assert.equal(a.damage, "");
});

test("tag só com espaços (ou vazia) carrega como acao, não como vazia", () => {
  for (const tag of ["   ", "", "\t\n", "   "]) {
    const [a] = carregadas(salva([{ id: "act-gesto", label: "Gesto", tag }]));
    assert.equal(a.tag, "acao", JSON.stringify(tag));
  }
});

test("tag com espaços nas pontas perde só os espaços e respeita o limite de 24 letras", () => {
  const [a] = carregadas(salva([{ id: "act-gesto", label: "Gesto", tag: `  ${"x".repeat(30)}  ` }]));
  assert.equal(a.tag, "x".repeat(24));
});

test("tag e dano que existem continuam como estavam", () => {
  const [a] = carregadas(salva([{ id: "act-arco", label: "Arco", roll: "1d20+5", damage: "1d6+3", tag: "ataque" }]));
  assert.equal(a.tag, "ataque");
  assert.equal(a.damage, "1d6+3");
});

test("sem id válido o id sai do rótulo; sem rótulo a ação some", () => {
  const acoes = carregadas(salva([{ label: "Golpe Sombrio" }, { id: "act-sem-nome", roll: "1d20" }]));
  assert.equal(acoes.length, 1);
  assert.match(acoes[0].id, /^golpe-sombrio/);
});

test("a semente de cada sistema, salva sem tag e sem dano, carrega com os mesmos ids e rolagens e os padrões", () => {
  for (const id of ["5e", "t20", "gurps4e"]) {
    const sementes = getSystemPack(id).seedActions;
    const cruas = sementes.map(({ id: aid, label, roll }) => ({ id: aid, label, roll }));
    const lidas = carregadas(salva(cruas, id));
    assert.deepEqual(lidas.map((a) => [a.id, a.label, a.roll]), sementes.map((a) => [a.id, a.label, a.roll]), id);
    assert.ok(lidas.every((a) => a.tag === "acao" && a.damage === ""), `${id}: padrões`);
  }
});

test("pelo armazenamento: a ficha gravada sem tag e sem dano volta do disco com os padrões", async () => {
  const store = createVttStore(createMemoryVttBackend());
  const doc = createCampaign({ id: "camp_seed", name: "Seed" });
  doc.sheetsById = { ficha: { character_id: "ficha", ...salva([{ id: "act-faca", label: "Faca", roll: "1d20+2" }]) } };
  await store.saveCampaign(doc);
  const lida = (await store.loadCampaign("camp_seed")).sheetsById.ficha;
  assert.deepEqual(carregadas(lida), [{ id: "act-faca", label: "Faca", roll: "1d20+2", damage: "", tag: "acao" }]);
});
