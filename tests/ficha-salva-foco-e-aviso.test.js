/**
 * @file Editar ficha: depois de um Salvar aceito o foco volta ao botão Salvar (alvo estável, dentro do painel que
 * continua aberto) em vez de cair no body, e o aviso "Ficha salva" sai na região de status que a tela já tem.
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

const campo = (values) => (sel) => { const m = sel.match(/name=(\w+)/); return m && m[1] in values ? { value: values[m[1]] } : null; };

/** Ficha real num contêiner falso: só acha `[data-edit-save]` se o HTML desenhado tiver o atributo. */
async function fichaMontada() {
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
  return { container, handlers, foco };
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

test("Salvar aceito: 'Ficha salva' sai na região de status que já existe, sem região viva nova", async () => {
  const { container, handlers } = await fichaMontada();
  await envia(handlers, { sheetName: "Lyra", armorClass: "14", sheetSystem: "5e", str: "10" });
  const antes = (container.innerHTML.match(/role="status"/g) ?? []).length;
  assert.ok(antes >= 1, "a região do aviso já existe antes do segundo Salvar");
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  assert.ok(container.innerHTML.includes(`<p class="dungeon-inline-status" role="status">${escapeHtml('Ficha salva: "Kael".')}</p>`));
  assert.equal((container.innerHTML.match(/Ficha salva/g) ?? []).length, 1, "o aviso aparece em uma só região");
  assert.equal(container.innerHTML.match(/role="alert"/g), null, "nenhum role=alert novo");
  assert.equal((container.innerHTML.match(/role="status"/g) ?? []).length, antes, "o aviso ocupa a região de status que já existia, sem região viva nova");
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

