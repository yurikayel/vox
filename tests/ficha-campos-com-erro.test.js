/**
 * @file Campos com erro da ficha (assistente e Editar ficha): o campo recusado sai com `aria-invalid="true"` e com
 * `aria-describedby` apontando para o `<li>` da mensagem; sem erro, nenhum campo é marcado (WCAG 3.3.1).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createWizard } from "../client/js/dungeon/sheet-wizard.js";
import { renderWizard } from "../client/js/dungeon/sheet-wizard-view.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";

/** Tag de abertura do campo de nome `name` no HTML. */
const tagOf = (html, name) => new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";

/** Texto do `<li id>` para o qual o campo aponta, ou `null` se o campo não aponta para um aviso existente. */
function describedBy(html, name) {
  const id = /aria-describedby="([^"]+)"/.exec(tagOf(html, name))?.[1];
  return id ? new RegExp(`<li id="${id.split(" ")[0]}">([^<]*)</li>`).exec(html)?.[1] ?? null : null;
}

const wizardWith = (issues) => renderWizard({ ...createWizard(), mode: "guided", step: 1, issues });

test("assistente: o campo com erro é marcado e aponta para a mensagem", () => {
  const html = wizardWith([{ field: "sheetName", message: "Nome: a ficha precisa de um nome." }]);
  assert.match(tagOf(html, "sheetName"), /aria-invalid="true"/);
  assert.equal(describedBy(html, "sheetName"), "Nome: a ficha precisa de um nome.");
});

test("assistente: só o campo com erro é marcado e sem erro nada é marcado", () => {
  const html = wizardWith([{ field: "sheetName", message: "Nome: a ficha precisa de um nome." }]);
  assert.doesNotMatch(tagOf(html, "className"), /aria-invalid/);
  assert.doesNotMatch(wizardWith([]), /aria-invalid/);
});

const wizardAt = (step, issues) => renderWizard({ ...createWizard(), mode: "guided", step, issues });

test("assistente: atributo (numberField) com erro é marcado e aponta para a mensagem", () => {
  const message = "Força: 0 está fora do intervalo 1–30.";
  const html = wizardAt(2, [{ field: "str", message }]);
  assert.match(tagOf(html, "str"), /aria-invalid="true"/);
  assert.equal(describedBy(html, "str"), message);
  assert.doesNotMatch(tagOf(html, "dex"), /aria-invalid/);
});

test("assistente: perícia (checkGroup) com erro marca as caixas de dentro e o grupo só aponta para a mensagem", () => {
  const message = "Perícia: x não existe neste sistema.";
  const html = wizardAt(3, [{ field: "skill", message }]);
  assert.match(tagOf(html, "skill"), /aria-invalid="true"/, "caixa marcada");
  assert.equal(describedBy(html, "skill"), message);
  const grupo = /<fieldset[^>]*>/.exec(html)[0];
  assert.doesNotMatch(grupo, /aria-invalid/, "aria-invalid não vale em fieldset (ARIA 1.2)");
  assert.match(grupo, /aria-describedby="wizard-issue-0"/);
  assert.doesNotMatch(wizardAt(3, []), /aria-invalid/);
});

test("assistente: Dado de Vida (hitDie) com erro é marcado e aponta para a mensagem", () => {
  const message = "Dado de Vida: use d4, d6, d8, d10 ou d12.";
  const html = wizardAt(5, [{ field: "hitDie", message }]);
  assert.match(tagOf(html, "hitDie"), /aria-invalid="true"/);
  assert.equal(describedBy(html, "hitDie"), message);
});

test("Editar ficha: nome, CA e atributo com erro são marcados e apontam para a mensagem", () => {
  const issues = [
    { field: "sheetName", message: "Nome: a ficha precisa de um nome." },
    { field: "armorClass", message: "CA: o campo está em branco." },
    { field: "str", message: "Força: 0 está fora do intervalo 1–30." },
  ];
  const html = renderSheetEditPanel({}, { issues });
  for (const [name, i] of [["sheetName", 0], ["armorClass", 1], ["str", 2]]) {
    assert.match(tagOf(html, name), /aria-invalid="true"/, `${name} marcado`);
    assert.equal(describedBy(html, name), issues[i].message, `${name} aponta para a mensagem`);
  }
  assert.doesNotMatch(tagOf(html, "dex"), /aria-invalid/);
});

test("Editar ficha sem avisos não marca nenhum campo", () => {
  assert.doesNotMatch(renderSheetEditPanel({}, { issues: [] }), /aria-invalid/);
});
