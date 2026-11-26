/**
 * @file Fachada de persistência, rolagem por fórmula, notas, ficha e backup/importação da Mesa Soberana (E1 + E4).
 * Conecta `dungeon-sync-bridge.js`, `vtt-store.js`, `dice-engine.js`, `vtt-portable.js` e `obsidian-bridge.js`
 * ao estado de sessão do `#/dungeon` sem acoplamento circular com `dungeon-state.js`.
 * @module dungeon/dungeon-persistence
 */
import { parseDiceCommand, rollDiceFormula } from "./dice-engine.js";
import {
  buildCampaignFromSession,
  dispatchCampaignOp,
  hydrateStateFromCampaign,
} from "./dungeon-sync-bridge.js";
import {
  chronicleToMarkdown,
  markdownToNote,
  markdownToSheet,
  parseObsidianCanvas,
  splitFrontmatter,
} from "./obsidian-bridge.js";
import { formatInWorldDate } from "./vtt-calendar.js";
import { buildLevelUpPlan } from "./vtt-levelup.js";
import { packEncryptedVoxRpg, packVoxRpg, unpackEncryptedVoxRpg, unpackVoxRpg } from "./vtt-portable.js";
import { createCampaign, createNoteDoc, ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";
import { tryStartFairplayRoll } from "./vtt-fairplay-roll-flow.js";
import { migrateLegacySheet } from "./system-migrate.js";
import { systemFieldsForSave, withSpeed } from "./dungeon-persistence-sheet-system.js";

export { buildCampaignFromSession, hydrateStateFromCampaign };

const DUNGEON_PREFS_KEY = "vox-dungeon-prefs-v1";
const ENC = new TextEncoder();
const DEC = new TextDecoder();

const ABILITY_LABELS_PTBR = Object.freeze({
  str: "Força",
  dex: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  wis: "Sabedoria",
  cha: "Carisma",
});

async function refreshStoreSummary(state, store) {
  state.campaigns = await store.listCampaigns();
  state.storageUsage = await store.estimateUsage();
  state.persistenceReady = true;
}

/**
 * Inicializa a persistência local da aba, carrega lista de campanhas, medidor de disco e restaura a mais recente.
 * @param {object} state Estado da sessão.
 * @param {object} [store] Instância de `VttStore` (usa o store padrão se omitido).
 * @returns {Promise<object>} Estado hidratado.
 */
export async function bootstrapDungeonPersistence(state, store = getDefaultVttStore()) {
  await refreshStoreSummary(state, store);
  const targetId = state.campaignId || state.campaigns[0]?.id || "";
  if (targetId) {
    const loaded = await store.loadCampaign(targetId);
    if (loaded) hydrateStateFromCampaign(state, loaded);
  }
  return state;
}

/**
 * Cria uma nova campanha local no `VttStore`, ativa-a na sessão e solicita armazenamento persistente na primeira campanha.
 * @param {object} state Estado da sessão.
 * @param {string} name Nome da campanha.
 * @param {object} [opts={}] Opções (`system`, `store`).
 * @returns {Promise<object>} `CampaignDoc` salvo.
 */
export async function createAndSelectCampaign(state, name, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const cleanName = String(name || "").trim() || "Nova Campanha";
  const system = String(opts.system || "d20_fantasy").trim() || "d20_fantasy";
  const doc = createCampaign({
    name: cleanName,
    system,
    dungeonPrefs: { preset: system },
    chronicle: [
      {
        id: "turn-inicio",
        speaker: "Mesa Soberana",
        badge: "Início",
        text: `Campanha "${cleanName}" criada neste aparelho. Dados, ficha e crônica são salvos localmente.`,
        rollNote: "Local-first",
      },
    ],
  });
  const saved = await store.saveCampaign(doc);
  hydrateStateFromCampaign(state, saved);
  await refreshStoreSummary(state, store);
  state.campaignNotice = `Campanha "${saved.name}" salva neste aparelho.`;
  return saved;
}

/**
 * Abre uma campanha já salva no `VttStore` e hidrata a sessão ativa.
 * @param {object} state Estado da sessão.
 * @param {string} campaignId Identificador da campanha.
 * @param {object} [store] Instância de `VttStore`.
 * @returns {Promise<object|null>} Campanha aberta ou `null`.
 */
export async function openSavedCampaign(state, campaignId, store = getDefaultVttStore()) {
  const loaded = await store.loadCampaign(campaignId);
  if (!loaded) {
    state.campaignNotice = "Campanha não encontrada no armazenamento local.";
    return null;
  }
  hydrateStateFromCampaign(state, loaded);
  await refreshStoreSummary(state, store);
  state.campaignNotice = `Campanha "${loaded.name}" aberta.`;
  return loaded;
}

/**
 * Avalia uma fórmula de dados (`/roll`, `/gmroll`, `2d20kh1+@for`), registra na crônica e persiste/sincroniza.
 * @param {object} state Estado da sessão.
 * @param {string} rawInput Comando ou fórmula de dados.
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`).
 * @returns {Promise<object>} Resultado de `rollDiceFormula`.
 */
export async function recordFormulaRoll(state, rawInput, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const mode = opts.mode || state.rollMode || "normal";
  const viaTable = await tryStartFairplayRoll(state, rawInput, { ...opts, store, mode });
  if (viaTable) return viaTable;
  const result = rollDiceFormula(rawInput, { sheet: state.sheet, mode, randomBytesFn: opts.randomBytesFn });
  if (!result.ok) {
    state.rollError = result.error;
    return result;
  }
  state.rollError = "";
  state.lastFormulaRoll = result;
  await dispatchCampaignOp(state, "ROLL_RECORDED", { speaker: state.sheet?.name || "Aventureiro", rollResult: result }, { store, refreshCampaignsList: true });
  return result;
}

/**
 * Rola um teste de atributo (`str`, `dex`, `con`, `int`, `wis`, `cha`) a partir da ficha clicável.
 * @param {object} state Estado da sessão.
 * @param {string} abilityKey Chave do atributo (`str`..`cha`).
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`).
 * @returns {Promise<object>} Resultado da rolagem.
 */
export async function recordAbilityRoll(state, abilityKey, opts = {}) {
  const key = String(abilityKey || "").toLowerCase();
  const label = ABILITY_LABELS_PTBR[key] || key.toUpperCase();
  return recordFormulaRoll(state, `1d20+@${key} # Teste de ${label}`, opts);
}

/**
 * Rola uma ação clicável da ficha (`sheet_meta.clickable_actions`), incluindo dano quando definido.
 * @param {object} state Estado da sessão.
 * @param {string} actionId Identificador da ação clicável.
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`).
 * @returns {Promise<{ ok: boolean, attack?: object, damage?: object|null, error?: string }>} Resultado completo.
 */
export async function recordSheetActionRoll(state, actionId, opts = {}) {
  const actions = state.sheet?.sheet_meta?.clickable_actions || [];
  const action = actions.find((a) => a.id === actionId);
  if (!action) {
    state.rollError = "Ação clicável não encontrada na ficha.";
    return { ok: false, error: state.rollError };
  }
  const attack = await recordFormulaRoll(state, `${action.roll} # ${action.label}`, opts);
  if (!attack.ok) return { ok: false, attack, error: attack.error };
  const damage = action.damage
    ? await recordFormulaRoll(state, `${action.damage} # Dano: ${action.label}`, { ...opts, mode: "normal" })
    : null;
  return { ok: true, attack, damage };
}

/**
 * Persiste uma alteração CRDT de recurso (`hp_current`, `currency_gp`, `spell_slot_l1`) quando há campanha ativa ou P2P.
 * @param {object} state Estado da sessão.
 * @param {string} poolKey Chave do pool.
 * @param {number} delta Valor da variação.
 * @param {string} reason Motivo da movimentação.
 * @param {object} [store] Instância de `VttStore`.
 * @returns {Promise<object|null>} Campanha atualizada ou `null` fora de campanha salva.
 */
export async function persistSheetDeltaIfActive(state, poolKey, delta, reason, store = getDefaultVttStore()) {
  if (!state.campaignId && !state.syncPeer) return null;
  const targetPool = poolKey === "coins" ? "currency_gp" : poolKey;
  return dispatchCampaignOp(state, "SHEET_DELTA", { sheetId: state.sheet?.character_id, target_pool: targetPool, delta, reason }, { store });
}

function validateCustomAction(action) {
  const label = String(action?.label || "").trim();
  const roll = String(action?.roll || "").trim();
  const damage = String(action?.damage || "").trim();
  if (!label || !roll) return { ok: false, error: "Informe nome e fórmula da ação (ex.: Arco Longo · 1d20+@des)." };
  try {
    parseDiceCommand(roll);
    if (damage) parseDiceCommand(damage);
    return { ok: true, action: { label, roll, damage, tag: action?.tag || "acao" } };
  } catch (err) {
    return { ok: false, error: err?.message || "Fórmula inválida para a ação." };
  }
}

/**
 * Adiciona ou atualiza uma ação clicável customizada na ficha ativa (`SHEET_ACTION_UPSERT`), validando a fórmula antes.
 * @param {object} state Estado da sessão.
 * @param {{ label: string, roll: string, damage?: string, tag?: string }} action Dados da ação.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<{ ok: boolean, error?: string }>} Resultado da operação.
 */
export async function addCustomSheetAction(state, action, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const check = validateCustomAction(action);
  if (!check.ok) {
    state.rollError = check.error;
    return check;
  }
  state.rollError = "";
  await dispatchCampaignOp(state, "SHEET_ACTION_UPSERT", { sheetId: state.sheet?.character_id, action: check.action }, { store });
  state.campaignNotice = `Ação "${check.action.label}" adicionada à ficha.`;
  return { ok: true };
}

/**
 * Remove uma ação clicável customizada da ficha ativa (`SHEET_ACTION_REMOVE`).
 * @param {object} state Estado da sessão.
 * @param {string} actionId Identificador da ação.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Estado reduzido.
 */
export async function removeCustomSheetAction(state, actionId, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  return dispatchCampaignOp(state, "SHEET_ACTION_REMOVE", { sheetId: state.sheet?.character_id, actionId }, { store });
}

function mergePatchedAbilities(baseAbilities, patch) {
  const ab = { ...(baseAbilities || {}) };
  for (const key of Object.keys(ABILITY_LABELS_PTBR)) {
    const num = Number(patch[key]);
    if (patch[key] !== undefined && Number.isFinite(num)) {
      ab[key] = Math.max(1, Math.min(30, Math.trunc(num)));
    }
  }
  return ab;
}

/**
 * Atualiza dados básicos da ficha ativa (nome, classe, CA e atributos FOR–CAR) via `SHEET_UPSERT`.
 * @param {object} state Estado da sessão.
 * @param {object} patch Campos editados na UI.
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Campanha ou ficha atualizada.
 */
export async function updateSheetBasicInfo(state, patch = {}, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const base = migrateLegacySheet(ensureSheetMeta(state.sheet || {}));
  const attrs = base.attributes_lww || {};
  const nextName = String(patch.name || attrs.name || "Aventureiro").trim().slice(0, 60);
  const nextClass = String(patch.class_name || attrs.class_name || "Aventureiro").trim().slice(0, 60);
  const nextAc = Math.max(1, Math.min(40, Math.trunc(Number(patch.armor_class) || attrs.armor_class || 10)));
  const abilities = mergePatchedAbilities(attrs.abilities, patch);
  const updated = ensureSheetMeta({
    ...base,
    ...systemFieldsForSave(base, patch, abilities),
    attributes_lww: withSpeed({ ...attrs, name: nextName, class_name: nextClass, armor_class: nextAc, abilities }, patch.speedFt),
  });
  const res = await dispatchCampaignOp(state, "SHEET_UPSERT", { sheet: updated, setActive: true }, { store });
  state.campaignNotice = `Ficha "${updated.attributes_lww.name}" atualizada.`;
  return res;
}

/**
 * Exclui uma campanha salva do `VttStore` e atualiza a sessão ativa (abrindo a próxima restante, se houver).
 * @param {object} state Estado da sessão.
 * @param {string} campaignId Identificador da campanha a excluir.
 * @param {object} [store] Instância de `VttStore`.
 * @returns {Promise<void>} Concluído após atualizar o estado.
 */
export async function deleteSavedCampaign(state, campaignId, store = getDefaultVttStore()) {
  await store.deleteCampaign(campaignId);
  state.pendingDeleteId = "";
  await refreshStoreSummary(state, store);
  if (state.campaignId === campaignId) {
    state.campaignId = "";
    state.campaignDoc = null;
    if (state.campaigns[0]?.id) {
      const next = await store.loadCampaign(state.campaigns[0].id);
      if (next) hydrateStateFromCampaign(state, next);
    }
  }
  state.campaignNotice = `Campanha "${campaignId}" removida deste aparelho.`;
}

/**
 * Persiste turnos narrativos recém-adicionados em `submitTableAction` e respectivos deltas CRDT quando há campanha ativa.
 * @param {object} state Estado da sessão.
 * @param {Array<object>} newEntries Entradas de crônica geradas no turno.
 * @param {Array<object>} newDeltas Operações de `delta_ledger` geradas no turno.
 * @param {object} [store] Instância de `VttStore`.
 * @returns {Promise<void>} Concluído após persistir as operações.
 */
export async function persistTableTurnIfActive(state, newEntries, newDeltas = [], store = getDefaultVttStore()) {
  if (!state.campaignId && !state.syncPeer) return;
  for (const entry of newEntries || []) {
    await dispatchCampaignOp(state, "CHRONICLE_APPEND", { speaker: entry.speaker, badge: entry.badge, text: entry.text, rollNote: entry.rollNote }, { store });
  }
  for (const op of newDeltas || []) {
    await dispatchCampaignOp(state, "SHEET_DELTA", { sheetId: state.sheet?.character_id, deltaOpId: op.op_id, target_pool: op.target_pool, delta: op.delta, reason: op.reason }, { store });
  }
}

/**
 * Persiste uma rolagem simples da Bandeja D20 quando há campanha salva ativa.
 * @param {object} state Estado da sessão.
 * @param {number} value Valor sorteado (`1..20`).
 * @param {object} [store] Instância de `VttStore`.
 * @returns {Promise<void>} Concluído após persistir a rolagem.
 */
export async function persistD20RollIfActive(state, value, store = getDefaultVttStore()) {
  if (!state.campaignId && !state.syncPeer) return;
  const rollResult = { formula: "1d20", resolvedFormula: "1d20", label: "Bandeja D20", visibility: "public", rolls: [{ sides: 20, value, kept: true, exploded: false }], total: value, crits: value === 20 ? 1 : 0, fumbles: value === 1 ? 1 : 0 };
  await dispatchCampaignOp(state, "ROLL_RECORDED", { speaker: state.sheet?.name || "Aventureiro", rollResult }, { store });
}

/**
 * Exporta a campanha ativa em `.voxrpg.zip`, `.voxrpg.enc` (cifrado via Senha Soberana) ou crônica `.md` (Obsidian).
 * @param {object} state Estado da sessão.
 * @param {object} [opts={}] Opções (`format`: `"zip"|"enc"|"md"`, `passphrase`, `includeGmSecrets`, `store`).
 * @returns {Promise<{ filename: string, bytes: Uint8Array, mime: string }>} Artefato pronto para download.
 */
export async function exportCampaignBackup(state, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const doc = state.campaignId ? (await store.loadCampaign(state.campaignId)) || buildCampaignFromSession(state) : buildCampaignFromSession(state);
  const format = opts.format || "zip";
  if (format === "md") {
    const md = chronicleToMarkdown(doc, { includePrivate: opts.includeGmSecrets !== false });
    return { filename: `${doc.id}-cronica.md`, bytes: ENC.encode(md), mime: "text/markdown;charset=utf-8" };
  }
  const blobs = await store.getAllBlobsMap();
  if (format === "enc") {
    const json = await packEncryptedVoxRpg(doc, opts.passphrase, blobs);
    return { filename: `${doc.id}.voxrpg.enc`, bytes: ENC.encode(json), mime: "application/json;charset=utf-8" };
  }
  const zipBytes = await packVoxRpg(doc, blobs, { includeGmSecrets: opts.includeGmSecrets !== false });
  return { filename: `${doc.id}.voxrpg.zip`, bytes: zipBytes, mime: "application/zip" };
}

async function importMarkdownIntoCampaign(state, text, fileName, store) {
  if (!state.campaignId) await createAndSelectCampaign(state, state.tableName || "Campanha Importada", { store });
  const { data } = splitFrontmatter(text);
  const isSheet = data.tipo === "ficha" || data.tipo === "npc" || data.vox_tipo === "ficha" || Boolean(data.atributos) || Boolean(data.abilities);
  if (isSheet) {
    const sheet = markdownToSheet(text, { campaign_id: state.campaignId, name: fileName.replace(/\.md$/i, "") });
    await dispatchCampaignOp(state, "SHEET_UPSERT", { sheet, setActive: true }, { store });
    state.campaignNotice = `Ficha "${sheet.attributes_lww.name}" importada do Markdown.`;
    return { ok: true, kind: "sheet-md", campaignId: state.campaignId };
  }
  const note = markdownToNote(text, { title: fileName.replace(/\.md$/i, "") });
  await dispatchCampaignOp(state, "NOTE_UPSERT", { note }, { store });
  state.campaignNotice = `Nota "${note.title}" importada do Markdown.`;
  return { ok: true, kind: "note-md", campaignId: state.campaignId };
}

async function saveRestoredPackage(state, unpacked, store, label) {
  for (const bytes of unpacked.blobs.values()) await store.putBlob(bytes);
  const saved = await store.saveCampaign(unpacked.campaign);
  hydrateStateFromCampaign(state, saved);
  await refreshStoreSummary(state, store);
  state.campaignNotice = `Campanha "${saved.name}" restaurada (${label}).`;
  return { ok: true, kind: label, campaignId: saved.id };
}

/**
 * Importa arquivo `.voxrpg.zip`, backup cifrado `.voxrpg.enc`, nota/ficha `.md` ou quadro `.canvas` (Obsidian) para o `VttStore`.
 * @param {object} state Estado da sessão.
 * @param {{ name?: string, bytes: Uint8Array|string }} fileSpec Arquivo selecionado pelo usuário.
 * @param {object} [opts={}] Opções (`passphrase`, `store`).
 * @returns {Promise<{ ok: boolean, kind?: string, campaignId?: string, error?: string }>} Resultado da importação.
 */
export async function importCampaignFile(state, fileSpec, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const name = String(fileSpec?.name || "").trim();
  const rawBytes = fileSpec?.bytes instanceof Uint8Array ? fileSpec.bytes : ENC.encode(String(fileSpec?.bytes ?? ""));
  if (/\.canvas$/i.test(name)) {
    const canvasJson = parseObsidianCanvas(JSON.parse(DEC.decode(rawBytes)));
    const note = createNoteDoc({ title: name.replace(/\.canvas$/i, ""), folder: "Pistas", canvasJson, visibility: "shared" });
    if (!state.campaignId) await createAndSelectCampaign(state, state.tableName || "Campanha Importada", { store });
    await upsertCampaignNote(state, note, store);
    state.campaignNotice = `Quadro Obsidian "${note.title}" importado.`;
    return { ok: true, kind: "canvas", campaignId: state.campaignId };
  }
  if (/\.md$/i.test(name)) return importMarkdownIntoCampaign(state, DEC.decode(rawBytes), name, store);
  if (/\.enc$/i.test(name) || rawBytes[0] === 0x7b) {
    const unpacked = await unpackEncryptedVoxRpg(DEC.decode(rawBytes), opts.passphrase);
    return saveRestoredPackage(state, unpacked, store, "voxrpg-enc");
  }
  const unpacked = await unpackVoxRpg(rawBytes);
  return saveRestoredPackage(state, unpacked, store, "voxrpg-zip");
}

/**
 * Indica se já existe objeto de prefs da Mesa persistido no aparelho.
 * @returns {boolean}
 */
export function hasStoredDungeonPrefs() {
  try {
    return globalThis.localStorage?.getItem(DUNGEON_PREFS_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Lê preferências locais da Mesa (dados 3D e papel visual) do `localStorage`.
 * @returns {{ dice3d: boolean, viewerRole: "gm"|"player" }}
 */
export function loadDungeonPrefs() {
  try {
    const raw = globalThis.localStorage?.getItem(DUNGEON_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const role = parsed.viewerRole === "player" ? "player" : "gm";
    return { dice3d: parsed.dice3d !== false, viewerRole: role };
  } catch {
    return { dice3d: true, viewerRole: "gm" };
  }
}

/**
 * Salva preferências locais da Mesa no `localStorage`.
 * @param {object} prefs Preferências parciais.
 */
export function saveDungeonPrefs(prefs = {}) {
  const current = loadDungeonPrefs();
  const next = { ...current, ...prefs };
  globalThis.localStorage?.setItem(DUNGEON_PREFS_KEY, JSON.stringify(next));
}

/**
 * Avança o relógio de campanha (`CALENDAR_ADVANCE`) e atualiza `worldDateLabel`.
 * @param {object} state Sessão.
 * @param {string} delta Atalho de tempo.
 * @param {object} [store] Store.
 * @returns {Promise<object>} Campanha atualizada após `CALENDAR_ADVANCE`.
 */
export async function advanceCampaignCalendar(state, delta, store = getDefaultVttStore()) {
  const reduced = await dispatchCampaignOp(state, "CALENDAR_ADVANCE", { delta }, { store });
  if (reduced?.calendar) {
    state.worldCalendar = reduced.calendar;
    state.worldDateLabel = formatInWorldDate(reduced.calendar);
  }
  return reduced;
}

/**
 * Muta o inventário OR-Set da ficha ativa (`add`, `remove`, `toggle_equip`, `set_qty`, `adjust_qty`).
 * @param {object} state Sessão.
 * @param {string} kind Tipo da mutação.
 * @param {object} payload Dados do item.
 * @param {object} [store] Store.
 * @returns {Promise<object>} Campanha atualizada após `INVENTORY_MUTATE`.
 */
export async function mutateSheetInventory(state, kind, payload, store = getDefaultVttStore()) {
  const res = await dispatchCampaignOp(state, "INVENTORY_MUTATE", { sheetId: state.sheet?.character_id, kind, ...payload }, { store });
  state.campaignNotice = kind === "add" ? `Item "${payload.label || "item"}" adicionado à mochila.` : "Mochila atualizada.";
  return res;
}

/**
 * Aplica subida de nível guiada na ficha ativa com o preset escolhido.
 * @param {object} state Sessão.
 * @param {object} [store] Store.
 * @param {string} [presetOverride] Preset opcional (`libre`, `d20_fantasy`, `tormenta20`, `investigacao`).
 * @returns {Promise<{ ok: boolean, error?: string }>} Resultado do assistente.
 */
export async function applySheetLevelUp(state, store = getDefaultVttStore(), presetOverride = "") {
  const preset = presetOverride || state.levelUpPreset || state.campaignDoc?.dungeonPrefs?.preset || state.campaignDoc?.system || "libre";
  const level = (Number(state.sheet?.attributes_lww?.level) || 1) + 1;
  const plan = buildLevelUpPlan(state.sheet, level, preset);
  if (!plan.ok) {
    state.rollError = plan.error;
    return plan;
  }
  state.rollError = "";
  await dispatchCampaignOp(state, "LEVEL_UP_APPLY", { sheetId: state.sheet?.character_id, plan: plan.plan }, { store });
  state.levelUpOpen = false;
  state.campaignNotice = `Nível ${level} alcançado (+${plan.plan.hpGain} PV máx · proficiência +${plan.plan.proficiencyBonus}).`;
  return { ok: true };
}

/**
 * Cria ou atualiza nota com opcional canvas JSON.
 * @param {object} state Sessão.
 * @param {object} note `NoteDoc` parcial.
 * @param {object} [store] Store.
 * @returns {Promise<void>} Concluído após `NOTE_UPSERT`.
 */
export async function upsertCampaignNote(state, note, store = getDefaultVttStore()) {
  await dispatchCampaignOp(state, "NOTE_UPSERT", { note }, { store });
  if (state.campaignDoc?.notesById) state.notes = Object.values(state.campaignDoc.notesById);
}

/**
 * Alterna visibilidade de uma nota/handout (`shared` ↔ `gm_only`) via `NOTE_VISIBILITY`.
 * @param {object} state Sessão.
 * @param {string} noteId Identificador da nota.
 * @param {"shared"|"gm_only"} visibility Nova visibilidade.
 * @param {object} [store] Store.
 * @returns {Promise<object>} Campanha atualizada.
 */
export async function updateNoteVisibility(state, noteId, visibility, store = getDefaultVttStore()) {
  const res = await dispatchCampaignOp(state, "NOTE_VISIBILITY", { noteId, visibility }, { store });
  state.campaignNotice = visibility === "shared" ? "Handout compartilhado com a mesa." : "Nota recolhida para a Camada do Mestre.";
  return res;
}

/**
 * Fixa uma nota como alfinete no mapa da cena ativa (`NOTE_PIN`).
 * @param {object} state Sessão.
 * @param {string} noteId Identificador da nota.
 * @param {{ x?: number, y?: number }} [pos={}] Coordenada em células.
 * @param {object} [store] Store.
 * @returns {Promise<object>} Campanha atualizada.
 */
export async function pinNoteToScene(state, noteId, pos = {}, store = getDefaultVttStore()) {
  const sceneId = state.scene?.sceneId || state.campaignDoc?.activeSceneId || "sc-cripta";
  const floorZ = state.scene?.activeFloorZ ?? 0;
  const res = await dispatchCampaignOp(state, "NOTE_PIN", { noteId, sceneId, floorZ, x: pos.x ?? 3, y: pos.y ?? 2 }, { store });
  state.campaignNotice = "Nota fixada como alfinete no mapa ativo.";
  return res;
}
