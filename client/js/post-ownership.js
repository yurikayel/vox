/** Regras de edição/exclusão — só posts locais assinados pelo autor ativo (vx_…). */
import * as localAccount from "./identity/index.js";

/**
 * Deriva título e corpo limpo a partir do texto único do compositor.
 * @param {string} bodyRaw Texto bruto digitado.
 * @returns {{ title: string, body: string }} Título derivado e corpo aparado.
 */
export function deriveTopicTitleFromBody(bodyRaw) {
  const body = String(bodyRaw || "").trim();
  if (!body) return { title: "", body: "" };
  const firstLine = body.split(/\r?\n/)[0].trim();
  const title = firstLine.slice(0, 120) || "Publicação";
  return { title, body };
}

/**
 * Evita título + corpo duplicados quando title === primeira linha do body.
 * @returns {{ mode: "empty"|"caption"|"title-body", text?: string, title?: string, body?: string }}
 */
function stripLeadingTitle(b, t) {
  let rest = b.slice(t.length);
  if (rest.startsWith("\r\n")) rest = rest.slice(2);
  else if (rest.startsWith("\n")) rest = rest.slice(1);
  return rest.trimStart();
}

const BODY_CANDIDATE_KEYS = [
  "body", "content", "text", "message", "mensagem", "desc", "description"
];

function extractCandidateFromObject(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of BODY_CANDIDATE_KEYS) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return "";
}

function stripCodeFences(text) {
  if (text.startsWith("```json") && text.endsWith("```")) {
    return text.slice(7, -3).trim();
  }
  if (text.startsWith("```") && text.endsWith("```")) {
    return text.slice(3, -3).trim();
  }
  return text;
}

function tryParseJsonObject(str) {
  const isEnclosed = (str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"));
  if (!isEnclosed) return null;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Limpa cercas de código e extrai texto legível caso o corpo venha encapsulado em JSON/objeto.
 * @param {string|object|null|undefined} rawBody Corpo bruto da publicação.
 * @returns {string} Texto higienizado.
 */
export function sanitizeBodyString(rawBody) {
  if (!rawBody) return "";
  if (typeof rawBody === "object") {
    const fromObj = extractCandidateFromObject(rawBody);
    return fromObj ? sanitizeBodyString(fromObj) : "";
  }
  const stripped = stripCodeFences(String(rawBody).trim());
  const parsedObj = tryParseJsonObject(stripped);
  if (parsedObj) {
    const candidate = extractCandidateFromObject(parsedObj);
    return candidate ? sanitizeBodyString(candidate) : "";
  }
  return stripped;
}

function extractTitleFromPossibleJson(title) {
  const parsed = tryParseJsonObject(title);
  if (!parsed) return title;
  return String(parsed.title || parsed.caption || "").trim();
}

function isGenericTitle(t) {
  return t === "Tópico" || t === "Publicação" || t === "Sem título";
}

/**
 * Formata título e corpo de um post evitando duplicação quando o título repete a primeira linha.
 * @param {{ title?: string, body?: string }} [post={}] Título e corpo brutos.
 * @returns {{ mode: "empty"|"caption"|"title-body", text?: string, title?: string, body?: string }} Layout textual resolvido.
 */
export function formatPostDisplay({ title = "", body = "" } = {}) {
  const t = extractTitleFromPossibleJson(String(title || "").trim());
  const b = sanitizeBodyString(body);

  if (!b && isGenericTitle(t)) {
    return { mode: "empty" };
  }
  if (!t && !b) {
    return { mode: "empty" };
  }
  if (!b || b === t) {
    return { mode: "caption", text: t || b };
  }
  if (b.startsWith(t)) {
    const rest = stripLeadingTitle(b, t);
    return rest ? { mode: "title-body", title: t, body: rest } : { mode: "caption", text: t };
  }
  const fallbackTitle = t || b.split(/\r?\n/)[0].trim();
  return { mode: "title-body", title: fallbackTitle, body: b };
}

/**
 * Indica se o post local assinado pertence à rota ativa e pode ser editado/removido por ela.
 * @param {object|null|undefined} post Registro do post.
 * @param {string} routeId Rota ativa do usuário.
 * @returns {boolean} `true` se o usuário puder mutar o post.
 */
export function canMutateLocalPost(post, routeId) {
  if (!routeId || !post?.id || !post?.sig) return false;
  const author = post.author || post.owner || "";
  return author === routeId;
}

/**
 * Anexa a flag `isOwnLocalPost` a um registro de post.
 * @param {object} post Registro do post.
 * @param {string} routeId Rota ativa do usuário.
 * @returns {object} Cópia rasa do post com `isOwnLocalPost`.
 */
export function withOwnLocalFlag(post, routeId) {
  return { ...post, isOwnLocalPost: canMutateLocalPost(post, routeId) };
}

/**
 * Mapeia `isOwnLocalPost` em uma lista de posts para a rota informada.
 * @param {object[]} posts Lista de posts.
 * @param {string} routeId Rota ativa do usuário.
 * @returns {object[]} Lista com flags aplicadas.
 */
export function mapOwnLocalFlags(posts, routeId) {
  if (!routeId || !Array.isArray(posts)) return posts || [];
  return posts.map((p) => withOwnLocalFlag(p, routeId));
}

/**
 * Cria e assina um registro `tombstone` para exclusão lógica de um post próprio.
 * @param {{ id: string, author: string, ts?: number }} post Post a ser removido.
 * @returns {Promise<object>} Tombstone assinado pronto para gravação e gossip.
 */
export async function createPostTombstone(post) {
  if (!post?.id || !post?.author) throw new Error("Post inválido para exclusão");
  const deletePayload = {
    kind: "post-tombstone",
    type: "tombstone",
    id: post.id,
    author: post.author,
    ts: post.ts || Date.now(),
    editedAt: Date.now(),
  };
  return await localAccount.signPayload(deletePayload);
}
