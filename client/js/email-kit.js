/**
 * @module email-kit
 * @file ADR-032 §6.4–§6.7 — kit de recuperação enviado por `mailto:` para o próprio e-mail.
 *
 * O e-mail leva o link `#/sync?b=…` e o código cifrado `VOX1:…`, além de data, nome e `vx_…`.
 * A senha nunca vai no e-mail. A frase de recuperação é opcional e vem desmarcada por padrão.
 */
import * as localAccount from "./identity/index.js";
import * as oauthVault from "./vault/index.js";
import * as share from "./share.js";
import { decodeVaultBundleFromUrl, encodeVaultBundleForUrl, normalizeVaultEmail } from "./vault/index.js";
/** Prefixo do código cifrado colável em "Já tenho conta". */
export const VOX_KIT_PREFIX = "VOX1:";
/** Teto conservador de URI `mailto:` para caber em clientes de e-mail e Windows (< 2.000). */
export const MAILTO_MAX_CHARS = 1950;
const PHRASE_EMAIL_KEY_PREFIX = "vox-phrase-in-email-v1:";
const phraseEmailKey = (routeId) => PHRASE_EMAIL_KEY_PREFIX + routeId;

/**
 * Registra localmente quando a pessoa marcou a inclusão da frase no e-mail (§6.4).
 * @param {string} [routeId] Identificador da conta (padrão: conta ativa).
 * @param {number} [now] Timestamp em ms.
 * @returns {boolean} `true` se gravou no armazenamento local.
 */
export function recordPhraseSentInEmail(routeId = localAccount.getCachedRouteIdSync(), now = Date.now()) {
  if (!routeId) return false;
  try {
    localStorage.setItem(phraseEmailKey(routeId), JSON.stringify({ at: now }));
    return true;
  } catch {
    return false;
  }
}
/**
 * Remove o registro de frase enviada por e-mail (por exemplo, ao refazer o rascunho sem a frase).
 * @param {string} [routeId] Identificador da conta (padrão: conta ativa).
 */
export function clearPhraseSentInEmail(routeId = localAccount.getCachedRouteIdSync()) {
  if (!routeId) return;
  try {
    localStorage.removeItem(phraseEmailKey(routeId));
  } catch {
    /* ignore */
  }
}
/**
 * Lê o timestamp em que a frase foi marcada para envio por e-mail nesta conta.
 * @param {string} [routeId] Identificador da conta (padrão: conta ativa).
 * @returns {number|null} Timestamp em ms ou `null`.
 */
export function getPhraseSentInEmailAt(routeId = localAccount.getCachedRouteIdSync()) {
  if (!routeId) return null;
  try {
    const data = JSON.parse(localStorage.getItem(phraseEmailKey(routeId)) || "null");
    return typeof data?.at === "number" ? data.at : null;
  } catch {
    return null;
  }
}
/**
 * Texto curto para Perfil → Segurança quando a frase foi incluída no e-mail (§6.4).
 * @param {string} [routeId] Identificador da conta (padrão: conta ativa).
 * @returns {string} Aviso datado ou `""`.
 */
export function formatPhraseSentInEmailNotice(routeId = localAccount.getCachedRouteIdSync()) {
  const at = getPhraseSentInEmailAt(routeId);
  if (!at) return "";
  const dateLabel = new Date(at).toLocaleDateString("pt-BR");
  return `Frase enviada por e-mail em ${dateLabel} (quem ler sua caixa de entrada entra na conta sem a senha).`;
}
/**
 * Marca que a conta ganhou saída soberana pelo kit de e-mail confirmado (§6.5).
 * @param {string} [routeId] Identificador da conta (padrão: conta ativa).
 * @param {number} [now] Timestamp em ms.
 * @returns {boolean} `true` se marcou.
 */
export function confirmEmailKitSent(routeId = localAccount.getCachedRouteIdSync(), now = Date.now()) {
  return localAccount.markAccountExit("email", routeId, now);
}

function resolveSyncBaseUrl(baseUrl) {
  if (baseUrl) return String(baseUrl).replace(/#.*$/, "");
  const origin = globalThis.location?.origin;
  const pathname = globalThis.location?.pathname || "/";
  if (origin && origin !== "null" && /^https?:\/\//i.test(origin)) return `${origin}${pathname}`;
  return "https://yurikayel.github.io/vox/";
}

function buildMailtoUri(email, subject, body) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function formatKitBody({ displayName, routeId, dateIso, syncUrl, kitCode, phrase, includePhrase, compact }) {
  const lines = [
    `Conta: ${displayName || "Cidadão"}`,
    `Chave: ${routeId || "vox"}`,
    `Data: ${dateIso}`,
    "",
    "Link de volta (pede sua senha; ela nao vai aqui):",
    syncUrl,
  ];
  if (!compact) {
    lines.push("", 'Codigo alternativo (cole em "Ja tenho conta"):', kitCode);
  }
  if (includePhrase && phrase) {
    lines.push("", "Frase de recuperacao (quem ler este e-mail entra como voce, mesmo sem senha):", phrase);
  }
  return lines.join("\n");
}

function selectMailtoUrl(email, subject, parts) {
  const fullMailto = buildMailtoUri(email, subject, formatKitBody({ ...parts, compact: false }));
  if (fullMailto.length <= MAILTO_MAX_CHARS) return { mailtoUrl: fullMailto, truncatedForMailto: false };
  const compactMailto = buildMailtoUri(email, subject, formatKitBody({ ...parts, compact: true }));
  if (compactMailto.length <= MAILTO_MAX_CHARS) return { mailtoUrl: compactMailto, truncatedForMailto: true };
  const minimal = parts.includePhrase && parts.phrase ? `${parts.syncUrl}\n\n${parts.phrase}` : parts.syncUrl;
  const minimalMailto = buildMailtoUri(email, subject, minimal);
  const mailtoUrl = minimalMailto.length <= MAILTO_MAX_CHARS ? minimalMailto : buildMailtoUri(email, subject, parts.syncUrl);
  return { mailtoUrl, truncatedForMailto: true };
}
/**
 * Monta o kit de retorno por e-mail (assunto, corpo para copiar/baixar e URI `mailto:` dentro do teto).
 * Nunca aceita nem inclui a senha no texto.
 * @param {object} opts Opções (`email`, `displayName`, `routeId`, `encodedVault`, `phrase`, `includePhrase`, `baseUrl`, `now`).
 * @returns {{to: string, subject: string, body: string, copyText: string, filename: string, syncUrl: string, kitCode: string, mailtoUrl: string, includePhrase: boolean, truncatedForMailto: boolean}} Kit pronto.
 */
export function buildEmailKit(opts = {}) {
  const to = normalizeVaultEmail(opts.email || "");
  const encodedVault = String(opts.encodedVault || "").trim();
  if (!to || !to.includes("@")) throw new Error("Informe um e-mail válido.");
  if (!encodedVault) throw new Error("Cofre cifrado ausente para o kit.");
  const dateIso = new Date(opts.now || Date.now()).toISOString().slice(0, 10);
  const cleanPhrase = String(opts.phrase || "").trim();
  const includePhrase = Boolean(opts.includePhrase && cleanPhrase);
  const syncUrl = `${resolveSyncBaseUrl(opts.baseUrl)}#/sync?b=${encodedVault}`;
  const kitCode = `${VOX_KIT_PREFIX}${encodedVault}`;
  const label = String(opts.displayName || "").trim() || "sua conta";
  const subject = `Vox — acesso de ${label} (${dateIso})`;
  const parts = { displayName: opts.displayName, routeId: opts.routeId, dateIso, syncUrl, kitCode, phrase: cleanPhrase, includePhrase };
  const body = formatKitBody({ ...parts, compact: false });
  const { mailtoUrl, truncatedForMailto } = selectMailtoUrl(to, subject, parts);
  return {
    to,
    subject,
    body,
    copyText: `Assunto: ${subject}\n\n${body}`,
    filename: `vox-acesso-${dateIso}.txt`,
    syncUrl,
    kitCode,
    mailtoUrl,
    includePhrase,
    truncatedForMailto,
  };
}

function decodeUriSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collectKitCandidates(raw) {
  const out = [];
  const urlMatch = raw.match(/#\/?sync\?[^#\s"']*?\bb=([A-Za-z0-9._~%-]+)/i);
  if (urlMatch?.[1]) out.push(decodeUriSafe(urlMatch[1]));
  const codeMatch = raw.match(/VOX1:\s*([A-Za-z0-9._~=-]+)/i);
  if (codeMatch?.[1]) out.push(codeMatch[1]);
  const v2Match = raw.match(/\b(v2\.[A-Za-z0-9_-]{20,})\b/);
  if (v2Match?.[1]) out.push(v2Match[1]);
  if (!/\s/.test(raw)) out.push(raw);
  return out;
}
/**
 * Extrai o token codificado do cofre de um link `#/sync?b=…`, código `VOX1:…` ou texto do e-mail.
 * @param {string} rawText Texto colado pelo usuário.
 * @returns {string} Token codificado válido ou `""`.
 */
export function extractEncodedVaultFromText(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return "";
  for (const candidate of collectKitCandidates(raw)) {
    if (decodeVaultBundleFromUrl(candidate)) return candidate;
  }
  return "";
}
/**
 * Decodifica o registro do cofre cifrado a partir de link `#/sync?b=…`, código `VOX1:…` ou e-mail colado.
 * @param {string} rawText Texto colado pelo usuário.
 * @returns {object|null} Registro do cofre cifrado ou `null`.
 */
export function extractVaultRecordFromEmailKit(rawText) {
  const encoded = extractEncodedVaultFromText(rawText);
  return encoded ? decodeVaultBundleFromUrl(encoded) : null;
}
/**
 * Dispara a abertura do rascunho `mailto:` sem tirar o aplicativo da página atual.
 * @param {string} mailtoUrl URI `mailto:` completo.
 * @param {Document} [doc] Documento DOM (injetável para testes).
 * @returns {boolean} `true` se o clique no link foi acionado.
 */
export function triggerMailtoDraft(mailtoUrl, doc = globalThis.document) {
  if (!mailtoUrl || !doc?.createElement) return false;
  const link = doc.createElement("a");
  link.href = mailtoUrl;
  link.rel = "noopener";
  if (link.style) link.style.display = "none";
  doc.body?.appendChild?.(link);
  link.click?.();
  link.remove?.();
  return true;
}
/**
 * Copia assunto e corpo do kit para colar no webmail.
 * @param {{ copyText?: string }} kit Kit gerado por `buildEmailKit`.
 * @returns {Promise<boolean>} `true` se copiou.
 */
export async function copyEmailKit(kit) {
  try {
    if (!kit?.copyText || !navigator?.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(kit.copyText);
    share.showToast("E-mail copiado — cole no seu webmail e envie para você mesmo.");
    return true;
  } catch {
    share.showToast("Não foi possível copiar o texto automaticamente.", "error");
    return false;
  }
}
/**
 * Baixa o kit como arquivo `.txt` e confirma a saída soberana local.
 * @param {{ copyText?: string, filename?: string }} kit Kit gerado por `buildEmailKit`.
 * @param {string} [routeId] Conta dona do kit.
 * @returns {boolean} `true` se iniciou o download.
 */
export function downloadEmailKitFile(kit, routeId = localAccount.getCachedRouteIdSync()) {
  if (!kit?.copyText) return false;
  share.downloadBlob(new Blob([kit.copyText], { type: "text/plain;charset=utf-8" }), kit.filename || "vox-acesso.txt");
  confirmEmailKitSent(routeId);
  share.showToast("Cópia do acesso salva neste aparelho.");
  return true;
}
/**
 * Define o nome, garante a conta local com semente, salva o cofre por e-mail/senha e gera o kit (§6.2–§6.4).
 * Ao corrigir e-mail (`draftState.pass` já preenchido), migra o cofre e revoga o endereço anterior (§6.3.7).
 * @param {object} opts `{ rawName, email, pass, includePhrase, draftState }`.
 * @returns {Promise<{ ok: boolean, reason?: string, routeId?: string, kit?: object }>} Resultado com `kit` pronto.
 */
export async function createEmailAccountKit({ rawName, email, pass, includePhrase = false, draftState = { email: "", pass: "" } }) {
  // Antes de gravar: e-mail inválido não pode revogar o cofre anterior para só então falhar em `buildEmailKit`.
  const normalizedEmail = normalizeVaultEmail(email || "");
  if (!normalizedEmail.includes("@")) return { ok: false, reason: "Informe um e-mail válido." };
  localAccount.setDisplayName(rawName);
  const acc = await localAccount.ensureLocalAccount();
  await localAccount.hasSovereignExit(acc.routeId);
  let phrase = "";
  if (includePhrase) {
    const { getAccountPhrase } = await import("./identity/index.js");
    phrase = (await getAccountPhrase(draftState.pass)).words.join(" ");
  }
  const vaultOpts = draftState.pass ? { email, prevEmail: draftState.email, prevPassphrase: draftState.pass } : email;
  const saved = await oauthVault.savePassphraseVault(pass, vaultOpts);
  if (!saved.ok) return { ok: false, reason: saved.reason || "Não foi possível salvar seu cofre." };
  const hadPrevDraft = Boolean(draftState.pass);
  draftState.email = email;
  draftState.pass = pass;
  if (includePhrase && phrase) recordPhraseSentInEmail(saved.routeId);
  else if (hadPrevDraft) clearPhraseSentInEmail(saved.routeId);
  const kit = buildEmailKit({
    email,
    displayName: rawName,
    routeId: saved.routeId,
    encodedVault: encodeVaultBundleForUrl(saved.syncBundle || saved.bundle),
    phrase,
    includePhrase,
  });
  return { ok: true, routeId: saved.routeId, kit };
}
/**
 * Primeira falha de validação da entrada (§6.2 / LT-07).
 * @param {{ rawName?: string, email?: string, pass?: string, includePhrase?: boolean }} values Valores do formulário.
 * @returns {{ message: string, field: "name"|"email"|"pass" } | null}
 */
export function validateEmailEntryIssue({ rawName = "", email = "", pass = "", includePhrase = false } = {}) {
  if (!rawName) return { message: "Digite um nome ou apelido para continuar.", field: "name" };
  if (!email && !pass && !includePhrase) return null;
  if (!email || !email.includes("@")) return { message: "Informe um e-mail válido para enviar seu kit de volta.", field: "email" };
  if (pass.length < oauthVault.VAULT_PASSPHRASE_MIN) {
    return { message: `Use uma senha com pelo menos ${oauthVault.VAULT_PASSPHRASE_MIN} caracteres (uma frase de 4 palavras serve).`, field: "pass" };
  }
  return null;
}
/**
 * Mensagem de erro de `validateEmailEntryIssue` ou `""` (§6.2 / §6.2.5).
 * @param {{ rawName?: string, email?: string, pass?: string, includePhrase?: boolean }} values Valores do formulário.
 * @returns {string} Mensagem de erro ou `""` se válido.
 */
export function validateEmailEntry(values) {
  return validateEmailEntryIssue(values)?.message ?? "";
}
/**
 * Tenta restaurar uma conta existente a partir de link/código do kit, frase (ADR-032),
 * arquivos `.txt`/`.voxid` ou busca de cofre por e-mail/senha (§6.3.8).
 * @param {{ email?: string, pass?: string, kitText?: string, phraseText?: string, files?: File[] }} opts Dados informados na volta.
 * @returns {Promise<{ ok: boolean, reason?: string, routeId?: string, displayName?: string, noServer?: boolean }>} Resultado.
 */
export async function restoreAccountFromInputs({ email = "", pass = "", kitText = "", phraseText = "", files = [] } = {}) {
  const directRecord = extractVaultRecordFromEmailKit(kitText || phraseText);
  if (directRecord) {
    if (!pass) return { ok: false, reason: "Digite a Senha Soberana para abrir o link ou código do e-mail." };
    const result = await oauthVault.restoreFromPassphraseVault(pass, { email, directRecord });
    if (result.ok) confirmEmailKitSent(result.routeId);
    return result;
  }
  if (kitText) return { ok: false, reason: "Não achei um link #/sync?b=… ou código VOX1:… válido nesse texto." };
  if (phraseText) return (await import("./identity/index.js")).restoreFromPhrase(phraseText);
  if (files.length) return restoreFromInboxFiles(files, pass, email);
  if (!pass) return { ok: false, reason: "Digite seu e-mail e senha, a frase de recuperação ou cole o código do e-mail." };
  return oauthVault.restoreFromPassphraseVault(pass, { email });
}

async function restoreSingleBackupFile(text, pass, email) {
  const kitRecord = extractVaultRecordFromEmailKit(text);
  if (kitRecord) {
    if (!pass) return { ok: false, reason: "Digite a Senha Soberana para abrir o arquivo de acesso." };
    const res = await oauthVault.restoreFromPassphraseVault(pass, { email, directRecord: kitRecord });
    if (res.ok) confirmEmailKitSent(res.routeId);
    return res;
  }
  const { KIND_PLAIN, KIND_WRAPPED, peekBackupKind, importAccountBundle } = await import("./identity/index.js");
  const kind = peekBackupKind(text);
  if (kind !== KIND_PLAIN && kind !== KIND_WRAPPED) return null;
  if (kind === KIND_WRAPPED && !pass) return { ok: false, reason: "Digite a Senha Soberana para abrir o arquivo .voxid." };
  const acc = await importAccountBundle(text, pass, { asFile: true });
  return { ok: true, routeId: acc?.routeId, displayName: localAccount.getDisplayName() };
}

async function restoreFromInboxFiles(files, pass, email = "") {
  const texts = await Promise.all(files.map((f) => f.text()));
  if (texts.length === 1) {
    const single = await restoreSingleBackupFile(texts[0], pass, email);
    if (single) return single;
  }
  if (!pass) return { ok: false, reason: "Digite a Senha Soberana para abrir os backups." };
  const backup = await import("./identity/index.js");
  if (!texts.every(backup.isInboxBackupText)) return { ok: false, reason: "Escolha o arquivo de acesso (.txt/.voxid) ou os backups do e-mail (.txt)." };
  let acc = null;
  for (const text of texts.sort((a, b) => JSON.parse(a).to - JSON.parse(b).to)) acc = await backup.restoreInboxBackup(text, pass);
  return { ok: true, routeId: acc?.routeId, displayName: localAccount.getDisplayName() };
}
