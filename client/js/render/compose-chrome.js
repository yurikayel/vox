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
