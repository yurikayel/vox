/**
 * @file Signal persistido em localStorage com validação e sincronia entre abas.
 *
 * Isola parse JSON e erros de cota num ponto único, evitando espalhar
 * leituras/escritas diretas no storage pelos módulos de tela.
 *
 * @module shared/persisted-signal
 */

import { signal } from "./signals.js";

/**
 * Lê e valida um valor JSON salvo no storage, caindo no padrão em falha.
 * @template T
 * @param {Storage|null} storage Instância de storage.
 * @param {string} key Chave do storage.
 * @param {T} fallback Valor de reserva.
 * @param {((v: unknown) => boolean)|null} validate Predicado validador.
 * @returns {T} Valor lido ou `fallback`.
 */
function readValidated(storage, key, fallback, validate) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

/**
 * Grava valor serializado no storage tratando quota/bloqueio sem lançar.
 * @param {Storage|null} storage Instância de storage.
 * @param {string} key Chave do storage.
 * @param {unknown} value Valor a gravar.
 * @param {((err: unknown) => void)|null} onWriteError Callback opcional em falha.
 * @returns {boolean} Verdadeiro se persistiu.
 */
function writeSafe(storage, key, value, onWriteError) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    if (typeof onWriteError === "function") onWriteError(err);
    return false;
  }
}

/**
 * Cria um signal sincronizado com `localStorage` e eventos `storage` de outras abas.
 * @template T
 * @param {string} key Chave no storage.
 * @param {T} fallback Valor padrão quando ausente ou inválido.
 * @param {object} [options={}] Opções do signal persistido.
 * @param {Storage|null} [options.storage] Storage alvo (padrão `globalThis.localStorage`).
 * @param {EventTarget|null} [options.eventTarget] Alvo de eventos `storage` (padrão `globalThis`).
 * @param {((v: unknown) => boolean)|null} [options.validate] Validador para leitura e escrita.
 * @param {((err: unknown) => void)|null} [options.onWriteError] Callback em erro de gravação/quota.
 * @param {{ onCleanup?: (fn: () => void) => void }|null} [options.scope] Escopo opcional para `dispose` automático.
 * @returns {{ get: () => T, set: (next: T) => boolean, update: (fn: (cur: T) => T) => boolean, peek: () => T, dispose: () => void }} Signal persistido.
 * @throws {TypeError} Se `validate` rejeitar uma escrita explícita.
 */
export function persistedSignal(key, fallback, options = {}) {
  const storage = options.storage !== undefined ? options.storage : globalThis.localStorage ?? null;
  const eventTarget = options.eventTarget !== undefined ? options.eventTarget : globalThis;
  const validate = typeof options.validate === "function" ? options.validate : null;
  const onWriteError = typeof options.onWriteError === "function" ? options.onWriteError : null;
  const sig = signal(readValidated(storage, key, fallback, validate));
  const onStorage = (ev) => {
    if (!ev || (ev.key !== null && ev.key !== key)) return;
    if (ev.storageArea && storage && ev.storageArea !== storage) return;
    sig.set(readValidated(storage, key, fallback, validate));
  };
  if (eventTarget?.addEventListener) eventTarget.addEventListener("storage", onStorage);
  const dispose = () => {
    eventTarget?.removeEventListener?.("storage", onStorage);
  };
  if (options.scope?.onCleanup) options.scope.onCleanup(dispose);
  const set = (next) => {
    if (validate && !validate(next)) throw new TypeError(`persistedSignal(${key}): valor inválido`);
    sig.set(next);
    return writeSafe(storage, key, next, onWriteError);
  };
  return {
    get: sig.get,
    set,
    update: (fn) => set(fn(sig.peek())),
    peek: sig.peek,
    dispose
  };
}
