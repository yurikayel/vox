/**
 * PM-77 — linha do tempo do carrossel: limites, trechos, marcas da barra, arrasto e agendamento sem emenda do áudio.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { MEDIA_V2_LIMITS } from "../scripts/media-v2-budget.mjs";
import { buildCarouselTimeline, CAROUSEL_LIMITS, locateInCarousel, scheduleAudioParts, secondsAtFraction } from "../client/js/carousel-timeline.js";

const audio = (...secs) => secs.map((durationSec) => ({ kind: "audio", durationSec }));
const video = (...secs) => secs.map((durationSec) => ({ kind: "video", durationSec }));

test("limites do cliente batem com os do validador de orçamento", () => {
  assert.equal(CAROUSEL_LIMITS.maxItems, MEDIA_V2_LIMITS.maxCarouselItems);
  assert.equal(CAROUSEL_LIMITS.maxAudioItemSec, MEDIA_V2_LIMITS.maxAudioSec);
  assert.equal(CAROUSEL_LIMITS.maxVideoItemSec, MEDIA_V2_LIMITS.maxVideoSec);
  assert.equal(CAROUSEL_LIMITS.maxAudioTotalSec, MEDIA_V2_LIMITS.maxCarouselAudioSec);
  assert.equal(CAROUSEL_LIMITS.maxVideoTotalSec, MEDIA_V2_LIMITS.maxCarouselVideoSec);
});

test("monta os trechos em sequência e as marcas nas fronteiras", () => {
  const t = buildCarouselTimeline(audio(60, 30, 30, 60));
  assert.deepEqual(t.parts.map((p) => [p.startSec, p.endSec]), [[0, 60], [60, 90], [90, 120], [120, 180]]);
  assert.equal(t.totalSec, 180);
  assert.deepEqual(t.marks, [60 / 180, 90 / 180, 120 / 180]);
});

test("aceita o teto: 4 áudios de 60 s (4 min) e 4 vídeos de 10 s (40 s)", () => {
  assert.equal(buildCarouselTimeline(audio(60, 60, 60, 60)).totalSec, 240);
  assert.equal(buildCarouselTimeline(video(10, 10, 10, 10)).totalSec, 40);
});

test("recusa o que passa do limite ou mistura tipos", () => {
  assert.equal(buildCarouselTimeline(audio(60, 60, 60, 60, 1)), null, "5 itens");
  assert.equal(buildCarouselTimeline([]), null, "vazio");
  assert.equal(buildCarouselTimeline(audio(61)), null, "áudio acima de 60 s");
  assert.equal(buildCarouselTimeline(video(10.5)), null, "vídeo acima de 10 s");
  assert.equal(buildCarouselTimeline([...video(10), ...audio(10)]), null, "tipos misturados");
  assert.equal(buildCarouselTimeline(audio(0)), null, "duração zero");
  assert.equal(buildCarouselTimeline(audio(Number.NaN)), null, "duração inválida");
  assert.equal(buildCarouselTimeline([{ kind: "gif", durationSec: 5 }]), null, "tipo desconhecido");
  assert.equal(buildCarouselTimeline("x"), null, "não é lista");
});

test("fotos: até 4, sem duração e sem marcas", () => {
  const t = buildCarouselTimeline(Array.from({ length: 4 }, () => ({ kind: "photo" })));
  assert.equal(t.parts.length, 4);
  assert.equal(t.totalSec, 0);
  assert.deepEqual(t.marks, []);
  assert.equal(buildCarouselTimeline(Array.from({ length: 5 }, () => ({ kind: "photo" }))), null);
});

test("arrasto: acha a parte e o ponto dentro dela, com a fronteira na parte que começa", () => {
  const t = buildCarouselTimeline(video(10, 5, 10));
  assert.deepEqual(locateInCarousel(t, 0), { index: 0, offsetSec: 0 });
  assert.deepEqual(locateInCarousel(t, 9.5), { index: 0, offsetSec: 9.5 });
  assert.deepEqual(locateInCarousel(t, 10), { index: 1, offsetSec: 0 });
  assert.deepEqual(locateInCarousel(t, 17), { index: 2, offsetSec: 2 });
  assert.deepEqual(locateInCarousel(t, 25), { index: 2, offsetSec: 10 }, "o fim cai no fim da última parte");
  assert.deepEqual(locateInCarousel(t, 99), { index: 2, offsetSec: 10 }, "acima do fim vale o fim");
  assert.deepEqual(locateInCarousel(t, -4), { index: 0, offsetSec: 0 }, "abaixo de zero vale o começo");
});

test("barra de progresso: fração vira segundos do conjunto, presa em 0–1", () => {
  const t = buildCarouselTimeline(video(10, 10, 10, 10));
  assert.equal(secondsAtFraction(t, 0.5), 20);
  assert.equal(secondsAtFraction(t, 2), 40);
  assert.equal(secondsAtFraction(t, -1), 0);
});

test("áudio: partes agendadas uma atrás da outra, sem lacuna nem sobreposição", () => {
  const t = buildCarouselTimeline(audio(60, 30, 30));
  const plan = scheduleAudioParts(t, { startAt: 5 });
  assert.deepEqual(plan, [{ index: 0, when: 5, offset: 0 }, { index: 1, when: 65, offset: 0 }, { index: 2, when: 95, offset: 0 }]);
});

test("áudio: retomar no meio pula o que já tocou e começa a parte atual no ponto certo", () => {
  const t = buildCarouselTimeline(audio(60, 30, 30));
  const plan = scheduleAudioParts(t, { startAt: 2, fromSec: 70 });
  assert.deepEqual(plan, [{ index: 1, when: 2, offset: 10 }, { index: 2, when: 22, offset: 0 }]);
});

test("áudio: retomar exatamente numa fronteira começa na parte seguinte", () => {
  const t = buildCarouselTimeline(audio(60, 30));
  assert.deepEqual(scheduleAudioParts(t, { startAt: 0, fromSec: 60 }), [{ index: 1, when: 0, offset: 0 }]);
});

test("áudio: instantes caem na grade de amostras e vídeo não agenda nada", () => {
  const t = buildCarouselTimeline(audio(0.00001, 1));
  const [, second] = scheduleAudioParts(t, { startAt: 0, sampleRate: 8000 });
  assert.equal(second.when, 0, "1e-5 s é menos que uma amostra a 8 kHz");
  assert.deepEqual(scheduleAudioParts(buildCarouselTimeline(video(10)), { startAt: 0 }), []);
});
