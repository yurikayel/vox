/**
 * @file Ponte lazy do `kit-genesis` (laboratório) para criação de comunidade a partir de modelo.
 * @module app/compose-community-kit
 */

import { escapeHtml } from "../shared/html.js";

const KIT_META_BY_ID = Object.freeze({
  "kit-bairro": Object.freeze({ shortLabel: "Bairro", category: "Cidades & Bairros", suggestedSlug: "meu-bairro" }),
  "kit-sindicato": Object.freeze({ shortLabel: "Sindicato", category: "Política & Cidadania", suggestedSlug: "meu-sindicato" }),
  "kit-coletivo": Object.freeze({ shortLabel: "Coletivo", category: "Cultura & Artes", suggestedSlug: "meu-coletivo" }),
});

/**
 * Carrega o módulo `kit-genesis.js` sob demanda (import dinâmico lazy).
 * @returns {Promise<typeof import("../labs/parado/kit-genesis.js")>}
 */
export function loadKitGenesis() {
  return import("../labs/parado/kit-genesis.js");
}

/**
 * Normaliza o endereço do criador para o formato `vx_…` exigido pelo `kit-genesis`.
 * @param {string} rawAddr Identidade ativa do aparelho.
 * @returns {string}
 * @throws {Error} Se vazio.
 */
export function normalizeKitCreatorAddr(rawAddr) {
  const clean = String(rawAddr || "").trim();
  if (!clean) throw new Error("Identidade do criador é obrigatória para instanciar modelo.");
  const prefixed = clean.startsWith("vx_") ? clean : `vx_${clean}`;
  return prefixed.length >= 8 ? prefixed : prefixed.padEnd(8, "0");
}

/**
 * Resume os manifestos de kit disponíveis para exibição no seletor.
 * @param {object} [kitMod] Módulo `kit-genesis` já carregado (opcional).
 * @returns {Promise<object[]>}
 */
export async function listCommunityKitSummaries(kitMod) {
  const mod = kitMod || (await loadKitGenesis());
  return mod.listAvailableKits().map((kit) => {
    const meta = KIT_META_BY_ID[kit.id] || { shortLabel: kit.title, category: "Geral", suggestedSlug: kit.id };
    return {
      id: kit.id,
      shortLabel: meta.shortLabel,
      title: kit.title,
      description: kit.description,
      category: meta.category,
      suggestedSlug: meta.suggestedSlug,
      visibility: kit.securityPolicy?.allowGuestRead === false ? "closed" : "open",
      channels: kit.channels || [],
      cartridges: kit.cartridges || [],
    };
  });
}

/**
 * Renderiza um cartão de modelo de comunidade com escape HTML estrito.
 * @param {object} kit Resumo do kit.
 * @param {boolean} isSelected Se o kit está selecionado.
 * @returns {string}
 */
function renderKitCardHtml(kit, isSelected) {
  const activeClass = isSelected ? " is-selected" : "";
  const channelNames = (kit.channels || []).map((ch) => escapeHtml(ch.title)).join(", ");
  return `
    <button type="button" class="comm-kit-card btn btn-outline${activeClass}" data-kit-id="${escapeHtml(kit.id)}" aria-pressed="${isSelected ? "true" : "false"}" style="text-align:left; display:block; width:100%; margin-bottom:0.5rem; padding:0.65rem 0.75rem;">
      <strong>${escapeHtml(kit.shortLabel)}</strong> — ${escapeHtml(kit.title)}
      <div class="text-muted" style="font-size:0.85rem; margin-top:0.2rem;">${escapeHtml(kit.description)}</div>
      <div style="font-size:0.78rem; margin-top:0.25rem;">Canais: ${channelNames}</div>
    </button>`;
}

/**
 * Renderiza o painel de escolha de modelos (`Bairro`, `Sindicato`, `Coletivo`) e opção de cartuchos.
 * @param {object[]} kits Lista de resumos de kit.
 * @param {string} [selectedKitId=""] ID selecionado.
 * @param {boolean} [includeCartridges=false] Opt-in de cartuchos Webxdc.
 * @returns {string}
 */
export function renderKitPickerPanelHtml(kits, selectedKitId = "", includeCartridges = false) {
  const cards = (kits || []).map((k) => renderKitCardHtml(k, k.id === selectedKitId)).join("");
  const checkedAttr = includeCartridges ? " checked" : "";
  const clearBtn = selectedKitId
    ? `<button type="button" class="btn btn-sm btn-outline" data-kit-clear style="margin-top:0.4rem;">Limpar modelo</button>`
    : "";
  return `
    <div class="comm-kit-panel card" style="padding:0.75rem; margin-top:0.5rem;">
      <p style="font-weight:600; margin:0 0 0.5rem;">Escolha um modelo de comunidade:</p>
      <div class="comm-kit-list">${cards}</div>
      <label style="display:flex; gap:0.5rem; align-items:flex-start; font-size:0.85rem; margin-top:0.4rem;">
        <input type="checkbox" id="comm-kit-include-cartridges"${checkedAttr} />
        <span>Incluir cartuchos Webxdc sugeridos (opcional; não bloqueia a criação)</span>
      </label>
      ${clearBtn}
    </div>`;
}

/**
 * Monta a descrição inicial preenchida a partir de um kit.
 * @param {object} kit Resumo do kit.
 * @returns {string}
 */
function formatKitDescription(kit) {
  const channelList = (kit.channels || []).map((ch) => ch.title).join(", ");
  const full = channelList ? `${kit.description}\nCanais iniciais: ${channelList}.` : kit.description;
  return full.slice(0, 500);
}

/**
 * Preenche os campos do formulário de criação de comunidade com os valores do modelo escolhido.
 * @param {object} kit Resumo do kit.
 * @param {Document} [doc=document] Documento alvo.
 */
export function applyKitToCommunityForm(kit, doc = document) {
  const setVal = (id, val) => {
    const el = doc.getElementById(id);
    if (el) el.value = val;
  };
  setVal("comm-title", kit.title);
  setVal("comm-id", kit.suggestedSlug);
  setVal("comm-category", kit.category);
  setVal("comm-type", kit.visibility);
  setVal("comm-desc", formatKitDescription(kit));
}

/**
 * Instancia o payload validado da comunidade a partir do kit via import lazy.
 * @param {object} params Parâmetros de instanciação.
 * @param {string} params.kitId ID do kit (`kit-bairro`, `kit-sindicato`, `kit-coletivo`).
 * @param {string} params.creatorAddr Endereço do criador.
 * @param {string} [params.title] Título personalizado.
 * @param {string} [params.id] Slug personalizado.
 * @param {string} [params.desc] Descrição personalizada.
 * @param {boolean} [params.includeCartridges=false] Se inclui cartuchos Webxdc opcionais.
 * @param {object} [params.kitMod] Módulo injetável para testes.
 * @returns {Promise<object>}
 */
export async function buildCommunityFromKit({
  kitId,
  creatorAddr,
  title,
  id,
  desc,
  includeCartridges = false,
  kitMod,
}) {
  const mod = kitMod || (await loadKitGenesis());
  return mod.instantiateCommunityFromKit(kitId, {
    creatorAddr: normalizeKitCreatorAddr(creatorAddr),
    id: id || undefined,
    name: title || undefined,
    description: desc || undefined,
    includeCartridges: Boolean(includeCartridges),
  });
}

/**
 * Liga os eventos de seleção de kit e opt-in de cartuchos dentro do painel.
 * @param {HTMLElement} panel Container do painel.
 * @param {object} state Estado mutável do compositor.
 * @param {object[]} kits Lista de resumos carregados.
 * @param {Document} doc Documento alvo.
 */
function bindKitPanelInteractions(panel, state, kits, doc) {
  const redraw = () => {
    panel.innerHTML = renderKitPickerPanelHtml(kits, state.kitId, state.includeCartridges);
  };
  panel.addEventListener("click", (e) => {
    const clearEl = e.target?.closest?.("[data-kit-clear]");
    if (clearEl) {
      state.kitId = "";
      state.includeCartridges = false;
      redraw();
      return;
    }
    const card = e.target?.closest?.("[data-kit-id]");
    const kit = card ? kits.find((k) => k.id === card.dataset.kitId) : null;
    if (!kit) return;
    state.kitId = kit.id;
    applyKitToCommunityForm(kit, doc);
    redraw();
  });
  panel.addEventListener("change", (e) => {
    if (e.target?.id === "comm-kit-include-cartridges") {
      state.includeCartridges = Boolean(e.target.checked);
    }
  });
}

/**
 * Liga o botão "Criar comunidade a partir de modelo" com carregamento lazy de `kit-genesis.js`.
 * @param {object} state Estado do formulário (`kitId`, `includeCartridges`).
 * @param {object} [opts={}] Dependências opcionais para testes.
 * @param {Function} [opts.loadKit=loadKitGenesis] Loader lazy.
 * @param {Document} [opts.doc=document] Documento alvo.
 */
export function bindCommunityKitPicker(state, { loadKit = loadKitGenesis, doc = document } = {}) {
  const btn = doc.getElementById("btn-open-kit-genesis");
  const panel = doc.getElementById("comm-kit-picker-panel");
  if (!btn || !panel) return;
  let loadedKits = null;

  btn.addEventListener("click", async () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    btn.setAttribute?.("aria-expanded", String(opening));
    if (!opening || loadedKits) return;
    const mod = await loadKit();
    loadedKits = await listCommunityKitSummaries(mod);
    panel.innerHTML = renderKitPickerPanelHtml(loadedKits, state.kitId, state.includeCartridges);
    bindKitPanelInteractions(panel, state, loadedKits, doc);
  });
}
