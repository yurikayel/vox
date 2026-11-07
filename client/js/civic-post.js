/**
 * @module civic-post
 * Esfera cívica do feed: decide se um post é "cívico" (habilita interações cívicas — posicionamento,
 * enquete, encaminhamento para votação formal) ou "social" (post comum).
 *
 * Um post só é cívico quando carrega uma TAG CÍVICA **e** cumpre todos os requisitos abaixo.
 * Puro (sem DOM, sem IndexedDB) — testável em Node.
 */

/** Tags cívicas canônicas (mesmo formato do seletor do compositor: `[Pauta]`…). */
export const CIVIC_TAGS = {
  "[Pauta]": { kind: "pauta", label: "Pauta" },
  "[Ideia]": { kind: "ideia", label: "Ideia" },
  "[Debate Geral]": { kind: "debate", label: "Debate" },
  "[Enquete]": { kind: "enquete", label: "Enquete" },
};

/** Hashtags no corpo que equivalem a uma tag cívica. */
const HASHTAG_TO_TAG = {
  pauta: "[Pauta]",
  votacao: "[Pauta]",
  peticao: "[Pauta]",
  ideia: "[Ideia]",
  proposta: "[Ideia]",
  debate: "[Debate Geral]",
  enquete: "[Enquete]",
  consulta: "[Enquete]",
};

export const CIVIC_MIN_TITLE = 8;
export const CIVIC_MIN_BODY = 40;
export const CIVIC_POLL_MIN = 2;
export const CIVIC_POLL_MAX = 6;

/** Requisitos exibidos ao usuário (a ordem é a da checagem). */
export const CIVIC_REQUIREMENTS = [
  { key: "tag", label: "Tag cívica: #pauta, #ideia, #debate ou #enquete" },
  { key: "title", label: `Título com pelo menos ${CIVIC_MIN_TITLE} caracteres` },
  { key: "body", label: `Argumento com pelo menos ${CIVIC_MIN_BODY} caracteres` },
  { key: "author", label: "Assinado por uma identidade Vox (vx_)" },
  { key: "circle", label: "Publicado em um círculo (comunidade)" },
  { key: "options", label: `Enquete: ${CIVIC_POLL_MIN} a ${CIVIC_POLL_MAX} opções, uma por linha começando com “- ”`, onlyFor: "enquete" },
];

export const CIVIC_STANCES = [
  { key: "concordo", label: "Concordo" },
  { key: "discordo", label: "Discordo" },
  { key: "abstencao", label: "Abstenho" },
];

const HASHTAG_RE = /(^|\s)#([a-zà-ú0-9_]+)/giu;
const POLL_LINE_RE = /^\s*(?:[-*•]|\(\s?\))\s+(.+?)\s*$/;

function stripAccents(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tagFromTitlePrefix(title) {
  const m = String(title || "").match(/^\s*(\[[^\]]+\])/);
  return m && CIVIC_TAGS[m[1]] ? m[1] : "";
}

function tagFromHashtags(body) {
  for (const m of String(body || "").matchAll(HASHTAG_RE)) {
    const tag = HASHTAG_TO_TAG[stripAccents(m[2])];
    if (tag) return tag;
  }
  return "";
}

/** Tag cívica do post: campo `civicTag`, prefixo no título ou hashtag no corpo. */
export function resolveCivicTag(post = {}) {
  if (CIVIC_TAGS[post.civicTag]) return post.civicTag;
  return tagFromTitlePrefix(post.title) || tagFromHashtags(post.body);
}

/** Opções de enquete: linhas do corpo iniciadas por "- ", "* ", "• " ou "( )". */
export function parsePollOptions(body = "") {
  return String(body)
    .split(/\r?\n/)
    .map((line) => line.match(POLL_LINE_RE)?.[1] || "")
    .filter(Boolean)
    .slice(0, CIVIC_POLL_MAX + 1);
}

function plainTitle(title) {
  return String(title || "").replace(/^\s*\[[^\]]+\]\s*/, "").trim();
}

function isSignedVoxAuthor(post) {
  if (post.isExternal || post.source === "bluesky") return false;
  const author = String(post.author || post.owner || "");
  return author.length > 0;
}

function checkRequirement(key, post, options) {
  switch (key) {
    case "title": return plainTitle(post.title).length >= CIVIC_MIN_TITLE;
    case "body": return String(post.body || "").trim().length >= CIVIC_MIN_BODY;
    case "author": return isSignedVoxAuthor(post);
    case "circle": return Boolean(post.communityId);
    case "options": return options.length >= CIVIC_POLL_MIN && options.length <= CIVIC_POLL_MAX;
    default: return true;
  }
}

/**
 * @param {object} post
 * @returns {{ isCivic: boolean, tag: string, kind: string, label: string, missing: string[], options: string[] }}
 */
export function classifyCivicPost(post = {}) {
  const tag = resolveCivicTag(post);
  const meta = CIVIC_TAGS[tag];
  if (!meta) return { isCivic: false, tag: "", kind: "", label: "", missing: ["tag"], options: [] };
  const options = meta.kind === "enquete" ? parsePollOptions(post.body) : [];
  const missing = CIVIC_REQUIREMENTS
    .filter((r) => r.key !== "tag" && (!r.onlyFor || r.onlyFor === meta.kind))
    .filter((r) => !checkRequirement(r.key, post, options))
    .map((r) => r.key);
  return { isCivic: missing.length === 0, tag, kind: meta.kind, label: meta.label, missing, options };
}

/** Escolhas disponíveis: opções da enquete (`opt:N`) ou posicionamento concordo/discordo/abstenção. */
export function civicChoicesFor(classification) {
  if (classification?.kind === "enquete") {
    return classification.options.map((label, i) => ({ key: `opt:${i}`, label }));
  }
  return CIVIC_STANCES;
}

export function isValidCivicChoice(classification, choice) {
  return civicChoicesFor(classification).some((c) => c.key === choice);
}

/**
 * Apura votos `civic-vote`: vale o voto mais recente de cada autor por post.
 * @param {Array<{postId:string, author:string, choice:string, ts?:number, editedAt?:number}>} votes
 * @param {string} [me]
 * @returns {Map<string, { counts: Record<string, number>, total: number, mine: string }>}
 */
function latestVotePerAuthor(votes) {
  const latest = new Map();
  for (const v of votes) {
    if (!v?.postId || !v.author || !v.choice) continue;
    const k = `${v.postId}\u0000${v.author}`;
    const at = Number(v.editedAt || v.ts || 0);
    const prev = latest.get(k);
    if (!prev || at >= prev.at) latest.set(k, { ...v, at });
  }
  return latest;
}

export function tallyCivicVotes(votes = [], me = "") {
  const latest = latestVotePerAuthor(votes);
  const out = new Map();
  for (const v of latest.values()) {
    const t = out.get(v.postId) || { counts: {}, total: 0, mine: "" };
    t.counts[v.choice] = (t.counts[v.choice] || 0) + 1;
    t.total += 1;
    if (me && v.author === me) t.mine = v.choice;
    out.set(v.postId, t);
  }
  return out;
}

/**
 * Separa posts em esferas. Posts cívicos recebem `civic` (classificação) e `civicTally`.
 * Posts próprios com tag cívica mas sem requisitos recebem `civicPending` (lista do que falta).
 */
export function splitFeedBySphere(posts = [], { votes = [], me = "" } = {}) {
  const tallies = tallyCivicVotes(votes, me);
  const social = [];
  const civic = [];
  for (const p of posts) {
    const c = classifyCivicPost(p);
    if (c.isCivic) {
      civic.push({ ...p, civic: c, civicTally: tallies.get(p.id) || { counts: {}, total: 0, mine: "" } });
    } else if (c.tag && (p.isOwnLocalPost || (me && (p.author || p.owner) === me))) {
      social.push({ ...p, civicPending: c.missing });
    } else {
      social.push(p);
    }
  }
  return { social, civic };
}

/** Rótulos legíveis dos requisitos pendentes. */
export function describeMissingRequirements(missing = []) {
  return CIVIC_REQUIREMENTS.filter((r) => missing.includes(r.key)).map((r) => r.label);
}

/**
 * Acrescenta as opções do construtor de enquete ao corpo como linhas "- opção" (formato que
 * `parsePollOptions` lê). Ignora vazias, repetidas e as que já estão no texto; respeita o máximo.
 */
export function appendPollOptionsToBody(body = "", options = []) {
  const existing = new Set(parsePollOptions(body).map((o) => o.toLowerCase()));
  const clean = [];
  for (const raw of options) {
    const o = String(raw || "").trim();
    if (!o || existing.has(o.toLowerCase())) continue;
    existing.add(o.toLowerCase());
    clean.push(o);
  }
  const room = Math.max(0, CIVIC_POLL_MAX - (existing.size - clean.length));
  const lines = clean.slice(0, room).map((o) => `- ${o}`);
  if (!lines.length) return body;
  return `${String(body).replace(/\s+$/, "")}\n\n${lines.join("\n")}`;
}
