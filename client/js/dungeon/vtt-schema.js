/**
 * @file Contratos e validadores puros da Mesa Soberana (E1): campanhas, fichas com ações clicáveis,
 * entradas de crônica, rolagens de dados, notas (públicas + segredo GM) e operações `VttOp`.
 * @module dungeon/vtt-schema
 */
import { createCharacterSheetDoc } from "../rpg-sheet-and-lore.js";
import { createDefaultScene, createSceneDoc } from "./vtt-scene-schema.js";
import { createInitiativeState } from "./vtt-tactics-schema.js";
import { createDefaultCalendar } from "./vtt-calendar.js";
import { normalizeFairplayState } from "./vtt-fairplay-log.js";
import { normalizeFavorites } from "./hud-favorites.js";

/** Versão canônica do schema de campanha da Mesa Soberana. */
export const VTT_SCHEMA_VERSION = "1.0.0";

const VTT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/i;

/** Ações clicáveis padrão anexadas a uma ficha inicial d20. */
export const DEFAULT_CLICKABLE_ACTIONS = Object.freeze([
  { id: "act-ataque", label: "Espada Longa", roll: "1d20+@for+@prof", damage: "1d8+@for", tag: "ataque" },
  { id: "act-investigacao", label: "Investigação", roll: "1d20+@int+@prof", damage: "", tag: "pericia" },
  { id: "act-percepcao", label: "Percepção", roll: "1d20+@sab+@prof", damage: "", tag: "pericia" },
  { id: "act-furtividade", label: "Furtividade", roll: "1d20+@des", damage: "", tag: "pericia" },
]);

/**
 * Verifica se um identificador da Mesa Soberana tem formato seguro (sem path traversal ou caracteres de controle).
 * @param {unknown} id Identificador candidato.
 * @returns {boolean} `true` quando válido.
 */
export function isValidVttId(id) {
  return typeof id === "string" && VTT_ID_RE.test(id);
}

/**
 * Normaliza uma string livre para um identificador seguro `a-z0-9_-`.
 * @param {string} raw Texto base.
 * @param {string} [prefix="item"] Prefixo de fallback quando o texto ficar vazio.
 * @returns {string} Identificador válido.
 */
export function sanitizeVttId(raw, prefix = "item") {
  const clean = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (clean.length >= 2 && isValidVttId(clean)) return clean;
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${prefix}-${suffix}`;
}

function normalizeAction(raw, idx) {
  const label = String(raw?.label || "").trim().slice(0, 60);
  const roll = String(raw?.roll || "1d20").trim().slice(0, 80);
  if (!label) return null;
  return {
    id: isValidVttId(raw?.id) ? raw.id : sanitizeVttId(label, `act${idx + 1}`),
    label,
    roll,
    damage: String(raw?.damage || "").trim().slice(0, 80),
    tag: String(raw?.tag || "acao").trim().slice(0, 24),
  };
}

/**
 * Garante o bloco opcional `sheet_meta` (ações clicáveis, perícias e notas) sobre um `VoxCRDTCharacterSheet`.
 * @param {object} [sheet={}] Documento de ficha CRDT existente ou parcial.
 * @returns {object} Cópia da ficha com `sheet_meta` normalizado.
 */
export function ensureSheetMeta(sheet = {}) {
  const base = sheet?.schema_version ? { ...sheet } : createCharacterSheetDoc(sheet);
  const meta = sheet?.sheet_meta || {};
  const rawActions = Array.isArray(meta.clickable_actions) ? meta.clickable_actions : DEFAULT_CLICKABLE_ACTIONS;
  const actions = rawActions.map(normalizeAction).filter(Boolean);
  const skills = Array.isArray(meta.skill_refs) ? meta.skill_refs.map((s) => String(s).trim()).filter(Boolean) : [];
  return {
    ...base,
    sheet_meta: {
      clickable_actions: actions,
      skill_refs: skills,
      proficiency_bonus: Number.isFinite(Number(meta.proficiency_bonus)) ? Math.trunc(Number(meta.proficiency_bonus)) : undefined,
      notes_public: String(meta.notes_public || ""),
      notes_gm: String(meta.notes_gm || ""),
      level_milestones: Array.isArray(meta.level_milestones) ? [...meta.level_milestones] : [],
      favorites: normalizeFavorites(meta.favorites),
    },
  };
}

/**
 * Cria uma entrada padronizada da crônica da mesa.
 * @param {object} [opts={}] Campos (`id`, `speaker`, `badge`, `text`, `rollNote`, `visibility`, `author`, `ts`, `checkRequestId`, `fairplayRollId`, `fairplayValue`, `fairplayFaultRoll`).
 * @returns {object} Entrada normalizada da crônica.
 */
export function createChronicleEntry(opts = {}) {
  const visibility = ["public", "gm", "blind"].includes(opts.visibility) ? opts.visibility : "public";
  return {
    id: isValidVttId(opts.id) ? opts.id : `turn-${crypto.randomUUID().slice(0, 8)}`,
    speaker: String(opts.speaker || "Aventureiro").trim().slice(0, 60),
    badge: String(opts.badge || "Ação").trim().slice(0, 32),
    text: String(opts.text || "").trim().slice(0, 2000),
    rollNote: String(opts.rollNote || "").trim().slice(0, 140),
    visibility,
    author: String(opts.author || ""),
    ts: Number.isFinite(Number(opts.ts)) ? Number(opts.ts) : Date.now(),
    ...optionalId("checkRequestId", opts.checkRequestId),
    ...fairplayLink(opts),
  };
}

/** Campo de vínculo opcional: só entra se o valor for um id válido (o resto é descartado). */
function optionalId(key, value) {
  return VTT_ID_RE.test(String(value ?? "")) ? { [key]: String(value) } : {};
}

/** Vínculo com a rolagem Fairplay (só o id e o valor anunciado, ou a marca booleana de falta que o reducer só dá ao Mestre; nunca um "verificado" de outro par). */
function fairplayLink(opts) {
  const faultRoll = String(opts.fairplayFaultRoll || "");
  if (VTT_ID_RE.test(faultRoll)) return { fairplayRollId: faultRoll, fairplayFault: true, speaker: "Mesa", badge: "Falta", text: "", rollNote: "" };
  const rollId = String(opts.fairplayRollId || "");
  if (!VTT_ID_RE.test(rollId)) return {};
  const value = Number(opts.fairplayValue);
  return Number.isFinite(value) ? { fairplayRollId: rollId, fairplayValue: value } : { fairplayRollId: rollId };
}

function finiteOr(val, fallback) {
  return Number.isFinite(Number(val)) ? Number(val) : fallback;
}

function nonNegInt(val) {
  return Math.max(0, Math.trunc(Number(val) || 0));
}

/**
 * Converte o resultado de `rollDiceFormula` num registro estruturado `DiceRollEntry`.
 * @param {object} [opts={}] Campos (`id`, `author`, `speaker`, `rollResult`, `ts`).
 * @returns {object} Registro estruturado de rolagem.
 */
export function createDiceRollEntry(opts = {}) {
  const r = opts.rollResult || {};
  return {
    id: isValidVttId(opts.id) ? opts.id : `roll-${crypto.randomUUID().slice(0, 8)}`,
    author: String(opts.author || ""),
    speaker: String(opts.speaker || "Aventureiro").trim().slice(0, 60),
    formula: String(r.formula || "1d20"),
    resolvedFormula: String(r.resolvedFormula || r.formula || "1d20"),
    label: String(r.label || "").slice(0, 80),
    rolls: Array.isArray(r.rolls) ? r.rolls.map((d) => ({ ...d })) : [],
    total: finiteOr(r.total, 0),
    crits: nonNegInt(r.crits),
    fumbles: nonNegInt(r.fumbles),
    visibility: ["public", "gm", "blind"].includes(r.visibility) ? r.visibility : "public",
    digestHex: String(r.digestHex || ""),
    ...optionalId("requestId", r.requestId),
    ts: finiteOr(opts.ts, Date.now()),
  };
}

/**
 * Cria um documento de nota/pista com separação explícita entre texto público e segredo do Mestre.
 * @param {object} [opts={}] Campos (`id`, `title`, `publicMarkdown`, `gmSecretMarkdown`, `tags`, `links`, `updatedAt`).
 * @returns {object} `NoteDoc` normalizado.
 */
function normalizeNotePin(pin) {
  if (!pin || typeof pin !== "object") return null;
  return { sceneId: String(pin.sceneId || ""), floorZ: Math.trunc(Number(pin.floorZ) || 0), x: Number(pin.x) || 0, y: Number(pin.y) || 0 };
}

/**
 * Cria um documento de nota/pista com visibilidade, pasta, pin e canvas opcional.
 * @param {object} [opts={}] Campos da nota.
 * @returns {object} `NoteDoc` normalizado.
 */
export function createNoteDoc(opts = {}) {
  const title = String(opts.title || "Nota sem título").trim().slice(0, 120);
  const visibility = ["shared", "gm_only", "player_private"].includes(opts.visibility) ? opts.visibility : "shared";
  const canvasJson = opts.canvasJson && typeof opts.canvasJson === "object" ? opts.canvasJson : null;
  return {
    id: isValidVttId(opts.id) ? opts.id : sanitizeVttId(title, "nota"),
    title,
    folder: String(opts.folder || "Notas").trim().slice(0, 48),
    visibility,
    publicMarkdown: String(opts.publicMarkdown || ""),
    gmSecretMarkdown: String(opts.gmSecretMarkdown || ""),
    canvasJson,
    pin: normalizeNotePin(opts.pin),
    tags: Array.isArray(opts.tags) ? [...new Set(opts.tags.map((t) => String(t).trim()).filter(Boolean))] : [],
    links: Array.isArray(opts.links) ? [...new Set(opts.links.map((l) => String(l).trim()).filter(Boolean))] : [],
    updatedAt: Number.isFinite(Number(opts.updatedAt)) ? Number(opts.updatedAt) : Date.now(),
  };
}

/**
 * Cria um envelope de operação `VttOp` aplicável pelo redutor determinístico.
 * @param {object} [opts={}] Campos (`opId`, `type`, `payload`, `actor`, `lamport`, `ts`).
 * @returns {object} `VttOp` normalizado.
 */
export function createVttOp(opts = {}) {
  return {
    opId: isValidVttId(opts.opId) ? opts.opId : `op-${crypto.randomUUID().slice(0, 12)}`,
    type: String(opts.type || ""),
    payload: opts.payload && typeof opts.payload === "object" ? opts.payload : {},
    actor: String(opts.actor || ""),
    lamport: Math.max(1, Math.trunc(Number(opts.lamport) || 1)),
    ts: Number.isFinite(Number(opts.ts)) ? Number(opts.ts) : Date.now(),
  };
}

function normalizeRecordMap(map, normalizer) {
  const out = {};
  for (const [key, val] of Object.entries(map || {})) {
    if (!val || typeof val !== "object") continue;
    const item = normalizer(val, key);
    out[item.character_id || item.id] = item;
  }
  return out;
}

function createStarterSheet(campaignId) {
  return ensureSheetMeta({
    character_id: "lyra",
    campaign_id: campaignId,
    name: "Lyra, A Espada da Vila",
    class_name: "Paladina de Vigília",
    abilities: { str: 16, dex: 12, con: 14, int: 11, wis: 14, cha: 15 },
    pools_base: { hp_max: 24, gold_initial: 50, spell_slots_max: { l1: 3, l2: 1, l3: 0 } },
  });
}

function buildCampaignSheets(opts, campaignId) {
  if (opts.sheetsById) return normalizeRecordMap(opts.sheetsById, (s) => ensureSheetMeta({ ...s, campaign_id: campaignId }));
  const starter = createStarterSheet(campaignId);
  return { [starter.character_id]: starter };
}

function buildCampaignScenes(opts, ownerRouteId) {
  if (opts.scenesById && typeof opts.scenesById === "object") {
    const out = {};
    for (const raw of Object.values(opts.scenesById)) {
      if (!raw || typeof raw !== "object") continue;
      const sc = createSceneDoc(raw);
      out[sc.sceneId] = sc;
    }
    if (Object.keys(out).length) return out;
  }
  const starter = createDefaultScene(ownerRouteId || "local");
  return { [starter.sceneId]: starter };
}

function pickActiveKey(map, preferred) {
  if (preferred && map[preferred]) return preferred;
  return Object.keys(map)[0] || "";
}

function campaignMetaFields(opts) {
  return {
    calendar: createDefaultCalendar(opts.calendar),
    dungeonPrefs: {
      dice3d: opts.dungeonPrefs?.dice3d !== false,
      preset: String(opts.dungeonPrefs?.preset || opts.system || "libre").slice(0, 24),
    },
  };
}

/**
 * Cria um documento raiz `CampaignDoc` para persistência local (`vox-vtt-db-v1`) e export `.voxrpg.zip`.
 * @param {object} [opts={}] Opções iniciais da campanha.
 * @returns {object} `CampaignDoc` pronto para redução e persistência.
 */
export function createCampaign(opts = {}) {
  const now = finiteOr(opts.now, Date.now());
  const name = String(opts.name || "Nova Campanha").trim().slice(0, 80) || "Nova Campanha";
  const id = isValidVttId(opts.id) ? opts.id : sanitizeVttId(name, "camp");
  const gmRouteId = String(opts.gmRouteId || opts.ownerRouteId || "local");
  const sheetsById = buildCampaignSheets(opts, id);
  const scenesById = buildCampaignScenes(opts, gmRouteId);
  return {
    schemaVersion: VTT_SCHEMA_VERSION,
    id,
    name,
    system: String(opts.system || "d20-livre").trim().slice(0, 40),
    ownerRouteId: String(opts.ownerRouteId || ""),
    gmRouteId,
    activeSheetId: pickActiveKey(sheetsById, opts.activeSheetId),
    activeSceneId: pickActiveKey(scenesById, opts.activeSceneId),
    sheetsById,
    scenesById,
    initiative: createInitiativeState(opts.initiative),
    ...campaignMetaFields(opts),
    notesById: normalizeRecordMap(opts.notesById, (n) => createNoteDoc(n)),
    chronicle: Array.isArray(opts.chronicle) ? opts.chronicle.map(createChronicleEntry) : [],
    rolls: Array.isArray(opts.rolls) ? opts.rolls.map((r) => ({ ...r })) : [],
    fairplay: normalizeFairplayState(opts.fairplay),
    appliedOpIds: Array.isArray(opts.appliedOpIds) ? [...opts.appliedOpIds] : [],
    lamport: nonNegInt(opts.lamport),
    createdAt: finiteOr(opts.createdAt, now),
    updatedAt: finiteOr(opts.updatedAt, now),
  };
}

/**
 * Valida estruturalmente um `CampaignDoc` vindo de importação ou storage (INV-4 / INV-6).
 * @param {unknown} doc Candidato a documento de campanha.
 * @returns {{ valid: boolean, error?: string }} Veredito da validação.
 */
export function validateCampaignDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { valid: false, error: "Documento de campanha inválido." };
  if (doc.schemaVersion !== VTT_SCHEMA_VERSION) return { valid: false, error: `Versão de schema não suportada: ${String(doc.schemaVersion)}.` };
  if (!isValidVttId(doc.id)) return { valid: false, error: "Identificador de campanha inválido." };
  if (typeof doc.name !== "string" || !doc.name.trim()) return { valid: false, error: "Nome da campanha ausente." };
  if (!doc.sheetsById || typeof doc.sheetsById !== "object" || Array.isArray(doc.sheetsById)) return { valid: false, error: "Mapa de fichas inválido." };
  if (!Array.isArray(doc.chronicle) || !Array.isArray(doc.rolls)) return { valid: false, error: "Crônica ou histórico de rolagens inválido." };
  return { valid: true };
}
