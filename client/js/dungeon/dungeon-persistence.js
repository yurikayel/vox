/**
 * @file Fachada de persistência, rolagem por fórmula e backup/importação da Mesa Soberana (E1).
 * Conecta `vtt-store.js`, `vtt-reducer.js`, `dice-engine.js`, `vtt-portable.js` e `obsidian-bridge.js`
 * ao estado de sessão do `#/dungeon` sem acoplamento circular com `dungeon-state.js`.
 * @module dungeon/dungeon-persistence
 */
import { parseDiceCommand, rollDiceFormula } from "./dice-engine.js";
import { chronicleToMarkdown, markdownToNote, markdownToSheet, splitFrontmatter } from "./obsidian-bridge.js";
import { packEncryptedVoxRpg, packVoxRpg, unpackEncryptedVoxRpg, unpackVoxRpg } from "./vtt-portable.js";
import { reduceCampaign } from "./vtt-reducer.js";
import { createCampaign, createVttOp, ensureSheetMeta } from "./vtt-schema.js";
import { getDefaultVttStore } from "./vtt-store.js";

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

function buildUiSheetProjection(rawSheet, fallbackInventory) {
  const sheet = ensureSheetMeta(rawSheet);
  const attrs = sheet.attributes_lww || {};
  const ab = attrs.abilities || {};
  return {
    ...sheet,
    char_id: sheet.character_id,
    name: attrs.name || "Aventureiro",
    role_title: attrs.class_name || "Aventureiro",
    attributes: { vitalidade: ab.con ?? 12, astucia: ab.dex ?? 12, sabedoria: ab.wis ?? 12 },
    inventory: Array.isArray(sheet.inventory) ? sheet.inventory : fallbackInventory || [],
  };
}

/**
 * Hidrata o estado de sessão da UI a partir de um `CampaignDoc` persistido sem sobrescrever blocos demo W-DRF.
 * @param {object} state Estado de sessão do `#/dungeon`.
 * @param {object} campaign Documento `CampaignDoc` carregado do `VttStore`.
 * @returns {object} Estado atualizado.
 */
export function hydrateStateFromCampaign(state, campaign) {
  state.campaignId = campaign.id;
  state.campaignDoc = campaign;
  state.tableId = campaign.id;
  state.tableName = campaign.name;
  const activeSheet = campaign.sheetsById?.[campaign.activeSheetId] || Object.values(campaign.sheetsById || {})[0];
  if (activeSheet) state.sheet = buildUiSheetProjection(activeSheet, state.sheet?.inventory);
  if (Array.isArray(campaign.chronicle) && campaign.chronicle.length) state.chronicle = [...campaign.chronicle];
  state.rolls = [...(campaign.rolls || [])];
  state.notes = Object.values(campaign.notesById || {});
  const lastRoll = state.rolls[state.rolls.length - 1];
  const keptD20 = lastRoll?.rolls?.find((d) => d.kept && d.sides === 20);
  if (keptD20) state.lastRoll = { dieSides: 20, value: keptD20.value, committed: false };
  return state;
}

/**
 * Constrói um `CampaignDoc` a partir do estado atual da sessão quando ainda não há campanha salva selecionada.
 * @param {object} state Estado da sessão.
 * @returns {object} Documento `CampaignDoc` válido.
 */
export function buildCampaignFromSession(state) {
  if (state.campaignDoc) return state.campaignDoc;
  const sheet = ensureSheetMeta(state.sheet || {});
  return createCampaign({
    id: state.tableId || "mesa-local",
    name: state.tableName || "Mesa Local",
    activeSheetId: sheet.character_id,
    sheetsById: { [sheet.character_id]: sheet },
    chronicle: state.chronicle || [],
    rolls: state.rolls || [],
  });
}

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
  const doc = createCampaign({
    name: cleanName,
    system: opts.system || "d20-livre",
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

async function applyAndPersistOp(state, type, payload, store) {
  const op = createVttOp({
    type,
    payload,
    actor: state.localActor || "local",
    lamport: (state.campaignDoc?.lamport || 0) + 1,
  });
  if (state.campaignId) {
    const res = await store.appendOp(state.campaignId, op);
    hydrateStateFromCampaign(state, res.campaign);
    state.campaigns = await store.listCampaigns();
    return res.campaign;
  }
  const reduced = reduceCampaign(buildCampaignFromSession(state), op);
  state.chronicle = [...reduced.chronicle];
  state.rolls = [...reduced.rolls];
  const keptD20 = state.rolls[state.rolls.length - 1]?.rolls?.find((d) => d.kept && d.sides === 20);
  if (keptD20) state.lastRoll = { dieSides: 20, value: keptD20.value, committed: false };
  return reduced;
}

/**
 * Avalia uma fórmula de dados (`/roll`, `/gmroll`, `2d20kh1+@for`), registra na crônica e persiste se houver campanha ativa.
 * @param {object} state Estado da sessão.
 * @param {string} rawInput Comando ou fórmula de dados.
 * @param {object} [opts={}] Opções (`mode`, `randomBytesFn`, `store`).
 * @returns {Promise<object>} Resultado de `rollDiceFormula`.
 */
export async function recordFormulaRoll(state, rawInput, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const mode = opts.mode || state.rollMode || "normal";
  const result = rollDiceFormula(rawInput, { sheet: state.sheet, mode, randomBytesFn: opts.randomBytesFn });
  if (!result.ok) {
    state.rollError = result.error;
    return result;
  }
  state.rollError = "";
  state.lastFormulaRoll = result;
  await applyAndPersistOp(state, "ROLL_RECORDED", { speaker: state.sheet?.name || "Aventureiro", rollResult: result }, store);
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
 * Persiste uma alteração CRDT de recurso (`hp_current`, `currency_gp`, `spell_slot_l1`) quando há campanha salva ativa.
 * @param {object} state Estado da sessão.
 * @param {string} poolKey Chave do pool.
 * @param {number} delta Valor da variação.
 * @param {string} reason Motivo da movimentação.
 * @param {object} [store] Instância de `VttStore`.
 * @returns {Promise<object|null>} Campanha atualizada ou `null` fora de campanha salva.
 */
export async function persistSheetDeltaIfActive(state, poolKey, delta, reason, store = getDefaultVttStore()) {
  if (!state.campaignId) return null;
  const targetPool = poolKey === "coins" ? "currency_gp" : poolKey;
  return applyAndPersistOp(state, "SHEET_DELTA", { sheetId: state.sheet?.character_id, target_pool: targetPool, delta, reason }, store);
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
  const reduced = await applyAndPersistOp(state, "SHEET_ACTION_UPSERT", { sheetId: state.sheet?.character_id, action: check.action }, store);
  const activeSheet = reduced?.sheetsById?.[reduced.activeSheetId];
  if (!state.campaignId && activeSheet) state.sheet = buildUiSheetProjection(activeSheet, state.sheet?.inventory);
  return { ok: true };
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
  if (!state.campaignId) return;
  for (const entry of newEntries || []) {
    await applyAndPersistOp(state, "CHRONICLE_APPEND", { speaker: entry.speaker, badge: entry.badge, text: entry.text, rollNote: entry.rollNote }, store);
  }
  for (const op of newDeltas || []) {
    await applyAndPersistOp(state, "SHEET_DELTA", { sheetId: state.sheet?.character_id, deltaOpId: op.op_id, target_pool: op.target_pool, delta: op.delta, reason: op.reason }, store);
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
  if (!state.campaignId) return;
  const rollResult = { formula: "1d20", resolvedFormula: "1d20", label: "Bandeja D20", visibility: "public", rolls: [{ sides: 20, value, kept: true, exploded: false }], total: value, crits: value === 20 ? 1 : 0, fumbles: value === 1 ? 1 : 0 };
  await applyAndPersistOp(state, "ROLL_RECORDED", { speaker: state.sheet?.name || "Aventureiro", rollResult }, store);
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
    await applyAndPersistOp(state, "SHEET_UPSERT", { sheet, setActive: true }, store);
    state.campaignNotice = `Ficha "${sheet.attributes_lww.name}" importada do Markdown.`;
    return { ok: true, kind: "sheet-md", campaignId: state.campaignId };
  }
  const note = markdownToNote(text, { title: fileName.replace(/\.md$/i, "") });
  await applyAndPersistOp(state, "NOTE_UPSERT", { note }, store);
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
 * Importa arquivo `.voxrpg.zip`, backup cifrado `.voxrpg.enc` ou nota/ficha `.md` (Obsidian) para o `VttStore`.
 * @param {object} state Estado da sessão.
 * @param {{ name?: string, bytes: Uint8Array|string }} fileSpec Arquivo selecionado pelo usuário.
 * @param {object} [opts={}] Opções (`passphrase`, `store`).
 * @returns {Promise<{ ok: boolean, kind?: string, campaignId?: string, error?: string }>} Resultado da importação.
 */
export async function importCampaignFile(state, fileSpec, opts = {}) {
  const store = opts.store || getDefaultVttStore();
  const name = String(fileSpec?.name || "").trim();
  const rawBytes = fileSpec?.bytes instanceof Uint8Array ? fileSpec.bytes : ENC.encode(String(fileSpec?.bytes ?? ""));
  if (/\.md$/i.test(name)) return importMarkdownIntoCampaign(state, DEC.decode(rawBytes), name, store);
  if (/\.enc$/i.test(name) || rawBytes[0] === 0x7b) {
    const unpacked = await unpackEncryptedVoxRpg(DEC.decode(rawBytes), opts.passphrase);
    return saveRestoredPackage(state, unpacked, store, "voxrpg-enc");
  }
  const unpacked = await unpackVoxRpg(rawBytes);
  return saveRestoredPackage(state, unpacked, store, "voxrpg-zip");
}
