/** @file Peças compartilhadas do compositor (Stitch tela 9): tipo de registro e painel de assinatura. */
import { escapeHtml } from "./util.js";

const COMPOSE_TYPES = [
  { key: "topic", label: "Publicação social", hint: "Fotos e diálogo", href: (c) => `#/compose/topic${c ? `?c=${encodeURIComponent(c)}` : ""}` },
  { key: "proposal", label: "Deliberação cívica", hint: "Votação da comunidade", href: (c) => `#/compose/proposal?c=${encodeURIComponent(c || "vox")}` },
  { key: "listing", label: "Feira local", hint: "Economia P2P", href: (c) => `#/compose/listing${c ? `?c=${encodeURIComponent(c)}` : ""}` },
  { key: "community", label: "Nova comunidade", hint: "Fundar um círculo", href: () => "#/compose/community" },
];

/** Seletor "Tipo de registro" (Stitch tela 9) — cada tipo é uma rota de composição existente. */
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

/** Painel de assinatura (Stitch): explica que a publicação é assinada no aparelho. */
export function renderComposeSignaturePanel() {
  return `
    <section class="agora-signature-panel" aria-label="Assinatura criptográfica">
      <div class="agora-signature-head">
        <span class="agora-section-label">Painel de assinatura criptográfica</span>
        <span class="agora-section-label agora-section-label--teal"><span class="agora-pylon" aria-hidden="true"></span>Chave local</span>
      </div>
      <p class="agora-signature-body">Toda publicação é assinada neste aparelho com a sua chave Ed25519 e propagada pela malha de pares — sem intermediários.</p>
    </section>`;
}
