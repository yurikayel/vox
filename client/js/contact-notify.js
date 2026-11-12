/**
 * @file Notificações de "adicionou você aos contatos" (envelope E2E e lista local no aparelho).
 *
 * Lógica pura e armazenamento local em `vox-added-by-v1`, sem DOM nem rede.
 * O transporte criptografado fica em `app/contact-notify-flow.js`.
 *
 * @module contact-notify
 */

/**
 * Tipo do payload assinado enviado por DM cifrada quando alguém adiciona você aos contatos.
 *
 * @type {string}
 */
export const CONTACT_ADDED_TYPE = "vox-contact-added";

/**
 * Chave em `localStorage` com os avisos recebidos ("Quem adicionou você").
 *
 * @type {string}
 */
export const ADDED_BY_STORAGE_KEY = "vox-added-by-v1";

const ADDED_BY_MAX = 100;

function clip(str, max) {
  return String(str || "").trim().slice(0, max);
}

function readStoredList(storage) {
  try {
    const raw = storage?.getItem(ADDED_BY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredList(storage, list) {
  try {
    storage?.setItem(ADDED_BY_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Monta o corpo (a assinar com `localAccount.signPayload`) de aviso de novo contato.
 *
 * @param {object} opts Dados do aviso.
 * @param {string} opts.to Rota de quem foi adicionado.
 * @param {string} [opts.displayName=""] Nome visível de quem adicionou.
 * @param {string} [opts.avatarUrl=""] URL de avatar de quem adicionou.
 * @param {number} [opts.now=Date.now()] Timestamp em ms.
 * @returns {object} Payload pronto para assinar.
 */
export function buildContactAddedPayload({ to, displayName = "", avatarUrl = "", now = Date.now() }) {
  return {
    type: CONTACT_ADDED_TYPE,
    to: clip(to, 128),
    displayName: clip(displayName, 80),
    avatarUrl: clip(avatarUrl, 512),
    ts: Number(now) || Date.now(),
  };
}

/**
 * Serializa o payload assinado dentro do envelope DM v2 (`kind: "contact_added"`).
 *
 * @param {object} signed Payload já assinado por `localAccount.signPayload`.
 * @returns {string} JSON para cifrar com `cryptoDm.seal`.
 */
export function serializeContactAddedDm(signed) {
  return JSON.stringify({ __vox_dm_v2: 1, kind: "contact_added", payload: signed });
}

/**
 * Extrai e valida a forma básica do payload `contact_added` de um texto DM decifrado.
 *
 * @param {string} rawText Texto decifrado do envelope.
 * @returns {object|null} Payload assinado, ou `null` se não for aviso de contato.
 */
export function parseContactAddedDm(rawText) {
  const s = String(rawText ?? "");
  if (!s.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(s);
    const p = parsed?.payload;
    if (parsed?.__vox_dm_v2 !== 1 || parsed?.kind !== "contact_added") return null;
    if (!p || p.type !== CONTACT_ADDED_TYPE || !p.author || !p.to || !p.sig || !p.pubKey) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * Lista avisos ativos ("Quem adicionou você"), do mais recente para o mais antigo.
 *
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {Array<{routeId: string, name: string, avatarUrl: string, ts: number}>} Avisos visíveis.
 */
export function listIncomingContactNotices(storage = globalThis.localStorage) {
  return readStoredList(storage)
    .filter((item) => item?.routeId && !item.dismissed)
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
}

/**
 * Registra um aviso verificado de quem adicionou você; ignora cópia repetida ou mais antiga.
 *
 * @param {object} signed Payload assinado já verificado.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {{added: boolean, entry: object|null}} `added: true` se for novo ou mais recente que o anterior.
 */
export function recordIncomingContactNotice(signed, storage = globalThis.localStorage) {
  const routeId = clip(signed?.author, 128);
  if (!routeId) return { added: false, entry: null };
  const ts = Number(signed?.ts) || Date.now();
  const list = readStoredList(storage);
  const prev = list.find((item) => item?.routeId === routeId);
  if (prev && ts <= (Number(prev.ts) || 0)) return { added: false, entry: null };

  const entry = {
    routeId,
    name: clip(signed?.displayName || prev?.name, 80),
    avatarUrl: clip(signed?.avatarUrl || prev?.avatarUrl, 512),
    ts,
    dismissed: false,
  };
  const next = [entry, ...list.filter((item) => item?.routeId !== routeId)].slice(0, ADDED_BY_MAX);
  writeStoredList(storage, next);
  return { added: true, entry };
}

/**
 * Dispensa um aviso da lista (mantém marca para cópia atrasada do relay não voltar).
 *
 * @param {string} routeId Rota do contato.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {boolean} `true` se encontrou o registro.
 */
export function dismissIncomingContactNotice(routeId, storage = globalThis.localStorage) {
  const id = clip(routeId, 128);
  if (!id) return false;
  const list = readStoredList(storage);
  const idx = list.findIndex((item) => item?.routeId === id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], dismissed: true };
  writeStoredList(storage, list);
  return true;
}
