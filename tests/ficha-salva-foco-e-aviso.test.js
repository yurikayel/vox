/**
 * @file Editar ficha: depois de um Salvar aceito o foco volta ao botão Salvar (alvo estável, dentro do painel que
 * continua aberto) em vez de cair no body. O aviso ("Ficha salva") continua visível no `<p>` da tela, como antes, e é
 * anunciado uma vez só numa região viva fixa fora do contêiner redesenhado (F54): o texto repetido de propósito é
 * anunciado de novo e um redesenho sem aviso novo não repete nada.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView } from "../client/js/dungeon/dungeon-controller.js";
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
  assert.equal(viva().className, "sr-only", "a região fica só para o leitor de tela");
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

test("aviso: o <p> visível persiste nos redesenhos seguintes e a região não repete o anúncio", async () => {
  const { container, state, handlers } = await fichaMontada();
  await envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  const no = viva();
  assert.equal(no.textContent, 'Ficha salva: "Kael".');
  assert.equal(state.campaignNotice, 'Ficha salva: "Kael".', "o aviso visível não é zerado");
  await envia(handlers, { sheetName: "Kael", armorClass: "99", sheetSystem: "5e", str: "10" });
  assert.ok(container.innerHTML.includes(`<p class="dungeon-inline-status">${escapeHtml('Ficha salva: "Kael".')}</p>`), "o <p> continua no redesenho seguinte");
  assert.equal(no.textContent, 'Ficha salva: "Kael".', "a região não anuncia de novo sem aviso novo");
});
test("aviso: o mesmo texto repetido de propósito é anunciado a cada vez (3×), sem trocar de nó", async () => {
  const { handlers } = await fichaMontada();
  const salva = () => envia(handlers, { sheetName: "Kael", armorClass: "15", sheetSystem: "5e", str: "10" });
  await salva();
  const no = viva();
  const lidos = [no.textContent];
  for (let i = 0; i < 3; i += 1) {
    await salva();
    assert.equal(viva(), no);
    assert.notEqual(no.textContent, lidos.at(-1), `o anúncio ${i + 2} muda a região para o leitor reler`);
    lidos.push(no.textContent);
  }
  assert.ok(lidos.every((t) => t.trim() === 'Ficha salva: "Kael".'));
});

/** Estado de sessão com um aviso, desenhado pela tela `screen`; devolve o HTML do `<p>` do aviso. */
function paragrafoDoAviso(screen) {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  state.campaignNotice = "Aviso visível";
  const html = renderDungeonView({ screen, state });
  const m = html.match(/<p class="dungeon-inline-status[^"]*"[^>]*>Aviso visível<\/p>/);
  assert.ok(m, `a tela ${screen} desenha o aviso num <p>`);
  return m[0];
}

for (const screen of ["acampamento", "mestre", "mesa", "ficha"]) {
  test(`aviso: o <p> da tela ${screen} não é uma região viva (quem anuncia é a região fixa)`, () => {
    assert.equal(/role=/.test(paragrafoDoAviso(screen)), false);
  });
}
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


test("aviso: gravar um aviso guarda o pendente; limpar o visível não apaga o que ainda não foi anunciado", () => {
  const state = createDungeonSessionState({});
  assert.equal(state.noticePending, "");
  state.campaignNotice = "Primeiro";
  assert.equal(state.noticePending, "Primeiro");
  state.campaignNotice = "";
  assert.equal(state.campaignNotice, "");
  assert.equal(state.noticePending, "Primeiro", "o pendente só é zerado por quem anuncia");
  assert.equal(createDungeonSessionState({ campaignNotice: "Inicial" }).noticePending, "Inicial", "um aviso passado na criação também fica pendente");
});