/**
 * @file Assistentes de criação de comunidade e oferta na feira comunitária.
 *
 * Fluxo em etapas cívicas delegando passos ao `compose-steps.js`.
 *
 * @module render/profile-compose-wizards
 */
import * as listing from "../listing.js";
import { escapeHtml } from "./util.js";
import { renderComposeSignaturePanel } from "./compose-chrome.js";
import { renderSteps, renderReviewList } from "./compose-steps.js";
import { COMPOSER_IMAGE_ACCEPT_ATTR } from "../composer-media.js";

function renderComposeCommunityPhotoSection() {
  return `
    <div class="form-group community-compose-photo-group">
      <label style="font-weight:600; display:block; margin-bottom:0.4rem;">Foto da Comunidade (estilo Orkut):</label>
      <div class="community-compose-photo-row" style="display:flex; gap:1rem; align-items:center;">
        <div id="comm-photo-preview" class="community-avatar-box community-avatar-lg" style="--comm-avatar-accent:var(--brand-chrome); width:80px; height:80px; flex-shrink:0;">
          <div class="community-avatar-fallback" style="background:var(--brand-chrome); font-size:1.8rem; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#fff; font-weight:800; border-radius:14px;">C</div>
        </div>
        <div style="flex:1;">
          <label class="btn btn-sm btn-outline" style="cursor:pointer; display:inline-block; margin-bottom:0.4rem;">
            📁 Escolher foto do aparelho
            <input type="file" id="comm-photo-file" accept="${COMPOSER_IMAGE_ACCEPT_ATTR}" style="display:none;" />
          </label>
          <input type="url" id="comm-photo-url" class="form-control" placeholder="Ou cole a URL da imagem (opcional)" style="font-size:0.85rem;" />
        </div>
      </div>
    </div>`;
}

/** Nova comunidade em etapas: nome e endereço → foto → tipo → regras → revisar. */
function communityNameStepHtml() {
  return `
      <div class="form-group">
        <label for="comm-title">Título:</label>
        <input type="text" id="comm-title" class="form-control" placeholder="ex: Cinema Brasileiro" required maxlength="100" />
      </div>
      <div class="form-group">
        <label for="comm-id">Endereço (slug):</label>
        <input type="text" id="comm-id" class="form-control" placeholder="ex: cinema-nacional" required pattern="[a-z0-9\\-]+" title="Apenas letras minúsculas, números e hífens." />
      </div>`;
}

function communityPhotoStepHtml() {
  return `
      <div class="form-group">
        <label for="comm-type">Tipo de Comunidade:</label>
        <select id="comm-type" class="form-control">
          <option value="open">Pública (Aberta a todos)</option>
          <option value="closed">Moderada (Requer aprovação)</option>
        </select>
      </div>
      <div class="form-group" style="display:flex; gap:0.5rem; align-items:flex-start;">
        <input type="checkbox" id="comm-new-key-quarantine" style="margin-top:0.25rem;" />
        <label for="comm-new-key-quarantine" style="margin:0; font-weight:normal;">
          <strong>Quarentena para chave nova</strong> (anti-spam): posts de quem chegou à rede há menos de 24 h ficam recolhidos,
          a menos que o aparelho da pessoa faça uma prova de trabalho leve (cerca de 1 segundo) ao publicar.
          Moderação sempre vê tudo. Só dá para escolher agora, na criação.
        </label>
      </div>
      <div class="form-group">
        <label for="comm-category">Categoria:</label>
        <input type="text" id="comm-category" class="form-control" list="comm-category-suggestions" placeholder="ex: Cultura & Artes, Política & Cidadania" maxlength="40" />
        <datalist id="comm-category-suggestions">
          <option value="Política & Cidadania"><option value="Cultura & Artes"><option value="Tecnologia & Software Livre"><option value="Cidades & Bairros"><option value="Música & Cinema"><option value="Economia Solidária"><option value="Educação & Ciência"><option value="Humor & Entretenimento">
        </datalist>
      </div>`;
}

function communityRulesStepHtml() {
  return `
      <div class="form-group">
        <label for="comm-desc">Descrição e Regras:</label>
        <textarea id="comm-desc" class="form-control" rows="6" placeholder="Qual o propósito desta comunidade? Quais as regras de convivência?" required maxlength="500"></textarea>
      </div>`;
}

function communityReviewStepHtml() {
  return `
      ${renderReviewList([
        { label: "Título", from: "comm-title" },
        { label: "Endereço", from: "comm-id" },
        { label: "Tipo", from: "comm-type" },
        { label: "Categoria", from: "comm-category", empty: "Sem categoria" },
        { label: "Regras", from: "comm-desc", long: true },
      ])}
      ${renderComposeSignaturePanel()}`;
}

/**
 * Wizard de criação de comunidade (etapas nome → foto → regras).
 * @param {HTMLElement} main Container da rota `#/compose/community`.
 * @returns {void}
 */
export function renderComposeCommunity(main) {
  const nav = { backHref: "#/communities", submitId: "btn-submit-comm", submitLabel: "Publicar comunidade" };
  const steps = [
    { key: "name", title: "Nome e endereço", required: ["comm-title", "comm-id"], requiredMsg: "Preencha o título e um endereço válido (letras minúsculas, números e hífens).", body: communityNameStepHtml() },
    { key: "photo", title: "Foto (opcional)", body: renderComposeCommunityPhotoSection() },
    { key: "type", title: "Tipo e visibilidade", body: communityPhotoStepHtml() },
    { key: "rules", title: "Propósito e regras", required: ["comm-desc"], requiredMsg: "Descreva o propósito e as regras.", body: communityRulesStepHtml() },
    { key: "review", title: "Revisar a comunidade", body: communityReviewStepHtml() },
  ];
  main.innerHTML = `
    <div class="compose-card compose-card-sleek compose-community-card agora-composer agora-composer--steps">
      <div class="agora-composer-head">
        <a class="back-link compose-back-link" href="#/communities">← Voltar</a>
        <p class="agora-composer-kicker">Nova Comunidade</p>
      </div>
      <form id="form-compose-community" novalidate>
        ${renderSteps(steps, nav)}
      </form>
    </div>`;
}

/** Nova oferta em etapas: o quê → preço e local → Pix → foto e descrição → revisar. */
function listingWhatStepHtml() {
  return `
      <div class="form-group">
        <label for="listing-title">Oferta:</label>
        <input type="text" id="listing-title" class="form-control" placeholder="Ex: Pão artesanal de fermentação natural" required maxlength="120" />
      </div>`;
}

function listingPriceStepHtml() {
  return `
      <div class="form-group">
        <label for="listing-price">Preço sugerido:</label>
        <input type="text" id="listing-price" class="form-control" placeholder="Ex: R$ 35" />
      </div>
      <div class="form-group">
        <label for="listing-location">Bairro / Região:</label>
        <input type="text" id="listing-location" class="form-control" placeholder="Ex: Vila Madalena, SP" maxlength="60" />
      </div>`;
}

function listingPixStepHtml(defaultPix) {
  return `
      <div class="form-group">
        <label for="listing-pix">Chave Pix para recebimento direto:</label>
        <input type="text" id="listing-pix" class="form-control" placeholder="E-mail, celular, CPF ou chave aleatória" value="${escapeHtml(defaultPix)}" />
      </div>
      <p class="listing-form-disclaimer compose-step-lead">⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}</p>`;
}

function listingDetailsStepHtml() {
  return `
      <div class="form-group">
        <label for="listing-image">Foto do item (URL opcional):</label>
        <input type="text" id="listing-image" class="form-control" placeholder="images/posts/tour-helena.jpg ou https://..." />
      </div>
      <div class="form-group">
        <label for="listing-body">Descrição da oferta:</label>
        <textarea id="listing-body" class="form-control" rows="5" placeholder="Descreva os detalhes do produto ou serviço, prazos e forma de entrega..." required></textarea>
      </div>`;
}

/**
 * Wizard de nova oferta na feira comunitária.
 * @param {HTMLElement} main Container da rota `#/compose/listing`.
 * @param {string} communityId Comunidade da feira.
 * @param {string} [commTitle=""] Título legível no kicker.
 * @param {object} [prefill={}] Valores iniciais (`defaultPix`, etc.).
 * @returns {void}
 */
export function renderComposeListing(main, communityId, commTitle = "", prefill = {}) {
  const titleDisplay = commTitle || communityId || "Feira";
  const defaultPix = prefill.defaultPix || "";
  const backHref = `#/c/${encodeURIComponent(communityId)}?tab=listings`;
  const nav = { backHref, submitId: "btn-submit-listing", submitLabel: "Publicar na Feira" };
  const steps = [
    { key: "what", title: "O que você está ofertando?", required: ["listing-title"], requiredMsg: "Diga o que é a oferta.", body: listingWhatStepHtml() },
    { key: "price", title: "Preço e local", body: listingPriceStepHtml() },
    { key: "pix", title: "Como receber? (opcional)", body: listingPixStepHtml(defaultPix) },
    { key: "details", title: "Foto e descrição", required: ["listing-body"], requiredMsg: "Descreva a oferta.", body: listingDetailsStepHtml() },
    { key: "review", title: "Revisar a oferta", body: renderReviewList([
      { label: "Oferta", from: "listing-title" },
      { label: "Preço", from: "listing-price", empty: "A combinar" },
      { label: "Local", from: "listing-location", empty: "Não informado" },
      { label: "Pix", from: "listing-pix", empty: "Sem Pix" },
      { label: "Descrição", from: "listing-body", long: true },
    ]) },
  ];
  main.innerHTML = `
    <div class="card compose-card compose-listing-card agora-composer agora-composer--steps">
      <div class="agora-composer-head">
        <a class="back-link" href="${backHref}">← Voltar à feira</a>
        <p class="agora-composer-kicker">Nova Oferta — ${escapeHtml(titleDisplay)}</p>
      </div>
      <form id="form-compose-listing" novalidate>
        <input type="hidden" id="listing-comm-id" value="${escapeHtml(communityId)}" />
        ${renderSteps(steps, nav)}
      </form>
    </div>`;
}
