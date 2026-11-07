import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderStep, renderStepHeader, COMPOSE_TOPIC_STEPS } from "../client/js/render/compose-steps.js";

const render = await import("../client/js/render.js");

test("compose-steps — cabeçalho mostra etapa N de M e progresso", () => {
  const html = renderStepHeader(2);
  assert.ok(html.includes(`Etapa 3 de ${COMPOSE_TOPIC_STEPS.length}`));
  assert.equal((html.match(/compose-step-seg is-done/g) || []).length, 3);
  assert.ok(html.includes("Escreva"));
});

test("compose-steps — só a primeira etapa começa visível; a última publica", () => {
  const first = renderStep(0, "x", { backHref: "#/" });
  const last = renderStep(4, "y", { submitId: "btn-submit-topic", submitLabel: "Publicar" });
  assert.ok(!first.includes(" hidden>"));
  assert.ok(first.includes('href="#/"') && first.includes("data-step-next"));
  assert.ok(last.includes(" hidden>"));
  assert.ok(last.includes('type="submit"') && last.includes('id="btn-submit-topic"'));
  assert.ok(last.includes("data-step-prev"));
});

test("compose-steps — compositor de post tem 5 etapas e preserva os campos", () => {
  const main = { innerHTML: "" };
  render.renderComposeTopic(main, "");
  const html = main.innerHTML;
  assert.equal((html.match(/class="compose-step"/g) || []).length, 5);
  for (const id of ["topic-comm-id", "topic-title", "topic-body", "topic-civic-tag", "chat-transcript-input", "btn-submit-topic"]) {
    assert.ok(html.includes(`id="${id}"`), `falta #${id}`);
  }
  assert.ok(html.includes("data-compose-review"));
});
