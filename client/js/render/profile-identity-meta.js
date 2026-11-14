/** @file Renderização das pílulas e formulário opcional de pronomes, gênero e orientação. */
import { escapeHtml } from "./util.js";
import {
  GENDER_SUGGESTIONS,
  IDENTITY_FIELD_MAX,
  ORIENTATION_SUGGESTIONS,
  PRONOUN_MAX,
  PRONOUN_PRESETS,
  hasAnyIdentityMeta,
  isJokePronoun,
  normalizeIdentityMeta,
} from "../profile-identity-meta.js";

function renderMetaPill(kind, value, titleText) {
  if (!value) return "";
  return `<span class="profile-identity-pill profile-identity-pill--${kind}" title="${escapeHtml(titleText)}">${escapeHtml(value)}</span>`;
}

/**
 * Renderiza pílulas discretas de pronomes, gênero e orientação quando preenchidos.
 * @param {{ pronouns?: string, gender?: string, orientation?: string }} [meta] Dados opcionais.
 * @returns {string} HTML das pílulas ou string vazia.
 */
export function renderIdentityMetaPills(meta = {}) {
  const { pronouns, gender, orientation } = normalizeIdentityMeta(meta);
  if (!pronouns && !gender && !orientation) return "";
  const pronounTitle = isJokePronoun(pronouns)
    ? `Pronomes (humor): ${pronouns}`
    : `Pronomes: ${pronouns}`;
  const pills = [
    renderMetaPill("pronouns", pronouns, pronounTitle),
    renderMetaPill("gender", gender, `Gênero: ${gender}`),
    renderMetaPill("orientation", orientation, `Orientação sexual: ${orientation}`),
  ].filter(Boolean);
  return `<div class="profile-identity-pills" aria-label="Pronomes, gênero e orientação">${pills.join("")}</div>`;
}

function renderDatalist(id, options) {
  const opts = options.map((o) => `<option value="${escapeHtml(o)}"></option>`).join("");
  return `<datalist id="${id}">${opts}</datalist>`;
}

function renderPronounPresetChips(currentPronouns) {
  const active = String(currentPronouns || "").trim().toLowerCase();
  return PRONOUN_PRESETS.map((p) => {
    const isMatch = active && active === p.value.toLowerCase();
    const funCls = p.fun ? " pronoun-chip--fun" : "";
    const activeCls = isMatch ? " is-active" : "";
    const titleAttr = p.fun ? ' title="Opção de humor — você também pode digitar qualquer outro"' : "";
    return `<button type="button" class="pronoun-chip${funCls}${activeCls}" data-pronoun-preset="${escapeHtml(p.value)}" aria-pressed="${isMatch ? "true" : "false"}"${titleAttr}>${escapeHtml(p.label)}</button>`;
  }).join("");
}

/**
 * Renderiza o bloco opcional de edição de pronomes, gênero e orientação sexual.
 * @param {{ pronouns?: string, gender?: string, orientation?: string }} [meta] Valores atuais.
 * @returns {string} HTML do formulário.
 */
export function renderIdentityMetaForm(meta = {}) {
  const current = normalizeIdentityMeta(meta);
  const clearBtn = hasAnyIdentityMeta(current)
    ? `<button type="button" id="btn-clear-identity-meta" class="btn btn-sm btn-outline">Limpar</button>`
    : "";
  return `
    <div class="identity-meta-section">
      <p class="pix-label" style="margin:0;">Pronomes, gênero e orientação (opcional)</p>
      <p class="desc pix-desc">Tudo opcional · suportamos todos os pronomes (até Jacaré 🐊).</p>
      <form id="form-identity-meta" class="identity-meta-form">
        <label for="input-profile-pronouns" class="identity-meta-label">Pronomes</label>
        <div class="pronoun-chips-row" role="group" aria-label="Sugestões rápidas de pronomes">${renderPronounPresetChips(current.pronouns)}</div>
        <input type="text" id="input-profile-pronouns" class="form-control" maxlength="${PRONOUN_MAX}" placeholder="Qualquer pronome (ex: elu/delu, ele/dele, Jacaré 🐊…)" value="${escapeHtml(current.pronouns)}" />
        <label for="input-profile-gender" class="identity-meta-label">Gênero (opcional)</label>
        <input type="text" id="input-profile-gender" class="form-control" maxlength="${IDENTITY_FIELD_MAX}" list="datalist-profile-gender" placeholder="Opcional (ex: mulher trans, não-binário…)" value="${escapeHtml(current.gender)}" />
        ${renderDatalist("datalist-profile-gender", GENDER_SUGGESTIONS)}
        <label for="input-profile-orientation" class="identity-meta-label">Orientação sexual (opcional)</label>
        <input type="text" id="input-profile-orientation" class="form-control" maxlength="${IDENTITY_FIELD_MAX}" list="datalist-profile-orientation" placeholder="Opcional (ex: bissexual, gay, hétero, pan…)" value="${escapeHtml(current.orientation)}" />
        ${renderDatalist("datalist-profile-orientation", ORIENTATION_SUGGESTIONS)}
        <div class="identity-meta-actions">
          <button type="submit" class="btn btn-sm btn-primary">Salvar identidade</button>
          ${clearBtn}
        </div>
      </form>
    </div>`;
}
