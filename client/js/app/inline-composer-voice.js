/**
 * @file Gravação de voz, máquina de estados e temporizador do compositor inline.
 */
import * as share from "../share.js";
import { createMachine } from "../shared/state-machine.js";
import {
  setComposerMedia,
  setAttachmentMeta,
  setPreviewVisible,
  syncInlineComposerUi,
  clearMedia,
} from "./inline-composer-state.js";

/**
 * Formata os segundos de gravação no formato mm:ss / 01:00.
 * @param {number} sec Segundos decorridos.
 * @returns {string} Tempo formatado.
 */
function formatRecordingTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s} / 01:00`;
}

/**
 * Configura callbacks do MediaRecorder de voz.
 * @param {MediaRecorder} recorder Instância do gravador.
 * @param {Blob[]} recordingChunks Buffer dos pedaços de áudio.
 * @param {(dataUrl: string, size: number) => void} onAudioReady Callback quando o áudio estiver pronto.
 * @returns {void}
 */
function setupVoiceRecorderCallbacks(recorder, recordingChunks, onAudioReady) {
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordingChunks.push(e.data);
  };
  recorder.onstop = () => {
    const type = recorder.mimeType || "audio/webm";
    const blob = new Blob(recordingChunks, { type });
    const reader = new FileReader();
    reader.onload = () => onAudioReady(reader.result, blob.size);
    reader.readAsDataURL(blob);
  };
}

/**
 * Trata o áudio gravado e atualiza a interface de prévia.
 * @param {string} dataUrl Conteúdo de áudio em base64.
 * @param {number} byteSize Tamanho em bytes.
 * @param {object} state Estado do controlador do compositor.
 * @returns {void}
 */
function handleVoiceAudioReady(dataUrl, byteSize, state) {
  const kb = Math.max(1, Math.round(byteSize / 1024));
  setComposerMedia({ type: "audio", dataUrl, byteLength: byteSize });
  setAttachmentMeta("voice", "Recado de voz", byteSize);
  const previewAudio = document.getElementById("inline-topic-preview-audio");
  const previewAudioWrap = document.getElementById("inline-topic-preview-audio-wrap");
  const previewVideoWrap = document.getElementById("inline-topic-preview-video-wrap");
  const previewImg = document.getElementById("inline-topic-preview");
  const previewWrap = document.getElementById("inline-topic-preview-wrap");
  if (previewAudio) previewAudio.src = dataUrl;
  setPreviewVisible(previewAudioWrap, true);
  setPreviewVisible(previewImg, false);
  setPreviewVisible(previewVideoWrap, false);
  const filterBar = document.getElementById("lofi-filter-bar");
  if (filterBar) filterBar.style.display = "none";
  const aspectBar = document.getElementById("composer-aspect-bar");
  if (aspectBar) aspectBar.style.display = "none";
  const tagBar = document.getElementById("composer-tag-bar");
  if (tagBar) tagBar.style.display = "none";
  const badge = document.getElementById("lofi-weight-badge");
  if (badge) badge.textContent = `⚡ ~${kb} KB (Voz Gravada Lo-Fi 48k · malha)`;
  setPreviewVisible(previewWrap, true);
  state.cleanupRecordingState();
  syncInlineComposerUi();
}

/**
 * Máquina de estados finita da gravação de voz (`idle` → `requesting` → `recording` → `stopping`).
 * @returns {ReturnType<typeof createMachine>} Máquina da gravação de voz.
 */
export function createVoiceRecordMachine() {
  return createMachine({
    initial: "idle",
    states: {
      idle: { on: { REQUEST: "requesting" } },
      requesting: { on: { START: "recording", FAIL: "idle", CANCEL: "idle", STOP: "idle" } },
      recording: { on: { STOP: "stopping", CANCEL: "idle" } },
      stopping: { on: { DONE: "idle", CANCEL: "idle" } },
    },
  });
}

/**
 * Inicia o MediaRecorder com o stream de áudio capturado.
 * @param {MediaStream} stream Stream do microfone.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
function beginRecorderWithStream(stream, state) {
  if (!state.voiceMachine.matches("requesting")) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  state.activeStream = stream;
  state.recordingChunks = [];
  state.recordingSeconds = 0;
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
  const options = mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {};
  const recorder = new MediaRecorder(stream, options);
  state.activeRecorder = recorder;
  setupVoiceRecorderCallbacks(recorder, state.recordingChunks, (url, sz) => handleVoiceAudioReady(url, sz, state));
  state.voiceMachine.send("START");
  recorder.start(500);
  state.startTimer();
}

/**
 * Solicita acesso ao microfone e inicia gravação.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function startVoiceRecording(state) {
  if (state.isRecording) {
    state.stopVoiceRecording();
    return;
  }
  if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    share.showToast("Gravação de voz não suportada neste ambiente.", "error");
    return;
  }
  if (!state.voiceMachine.send("REQUEST").changed) return;
  clearMedia(state);
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    beginRecorderWithStream(stream, state);
  }).catch((err) => {
    state.voiceMachine.send("FAIL");
    state.cleanupRecordingState();
    share.showToast(`Erro ao acessar microfone: ${err.message}`, "error");
  });
}

/**
 * Conecta botões de gravação, conclusão e cancelamento de áudio.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindVoiceButtons(state) {
  document.getElementById("btn-inline-mic")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (state.isRecording) {
      state.stopVoiceRecording();
    } else {
      startVoiceRecording(state);
    }
  });
  document.getElementById("btn-inline-stop-rec")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.stopVoiceRecording();
  });
  document.getElementById("btn-inline-cancel-rec")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.cancelVoiceRecording();
  });
}

/**
 * Restaura o botão de microfone e barra de ferramentas ao estado inativo.
 * @returns {void}
 */
export function resetMicToggleUi() {
  const toolsBar = document.querySelector(".inline-composer-tools");
  toolsBar?.classList.remove("is-recording-mode");
  const micBtn = document.getElementById("btn-inline-mic");
  if (micBtn) {
    micBtn.classList.remove("is-recording");
    micBtn.setAttribute("aria-pressed", "false");
    micBtn.setAttribute("title", "Gravar voz pelo microfone (até 60s)");
    micBtn.setAttribute("aria-label", "Gravar voz pelo microfone (até 60s)");
  }
  document.getElementById("btn-inline-cancel-rec")?.classList.add("hidden");
  const timerEl = document.getElementById("inline-recording-timer");
  if (timerEl) timerEl.textContent = "00:00 / 01:00";
}

/**
 * Configura o botão de microfone e ferramentas para o modo gravando.
 * @returns {void}
 */
export function setMicRecordingUi() {
  const toolsBar = document.querySelector(".inline-composer-tools");
  toolsBar?.classList.add("is-recording-mode");
  const micBtn = document.getElementById("btn-inline-mic");
  if (micBtn) {
    micBtn.classList.add("is-recording");
    micBtn.setAttribute("aria-pressed", "true");
    micBtn.setAttribute("title", "Gravando... Toque para concluir gravação");
    micBtn.setAttribute("aria-label", "Gravando voz. Toque para concluir a gravação.");
  }
  document.getElementById("btn-inline-cancel-rec")?.classList.remove("hidden");
  const timerEl = document.getElementById("inline-recording-timer");
  if (timerEl) timerEl.textContent = "00:00 / 01:00";
}

/**
 * Limpa timers, streams, buffers e reseta a máquina e UI da gravação.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function cleanupRecordingState(state) {
  if (state.recordingTimer) { clearInterval(state.recordingTimer); state.recordingTimer = null; }
  if (state.activeStream) { state.activeStream.getTracks().forEach((t) => t.stop()); state.activeStream = null; }
  state.activeRecorder = null;
  state.recordingChunks = [];
  state.recordingSeconds = 0;
  state.voiceMachine.reset();
  resetMicToggleUi();
}

/**
 * Para a gravação de voz ativamente.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function stopVoiceRecording(state) {
  state.voiceMachine.send("STOP");
  if (state.activeRecorder?.state === "recording") state.activeRecorder.stop();
  if (state.recordingTimer) { clearInterval(state.recordingTimer); state.recordingTimer = null; }
}

/**
 * Inicia cronômetro de gravação com corte estrito aos 60 segundos.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function startRecordingTimer(state) {
  setMicRecordingUi();
  const timerEl = document.getElementById("inline-recording-timer");
  state.recordingTimer = setInterval(() => {
    state.recordingSeconds++;
    if (timerEl) timerEl.textContent = formatRecordingTime(state.recordingSeconds);
    if (state.recordingSeconds >= 60) stopVoiceRecording(state);
  }, 1000);
}

/**
 * Cancela gravação de voz descartando dados gravados.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function cancelVoiceRecording(state) {
  state.voiceMachine.send("CANCEL");
  if (state.activeRecorder?.state === "recording") {
    state.activeRecorder.ondataavailable = null;
    state.activeRecorder.onstop = null;
    try { state.activeRecorder.stop(); } catch {}
  }
  cleanupRecordingState(state);
  share.showToast("Gravação cancelada.");
}

/**
 * Cria o objeto de estado reativo e temporizadores do controlador do compositor inline.
 * @returns {object} Estado do controlador.
 */
export function createComposerControllerState() {
  const voiceMachine = createVoiceRecordMachine();
  const state = {
    rawSourceFile: null,
    activeLofiFilter: "normal",
    activeStream: null,
    activeRecorder: null,
    recordingChunks: [],
    recordingTimer: null,
    recordingSeconds: 0,
    voiceMachine,
    get isRecording() { return voiceMachine.matches("recording"); },
    cleanupRecordingState: () => cleanupRecordingState(state),
    startTimer: () => startRecordingTimer(state),
    stopVoiceRecording: () => stopVoiceRecording(state),
    cancelVoiceRecording: () => cancelVoiceRecording(state),
  };
  return state;
}
