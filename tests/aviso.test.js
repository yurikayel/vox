import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const aviso = await import("../client/js/aviso.js");

const NOW = Date.UTC(2026, 10, 11, 12);
const DAY = 24 * 60 * 60 * 1000;
const META = { id: "c1", owner: "vx_dono", moderators: "vx_mod" };

const draft = (extra = {}) => ({
  communityId: "c1",
  avisoKind: "convocacao",
  title: "Assembleia da quadra",
  body: "Pauta: reforma e contas.",
  eventAt: NOW + 2 * DAY,
  eventPlace: "Salão",
  ...extra,
});

const signed = (extra = {}) => ({ ...aviso.buildAviso(draft(), NOW), id: "a1", author: "vx_dono", sig: "sig-a1", ...extra });

test("aviso — rascunho válido vira tópico com campos no topo e sem foto", () => {
  const body = aviso.buildAviso(draft(), NOW);
  assert.equal(body.type, "topic");
  assert.equal(body.avisoKind, "convocacao");
  assert.equal(body.authorAvatar, "");
  assert.equal(body.eventPlace, "Salão");
  for (const value of Object.values(body)) assert.notEqual(typeof value, "object");
});

test("aviso — limites, encontro só em convocação e cobrança recusada", () => {
  assert.deepEqual(aviso.validateAvisoDraft(draft({ title: "curto" })), ["title"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ body: "x".repeat(281) })), ["body"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ eventAt: 0 })), ["eventAt"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ avisoKind: "informe" })), ["eventAt"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ avisoKind: "cobranca" })), ["avisoKind", "eventAt"]);
  assert.throws(() => aviso.buildAviso(draft({ communityId: "" }), NOW), /communityId/);
});

test("aviso — selo só para dono ou moderação da mesma comunidade", () => {
  assert.equal(aviso.hasAvisoSeal(signed(), META), true);
  assert.equal(aviso.hasAvisoSeal(signed({ author: "vx_mod" }), META), true);
  assert.equal(aviso.hasAvisoSeal(signed({ author: "vx_outro" }), META), false);
  assert.equal(aviso.hasAvisoSeal(signed({ communityId: "c2" }), META), false);
  assert.equal(aviso.hasAvisoSeal(signed({ avisoKind: "cobranca" }), META), false);
  assert.equal(aviso.hasAvisoSeal({ type: "topic", author: "vx_dono" }, META), false);
});

test("aviso — topo, vencimento e cancelamento só valem de quem modera", () => {
  const old = signed({ id: "a0", ts: NOW - DAY });
  const fresh = signed({ id: "a2", ts: NOW });
  const expired = signed({ id: "a3", ts: NOW - 3 * DAY, eventAt: NOW - 2 * DAY });
  const foreignCancel = signed({ id: "x", author: "vx_outro", cancels: "a2" });
  assert.equal(aviso.pinnedAviso([old, fresh, expired, foreignCancel], META, NOW).id, "a2");
  const cancel = signed({ id: "a4", ts: NOW + 1, cancels: "a2", avisoKind: "informe", eventAt: undefined });
  const states = Object.fromEntries(aviso.classifyAvisos([old, fresh, expired, cancel], META, NOW).map((p) => [p.id, p.avisoState]));
  assert.deepEqual(states, { a4: "ativo", a2: "cancelado", a0: "ativo", a3: "encerrado" });
  assert.equal(aviso.avisoExpiresAt({ ts: NOW }), NOW + 7 * DAY);
});

test("aviso — respostas: última por autor, membros e de fora separados", () => {
  const base = signed();
  const r = (author, choice, ts) => ({ ...aviso.buildAvisoResponse(base, choice, ts), author });
  const tally = aviso.tallyAvisoResponses(
    [r("vx_a", "talvez", 1), r("vx_a", "vou", 2), r("vx_b", "ciente", 1), r("vx_c", "vou", 1), { ...r("vx_d", "vou", 1), avisoId: "outro" }],
    "a1",
    new Set(["vx_a", "vx_b"]),
  );
  assert.equal(tally.total, 2);
  assert.equal(tally.members.vou, 1);
  assert.equal(tally.members.talvez, 0);
  assert.equal(tally.outsiders.vou, 1);
  assert.throws(() => aviso.buildAvisoResponse(base, "sim"), /inválida/);
});

test("aviso — contagem colada: só números e só de quem modera", () => {
  const count = aviso.buildAvisoCount(signed(), { ciente: 12, vou: "8", talvez: -1 }, NOW);
  assert.deepEqual([count.countCiente, count.countVou, count.countTalvez, count.countNaoVou], [12, 8, 0, 0]);
  const fromMod = { ...count, author: "vx_mod" };
  const fromOther = { ...count, author: "vx_outro", countedAt: NOW + 1 };
  assert.equal(aviso.latestAvisoCount([fromMod, fromOther], "a1", META), fromMod);
});

test("aviso — códigos estáveis e no alfabeto sem letras ambíguas", async () => {
  const code = await aviso.avisoCode(signed());
  assert.equal(code, await aviso.avisoCode(signed()));
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.match(await aviso.personCode("vx_dono"), /^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/);
  assert.equal(await aviso.avisoCode({}), "");
});

test("aviso — texto do WhatsApp traz o aviso inteiro e o link por último", () => {
  const textValue = aviso.buildAvisoShareText({ aviso: signed(), communityName: "Vila", code: "A7F3", link: "https://x/aviso.html#v=1" });
  const lines = textValue.split("\n");
  assert.ok(lines[0].includes("Vila"));
  assert.ok(textValue.includes("Não vou"));
  assert.ok(textValue.includes("A7F3"));
  assert.ok(lines.at(-1).includes("https://x/aviso.html#v=1"));
  const informe = aviso.buildAvisoShareText({ aviso: { title: "Informe geral", body: "" } });
  assert.ok(!informe.includes("Vou"));
});

test("aviso — link: ida e volta, limite e lixo recusado", () => {
  const item = signed({ title: "Assembleia ção ✅" });
  const fragment = aviso.encodeAvisoFragment(item);
  assert.deepEqual(aviso.decodeAvisoFragment(`#${fragment}`), item);
  assert.throws(() => aviso.encodeAvisoFragment(signed({ body: "x".repeat(3000) })), /grande demais/);
  assert.equal(aviso.decodeAvisoFragment("v=2&a=abc"), null);
  assert.equal(aviso.decodeAvisoFragment("v=1&a=%%%"), null);
  assert.equal(aviso.decodeAvisoFragment(`v=1&a=${btoa(JSON.stringify({ type: "topic" }))}`), null);
});
