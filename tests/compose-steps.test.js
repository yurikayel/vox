import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderStep, renderStepHeader, renderComposeBlocked, renderFeiraDisabled, COMPOSE_TOPIC_STEPS } from "../client/js/render/compose-steps.js";

const render = await import("../client/js/render.js");

test("compose-steps — cabeçalho mostra etapa N de M e progresso", () => {
  const html = renderStepHeader(2);
  assert.ok(html.includes(`Etapa 3 de ${COMPOSE_TOPIC_STEPS.length}`));
  assert.equal((html.match(/compose-step-seg is-done/g) || []).length, 3);
  assert.ok(html.includes("Onde e sobre o quê?"));
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
  assert.ok(html.includes('data-sphere="social"') && html.includes('data-sphere="civic"'), "primeiro escolhe Social ou Cívico");
  assert.ok(html.includes('id="compose-social-panel"') && html.includes('id="inline-topic-file"'), "Social traz o composer com mídias");
});

test("compose-steps — compositor bloqueado explica o porquê e sempre oferece saída", () => {
  const html = renderComposeBlocked({
    title: "Sem <permissão>",
    body: "Motivo & saída",
    actions: [{ href: "#/c/a?x=1&y=2", label: "Voltar", primary: true }, { href: "#/", label: "Início" }],
  });
  assert.ok(html.includes("<h2>Sem &lt;permissão&gt;</h2>"), "título escapado");
  assert.ok(html.includes("<p>Motivo &amp; saída</p>"));
  assert.ok(html.includes('class="agora-btn agora-btn--primary" href="#/c/a?x=1&amp;y=2"'));
  assert.ok(html.includes('class="agora-btn agora-btn--secondary" href="#/"'));
  assert.ok(!renderComposeBlocked({ title: "t", body: "b" }).includes("compose-blocked-actions"), "sem ações, sem fileira vazia");
});

test("compose-steps — feira desligada leva à proposta de abertura e de volta à comunidade", () => {
  const html = renderFeiraDisabled("bairro sul");
  assert.ok(html.includes("Feira comunitária não ativada"));
  assert.ok(html.includes('href="#/compose/proposal?c=bairro%20sul"'), "atalho para propor a feira");
  assert.ok(html.includes('href="#/c/bairro%20sul"'), "volta à comunidade");
});
