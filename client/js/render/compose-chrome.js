/** @file Peças compartilhadas do compositor (Stitch tela 9): tipo de registro e painel de assinatura. */
import { escapeHtml } from "./util.js";

const COMPOSE_TYPES = [
  { key: "topic", label: "Publicação social", hint: "Fotos e diálogo", href: (c) => `#/compose/topic${c ? `?c=${encodeURIComponent(c)}` : ""}` },
  { key: "proposal", label: "Deliberação cívica", hint: "Votação da comunidade", href: (c) => `#/compose/proposal?c=${encodeURIComponent(c || "vox")}` },
  { key: "listing", label: "Feira local", hint: "Economia P2P", href: (c) => `#/compose/listing${c ? `?c=${encodeURIComponent(c)}` : ""}` },
  { key: "community", label: "Nova comunidade", hint: "Fundar um círculo", href: () => "#/compose/community" },
];

/**
 * Grade de tipos de registro (publicação, proposta, feira, comunidade) com rota ativa.
 * @param {string} activeKey Chave do tipo marcado (`topic`, `proposal`, …).
 * @param {string} [communityId=""] ID para montar query `?c=` nos links.
 * @returns {string}
 */
export function renderComposeTypeSelector(activeKey, communityId = "") {
  const items = COMPOSE_TYPES.map((t) => {
    const active = t.key === activeKey;
    return `<a class="agora-compose-type${active ? " is-active" : ""}" href="${t.href(communityId)}"${active ? ' aria-current="page"' : ""}>
        <span class="agora-compose-type-label">${escapeHtml(t.label)}</span>
        <span class="agora-compose-type-hint">${escapeHtml(t.hint)}</span>
      </a>`;
  }).join("");
  return `<nav class="agora-compose-types" aria-label="Tipo de registro"><p class="agora-field-label">Tipo de registro</p><div class="agora-compose-types-grid">${items}</div></nav>`;
}

/**
 * Painel que explica assinatura local antes de publicar.
 * @returns {string}
 */
export function renderComposeSignaturePanel() {
  return `
    <section class="agora-signature-panel" aria-label="Assinatura criptográfica">
      <p class="agora-signature-body">Toda publicação é assinada neste aparelho com a sua chave e propagada pela malha de pares — sem intermediários.</p>
    </section>`;
}

/** @type {string} Id da região de anúncio pós-publicação (foco de teclado + leitor de tela). */
export const COMPOSE_PUBLISH_STATUS_ID = "vox-compose-publish-status";

const PUBLISH_STATUS_STYLE =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";

function inlineCollapsedTrigger() {
  const root = document.getElementById?.("feed-inline-composer");
  if (!root?.classList.contains("is-collapsed")) return null;
  const collapsed = root.querySelector(".inline-composer-collapsed");
  if (!collapsed || collapsed.classList.contains("hidden")) return null;
  return collapsed;
}

/**
 * Garante a região de status do compositor (no DOM ou criada sob demanda no feed).
 * @returns {HTMLElement|null}
 */
export function ensureComposePublishStatus() {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc?.body) return null;
  let region = doc.getElementById(COMPOSE_PUBLISH_STATUS_ID);
  if (region) return region;
  region = doc.createElement("div");
  region.id = COMPOSE_PUBLISH_STATUS_ID;
  region.tabIndex = -1;
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  region.style.cssText = PUBLISH_STATUS_STYLE;
  doc.body.appendChild(region);
  return region;
}

/**
 * Após publicar com sucesso: foco no gatilho recolhido do feed ou na região de anúncio.
 * @param {{ message?: string }} [opts] Texto opcional para leitores de tela na região de status.
 * @returns {void}
 */
export function focusAfterComposePublish({ message = "" } = {}) {
  const collapsed = inlineCollapsedTrigger();
  if (collapsed) {
    collapsed.focus({ preventScroll: true });
    return;
  }
  const region = ensureComposePublishStatus();
  if (!region) return;
  if (message) {
    region.textContent = "";
    queueMicrotask(() => { region.textContent = message; });
  }
  region.focus({ preventScroll: true });
}
