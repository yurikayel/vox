/**
 * @file Ponte bidirecional pura com Obsidian (E1): frontmatter YAML mínimo e seguro, corte de segredos
 * do Mestre (`%%...%%` e `> [!gm]`), extração de `[[wikilinks]]` e conversão de fichas/notas/crônica em `.md`.
 * @module dungeon/obsidian-bridge
 */
import { appendPoolDeltaOp, projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { createNoteDoc, ensureSheetMeta, sanitizeVttId } from "./vtt-schema.js";
import { formatInWorldDate } from "./vtt-calendar.js";
import { listInventoryItems } from "./vtt-inventory.js";

/** Teto de bytes para JSON Canvas 1.0 (INV-6). */
export const MAX_CANVAS_JSON_BYTES = 256 * 1024;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const UNSAFE_YAML_VALUE_RE = /^(?:!!|[&*][a-z0-9_-])/i;
const WIKILINK_RE = /(!?)\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
const INLINE_SECRET_RE = /%%([\s\S]*?)%%/g;
const GM_CALLOUT_HEAD_RE = /^>\s*\[!gm\b[^\]]*\](.*)$/i;

function isQuotedScalar(val) {
  return (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
}

function parseFlowArray(val) {
  const inner = val.slice(1, -1).trim();
  if (!inner) return [];
  if (inner.includes("[") || inner.includes("]")) throw new Error("Lista YAML aninhada não suportada.");
  return inner.split(",").map((item) => parseYamlScalar(item)).filter((item) => item !== "");
}

function parseYamlScalar(raw) {
  const val = String(raw || "").trim();
  if (isQuotedScalar(val)) return val.slice(1, -1);
  if (UNSAFE_YAML_VALUE_RE.test(val)) throw new Error("Constructo YAML não suportado (tags ou âncoras).");
  if (val.startsWith("[") && val.endsWith("]")) return parseFlowArray(val);
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(val)) return Number(val);
  return val;
}

function assertSafeYamlKey(key) {
  if (!key || FORBIDDEN_KEYS.has(key) || /^[!&*]/.test(key)) throw new Error(`Chave YAML inválida: "${key}".`);
}

function parseNestedLine(trimmed, root, sectionKey) {
  if (trimmed.startsWith("- ")) {
    if (!Array.isArray(root[sectionKey])) root[sectionKey] = [];
    root[sectionKey].push(parseYamlScalar(trimmed.slice(2)));
    return;
  }
  const colon = trimmed.indexOf(":");
  if (colon <= 0) throw new Error(`Linha YAML aninhada inválida: "${trimmed}".`);
  const subKey = trimmed.slice(0, colon).trim();
  assertSafeYamlKey(subKey);
  if (!root[sectionKey] || Array.isArray(root[sectionKey]) || typeof root[sectionKey] !== "object") {
    root[sectionKey] = Object.create(null);
  }
  root[sectionKey][subKey] = parseYamlScalar(trimmed.slice(colon + 1));
}

/**
 * Parser estrito de subset YAML (escalares, listas `- item` e mapas aninhados de 1 nível).
 * Rejeita tags YAML (`!!`), âncoras (`&`/`*`) e chaves perigosas.
 * @param {string} yamlText Conteúdo interno entre `---` e `---`.
 * @returns {Record<string, unknown>} Objeto plano/1-nível.
 */
export function parseSimpleYaml(yamlText) {
  const root = {};
  let currentSection = "";
  for (const rawLine of String(yamlText || "").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^\s+/.test(rawLine)) {
      if (!currentSection) throw new Error("Indentação YAML sem chave pai.");
      parseNestedLine(trimmed, root, currentSection);
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon <= 0) throw new Error(`Linha YAML inválida: "${trimmed}".`);
    const key = trimmed.slice(0, colon).trim();
    assertSafeYamlKey(key);
    const rest = trimmed.slice(colon + 1).trim();
    if (!rest) {
      root[key] = null;
      currentSection = key;
    } else {
      root[key] = parseYamlScalar(rest);
      currentSection = "";
    }
  }
  return root;
}

/**
 * Extrai frontmatter YAML opcional do topo de um documento Markdown.
 * @param {string} markdown Texto `.md` bruto.
 * @returns {{ data: Record<string, unknown>, body: string }} Metadados e corpo sem frontmatter.
 */
export function splitFrontmatter(markdown) {
  const text = String(markdown || "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { data: {}, body: text };
  return { data: parseSimpleYaml(match[1]), body: text.slice(match[0].length) };
}

function stripGmCallouts(text, secrets) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let inCallout = false;
  let current = [];
  for (const line of lines) {
    if (!inCallout && GM_CALLOUT_HEAD_RE.test(line)) {
      inCallout = true;
      const tail = line.replace(GM_CALLOUT_HEAD_RE, "$1").trim();
      current = tail ? [tail] : [];
      continue;
    }
    if (inCallout && /^>\s?/.test(line)) {
      current.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (inCallout) {
      if (current.length) secrets.push(current.join("\n").trim());
      inCallout = false;
      current = [];
    }
    kept.push(line);
  }
  if (inCallout && current.length) secrets.push(current.join("\n").trim());
  return kept.join("\n");
}

/**
 * Separa segredos do Mestre (`%%...%%` e callouts `> [!gm]`) do texto público (Zero-Spoiler).
 * Nenhum conteúdo secreto permanece em `publicMarkdown`.
 * @param {string} markdown Texto Markdown bruto.
 * @returns {{ publicMarkdown: string, gmSecretMarkdown: string, hadSecrets: boolean }} Partes separadas.
 */
export function splitGmSecrets(markdown) {
  const secrets = [];
  const withoutComments = String(markdown || "").replace(INLINE_SECRET_RE, (_m, inner) => {
    const clean = String(inner || "").trim();
    if (clean) secrets.push(clean);
    return "";
  });
  const publicMarkdown = stripGmCallouts(withoutComments, secrets)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const gmSecretMarkdown = secrets.join("\n\n").trim();
  return { publicMarkdown, gmSecretMarkdown, hadSecrets: secrets.length > 0 };
}

/**
 * Extrai referências `[[Wikilink]]`, `[[Alvo|Rótulo]]` e `![[asset]]` de um Markdown Obsidian.
 * @param {string} markdown Texto Markdown.
 * @returns {Array<{ target: string, label: string, embed: boolean }>} Lista de vínculos encontrados.
 */
export function extractWikilinks(markdown) {
  const out = [];
  for (const m of String(markdown || "").matchAll(WIKILINK_RE)) {
    const target = m[2].trim();
    if (!target) continue;
    out.push({ target, label: (m[3] || target).trim(), embed: m[1] === "!" });
  }
  return out;
}

function yamlStr(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return /[:#[\]{}&*!|>'",%]/.test(text) ? `"${text.replace(/"/g, "'")}"` : text;
}

function buildSheetFrontmatter(sheet, pools) {
  const attrs = sheet.attributes_lww;
  const ab = attrs.abilities || {};
  const actions = sheet.sheet_meta.clickable_actions || [];
  const actionLines = actions.length
    ? ["acoes:", ...actions.map((a) => `  - ${yamlStr(`${a.label} | ${a.roll}${a.damage ? ` | ${a.damage}` : ""}`)}`)]
    : [];
  return [
    "---",
    "tipo: ficha",
    `id: ${yamlStr(sheet.character_id)}`,
    `nome: ${yamlStr(attrs.name)}`,
    `classe: ${yamlStr(attrs.class_name)}`,
    `nivel: ${attrs.level}`,
    `ca: ${attrs.armor_class}`,
    `hp_max: ${sheet.pools_base.hp_max}`,
    `hp_atual: ${pools.hp_current}`,
    `ouro: ${pools.currency_gp}`,
    "atributos:",
    `  for: ${ab.str ?? 10}`,
    `  des: ${ab.dex ?? 10}`,
    `  con: ${ab.con ?? 10}`,
    `  int: ${ab.int ?? 10}`,
    `  sab: ${ab.wis ?? 10}`,
    `  car: ${ab.cha ?? 10}`,
    ...actionLines,
    "---",
  ].join("\n");
}

/**
 * Serializa uma ficha CRDT (`VoxCRDTCharacterSheet` + `sheet_meta`) em Markdown compatível com Obsidian.
 * @param {object} rawSheet Ficha da campanha.
 * @param {{ includeGmNotes?: boolean }} [opts={}] Se `false`, omite blocos secretos `%%...%%`.
 * @returns {string} Conteúdo `.md` pronto para o Vault do Obsidian.
 */
export function sheetToMarkdown(rawSheet, { includeGmNotes = true } = {}) {
  const sheet = ensureSheetMeta(rawSheet);
  const pools = projectCharacterPools(sheet.pools_base, sheet.delta_ledger).pools;
  const body = [`# ${sheet.attributes_lww.name}`, ""];
  const inv = listInventoryItems(sheet.inventory_orset);
  if (inv.length) {
    body.push("## Inventário", ...inv.map((it) => `- ${it.label}${it.qty > 1 ? ` ×${it.qty}` : ""}${it.equipped ? " (equipado)" : ""}`), "");
  }
  if (sheet.sheet_meta.notes_public) body.push(sheet.sheet_meta.notes_public.trim(), "");
  if (includeGmNotes && sheet.sheet_meta.notes_gm) body.push(`%%${sheet.sheet_meta.notes_gm.trim()}%%`, "");
  return `${buildSheetFrontmatter(sheet, pools)}\n\n${body.join("\n").trim()}\n`;
}

function parseActionItem(line, idx) {
  const parts = String(line || "").split("|").map((p) => p.trim());
  const label = parts[0] || "";
  if (!label) return null;
  return { id: sanitizeVttId(label, `act${idx + 1}`), label, roll: parts[1] || "1d20", damage: parts[2] || "", tag: "acao" };
}

function mapYamlAbilities(raw) {
  const ab = raw && typeof raw === "object" ? raw : {};
  return {
    str: Number(ab.for ?? ab.str) || 10,
    dex: Number(ab.des ?? ab.dex) || 10,
    con: Number(ab.con) || 10,
    int: Number(ab.int) || 10,
    wis: Number(ab.sab ?? ab.wis) || 10,
    cha: Number(ab.car ?? ab.cha) || 10,
  };
}

function firstFilled(values, fallback) {
  for (const val of values) {
    if (val !== undefined && val !== null && String(val).trim()) return String(val).trim();
  }
  return fallback;
}

function firstPositiveInt(values, fallback) {
  for (const val of values) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) return Math.trunc(num);
  }
  return fallback;
}

function extractSheetIdentity(data, publicMarkdown, fallback) {
  const match = publicMarkdown.match(/^#\s+(.+)$/m);
  const heading = match ? match[1] : "";
  const name = firstFilled([data.nome, data.name, heading, fallback.name], "Aventureiro");
  return {
    character_id: sanitizeVttId(firstFilled([data.id, fallback.character_id, name], "char"), "char"),
    campaign_id: firstFilled([fallback.campaign_id], "camp_0000000000000001"),
    name,
    class_name: firstFilled([data.classe, data.class_name], "Aventureiro"),
    level: firstPositiveInt([data.nivel, data.level], 1),
    armor_class: firstPositiveInt([data.ca, data.armor_class], 10),
  };
}

/**
 * Converte uma nota `.md` do Obsidian em ficha CRDT `VoxCRDTCharacterSheet` com `sheet_meta`.
 * @param {string} markdown Conteúdo `.md` com frontmatter YAML.
 * @param {object} [fallback={}] Valores de fallback (`character_id`, `campaign_id`).
 * @returns {object} Ficha CRDT pronta para `SHEET_UPSERT`.
 */
export function markdownToSheet(markdown, fallback = {}) {
  const { data, body } = splitFrontmatter(markdown);
  const { publicMarkdown, gmSecretMarkdown } = splitGmSecrets(body);
  const cleanBody = publicMarkdown.replace(/^#\s+.+\r?\n?/, "").trim();
  const actions = Array.isArray(data.acoes) ? data.acoes.map(parseActionItem).filter(Boolean) : undefined;
  const hpMax = Number(data.hp_max ?? data.pv_max) || 20;
  let sheet = ensureSheetMeta({
    ...extractSheetIdentity(data, publicMarkdown, fallback),
    abilities: mapYamlAbilities(data.atributos || data.abilities),
    pools_base: { hp_max: hpMax, gold_initial: Number(data.ouro ?? data.gold) || 0 },
    sheet_meta: { ...(actions ? { clickable_actions: actions } : {}), notes_public: cleanBody, notes_gm: gmSecretMarkdown },
  });
  const hpAtual = Number(data.hp_atual ?? data.pv_atual);
  if (Number.isFinite(hpAtual) && hpAtual >= 0 && hpAtual < hpMax) {
    sheet = appendPoolDeltaOp(sheet, { op_id: `md-hp-${sheet.character_id}`, lamport_clock: 1, actor_pubkey: "obsidian-import", target_pool: "hp_current", delta: hpAtual - hpMax, reason: "Importação Obsidian" });
  }
  return sheet;
}

/**
 * Converte uma nota `.md` do Obsidian em `NoteDoc` separando segredos `%%...%%` e coletando `[[wikilinks]]`.
 * @param {string} markdown Conteúdo `.md`.
 * @param {object} [fallback={}] Metadados de fallback (`id`, `title`).
 * @returns {object} `NoteDoc` normalizado.
 */
export function markdownToNote(markdown, fallback = {}) {
  const { data, body } = splitFrontmatter(markdown);
  const { publicMarkdown, gmSecretMarkdown } = splitGmSecrets(body);
  const heading = publicMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = String(data.titulo || data.title || heading || fallback.title || "Nota").trim();
  const links = extractWikilinks(publicMarkdown).map((l) => l.target);
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return createNoteDoc({
    id: data.id || fallback.id || sanitizeVttId(title, "nota"),
    title,
    publicMarkdown,
    gmSecretMarkdown,
    tags,
    links,
  });
}

/**
 * Serializa um `NoteDoc` para Markdown compatível com Obsidian (omitindo segredos GM quando `includeGmSecrets=false`).
 * @param {object} note Documento `NoteDoc`.
 * @param {{ includeGmSecrets?: boolean }} [opts={}] Controle de segredo do Mestre.
 * @returns {string} Texto `.md`.
 */
export function noteToMarkdown(note, { includeGmSecrets = true } = {}) {
  const tags = note?.tags?.length ? ["tags:", ...note.tags.map((t) => `  - ${yamlStr(t)}`)] : [];
  const fm = ["---", "tipo: nota", `id: ${yamlStr(note.id)}`, `titulo: ${yamlStr(note.title)}`, ...tags, "---"].join("\n");
  const parts = [fm, "", String(note.publicMarkdown || "").trim()];
  if (includeGmSecrets && note.gmSecretMarkdown) parts.push("", `%%${note.gmSecretMarkdown.trim()}%%`);
  return `${parts.join("\n").trim()}\n`;
}

/**
 * Exporta a crônica e as rolagens da campanha em `.md` pronto para o Vault do Obsidian, preservando `[[wikilinks]]`.
 * @param {object} campaign Documento `CampaignDoc`.
 * @param {{ includePrivate?: boolean }} [opts={}] Se `false`, omite rolagens `gm`/`blind`.
 * @returns {string} Crônica em Markdown.
 */
/**
 * Valida e normaliza um JSON Canvas 1.0 do Obsidian.
 * @param {unknown} json Objeto ou string JSON.
 * @returns {{ nodes: Array<object>, edges: Array<object> }}
 */
export function parseObsidianCanvas(json) {
  const raw = typeof json === "string" ? JSON.parse(json) : json;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Canvas inválido.");
  const bytes = new TextEncoder().encode(JSON.stringify(raw)).length;
  if (bytes > MAX_CANVAS_JSON_BYTES) throw new Error("Canvas excede o tamanho máximo.");
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.slice(0, 400) : [];
  const edges = Array.isArray(raw.edges) ? raw.edges.slice(0, 800) : [];
  const normNodes = nodes.map((n, i) => ({
    id: String(n.id || `n${i}`).slice(0, 48),
    type: ["text", "file", "link", "group"].includes(n.type) ? n.type : "text",
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    width: Math.min(2000, Math.max(1, Number(n.width) || 120)),
    height: Math.min(2000, Math.max(1, Number(n.height) || 60)),
    text: String(n.text || "").slice(0, 4000),
    file: String(n.file || "").slice(0, 200),
  }));
  return { nodes: normNodes, edges: edges.map((e, i) => ({ id: String(e.id || `e${i}`), fromNode: String(e.fromNode || ""), toNode: String(e.toNode || "") })) };
}

/**
 * Projeta nós de texto do Canvas para quadro de investigação na UI.
 * @param {object} canvas `{ nodes, edges }`.
 * @returns {Array<{ id: string, label: string, x: number, y: number }>}
 */
export function canvasToInvestigationBoard(canvas) {
  const parsed = canvas?.nodes ? canvas : parseObsidianCanvas(canvas);
  return parsed.nodes
    .filter((n) => n.type === "text" && n.text.trim())
    .map((n) => ({ id: n.id, label: n.text.trim().slice(0, 120), x: n.x, y: n.y }));
}

/**
 * Serializa `canvasJson` de uma nota para arquivo `.canvas`.
 * @param {object} note `NoteDoc`.
 * @returns {string|null} JSON formatado.
 */
export function exportNoteCanvas(note) {
  if (!note?.canvasJson) return null;
  return `${JSON.stringify(note.canvasJson, null, 2)}\n`;
}

/**
 * Exporta a crônica com carimbo `data_mundo` do calendário de campanha.
 * @param {object} campaign `CampaignDoc`.
 * @param {{ includePrivate?: boolean }} [opts={}] Se inclui rolagens privadas.
 * @returns {string} Markdown da sessão.
 */
export function chronicleToMarkdown(campaign, { includePrivate = false } = {}) {
  const dateIso = new Date(campaign?.updatedAt || Date.now()).toISOString().slice(0, 10);
  const worldDate = formatInWorldDate(campaign?.calendar);
  const sheetLinks = Object.values(campaign?.sheetsById || {})
    .map((s) => `[[${s.attributes_lww?.name || s.character_id}]]`)
    .join(", ");
  const entries = (campaign?.chronicle || []).filter((e) => includePrivate || e.visibility === "public" || !e.visibility);
  const lines = [
    "---",
    "tipo: sessao",
    `campanha: ${yamlStr(campaign?.name || "Campanha")}`,
    `data: ${dateIso}`,
    `data_mundo: ${yamlStr(worldDate)}`,
    "---",
    "",
    `# Crônica — ${campaign?.name || "Campanha"} (${worldDate})`,
    "",
    sheetLinks ? `Personagens: ${sheetLinks}` : "",
    "",
    ...entries.map((e) => `- **${e.speaker}** *(${e.badge})*: ${e.text}`),
  ];
  return `${lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n").trim()}\n`;
}
