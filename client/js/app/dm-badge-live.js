/**
 * @file Badge de DMs não lidas via signals (camada `app`; `render/shell` continua HTML puro).
 *
 * Escopo de app (não de rota): o chrome da shell sobrevive à troca de tela.
 * Cache em `persistedSignal` mostra o último total conhecido antes do IndexedDB.
 *
 * @module app/dm-badge-live
 */

import { signal, createScope } from "../shared/signals.js";
import { persistedSignal } from "../shared/persisted-signal.js";
import { sumUnreadDms, formatDmBadge, setAfterShellMount } from "../render/shell.js";

const badgeScope = createScope();
const cachedUnread = persistedSignal("vox-dm-unread-hint", 0, {
  validate: (v) => Number.isInteger(v) && v >= 0,
  scope: badgeScope
});
const unreadDms = signal(cachedUnread.peek());
let listenerBound = false;
let effectBound = false;
/** Geração monotônica: descarta respostas async fora de ordem. */
let refreshGen = 0;
/** @type {null | (() => Promise<object[]>)} */
let conversationsLoader = null;

/**
 * Pinta badges e `aria-label` a partir do signal (peek: sem nova inscrição).
 * @returns {void}
 */
function paintDmBadge() {
  const count = unreadDms.peek();
  const label = formatDmBadge(count);
  document.querySelectorAll("[data-dm-badge]").forEach((el) => {
    el.textContent = label;
    el.hidden = !label;
  });
  document.querySelectorAll('a[href="#/dm"]').forEach((a) => {
    const base = "Mensagens";
    a.setAttribute("aria-label", label ? `${base} · ${count} não ${count === 1 ? "lida" : "lidas"}` : base);
  });
}

/**
 * Carrega conversas (injetável nos testes).
 * @returns {Promise<object[]>}
 */
async function loadConversations() {
  if (conversationsLoader) return conversationsLoader();
  const cacheNode = await import("../cache-node.js");
  return cacheNode.getDmConversations();
}

/**
 * Recarrega a contagem a partir do cache de conversas e persiste o hint.
 * @returns {Promise<void>}
 */
async function refreshDmBadge() {
  const gen = ++refreshGen;
  try {
    const total = sumUnreadDms(await loadConversations());
    if (gen !== refreshGen) return;
    unreadDms.set(total);
    try {
      cachedUnread.set(total);
    } catch {
      /* validate/quota: hint opcional */
    }
  } catch {
    /* sem IndexedDB: mantém hint em memória */
  }
}

/**
 * Injeta loader de conversas (só testes).
 * @param {null | (() => Promise<object[]>)} fn Loader ou `null` para o padrão.
 * @returns {void}
 */
export function setDmBadgeConversationsLoader(fn) {
  conversationsLoader = typeof fn === "function" ? fn : null;
}

/**
 * Liga efeito + listener uma vez e registra o hook pós-montagem da shell.
 * @returns {void}
 */
export function wireDmBadgeLive() {
  if (!effectBound && typeof document?.querySelectorAll === "function") {
    effectBound = true;
    badgeScope.effect(() => {
      unreadDms.get();
      paintDmBadge();
    });
  }
  if (!listenerBound && typeof window?.addEventListener === "function") {
    listenerBound = true;
    const onChanged = () => {
      void refreshDmBadge();
    };
    window.addEventListener("vox:dm-changed", onChanged);
    badgeScope.onCleanup(() => window.removeEventListener("vox:dm-changed", onChanged));
  }
  setAfterShellMount(() => {
    paintDmBadge();
    void refreshDmBadge();
  });
  paintDmBadge();
  void refreshDmBadge();
}
