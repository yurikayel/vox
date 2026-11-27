/**
 * @file "Importar por cima" do `.voxchar` (SUB-27, docs/specs/voxchar-importar-por-cima.md): troca só a lista branca na
 * ficha aberta e mantém `character_id`, campanha, dono, PV atual (`delta_ledger`), condições e notas do Mestre. Nada
 * do arquivo decide dono ou id. O arquivo é lido e validado primeiro, fica pendente, e só grava depois da confirmação.
 * Carregado sob demanda (`import()`), fora do precache.
 *
 * @module dungeon/voxchar-over
 */
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { checkVoxchar } from "./voxchar-check.js";
import { portableSheet } from "./voxchar.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";

/** Foco pedido ao redesenhar: a caixa que arma (origem) e o botão Substituir (próximo passo, depois de escolher o arquivo). */
const FOCUS_ARM = '[data-hud-op="voxchar-over"][data-step="arm"]';
const FOCUS_CONFIRM = '[data-hud-op="voxchar-over"][data-step="confirm"]';

/**
 * Ficha atual com a lista branca do arquivo por cima. Tudo o que a lista branca não cobre vem da ficha atual.
 * @param {object} current Ficha aberta.
 * @param {object} doc Documento validado por `checkVoxchar`.
 * @param {object} pack Pacote de sistema do documento.
 * @returns {object} Ficha pronta para `SHEET_UPSERT` (mesmo `character_id` e dono da atual).
 */
export function buildOverwrittenSheet(current, doc, pack) {
  const part = portableSheet(doc.sheet, pack);
  return ensureSheetMeta({
    ...current,
    attributes_lww: { ...current.attributes_lww, ...part.attributes_lww },
    system: { id: pack.id, version: pack.version },
    system_choices: { ...current.system_choices, ...part.system_choices },
    inventory_orset: part.inventory_orset,
    sheet_meta: { ...current.sheet_meta, ...part.sheet_meta },
    pools_base: { ...current.pools_base, ...part.pools_base },
  });
}

/**
 * Lê e valida o arquivo e o deixa pendente em `state.voxcharOver.pending`; não grava nada.
 * @param {object} state Estado da sessão.
 * @param {{bytes: Uint8Array}} file Conteúdo do arquivo lido.
 * @returns {Promise<{ok: boolean, issues?: string[]}>} Resultado; em recusa, os motivos em português.
 */
export async function stageVoxcharOver(state, file) {
  const checked = checkVoxchar(file?.bytes);
  if (!checked.ok) return checked;
  if (!state.sheet?.character_id) return { ok: false, issues: ["Não há ficha aberta para substituir."] };
  const name = portableSheet(checked.doc.sheet, checked.pack).attributes_lww.name;
  state.voxcharOver = { armed: true, pending: { doc: checked.doc, pack: checked.pack, name, characterId: state.sheet.character_id } };
  state.hudPanelFocus = FOCUS_CONFIRM;
  return { ok: true };
}

/**
 * Descarta o arquivo pendente e desarma a substituição.
 * @param {object} state Estado da sessão.
 * @returns {{ok: boolean}} Sempre `ok`.
 */
export function cancelVoxcharOver(state) {
  state.voxcharOver = { armed: false, pending: null };
  state.hudPanelFocus = FOCUS_ARM;
  return { ok: true };
}

/** Só afirma sucesso se a ficha devolvida pelo portão traz o que foi enviado; no par P2P o Mestre decide depois. */
function reportOutcome(state, sent) {
  if (state.joinMode === "p2p_player") {
    state.campaignNotice = "Pedido enviado; a ficha muda quando o Mestre aceitar.";
    return { ok: true };
  }
  const now = state.sheet;
  const same = now?.attributes_lww?.name === sent.attributes_lww.name && now?.attributes_lww?.level === sent.attributes_lww.level
    && now?.sheet_meta?.notes_public === sent.sheet_meta.notes_public;
  state.campaignNotice = same ? `Ficha "${sent.attributes_lww.name}" atualizada pelo arquivo .voxchar.` : "Não foi possível substituir a ficha: só o dono ou o Mestre podem.";
  return { ok: same };
}

/**
 * Grava o arquivo pendente por cima da ficha aberta. Se a ficha aberta já não é a do pedido, descarta sem gravar.
 * @param {object} state Estado da sessão.
 * @param {{store?: object}} [opts] Opções (`store`).
 * @returns {Promise<{ok: boolean}>} Resultado.
 */
export async function confirmVoxcharOver(state, opts = {}) {
  const pending = state.voxcharOver?.pending;
  cancelVoxcharOver(state);
  if (!pending) return { ok: false };
  if (state.sheet?.character_id !== pending.characterId) {
    state.campaignNotice = "A ficha aberta mudou; escolha o arquivo de novo.";
    return { ok: false };
  }
  const sheet = buildOverwrittenSheet(state.sheet, pending.doc, pending.pack);
  await dispatchCampaignOp(state, "SHEET_UPSERT", { sheet }, { store: opts.store || getDefaultVttStore() });
  return reportOutcome(state, sheet);
}

/**
 * Ponto de entrada da ação `voxchar-over` da tela: armar (caixa), confirmar ou cancelar.
 * @param {object} state Estado da sessão.
 * @param {"arm"|"confirm"|"cancel"} step Passo pedido.
 * @param {{checked?: boolean, store?: object}} [opts] Estado da caixa e `store`.
 * @returns {Promise<{ok: boolean}>|{ok: boolean}} Resultado do passo.
 */
export function runVoxcharOver(state, step, opts = {}) {
  if (step === "confirm") return confirmVoxcharOver(state, opts);
  if (step === "cancel") return cancelVoxcharOver(state);
  state.voxcharOver = { armed: Boolean(opts.checked), pending: null };
  return { ok: true };
}
