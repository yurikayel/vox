/**
 * @file Badge de DMs não lidas via signals (camada `app`; `render/shell` continua HTML puro).
 *
 * Escopo de app (não de rota): o chrome da shell sobrevive à troca de tela.
 *
 * @module app/dm-badge-live
 */

import { signal, createScope } from "../shared/signals.js";
import { sumUnreadDms, formatDmBadge, setAfterShellMount } from "../render/shell.js";

const unreadDms = signal(0);
const badgeScope = createScope();
let listenerBound = false;
let effectBound = false;

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
 * Recarrega a contagem a partir do cache de conversas.
 * @returns {Promise<void>}
 */
async function refreshDmBadge() {
  try {
    const cacheNode = await import("../cache-node.js");
    unreadDms.set(sumUnreadDms(await cacheNode.getDmConversations()));
  } catch {
    /* sem IndexedDB: contador fica oculto */
  }
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
    window.addEventListener("vox:dm-changed", () => {
      void refreshDmBadge();
    });
  }
  setAfterShellMount(() => {
    paintDmBadge();
    void refreshDmBadge();
  });
  paintDmBadge();
  void refreshDmBadge();
}
