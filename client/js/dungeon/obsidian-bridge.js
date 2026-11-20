/**
 * @file Ponte bidirecional pura com Obsidian (E1): frontmatter YAML mínimo e seguro, corte de segredos
 * do Mestre (`%%...%%` e `> [!gm]`), extração de `[[wikilinks]]` e conversão de fichas/notas/crônica em `.md`.
 * @module dungeon/obsidian-bridge
 */
import { projectCharacterPools } from "../rpg-sheet-and-lore.js";
import { createNoteDoc, ensureSheetMeta, sanitizeVttId } from "./vtt-schema.js";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const UNSAFE_YAML_RE = /(^|\s)(!![a-z0-9_-]+|[&*][a-z0-9_-]+)/i;
const WIKILINK_RE = /(!?)\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
const INLINE_SECRET_RE = /%%([\s\S]*?)%%/g;
const GM_CALLOUT_HEAD_RE = /^>\s*\[!gm\b[^\]]*\](.*)$/i;

function parseYamlScalar(raw) {
  const val = String(raw || "").trim();
  if (val === "true") return true;
  if (val === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(val)) return Number(val);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

function assertSafeYamlKey(key) {
  if (!key || FORBIDDEN_KEYS.has(key)) throw new Error(`Chave YAML inválida: "${key}".`);
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
    if (UNSAFE_YAML_RE.test(trimmed)) throw new Error("Constructo YAML não suportado (tags ou âncoras).");
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
  return ensureSheetMeta({
    ...extractSheetIdentity(data, publicMarkdown, fallback),
    abilities: mapYamlAbilities(data.atributos || data.abilities),
    pools_base: { hp_max: Number(data.hp_max ?? data.pv_max) || 20, gold_initial: Number(data.ouro ?? data.gold) || 0 },
    sheet_meta: { ...(actions ? { clickable_actions: actions } : {}), notes_public: cleanBody, notes_gm: gmSecretMarkdown },
  });
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
export function chronicleToMarkdown(campaign, { includePrivate = false } = {}) {
  const dateIso = new Date(campaign?.updatedAt || Date.now()).toISOString().slice(0, 10);
  const sheetLinks = Object.values(campaign?.sheetsById || {})
    .map((s) => `[[${s.attributes_lww?.name || s.character_id}]]`)
    .join(", ");
  const entries = (campaign?.chronicle || []).filter((e) => includePrivate || e.visibility === "public" || !e.visibility);
  const lines = [
    "---",
    "tipo: sessao",
    `campanha: ${yamlStr(campaign?.name || "Campanha")}`,
    `data: ${dateIso}`,
    "---",
    "",
    `# Crônica — ${campaign?.name || "Campanha"} (${dateIso})`,
    "",
    sheetLinks ? `Personagens: ${sheetLinks}` : "",
    "",
    ...entries.map((e) => `- **${e.speaker}** *(${e.badge})*: ${e.text}`),
  ];
  return `${lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n").trim()}\n`;
}
