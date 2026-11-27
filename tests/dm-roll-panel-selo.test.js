/**
 * @file SUB-33: selo de rolagem verificável no painel "Rolagens" do Escudo do Mestre. Com a flag de laboratório
 * `vox.lab.fairplay` ligada, cada linha cuja entrada da Crônica (`turn-<id>`) tem selo mostra o mesmo selo da Crônica
 * numa coluna "Conferida"; sem a flag a tabela não muda; rolagem sem entrada Fairplay fica com a célula vazia; falta
 * registrada mostra o texto de falta; o texto do jogador segue escapado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDmRollPanel } from "../client/js/dungeon/dm-roll-panel.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import { FAIRPLAY_LAB_KEY } from "../client/js/dungeon/vtt-fairplay-selo.js";

const roll = (extra = {}) => ({ id: "a", speaker: "Lia", label: "Furtividade", formula: "1d20+3", total: 14, visibility: "public", ...extra });
const VERIFIED = { status: "verified", label: "✓ Verificada", detail: "Este aparelho refez a conta." };
const withSeal = (extra = {}) => ({
  rolls: [roll()],
  chronicle: [{ id: "turn-a", fairplayRollId: "fp1" }],
  fairplaySeals: { "turn-a": VERIFIED },
  fairplayLabEnabled: true,
  ...extra,
});
const rowsOf = (html) => [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => m[1]);

test("a) flag ligada: a linha da rolagem traz o selo da Crônica e a coluna 'Conferida' aparece", () => {
  const html = renderDmRollPanel(withSeal());
  assert.match(html, /<th scope="col">Conferida<\/th>/);
  assert.match(rowsOf(html)[0], /<tr><th scope="row">Lia<\/th>[\s\S]*<td><details class="dungeon-fairplay-seal is-verified"><summary>✓ Verificada<\/summary><p>Este aparelho refez a conta\.<\/p><\/details><\/td><\/tr>/);
});

test("b) flag desligada (sem a chave no armazenamento): nenhum selo e nenhuma coluna nova", () => {
  globalThis.localStorage?.removeItem?.(FAIRPLAY_LAB_KEY);
  const html = renderDmRollPanel(withSeal({ fairplayLabEnabled: false }));
  assert.doesNotMatch(html, /dungeon-fairplay-seal|Conferida/);
  assert.match(html, /<th scope="col">Modo<\/th><\/tr><\/thead>/);
  assert.match(rowsOf(html)[0], /Pública<\/td><\/tr>/);
});

test("c) flag ligada só no armazenamento do aparelho (sem o campo no estado) também mostra o selo", () => {
  globalThis.localStorage?.setItem?.(FAIRPLAY_LAB_KEY, "1");
  try {
    assert.match(renderDmRollPanel(withSeal({ fairplayLabEnabled: undefined })), /dungeon-fairplay-seal is-verified/);
  } finally {
    globalThis.localStorage?.removeItem?.(FAIRPLAY_LAB_KEY);
  }
});

test("d) rolagem sem entrada Fairplay na Crônica: célula vazia, e a que tem selo não perde o dela", () => {
  const html = renderDmRollPanel(withSeal({ rolls: [roll(), roll({ id: "b", speaker: "Bo" })] }));
  const [body] = rowsOf(html);
  assert.match(body, /<th scope="row">Bo<\/th>[\s\S]*?Pública<\/td><td><\/td><\/tr>/, "sem entrada: <td></td>");
  assert.match(body, /<th scope="row">Lia<\/th>[\s\S]*?is-verified/);
  const plain = renderDmRollPanel(withSeal({ chronicle: [{ id: "turn-a" }] }));
  assert.match(rowsOf(plain)[0], /Pública<\/td><td><\/td><\/tr>/, "entrada sem fairplayRollId: célula vazia");
});

test("e) rolagem anulada (fairplayFault): a célula mostra o texto de falta, nunca o selo de verificada", () => {
  const state = withSeal({ chronicle: [{ id: "turn-a", fairplayRollId: "fp1", fairplayFault: true }], fairplaySeals: { "turn-a": VERIFIED } });
  const body = rowsOf(renderDmRollPanel(state))[0];
  assert.match(body, /<p class="dungeon-fairplay-seal is-unverified" role="status">falta registrada pelo Mestre/);
  assert.doesNotMatch(body, /is-verified/);
});

test("f) com a coluna ligada o texto do jogador continua escapado e as outras colunas não mudam", () => {
  const html = renderDmRollPanel(withSeal({ rolls: [roll({ speaker: "<b>Nova</b>", label: "<i>x</i>" })] }));
  assert.doesNotMatch(html, /<b>Nova|<i>x/);
  assert.ok(html.includes("&lt;b&gt;Nova&lt;/b&gt;"));
  assert.match(rowsOf(html)[0], /<td>14<\/td><td>Pública<\/td><td><details/);
});

test("g) as duas abas (Todas e Secretas) trazem a coluna, e o Escudo do Mestre monta o painel com o selo", () => {
  const state = createDungeonSessionState();
  state.rolls = [roll({ visibility: "gm" })];
  state.chronicle = [{ id: "turn-a", fairplayRollId: "fp1" }];
  state.fairplaySeals = { "turn-a": VERIFIED };
  state.fairplayLabEnabled = true;
  const html = renderDmScreen(state);
  assert.equal((html.match(/<th scope="col">Conferida<\/th>/g) || []).length, 2, "uma por aba");
  assert.match(html, /aria-label="Rolagens do Mestre"[\s\S]*is-verified/);
});
