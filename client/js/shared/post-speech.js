/**
 * @file Síntese de voz para publicações (Web Speech API).
 *
 * Módulo folha sem dependências externas, responsável pela formatação
 * de texto limpo e controle de reprodução em pt-BR.
 *
 * @module shared/post-speech
 */

let currentSpeakingPostId = null;
let cleanupHashListener = null;

/**
 * Remove sintaxe Markdown comum e URLs cruas para leitura fluida por voz.
 *
 * @param {string} raw Texto de entrada.
 * @returns {string} Texto limpo.
 */
function cleanMarkdownForSpeech(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

/**
 * Verifica se o ambiente possui suporte à Web Speech API.
 *
 * @param {Window|typeof globalThis} [win=globalThis] Objeto global da janela.
 * @returns {boolean} `true` se a síntese de voz estiver disponível.
 */
export function canSpeakPost(win = globalThis) {
  return Boolean(
    win &&
    typeof win.speechSynthesis?.speak === "function" &&
    typeof win.speechSynthesis?.cancel === "function" &&
    typeof win.SpeechSynthesisUtterance === "function",
  );
}

/**
 * Monta texto limpo e legível para leitura em voz alta, retirando links e Markdown.
 *
 * @param {{ title?: string, body?: string }} [post] Objeto com título e/ou corpo do post.
 * @returns {string} Texto normalizado para a síntese de voz.
 */
export function formatPostSpeechText(post = {}) {
  const title = cleanMarkdownForSpeech(post?.title || "");
  const body = cleanMarkdownForSpeech(post?.body || "");
  if (title && body) {
    if (title === body) return title;
    const separator = /[.?!]$/.test(title) ? " " : ". ";
    return `${title}${separator}${body}`.trim();
  }
  return (title || body).trim();
}

/**
 * Indica se uma publicação específica está sendo lida no momento.
 *
 * @param {string} postId Identificador do post.
 * @returns {boolean} `true` se o post estiver sendo reproduzido.
 */
export function isSpeakingPost(postId) {
  if (!postId || !currentSpeakingPostId) return false;
  return currentSpeakingPostId === String(postId);
}

/**
 * Interrompe a reprodução de voz em andamento e limpa o estado ativo.
 *
 * @param {Window|typeof globalThis} [win=globalThis] Objeto global da janela.
 * @returns {void}
 */
export function stopPostSpeech(win = globalThis) {
  if (typeof cleanupHashListener === "function") {
    cleanupHashListener();
    cleanupHashListener = null;
  }
  if (win?.speechSynthesis && typeof win.speechSynthesis.cancel === "function") {
    try {
      win.speechSynthesis.cancel();
    } catch {
      // Ignora falhas em implementações parciais
    }
  }
  currentSpeakingPostId = null;
}

/**
 * Vincula callbacks de ciclo de vida e ouvinte de hashchange à leitura.
 *
 * @param {Window|typeof globalThis} win Janela global.
 * @param {SpeechSynthesisUtterance} utt Instância da fala.
 * @param {string} postId Identificador do post.
 * @returns {void}
 */
function attachSpeechLifecycle(win, utt, postId) {
  const onDone = () => {
    if (currentSpeakingPostId === String(postId)) {
      currentSpeakingPostId = null;
      if (typeof cleanupHashListener === "function") {
        cleanupHashListener();
        cleanupHashListener = null;
      }
    }
  };
  utt.onend = onDone;
  utt.onerror = onDone;
  if (typeof win.addEventListener === "function") {
    const onHashChange = () => stopPostSpeech(win);
    win.addEventListener("hashchange", onHashChange, { once: true });
    cleanupHashListener = () => win.removeEventListener?.("hashchange", onHashChange);
  }
}

/**
 * Alterna a reprodução de voz de uma publicação específica.
 *
 * @param {object} params Parâmetros de fala.
 * @param {string} params.postId Id da publicação.
 * @param {string} [params.title] Título da publicação.
 * @param {string} [params.body] Corpo textual da publicação.
 * @param {Window|typeof globalThis} [params.win=globalThis] Objeto global da janela.
 * @returns {{ ok: boolean, speaking: boolean, reason?: string }} Resultado da ação.
 */
export function togglePostSpeech({ postId, title = "", body = "", win = globalThis } = {}) {
  if (!postId) return { ok: false, speaking: false, reason: "missing_id" };
  if (isSpeakingPost(postId)) {
    stopPostSpeech(win);
    return { ok: true, speaking: false };
  }
  if (!canSpeakPost(win)) {
    return { ok: false, speaking: false, reason: "unsupported" };
  }
  const text = formatPostSpeechText({ title, body });
  if (!text) {
    return { ok: false, speaking: false, reason: "empty" };
  }
  stopPostSpeech(win);
  const utt = new win.SpeechSynthesisUtterance(text);
  utt.lang = "pt-BR";
  attachSpeechLifecycle(win, utt, postId);
  currentSpeakingPostId = String(postId);
  win.speechSynthesis.speak(utt);
  return { ok: true, speaking: true };
}
