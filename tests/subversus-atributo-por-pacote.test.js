/**
 * @file SUB-21 PR-B: `@atributo` e `@prof` das fórmulas seguem o pacote do sistema da ficha (T20: valor − 10 e sem
 * proficiência), e as ações semeadas numa ficha nova vêm do pacote (5e: 4; T20: só o ataque; GURPS: nenhuma). O dock
 * do HUD e a aba Jogar não listam a semente que o botão do pacote já cobre nem a semente de outro sistema, sem apagar
 * nada da ficha. Só some a semente intacta: qualquer campo editado a devolve à lista.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveSheetVars, rollDiceFormula } from "../client/js/dungeon/dice-engine.js";
import { buildHudShortcuts } from "../client/js/dungeon/sheet-view-model.js";
import { DEFAULT_CLICKABLE_ACTIONS, ensureSheetMeta, isForeignSeed } from "../client/js/dungeon/vtt-schema.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderHudPanel } from "../client/js/dungeon/screen-hud-panels.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderPlayTab } from "../client/js/dungeon/screen-sheet-tabs.js";
import { resolveSheetSystem } from "../client/js/dungeon/screen-sheet-derived.js";

const abilities = { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

function sheetOf(systemId, extra = {}) {
  const system = systemId ? { system: { id: systemId, version: 1 } } : {};
  return { char_id: "c1", ...system, attributes_lww: { level: 5, abilities }, ...extra };
}

/** Ficha com as 4 sementes antigas gravadas, como as criadas antes de cada sistema ter as suas. */
const legacy = (systemId) => sheetOf(systemId, { sheet_meta: { clickable_actions: DEFAULT_CLICKABLE_ACTIONS.map((a) => ({ ...a })) } });

const labelsOf = (shortcuts) => shortcuts.filter((s) => s.action === "roll-action").map((s) => s.label);

/** Bônus que o dado somou: total menos o d20 mantido. */
function bonusOf(formula, sheet) {
  const result = rollDiceFormula(formula, { sheet });
  assert.equal(result.ok, true, result.error);
  const kept = result.rolls.find((d) => d.kept && d.sides === 20);
  return result.total - kept.value;
}

test("T20: @for e @des usam valor − 10 e @prof é zero (Força 8 = −2, Destreza 14 = +4)", () => {
  const vars = resolveSheetVars(sheetOf("t20"));
  assert.deepEqual([vars.for, vars.des, vars.prof], [-2, 4, 0]);
});

test("T20: o ataque semeado rola com o modificador do T20, não o da 5e", () => {
  assert.equal(bonusOf("1d20+@for+@prof", sheetOf("t20")), -2);
});

test("5e (controle): Força 8 = −1 e @prof pelo nível, com ou sem system, e com pacote desconhecido", () => {
  for (const id of ["5e", undefined, "nao-existe"]) {
    const vars = resolveSheetVars(sheetOf(id));
    assert.deepEqual([vars.for, vars.des, vars.prof], [-1, 2, 3], String(id));
  }
  assert.equal(bonusOf("1d20+@for+@prof", sheetOf("5e")), 2);
});

test("GURPS: sem proficiência e com o modificador de valor − 10", () => {
  const vars = resolveSheetVars(sheetOf("gurps4e"));
  assert.deepEqual([vars.for, vars.prof], [-2, 0]);
});

test("o bônus de proficiência guardado na ficha continua valendo, qualquer que seja o pacote", () => {
  assert.equal(resolveSheetVars(sheetOf("t20", { sheet_meta: { proficiency_bonus: 4 } })).prof, 4);
});

test("ficha nova: 5e semeia as 4 ações, T20 só o ataque e GURPS nenhuma", () => {
  const seeds = (id) => ensureSheetMeta({ schema_version: "1.0.0", system: { id } }).sheet_meta.clickable_actions.map((a) => a.id);
  assert.deepEqual(seeds("5e"), ["act-ataque", "act-investigacao", "act-percepcao", "act-furtividade"]);
  assert.deepEqual(seeds("t20"), ["act-ataque"]);
  assert.deepEqual(seeds("gurps4e"), []);
  assert.equal(ensureSheetMeta({}).sheet_meta.clickable_actions.length, 4, "sem system vale a 5e");
});

test("dock do T20: some a perícia semeada que o botão do pacote cobre; o ataque fica", () => {
  assert.deepEqual(labelsOf(buildHudShortcuts(legacy("t20"))), ["Espada Longa"]);
});

test("dock da 5e: o ataque fica e as perícias semeadas já cobertas pelo pacote saem", () => {
  assert.deepEqual(labelsOf(buildHudShortcuts(legacy("5e"))), ["Espada Longa"]);
  assert.deepEqual(labelsOf(buildHudShortcuts(legacy(undefined))), ["Espada Longa"]);
});

test("dock de uma ficha GURPS antiga: nenhuma semente da 5e, e os dados da ficha continuam lá", () => {
  const sheet = legacy("gurps4e");
  assert.deepEqual(labelsOf(buildHudShortcuts(sheet)), []);
  assert.equal(ensureSheetMeta(sheet).sheet_meta.clickable_actions.length, 4, "nada é apagado");
});

test("ação cadastrada à mão ou editada nunca é tratada como semente", () => {
  const custom = { id: "x1", label: "Furtividade", roll: "1d20+@des+2", damage: "", tag: "pericia" };
  const edited = { id: "act-investigacao", label: "Investigação", roll: "1d20+@int+5", damage: "", tag: "pericia" };
  for (const id of ["5e", "t20", "gurps4e"]) {
    const sheet = sheetOf(id, { sheet_meta: { clickable_actions: [custom, edited] } });
    assert.deepEqual(labelsOf(buildHudShortcuts(sheet)), ["Furtividade", "Investigação"], id);
  }
});

/** Semente da 5e pelo id, com os campos trocados. */
const seedWith = (id, patch) => ({ ...DEFAULT_CLICKABLE_ACTIONS.find((a) => a.id === id), ...patch });
const dockOf = (systemId, actions) => labelsOf(buildHudShortcuts(sheetOf(systemId, { sheet_meta: { clickable_actions: actions } })));

/** Edições de um único campo da semente: cada uma a torna uma ação da pessoa. */
const EDITS = [
  ["rótulo do ataque", seedWith("act-ataque", { label: "Machado" })],
  ["dano do ataque", seedWith("act-ataque", { damage: "2d6+@for" })],
  ["etiqueta do ataque", seedWith("act-ataque", { tag: "magia" })],
  ["rótulo da perícia", seedWith("act-percepcao", { label: "Perceber" })],
  ["etiqueta da perícia", seedWith("act-percepcao", { tag: "acao" })],
];

test("semente editada em qualquer campo (rótulo, dano ou etiqueta) aparece no dock do T20 e do GURPS", () => {
  for (const systemId of ["t20", "gurps4e"]) {
    for (const [nome, act] of EDITS) assert.deepEqual(dockOf(systemId, [act]), [act.label], `${systemId}: ${nome}`);
  }
});

test("isForeignSeed: a semente intacta é alheia ao GURPS (e à ficha sem a semente), editada não, e na 5e nunca", () => {
  const intact = ensureSheetMeta(legacy("gurps4e")).sheet_meta.clickable_actions;
  assert.equal(intact.length, 4);
  for (const act of intact) assert.equal(isForeignSeed(act, "gurps4e"), true, act.id);
  assert.equal(isForeignSeed(intact.find((a) => a.id === "act-furtividade"), "t20"), true);
  for (const [nome, act] of EDITS) assert.equal(isForeignSeed(act, "gurps4e"), false, nome);
  for (const act of intact) assert.equal(isForeignSeed(act, "5e"), false, `5e: ${act.id}`);
});

test("ação à mão com o id de uma semente, com o roll dela ou com todos os campos dela e id próprio, não some do dock", () => {
  const sameId = { id: "act-ataque", label: "Minha espada", roll: "1d20+@des", damage: "1d6", tag: "ataque" };
  const sameRoll = { id: "x1", label: "Furtividade", roll: "1d20+@des", damage: "", tag: "acao" };
  const sameAll = seedWith("act-ataque", { id: "meu-ataque" });
  for (const systemId of ["5e", "t20", "gurps4e"]) {
    assert.deepEqual(dockOf(systemId, [sameId, sameRoll]), ["Minha espada", "Furtividade"], systemId);
  }
  assert.deepEqual(dockOf("gurps4e", [sameAll]), ["Espada Longa"], "gurps4e: só o id é próprio");
});

function stateWith(systemId, actions) {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  Object.assign(state.sheet, {
    system: { id: systemId, version: 1 },
    attributes_lww: { level: 3, abilities: { dex: 14, con: 14 } },
    pools_base: { hp_max: 20, hp_current: 20 },
    inventory_orset: {},
    sheet_meta: { clickable_actions: actions },
  });
  return state;
}

test("aba Jogar de uma ficha GURPS antiga: a semente intacta da 5e some e a editada aparece", () => {
  const intact = DEFAULT_CLICKABLE_ACTIONS.map((a) => ({ ...a }));
  const skills = resolveSheetSystem(sheetOf("gurps4e")).derived.skills;
  const plain = renderPlayTab(intact, skills, true, "gurps4e");
  assert.doesNotMatch(plain, /Espada Longa|data-action-id="act-/, "nenhuma semente da 5e na ficha GURPS");
  for (const [nome, act] of EDITS) {
    const html = renderPlayTab([act], skills, true, "gurps4e");
    assert.ok(html.includes(`data-action-id="${act.id}"`) && html.includes(`<strong>${act.label}</strong>`), `aparece: ${nome}`);
  }
});

test("aba Jogar: na 5e (ou sem sistema) o ataque semeado segue na lista", () => {
  const intact = DEFAULT_CLICKABLE_ACTIONS.map((a) => ({ ...a }));
  const skills = resolveSheetSystem(sheetOf("5e")).derived.skills;
  assert.match(renderPlayTab(intact, skills, true, "5e"), /Espada Longa/);
  assert.match(renderPlayTab(intact, skills), /Espada Longa/);
});

/** Só a aba Jogar da ficha (a aba Ataques e Habilidades lista tudo o que a ficha guarda, para editar). */
const playPanelOf = (html) => html.split('dungeon-sheet-tab-panel is-play">')[1].split('dungeon-sheet-tab-panel is-abilities')[0];

test("a ficha e o painel do HUD passam o sistema da ficha para a aba Jogar", () => {
  const intact = DEFAULT_CLICKABLE_ACTIONS.map((a) => ({ ...a }));
  const edited = seedWith("act-percepcao", { label: "Perceber" });
  const renders = [(s) => playPanelOf(renderSheetScreen(s)), (s) => renderHudPanel({ ...s, hudPanel: "abilities" })];
  for (const render of renders) {
    const html = render(stateWith("gurps4e", [...intact, edited]));
    assert.doesNotMatch(html, /Espada Longa/, "semente intacta fora");
    assert.match(html, /<strong>Perceber<\/strong>/, "semente editada dentro");
    assert.match(render(stateWith("5e", intact)), /Espada Longa/, "5e segue igual");
  }
});
