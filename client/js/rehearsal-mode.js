/**
 * @file PM-100 — Modo Ensaio (runtime + faixa UI persistente).
 *
 * Conta/sessão de ensaio que nunca sai do aparelho: bloqueia saídas de rede
 * (gossip/malha P2P, memória central e Arweave/Turbo), exibe faixa persistente
 * "Modo Ensaio — nada sai deste aparelho" e oferece botão "Apagar ensaio e sair".
 *
 * @module rehearsal-mode
 */

import { escapeHtml } from "./shared/html.js";

/** Chave no `localStorage` que indica se o Modo Ensaio está ativo. */
export const REHEARSAL_STORAGE_KEY = "vox-rehearsal-mode";
/** Prefixo das chaves auxiliares criadas durante uma sessão de ensaio. */
export const REHEARSAL_DATA_PREFIX = "vox-rehearsal:";
/** Id do elemento DOM da faixa persistente de Modo Ensaio. */
export const REHEARSAL_BANNER_ID = "rehearsalModeBanner";
/** Id do botão "Apagar ensaio e sair" dentro da faixa. */
export const REHEARSAL_WIPE_BTN_ID = "btnRehearsalWipeExit";
/** Evento customizado disparado na janela quando o Modo Ensaio muda. */
export const REHEARSAL_EVENT_NAME = "vox:rehearsal-mode-change";

const DEFAULT_BANNER_TEXT = "Modo Ensaio — nada sai deste aparelho";
const DEFAULT_WIPE_LABEL = "Apagar ensaio e sair";
const IDENTITY_FIELDS = Object.freeze(["author", "owner", "routeId", "authorId", "ownerId", "from", "to", "peerId"]);

let memoryFlag = false;
let bannerListenersBound = false;

/**
 * Obtém o storage padrão do ambiente (`localStorage`), se disponível.
 * @returns {Storage|null}
 */
function getDefaultStorage() {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Obtém o `sessionStorage` padrão do ambiente, se disponível.
 * @returns {Storage|null}
 */
function getDefaultSessionStorage() {
  try {
    return typeof globalThis.sessionStorage !== "undefined" ? globalThis.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Lê o flag de Modo Ensaio do storage informado, sem lançar erro.
 * @param {Storage|null} storage Armazenamento chave-valor.
 * @returns {boolean|null} `true`/`false` se lido, ou `null` se indisponível.
 */
function readStorageFlag(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    return storage.getItem(REHEARSAL_STORAGE_KEY) === "1";
  } catch {
    return null;
  }
}

/**
 * Escreve ou remove o flag de Modo Ensaio no storage informado.
 * @param {Storage|null} storage Armazenamento chave-valor.
 * @param {boolean} enabled Novo estado.
 */
function writeStorageFlag(storage, enabled) {
  if (!storage) return;
  try {
    if (enabled && typeof storage.setItem === "function") {
      storage.setItem(REHEARSAL_STORAGE_KEY, "1");
    } else if (!enabled && typeof storage.removeItem === "function") {
      storage.removeItem(REHEARSAL_STORAGE_KEY);
    }
  } catch {
    // Storage indisponível (ex.: modo privado restrito); o flag em memória continua valendo.
  }
}

/**
 * Dispara o evento de mudança do Modo Ensaio no alvo informado.
 * @param {EventTarget|null} target Janela ou alvo de eventos.
 * @param {boolean} active Estado atual do modo ensaio.
 */
function emitModeChange(target, active) {
  if (!target || typeof target.dispatchEvent !== "function") return;
  if (typeof CustomEvent === "function") {
    target.dispatchEvent(new CustomEvent(REHEARSAL_EVENT_NAME, { detail: { active } }));
  }
}

/**
 * Informa se o Modo Ensaio está ativo neste aparelho.
 * @param {Storage|null} [storage=getDefaultStorage()] Armazenamento opcional para leitura.
 * @returns {boolean} `true` quando nenhuma saída de rede pode ser enviada.
 */
export function isRehearsalMode(storage = getDefaultStorage()) {
  const persisted = readStorageFlag(storage);
  if (persisted !== null) {
    memoryFlag = persisted;
    return persisted;
  }
  return memoryFlag;
}

/**
 * Verifica se um objeto de payload carrega marcação explícita de ensaio (`rehearsal`, `mode`, `channel` ou autor `rehearsal_*`).
 * @param {unknown} payload Objeto ou envelope destinado a saída de rede.
 * @returns {boolean} `true` se o payload pertence ao modo ensaio e deve ser bloqueado.
 */
export function isRehearsalPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.rehearsal === true || payload.mode === "rehearsal" || payload.channel === "rehearsal") {
    return true;
  }
  if (payload.item && typeof payload.item === "object" && isRehearsalPayload(payload.item)) {
    return true;
  }
  return IDENTITY_FIELDS.some((field) => {
    const val = payload[field];
    return typeof val === "string" && val.trim().startsWith("rehearsal_");
  });
}

/**
 * Ativa o Modo Ensaio localmente e atualiza a faixa persistente na UI.
 * @param {{ storage?: Storage|null, doc?: Document|null, win?: EventTarget|null }} [opts={}] Dependências opcionais.
 * @returns {boolean} Sempre `true`.
 */
export function enableRehearsalMode({
  storage = getDefaultStorage(),
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  memoryFlag = true;
  writeStorageFlag(storage, true);
  emitModeChange(win, true);
  if (doc?.body) refreshRehearsalBanner({ doc, storage });
  return true;
}

/**
 * Desativa o Modo Ensaio localmente e remove a faixa da UI.
 * @param {{ storage?: Storage|null, doc?: Document|null, win?: EventTarget|null }} [opts={}] Dependências opcionais.
 * @returns {boolean} Sempre `false`.
 */
export function disableRehearsalMode({
  storage = getDefaultStorage(),
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  memoryFlag = false;
  writeStorageFlag(storage, false);
  emitModeChange(win, false);
  if (doc?.getElementById) doc.getElementById(REHEARSAL_BANNER_ID)?.remove();
  return false;
}

/**
 * Remove todas as chaves do Modo Ensaio (`REHEARSAL_STORAGE_KEY` e prefixo `REHEARSAL_DATA_PREFIX`) de um Storage.
 * @param {Storage|null} storage Armazenamento a limpar.
 * @returns {string[]} Lista de chaves removidas.
 */
function purgeRehearsalKeys(storage) {
  if (!storage || typeof storage.removeItem !== "function") return [];
  const keys = [];
  if (typeof storage.length === "number" && typeof storage.key === "function") {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === REHEARSAL_STORAGE_KEY || (typeof key === "string" && key.startsWith(REHEARSAL_DATA_PREFIX))) {
        keys.push(key);
      }
    }
  } else {
    keys.push(REHEARSAL_STORAGE_KEY);
  }
  const removed = [];
  for (const key of keys) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // Ignora erro pontual de storage para concluir a limpeza.
    }
  }
  return removed;
}

/**
 * Apaga todos os dados locais de ensaio, executa limpeza extra opcional e sai do Modo Ensaio.
 * @param {{ storage?: Storage|null, session?: Storage|null, clearCache?: () => Promise<void>|void, doc?: Document|null, win?: EventTarget|null }} [opts={}] Dependências opcionais.
 * @returns {Promise<{ ok: boolean, removedKeys: string[] }>} Resumo das chaves apagadas.
 */
export async function wipeRehearsalData({
  storage = getDefaultStorage(),
  session = getDefaultSessionStorage(),
  clearCache = null,
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  const removedKeys = [
    ...purgeRehearsalKeys(storage),
    ...purgeRehearsalKeys(session),
  ];
  if (typeof clearCache === "function") {
    await clearCache();
  }
  disableRehearsalMode({ storage, doc, win });
  return { ok: true, removedKeys };
}

/**
 * Renderiza o HTML seguro da faixa persistente de Modo Ensaio (`escapeHtml` em todo texto e atributo).
 * @param {{ text?: string, buttonLabel?: string }} [opts={}] Textos opcionais.
 * @returns {string} Marcação HTML da faixa com `role="status"`.
 */
export function renderRehearsalBannerHtml({
  text = DEFAULT_BANNER_TEXT,
  buttonLabel = DEFAULT_WIPE_LABEL,
} = {}) {
  const safeId = escapeHtml(REHEARSAL_BANNER_ID);
  const safeBtnId = escapeHtml(REHEARSAL_WIPE_BTN_ID);
  const safeText = escapeHtml(text);
  const safeBtn = escapeHtml(buttonLabel);
  return `<div class="rehearsal-mode-banner" id="${safeId}" role="status" aria-live="polite" data-rehearsal-banner="1">`
    + `<span class="rehearsal-mode-banner__text">${safeText}</span>`
    + `<button type="button" class="rehearsal-mode-banner__wipe" id="${safeBtnId}">${safeBtn}</button>`
    + `</div>`;
}

/**
 * Monta ou remove a faixa persistente de Modo Ensaio no DOM conforme o estado atual.
 * @param {{ doc?: Document|null, storage?: Storage|null, session?: Storage|null, win?: EventTarget|null, onWipe?: () => Promise<void>|void }} [opts={}] Dependências opcionais.
 * @returns {boolean} `true` se a faixa ficou visível no DOM.
 */
export function refreshRehearsalBanner({
  doc = globalThis.document,
  storage = getDefaultStorage(),
  session = getDefaultSessionStorage(),
  win = globalThis.window,
  onWipe = null,
} = {}) {
  if (!doc?.body) return false;
  const existing = doc.getElementById(REHEARSAL_BANNER_ID);
  if (!isRehearsalMode(storage)) {
    existing?.remove();
    return false;
  }
  if (existing) return true;
  const holder = doc.createElement("div");
  holder.innerHTML = renderRehearsalBannerHtml();
  const banner = holder.firstElementChild;
  if (!banner) return false;
  doc.body.prepend(banner);
  doc.getElementById(REHEARSAL_WIPE_BTN_ID)?.addEventListener("click", () => {
    void wipeRehearsalData({ storage, session, clearCache: onWipe, doc, win });
  });
  return true;
}

/**
 * Inicializa a faixa persistente de Modo Ensaio no shell e escuta mudanças de estado.
 * @param {{ doc?: Document|null, win?: Window|null, storage?: Storage|null, session?: Storage|null, onWipe?: () => Promise<void>|void }} [opts={}] Dependências opcionais.
 * @returns {boolean} `true` se a faixa foi exibida imediatamente.
 */
export function startRehearsalBanner({
  doc = globalThis.document,
  win = globalThis.window,
  storage = getDefaultStorage(),
  session = getDefaultSessionStorage(),
  onWipe = null,
} = {}) {
  if (!bannerListenersBound && win?.addEventListener) {
    bannerListenersBound = true;
    const sync = () => refreshRehearsalBanner({ doc, storage, session, win, onWipe });
    win.addEventListener(REHEARSAL_EVENT_NAME, sync);
    win.addEventListener("storage", (ev) => {
      if (!ev?.key || ev.key === REHEARSAL_STORAGE_KEY) sync();
    });
  }
  return refreshRehearsalBanner({ doc, storage, session, win, onWipe });
}
