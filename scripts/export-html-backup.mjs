#!/usr/bin/env node
/**
 * @file EXP-04 — Exportador autônomo de backup HTML offline-forever para arquivos `own-posts` do Vox.
 * Zero dependências externas: lê JSON exportado pelo app e gera um arquivo HTML5 estático,
 * com CSP estrita (`default-src 'none'`), CSS embutido amigável à impressão e escape determinístico.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ARCHIVE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:;";
const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const ARCHIVE_CSS = [
  ":root { color-scheme: light; --bg: #f8fafc; --card: #ffffff; --fg: #0f172a; --muted: #475569; --border: #cbd5e1; --accent: #1d4ed8; --warn-bg: #fef3c7; --warn-fg: #92400e; }",
  "* { box-sizing: border-box; }",
  "body { margin: 0; padding: 2rem 1rem; background: var(--bg); color: var(--fg); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }",
  ".archive { max-width: 780px; margin: 0 auto; }",
  ".archive-header, .post { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }",
  ".archive-header h1 { margin: 0 0 0.5rem; font-size: 1.5rem; } .post h2 { margin: 0.25rem 0 0.75rem; font-size: 1.2rem; }",
  ".meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem 1rem; margin-top: 0.75rem; font-size: 0.92rem; color: var(--muted); }",
  ".meta-grid strong, .provenance code { color: var(--fg); }",
  ".post-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 0.9rem; font-size: 0.86rem; color: var(--muted); margin-bottom: 0.5rem; }",
  ".badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); font-weight: 600; color: var(--accent); background: #eff6ff; }",
  ".post-body p { margin: 0 0 0.75rem; overflow-wrap: anywhere; }",
  ".post-media { margin: 0.75rem 0; } .post-media img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--border); display: block; }",
  ".media-missing { padding: 0.5rem 0.75rem; background: var(--warn-bg); color: var(--warn-fg); border-radius: 6px; font-size: 0.88rem; }",
  ".provenance { margin-top: 0.9rem; padding-top: 0.75rem; border-top: 1px dashed var(--border); font-size: 0.82rem; color: var(--muted); }",
  ".provenance code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8rem; word-break: break-all; }",
  ".provenance details { margin-top: 0.35rem; } .provenance summary { cursor: pointer; font-weight: 600; color: var(--accent); }",
  ".empty-state { background: var(--card); border: 1px dashed var(--border); border-radius: 10px; padding: 2rem; text-align: center; color: var(--muted); }",
  "@media print { body { background: #fff; padding: 0; } .archive-header, .post { border-color: #94a3b8; break-inside: avoid; } }",
].join("\n");

const asStr = (val) => (typeof val === "string" ? val : typeof val === "number" ? String(val) : "");

function parseTimestampMs(val) {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim()) {
    const parsed = Date.parse(val.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDateUtc(ms) {
  if (!ms || !Number.isFinite(ms)) return "Data não informada";
  return `${new Date(ms).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/**
 * Escapa texto de forma determinística para HTML seguro (`& < > " '`).
 * @param {*} value Texto ou valor a escapar.
 * @returns {string} String com entidades HTML escapadas.
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Valida estritamente Data URLs de imagens raster seguras (PNG, JPEG, JPG, WebP, GIF em base64).
 * Rejeita SVG (`data:image/svg+xml`), HTML, `javascript:` e URLs remotas `http(s)://`.
 * @param {*} dataUrl URL de imagem candidata.
 * @returns {string | null} Data URL normalizada se segura, ou `null` caso rejeitada.
 */
export function sanitizeSafeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const trimmed = dataUrl.trim();
  return SAFE_RASTER_DATA_URL_RE.test(trimmed) ? trimmed : null;
}

function registerMedia(mediaMap, hash, rawUrl) {
  if (!hash || FORBIDDEN_KEYS.has(hash)) return;
  const safeUrl = sanitizeSafeImageDataUrl(rawUrl);
  if (safeUrl) mediaMap[hash] = safeUrl;
}

function extractMediaUrl(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") return asStr(item.data || item.url);
  return "";
}

function normalizePost(raw, fallbackAuthor) {
  const ts = parseTimestampMs(raw.ts ?? raw.timestamp ?? raw.createdAt);
  const editedAt = parseTimestampMs(raw.editedAt);
  return {
    id: asStr(raw.id),
    type: asStr(raw.type) || "post",
    author: asStr(raw.author || raw.owner || fallbackAuthor),
    authorDisplay: asStr(raw.authorDisplay),
    authorHandle: asStr(raw.authorHandle),
    community: asStr(raw.communityId || raw.community),
    title: asStr(raw.title),
    body: asStr(raw.body ?? raw.text ?? raw.content ?? raw.description),
    timestamp: ts,
    editedAt,
    deleted: Boolean(raw.deleted),
    mediaHash: asStr(raw.mediaHash || raw.mediaRef?.hash),
    inlineImage: sanitizeSafeImageDataUrl(raw.image),
    sig: asStr(raw.sig),
    sigv: raw.sigv ?? null,
    pubKey: raw.pubKey ?? raw.pubkey ?? null,
  };
}

function parseJsonObject(rawJson) {
  if (typeof rawJson === "string") {
    const clean = rawJson.replace(/^\uFEFF/, "").trim();
    if (!clean) throw new Error("Arquivo de backup vazio.");
    try {
      return JSON.parse(clean);
    } catch (err) {
      throw new Error(`JSON de backup malformado: ${err.message}`);
    }
  }
  return rawJson;
}

function validateBackupStructure(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Backup inválido: esperado um objeto JSON.");
  }
  if (data.entries !== undefined && !Array.isArray(data.entries)) {
    throw new Error("Backup inválido: o campo 'entries' precisa ser uma lista.");
  }
  if (data.posts !== undefined && !Array.isArray(data.posts)) {
    throw new Error("Backup inválido: o campo 'posts' precisa ser uma lista.");
  }
  const hasKnownShape =
    data.type === "vox-meus-posts" ||
    Array.isArray(data.entries) ||
    Array.isArray(data.posts) ||
    typeof data.author === "string" ||
    typeof data.address === "string" ||
    data.version !== undefined ||
    data.v !== undefined;
  if (!hasKnownShape) {
    throw new Error("Formato de backup Vox não reconhecido.");
  }
}

function collectRawPosts(data, mediaMap, fallbackAuthor) {
  const posts = [];
  if (Array.isArray(data.entries)) {
    for (const entry of data.entries) {
      if (!entry || typeof entry !== "object") throw new Error("Entrada inválida em 'entries'.");
      const rawPost = entry.post && typeof entry.post === "object" ? entry.post : entry;
      const post = normalizePost(rawPost, fallbackAuthor);
      posts.push(post);
      const blobHash = asStr(entry.blob?.hash || post.mediaHash);
      registerMedia(mediaMap, blobHash, extractMediaUrl(entry.blob));
    }
  }
  if (Array.isArray(data.posts)) {
    for (const rawPost of data.posts) {
      if (!rawPost || typeof rawPost !== "object") throw new Error("Post inválido em 'posts'.");
      posts.push(normalizePost(rawPost, fallbackAuthor));
    }
  }
  return posts;
}

const firstStr = (...vals) => vals.map(asStr).find(Boolean) || "";

function extractMediaMap(rawMedia) {
  const media = {};
  if (!rawMedia || typeof rawMedia !== "object" || Array.isArray(rawMedia)) return media;
  for (const [hash, item] of Object.entries(rawMedia)) {
    registerMedia(media, hash, extractMediaUrl(item));
  }
  return media;
}

/**
 * Valida e normaliza um bundle de backup JSON do esquema real `own-posts` (ou compatível) do Vox.
 * @param {string | object} rawJson String JSON ou objeto já parseado do backup.
 * @returns {{
 *   version: number | string,
 *   type: string,
 *   author: string,
 *   address: string,
 *   handle: string,
 *   displayName: string,
 *   pubkey: *,
 *   exportedAt: number,
 *   posts: Array<object>,
 *   media: Record<string, string>
 * }} Bundle normalizado.
 */
export function parseBackupBundle(rawJson) {
  const data = parseJsonObject(rawJson);
  validateBackupStructure(data);
  const media = extractMediaMap(data.media);
  const topAuthor = firstStr(data.author, data.address);
  const posts = collectRawPosts(data, media, topAuthor);
  const first = posts[0] || {};
  return {
    version: data.v ?? data.version ?? 1,
    type: firstStr(data.type) || "vox-meus-posts",
    author: firstStr(topAuthor, first.author),
    address: firstStr(data.address, data.author, first.author),
    handle: firstStr(data.handle, data.authorHandle, first.authorHandle),
    displayName: firstStr(data.displayName, data.authorDisplay, first.authorDisplay),
    pubkey: data.pubkey ?? data.pubKey ?? first.pubKey ?? null,
    exportedAt: parseTimestampMs(data.exportedAt),
    posts,
    media,
  };
}

/**
 * Calcula estatísticas de integridade e proveniência de um bundle normalizado.
 * @param {object} bundle Bundle retornado por `parseBackupBundle`.
 * @returns {{ postCount: number, signedCount: number, mediaCount: number, missingMediaRefs: number }} Contagens de verificação.
 */
export function verifyBundleStats(bundle) {
  const posts = Array.isArray(bundle?.posts) ? bundle.posts : [];
  const validMedia = extractMediaMap(bundle?.media);
  let signedCount = 0;
  let missingMediaRefs = 0;
  for (const post of posts) {
    if (asStr(post?.sig).trim()) signedCount++;
    const mHash = asStr(post?.mediaHash);
    if (mHash && !Object.hasOwn(validMedia, mHash)) missingMediaRefs++;
  }
  return { postCount: posts.length, signedCount, mediaCount: Object.keys(validMedia).length, missingMediaRefs };
}

function renderBodyParagraphs(body) {
  const text = asStr(body).trim();
  if (!text) return '<p class="muted"><em>Sem texto.</em></p>';
  return text.split(/\r?\n\r?\n+/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`).join("\n");
}

function renderPostMedia(post, media) {
  const hash = asStr(post.mediaHash);
  const mappedUrl = hash && Object.hasOwn(media, hash) ? sanitizeSafeImageDataUrl(media[hash]) : null;
  const safeUrl = mappedUrl || sanitizeSafeImageDataUrl(post.inlineImage);
  if (safeUrl) return `<figure class="post-media"><img src="${safeUrl}" alt="Anexo de mídia do post" loading="lazy"></figure>`;
  if (hash) return `<p class="media-missing">Mídia não incluída ou rejeitada por segurança (hash: <code>${escapeHtml(hash)}</code>)</p>`;
  return "";
}

function renderPostProvenance(post) {
  const idHtml = `<span>ID: <code>${escapeHtml(post.id || "—")}</code></span>`;
  const sigvHtml = post.sigv !== null && post.sigv !== undefined ? `<span>sigv: <code>${escapeHtml(post.sigv)}</code></span>` : "";
  const hashHtml = post.mediaHash ? `<span>mediaHash: <code>${escapeHtml(post.mediaHash)}</code></span>` : "";
  const sig = asStr(post.sig).trim();
  const sigDetails = sig
    ? `<details><summary>Assinatura (sig: ${escapeHtml(sig.slice(0, 16))}…)</summary><code>${escapeHtml(sig)}</code></details>`
    : "<span>Sem assinatura</span>";
  return `<footer class="provenance"><div>${[idHtml, sigvHtml, hashHtml].filter(Boolean).join(" · ")}</div>${sigDetails}</footer>`;
}

function renderPostArticle(post, media) {
  const titleText = asStr(post.title).trim() || `Publicação (${asStr(post.type) || "post"})`;
  const communityBadge = post.community ? `<span class="badge">${escapeHtml(post.community)}</span>` : "";
  const typeBadge = `<span class="badge">${escapeHtml(post.type || "post")}</span>`;
  const editedNote = post.editedAt ? `<span>Editado: ${escapeHtml(formatDateUtc(post.editedAt))}</span>` : "";
  const deletedNote = post.deleted ? `<span class="badge">Removido</span>` : "";
  return `<article class="post">\n  <div class="post-meta">${typeBadge}${communityBadge}${deletedNote}<time>${escapeHtml(formatDateUtc(post.timestamp))}</time>${editedNote}</div>\n  <h2>${escapeHtml(titleText)}</h2>\n  <div class="post-body">${renderBodyParagraphs(post.body)}</div>\n  ${renderPostMedia(post, media)}\n  ${renderPostProvenance(post)}\n</article>`;
}

function formatAuthorSummary(bundle) {
  const unique = [...new Set([bundle.displayName, bundle.handle, bundle.author || bundle.address].map((v) => asStr(v).trim()).filter(Boolean))];
  if (unique.length) return unique.join(" · ");
  if (typeof bundle.pubkey === "string" && bundle.pubkey.trim()) return bundle.pubkey.trim();
  return bundle.pubkey ? "Chave pública registrada" : "Autor não identificado";
}

function renderArchiveHeader(bundle, stats) {
  const authorText = escapeHtml(formatAuthorSummary(bundle));
  const exportedText = escapeHtml(formatDateUtc(bundle.exportedAt));
  const versionText = escapeHtml(bundle.version ?? 1);
  return `<header class="archive-header">\n  <h1>Arquivo Offline Vox — Meus Posts</h1>\n  <div class="meta-grid">\n    <div><strong>Autor:</strong> ${authorText}</div>\n    <div><strong>Exportado em:</strong> ${exportedText}</div>\n    <div><strong>Posts:</strong> ${stats.postCount} (${stats.signedCount} assinados)</div>\n    <div><strong>Mídias seguras:</strong> ${stats.mediaCount} · <strong>Versão:</strong> ${versionText}</div>\n  </div>\n</header>`;
}

/**
 * Gera um arquivo HTML5 autônomo, legível offline-forever, com CSP estrita e zero `<script>`.
 * @param {object} bundle Bundle normalizado por `parseBackupBundle`.
 * @returns {string} Documento HTML5 completo.
 */
export function renderStandaloneBackupHtml(bundle) {
  const normalized = bundle && Array.isArray(bundle.posts) ? bundle : { posts: [], media: {} };
  const stats = verifyBundleStats(normalized);
  const media = normalized.media || {};
  const sorted = [...normalized.posts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const postsHtml = sorted.length
    ? sorted.map((post) => renderPostArticle(post, media)).join("\n")
    : `<p class="empty-state">Nenhuma publicação encontrada neste arquivo de backup.</p>`;
  const docTitle = `Arquivo Offline Vox — ${formatAuthorSummary(normalized)}`;
  return `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta http-equiv="Content-Security-Policy" content="${ARCHIVE_CSP}">\n  <title>${escapeHtml(docTitle)}</title>\n  <style>\n${ARCHIVE_CSS}\n  </style>\n</head>\n<body>\n  <main class="archive">\n${renderArchiveHeader(normalized, stats)}\n${postsHtml}\n  </main>\n</body>\n</html>\n`;
}

function readNextArg(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith("-")) throw new Error(`Falta valor para ${flag}.`);
  return next;
}

/**
 * Interpreta argumentos de linha de comando (`--input`, `--output`, `--verify`, `--help`).
 * @param {string[]} argv Argumentos CLI (sem `node` e caminho do script).
 * @returns {{ input: string, output: string, verify: boolean, help: boolean }} Opções normalizadas.
 */
export function parseCliArgs(argv) {
  const opts = { input: "", output: "", verify: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verify") opts.verify = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--input" || arg === "-i") opts.input = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--input=")) opts.input = arg.slice(8);
    else if (arg === "--output" || arg === "-o") opts.output = readNextArg(argv, i++, arg);
    else if (arg.startsWith("--output=")) opts.output = arg.slice(9);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return opts;
}

/**
 * Executa o fluxo CLI de leitura, validação e exportação do arquivo HTML de backup.
 * @param {string[]} [argv] Argumentos CLI.
 * @returns {{ stats: object, outputPath: string | null }} Estatísticas verificadas e caminho gravado.
 */
export function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    console.log("Uso: node scripts/export-html-backup.mjs --input <backup.json> [--output <arquivo.html>] [--verify]");
    return { stats: null, outputPath: null };
  }
  if (!opts.input) throw new Error("Parâmetro obrigatório ausente: --input <backup.json>.");
  if (!opts.output && !opts.verify) {
    throw new Error("Parâmetro obrigatório ausente: --output <arquivo.html> (ou informe --verify).");
  }
  let rawJson;
  try {
    rawJson = fs.readFileSync(opts.input, "utf8");
  } catch (err) {
    throw new Error(`Não foi possível ler "${opts.input}": ${err.message}`);
  }
  const bundle = parseBackupBundle(rawJson);
  const stats = verifyBundleStats(bundle);
  if (opts.output) {
    fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true });
    fs.writeFileSync(opts.output, renderStandaloneBackupHtml(bundle), "utf8");
  }
  if (opts.verify) {
    console.log(`Verificação OK: ${JSON.stringify(stats)}`);
  } else if (opts.output) {
    console.log(`Backup HTML exportado para ${opts.output} (${stats.postCount} post(s), ${stats.mediaCount} mídia(s)).`);
  }
  return { stats, outputPath: opts.output || null };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

if (isMainModule()) {
  try {
    runCli();
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exitCode = 1;
  }
}
