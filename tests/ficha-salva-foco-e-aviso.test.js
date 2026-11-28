/**
 * @file Editar ficha: depois de um Salvar aceito o foco volta ao botão Salvar (alvo estável, dentro do painel que
 * continua aberto) em vez de cair no body, e o aviso "Ficha salva" é anunciado na região viva fixa dos avisos (F54: um\n * único nó fora do contêiner redesenhado, o aviso é zerado depois de anunciado e um texto repetido é anunciado de novo).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { escapeHtml } from "../client/js/shared/html.js";
import { drainMicrotasks } from "./helpers/wait-until.js";
import { createAndSelectCampaign } from "../client/js/dungeon/dungeon-persistence.js";
import { installFakeDom } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const regiao = () => doc.getElementById("dungeon-notice-live");
/** A região fixa dos avisos; falha por asserção (e não por TypeError) quando ela não existe. */
const viva = () => { const no = regiao(); assert.ok(no, "a região fixa dos avisos existe"); return no; };

const campo = (values) => (sel) => { const m = sel.match(/name=(\w+)/); return m && m[1] in values ? { value: values[m[1]] } : null; };

/** Ficha real num contêiner falso: só acha `[data-edit-save]` se o HTML desenhado tiver o atributo. */
async function fichaMontada() {
  if (regiao()) regiao().textContent = "";
  const store = createVttStore(createMemoryVttBackend());
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  await createAndSelectCampaign(state, "Mesa", { store });
  const handlers = {};
  const foco = [];
  const container = {
    dataset: {}, innerHTML: "",
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector(sel) { return sel === "[data-edit-save]" && this.innerHTML.includes("data-edit-save") ? { focus: () => foco.push("salvar") } : null; },
    querySelectorAll: () => [],
  };
  wireDungeonView(container, { screen: "ficha", state, store });
  await drainMicrotasks(300);
  foco.length = 0;
  return { container, state, handlers, foco };
}

const envia = (handlers, values) => handlers.submit({
  target: { dataset: { dungeon: "edit-sheet-form" }, querySelector: campo(values) },
  preventDefault() {},
});

test("Salvar aceito: o foco vai ao botão Salvar, não cai no body", async () => {
  const { handlers, foco } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  assert.deepEqual(foco, ["salvar"]);
});

test("Salvar aceito: 'Ficha salva' é anunciado na região fixa, e o aviso desenhado não vira outra região viva", async () => {
  const { container, handlers } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  assert.equal(viva().textContent, 'Ficha salva: "Kael".');
  assert.equal(viva().getAttribute("role"), "status");
  assert.equal(viva().getAttribute("aria-live"), "polite");
  assert.equal(viva().parentNode ?? viva().parent, doc.body, "a região fica no body, fora do contêiner redesenhado");
  assert.equal((container.innerHTML.match(/Ficha salva/g) ?? []).length, 1, "o aviso visível aparece em um só lugar");
  assert.ok(container.innerHTML.includes(`<p class="dungeon-inline-status">${escapeHtml('Ficha salva: "Kael".')}</p>`));
  assert.equal(container.innerHTML.match(/role="alert"/g), null, "nenhum role=alert novo");
  assert.equal(container.innerHTML.includes('role="status">Ficha salva'), false, "o aviso dentro do contêiner não é região viva");
});

test("aviso: a região fixa é o MESMO nó depois de redesenhos, e o texto só muda com aviso novo", async () => {
  const { handlers } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  const no = viva();
  await envia(handlers, { sheetName: "Lyra", armorClass: "14", sheetSystem: "5e", str: "10" });
  assert.equal(viva(), no, "o nó é o mesmo depois do 2º redesenho");
  assert.equal(no.textContent, 'Ficha salva: "Lyra".');
  await envia(handlers, { sheetName: "Lyra", armorClass: "99", sheetSystem: "5e", str: "10" });
  assert.equal(viva(), no);
  assert.equal(no.textContent, 'Ficha salva: "Lyra".', "um redesenho sem aviso novo não mexe no texto");
});

test("aviso: depois de anunciado o aviso é zerado, e não volta nos redesenhos seguintes", async () => {
  const { container, state, handlers } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  assert.equal(state.campaignNotice, "");
  await envia(handlers, { sheetName: "Kael", armorClass: "99", sheetSystem: "5e", str: "10" });
  assert.equal(container.innerHTML.includes("Ficha salva"), false, "o redesenho seguinte não traz o aviso de volta");
});

test("aviso: o mesmo texto repetido de propósito é anunciado de novo (a região muda), sem trocar de nó", async () => {
  const { handlers } = await fichaMontada();
  const salva = () => envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  await salva();
  const no = viva();
  const primeiro = no.textContent;
  await salva();
  assert.equal(viva(), no);
  assert.notEqual(no.textContent, primeiro, "o texto mudou para o leitor reler");
  assert.equal(no.textContent.trim(), primeiro.trim());
});
test("Salvar recusado continua indo ao resumo dos erros, não ao botão Salvar", async () => {
  const { handlers, foco } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "99", sheetSystem: "5e", str: "10" });
  assert.deepEqual(foco, []);
});

test("o botão Salvar é o único alvo [data-edit-save] da ficha", async () => {
  const { container, handlers } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  assert.equal((container.innerHTML.match(/data-edit-save/g) ?? []).length, 1);
});

