/**
 * @file Roteiro "Primeira mesa" (SUB-32): seis passos que se marcam pelo estado real da mesa, painel no Escudo do Mestre,
 * sumiço quando completo ou dispensado, texto do usuário escapado e folha registrada no carregador sob demanda.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { firstTableSteps, renderFirstTablePanel } from "../client/js/dungeon/first-table-checklist.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import { SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";

const IDS = ["campaign", "map", "token", "fog", "roll", "invite"];
const scene = (floor = {}, tokens = []) => ({ floors: [{ z: 0, ...floor }], tokens });

function fullState() {
  return {
    campaignId: "c1",
    scene: scene({ mapBlobHash: "abc", fog: { enabled: true } }, [{ id: "t1" }]),
    rolls: [{ id: "r1" }],
    inviteHref: "#/dungeon/entrar/x",
  };
}

test("estado vazio: 6 passos na ordem fixa, nenhum feito", () => {
  const steps = firstTableSteps({});
  assert.deepEqual(steps.map((s) => s.id), IDS);
  assert.ok(steps.every((s) => s.done === false));
});

test("estado completo: os 6 feitos e o painel some", () => {
  const state = fullState();
  assert.ok(firstTableSteps(state).every((s) => s.done));
  assert.equal(renderFirstTablePanel(state), "");
});

test("cada passo marca só pelo seu dado (um de cada vez)", () => {
  const base = fullState();
  const without = {
    campaign: { ...base, campaignId: "" },
    map: { ...base, scene: scene({ fog: { enabled: true } }, [{ id: "t1" }]) },
    token: { ...base, scene: scene({ mapBlobHash: "abc", fog: { enabled: true } }, []) },
    fog: { ...base, scene: scene({ mapBlobHash: "abc", fog: { enabled: false } }, [{ id: "t1" }]) },
    roll: { ...base, rolls: [] },
    invite: { ...base, inviteHref: "" },
  };
  for (const id of IDS) {
    const steps = firstTableSteps(without[id]);
    assert.deepEqual(steps.filter((s) => !s.done).map((s) => s.id), [id], `sem ${id}`);
  }
});

test("estado parcial: painel nomeado, 2 marcados e o próximo passo com o texto da ação", () => {
  const html = renderFirstTablePanel({ campaignId: "c1", scene: scene({ mapBlobHash: "abc" }) });
  assert.match(html, /aria-label="Primeira mesa"/);
  assert.equal((html.match(/is-done/g) || []).length, 2);
  assert.match(html, /Próximo:<\/strong> Adicione uma ficha ou um token simples ao mapa\./);
});

test("o painel não ecoa dado do estado: só rótulos fixos entram no HTML", () => {
  const html = renderFirstTablePanel({ campaignId: "<img src=x>", inviteHref: "<b>x</b>", dungeonPrefs: {} });
  assert.ok(!html.includes("<img") && !html.includes("<b>x"), "nenhum dado do estado entra no painel");
});

test("dispensar: dungeonPrefs.firstTableDismissed === true esconde o painel", () => {
  assert.equal(renderFirstTablePanel({ dungeonPrefs: { firstTableDismissed: true } }), "");
  assert.notEqual(renderFirstTablePanel({ dungeonPrefs: { firstTableDismissed: false } }), "");
});

test("o Escudo do Mestre monta o painel (data-first-table) com estado vazio", () => {
  assert.match(renderDmScreen(createDungeonSessionState({})), /data-first-table/);
});

const doneOf = (state) => firstTableSteps(state).filter((s) => s.done).map((s) => s.id);

test("sessão real do Mestre: a cena padrão (Lyra e Sentinela) não marca 'Colocar um token'", () => {
  const state = createDungeonSessionState({});
  assert.ok((state.scene.tokens || []).length >= 2, "a cena padrão traz tokens sem o Mestre fazer nada");
  assert.deepEqual(doneOf(state), []);
  const html = renderFirstTablePanel(state);
  assert.match(html, /0 de 6/);
  assert.match(html, /Próximo:<\/strong> Crie uma campanha/);
});

test("sessão real: um token novo (fora da cena padrão) marca o passo e o contador sobe para 1 de 6", () => {
  const state = createDungeonSessionState({});
  state.scene.tokens.push({ tokenId: "tok-do-mestre", name: "Goblin", layer: "gm" });
  assert.deepEqual(doneOf(state), ["token"]);
  assert.match(renderFirstTablePanel(state), /1 de 6/);
});

test("sessão real: tirar os dois tokens padrão sem pôr outro deixa o passo aberto", () => {
  const state = createDungeonSessionState({});
  state.scene.tokens = [];
  assert.deepEqual(doneOf(state), []);
});

test("o contador e as marcas concordam: N de 6 é o número de ✓ e de itens is-done; o resto é ○", () => {
  const html = renderFirstTablePanel({ campaignId: "c1", rolls: [{ id: "r1" }], scene: scene({ mapBlobHash: "abc" }) });
  const done = (html.match(/is-done/g) || []).length;
  assert.equal(done, 3);
  assert.match(html, new RegExp(`${done} de 6`));
  assert.equal((html.match(/✓/g) || []).length, done);
  assert.equal((html.match(/○/g) || []).length, 6 - done);
  assert.match(html, /is-done">✓ Criar a campanha/);
  assert.match(html, /step">○ Ligar a névoa/);
});

test("sem `scene` no estado, a cena ativa vem do `campaignDoc` (mapa, token e névoa)", () => {
  const campaignDoc = {
    activeSceneId: "sc-1",
    scenesById: { "sc-1": scene({ mapBlobHash: "abc", fog: { enabled: true } }, [{ tokenId: "tok-x" }]) },
  };
  assert.deepEqual(doneOf({ campaignDoc }), ["map", "token", "fog"]);
});

test("a folha sv-primeira-mesa.css existe, usa só tokens e está no carregador sob demanda", () => {
  const css = fs.readFileSync(new URL("../client/css/sv-primeira-mesa.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!css.includes("!important"));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "sem cor literal");
  assert.ok(SV_SHEETS.some((s) => s.href === "css/sv-primeira-mesa.css" && s.id === "sv-primeira-mesa-stylesheet"));
});
