/**
 * @file Cobertura de `app/inline-composer-voice.js` (lote T4): gravação de voz, máquina de estados e cronômetro.
 */
import "./setup.js";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";
import { installFakeFileReader } from "./helpers/cov-t4-media-env.mjs";

const voice = await import("../client/js/app/inline-composer-voice.js");
const st = await import("../client/js/app/inline-composer-state.js");

const IDS = ["btn-inline-mic", "btn-inline-stop-rec", "btn-inline-cancel-rec", "inline-recording-timer",
  "inline-topic-attach-meta", "inline-topic-preview-audio", "inline-topic-preview-audio-wrap",
  "inline-topic-preview-video-wrap", "inline-topic-preview", "inline-topic-preview-wrap",
  "lofi-filter-bar", "composer-aspect-bar", "composer-tag-bar", "lofi-weight-badge"];

/** MediaRecorder de mentira que registra chamadas e permite disparar os callbacks. */
class FakeRecorder {
  static supportsOpus = true;
  static isTypeSupported() { return FakeRecorder.supportsOpus; }
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = "inactive";
    this.mimeType = "audio/webm";
    FakeRecorder.last = this;
  }
  start(slice) { this.state = "recording"; this.slice = slice; }
  stop() { this.state = "inactive"; this.stopped = true; }
}

/**
 * Cria um stream falso com faixas que contam `stop()`.
 * @returns {{ tracks: { stopped: boolean, stop: () => void }[], getTracks: () => object[] }} Stream.
 */
function fakeStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { tracks: [track], getTracks() { return this.tracks; } };
}

/**
 * Monta DOM, MediaRecorder, microfone e FileReader falsos e devolve o estado do controlador.
 * @param {Function} getUserMedia Implementação de `getUserMedia`.
 * @returns {{ el: Record<string, FakeEl>, state: object, tools: FakeEl, cleanup: () => void }} Cenário.
 */
function mount(getUserMedia) {
  const dom = installFakeDocument();
  const el = {};
  for (const id of IDS) {
    el[id] = new FakeEl(id);
    dom.add(el[id]);
  }
  const tools = new FakeEl("", { classes: ["inline-composer-tools"] });
  dom.doc.stub(".inline-composer-tools", tools);
  const restoreReader = installFakeFileReader();
  const prevRecorder = globalThis.MediaRecorder;
  globalThis.MediaRecorder = FakeRecorder;
  Object.defineProperty(globalThis.navigator, "mediaDevices", { value: getUserMedia ? { getUserMedia } : undefined, configurable: true });
  st.clearMedia();
  return {
    el, tools, state: voice.createComposerControllerState(),
    cleanup: () => {
      dom.restore();
      restoreReader();
      globalThis.MediaRecorder = prevRecorder;
      Object.defineProperty(globalThis.navigator, "mediaDevices", { value: undefined, configurable: true });
    },
  };
}

/** Espera os microtasks encadeados da promessa de microfone. @returns {Promise<void>} Resolve após o ciclo. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Inicia a gravação neutralizando só durante a chamada síncrona o `cleanupRecordingState` que
 * `clearMedia` dispara (ver o teste do defeito conhecido): sem isso a máquina volta a `idle`
 * antes do microfone responder e nenhuma gravação começa.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
function startRecording(state) {
  const real = state.cleanupRecordingState;
  state.cleanupRecordingState = () => {};
  voice.startVoiceRecording(state);
  state.cleanupRecordingState = real;
}

test("inline-voice — máquina de voz percorre idle, requesting, recording, stopping e volta", () => {
  const m = voice.createVoiceRecordMachine();
  assert.equal(m.matches("idle"), true);
  assert.equal(m.send("REQUEST").to, "requesting");
  assert.equal(m.send("START").to, "recording");
  assert.equal(m.send("STOP").to, "stopping");
  assert.equal(m.send("DONE").to, "idle");
  assert.equal(m.send("DONE").changed, false, "evento inválido em idle não muda nada");
});

test("inline-voice — sem suporte a microfone avisa e mantém a máquina ociosa", () => {
  const { state, cleanup } = mount(null);
  voice.startVoiceRecording(state);
  assert.equal(state.voiceMachine.matches("idle"), true);
  cleanup();
});

test("inline-voice — gravar abre o microfone, inicia o MediaRecorder opus e liga o cronômetro", async () => {
  const stream = fakeStream();
  const { el, state, tools, cleanup } = mount(async () => stream);
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    startRecording(state);
    assert.equal(state.voiceMachine.matches("requesting"), true);
    await flush();
    assert.equal(state.isRecording, true);
    assert.deepEqual(FakeRecorder.last.options, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 48000 });
    assert.equal(FakeRecorder.last.slice, 500);
    assert.equal(tools.classList.contains("is-recording-mode"), true);
    assert.equal(el["btn-inline-mic"].getAttribute("aria-pressed"), "true");
    mock.timers.tick(65000);
    assert.equal(el["inline-recording-timer"].textContent, "01:00 / 01:00", "corta aos 60 s");
    assert.equal(FakeRecorder.last.stopped, true);
    assert.equal(state.voiceMachine.matches("stopping"), true);
    assert.equal(state.recordingTimer, null);
  } finally {
    mock.timers.reset();
    cleanup();
  }
});

test("inline-voice — ao parar, o áudio gravado vira mídia de áudio com prévia e metadados", async () => {
  const stream = fakeStream();
  const { el, state, cleanup } = mount(async () => stream);
  FakeRecorder.supportsOpus = false;
  try {
    startRecording(state);
    await flush();
    assert.deepEqual(FakeRecorder.last.options, {}, "sem opus, sem opções");
    const rec = FakeRecorder.last;
    rec.ondataavailable({ data: { size: 0 } });
    rec.ondataavailable({ data: new Blob(["abcd"]) });
    state.stopVoiceRecording();
    rec.onstop();
    await flush();
    assert.equal(st.inlineComposerMedia.type, "audio");
    assert.equal(st.inlineComposerMedia.byteLength, 4);
    assert.equal(st.inlineComposerMedia.dataUrl, "data:audio/webm;base64,QUJD");
    assert.equal(el["inline-topic-attach-meta"].textContent, "🎙️ Recado de voz · 1 KB");
    assert.equal(el["inline-topic-preview-audio"].src, "data:audio/webm;base64,QUJD");
    assert.equal(el["lofi-weight-badge"].textContent, "⚡ ~1 KB (Voz Gravada Lo-Fi 48k · malha)");
    assert.equal(stream.tracks[0].stopped, true, "microfone liberado");
    assert.equal(state.voiceMachine.matches("idle"), true);
  } finally {
    FakeRecorder.supportsOpus = true;
    cleanup();
  }
});

test("inline-voice — negar o microfone volta a idle e deixa a UI de gravação desligada", async () => {
  const { el, state, cleanup } = mount(async () => { throw new Error("negado"); });
  startRecording(state);
  await flush();
  assert.equal(state.voiceMachine.matches("idle"), true);
  assert.equal(el["btn-inline-mic"].getAttribute("aria-pressed"), "false");
  assert.equal(st.inlineComposerMedia.type, "");
  cleanup();
});

test("inline-voice — stream que chega depois do cancelamento é liberado sem gravar", async () => {
  const stream = fakeStream();
  const { state, cleanup } = mount(async () => stream);
  startRecording(state);
  state.voiceMachine.send("CANCEL");
  await flush();
  assert.equal(stream.tracks[0].stopped, true);
  assert.equal(state.activeRecorder, null);
  assert.equal(state.voiceMachine.matches("idle"), true);
  cleanup();
});

test("inline-voice — cancelar descarta callbacks do gravador, ignora erro do stop e limpa o estado", async () => {
  const stream = fakeStream();
  const { el, state, cleanup } = mount(async () => stream);
  startRecording(state);
  await flush();
  const rec = FakeRecorder.last;
  rec.stop = () => { throw new Error("já parado"); };
  state.cancelVoiceRecording();
  assert.equal(rec.ondataavailable, null);
  assert.equal(rec.onstop, null);
  assert.equal(state.activeRecorder, null);
  assert.equal(state.voiceMachine.matches("idle"), true);
  assert.equal(stream.tracks[0].stopped, true);
  assert.equal(el["btn-inline-cancel-rec"].classList.contains("hidden"), true);
  cleanup();
});

test("inline-voice — botões de microfone, concluir e cancelar acionam o estado correspondente", async () => {
  const stream = fakeStream();
  const { el, state, cleanup } = mount(async () => stream);
  voice.bindVoiceButtons(state);
  const ev = { preventDefault() {} };
  const real = state.cleanupRecordingState;
  let skipNext = true;
  state.cleanupRecordingState = () => { if (skipNext) skipNext = false; else real(); };
  await el["btn-inline-mic"].fire("click", ev);
  await flush();
  assert.equal(state.isRecording, true, "primeiro clique grava");
  await el["btn-inline-mic"].fire("click", ev);
  assert.equal(state.voiceMachine.matches("stopping"), true, "segundo clique conclui");
  state.voiceMachine.reset();
  skipNext = true;
  await el["btn-inline-mic"].fire("click", ev);
  await flush();
  await el["btn-inline-stop-rec"].fire("click", ev);
  assert.equal(FakeRecorder.last.stopped, true);
  await el["btn-inline-cancel-rec"].fire("click", ev);
  assert.equal(state.voiceMachine.matches("idle"), true);
  cleanup();
});

test("inline-voice — startVoiceRecording durante a gravação a interrompe em vez de reiniciar", async () => {
  const { state, cleanup } = mount(async () => fakeStream());
  startRecording(state);
  await flush();
  startRecording(state);
  assert.equal(state.voiceMachine.matches("stopping"), true);
  startRecording(state);
  assert.equal(state.voiceMachine.matches("stopping"), true, "REQUEST em stopping não muda a máquina");
  cleanup();
});

test("inline-voice — DEFEITO CONHECIDO: clearMedia zera a máquina e a gravação real nunca começa", async () => {
  const stream = fakeStream();
  const { state, cleanup } = mount(async () => stream);
  voice.startVoiceRecording(state);
  await flush();
  assert.equal(state.activeRecorder, null, "nenhum MediaRecorder criado");
  assert.equal(state.isRecording, false);
  assert.equal(stream.tracks[0].stopped, true, "o microfone é liberado logo ao chegar");
  cleanup();
});
