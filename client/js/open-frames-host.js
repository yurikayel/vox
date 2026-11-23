/**
 * @file Open Frames 2.0 — host mínimo (iframe sandbox + postMessage em lista fechada). Ver docs/specs/open-frames-v2.md.
 *
 * Um iframe com `sandbox` sem `allow-same-origin` roda em origem opaca: o navegador entrega as mensagens dele com
 * `origin === "null"`, a mesma de qualquer outra página sandboxed. Por isso o host só aceita mensagens da janela do
 * próprio iframe (`event.source`) e, para iframe opaco, aceita a origem `"null"` só nessa condição.
 * `allow-same-origin` junto de `allow-scripts` não é saída: o frame sairia do sandbox.
 */

/** Tipos de mensagem aceitos do frame. */
export const OF_HOST_MESSAGE_TYPES = new Set(["of:ready", "of:resize", "of:action"]);

/** Origem com que o navegador entrega mensagens de um iframe sandbox sem `allow-same-origin`. */
export const OPAQUE_ORIGIN = "null";

/**
 * Valida uma mensagem recebida do frame.
 * @param {MessageEvent|{ data?: unknown, origin?: string, source?: unknown }} event evento `message`
 * @param {{ allowedOrigins?: string[], source?: unknown }} [opts] origens aceitas (vazio = qualquer uma) e, se dada,
 *   a janela que precisa ter enviado a mensagem
 * @returns {{ type: string, payload: object, origin: string }|null} a mensagem aceita, ou null
 */
export function handleFrameMessage(event, { allowedOrigins = [], source } = {}) {
  if (!event?.data || typeof event.data !== "object") return null;
  if (source !== undefined && (!source || event.source !== source)) return null;
  const type = String(event.data.type || "");
  if (!OF_HOST_MESSAGE_TYPES.has(type)) return null;
  const origin = String(event.origin || "");
  if (allowedOrigins.length && !allowedOrigins.includes(origin)) return null;
  return { type, payload: event.data.payload || {}, origin };
}

/**
 * Iframe em origem opaca (tem `sandbox` e não tem `allow-same-origin`)?
 * @param {HTMLIFrameElement} iframe iframe do frame
 * @returns {boolean}
 */
export function isOpaqueSandbox(iframe) {
  const attr = iframe?.getAttribute?.("sandbox");
  if (attr === null || attr === undefined) return false;
  return !String(attr).split(/\s+/).includes("allow-same-origin");
}

/**
 * Aplica ao frame uma mensagem recebida (altura ou ação).
 * @param {object} msg Mensagem
 * @param {HTMLIFrameElement} iframe Frame
 * @param {Function} onAction Chamada quando há ação
 */
function applyMessage(msg, iframe, onAction) {
  if (msg.type === "of:resize" && msg.payload?.height) {
    iframe.style.height = `${Math.min(640, Math.max(120, Number(msg.payload.height) || 0))}px`;
  }
  if (msg.type === "of:action" && typeof onAction === "function") onAction(msg.payload);
}

/**
 * Liga o host às mensagens de um iframe: redimensiona em `of:resize` e repassa `of:action`.
 * @param {HTMLElement} container elemento que contém o iframe
 * @param {HTMLIFrameElement} iframe iframe do frame (só mensagens da janela dele são aceitas)
 * @param {{ allowedOrigins?: string[], onAction?: ((payload: object) => void)|null, win?: Window }} [opts] origens
 *   aceitas (a opaca entra sozinha quando o iframe é opaco), callback das ações e janela que ouve (padrão: `window`)
 * @returns {() => void} desliga o host
 */
export function attachOpenFrameHost(container, iframe, { allowedOrigins = [], onAction = null, win = globalThis.window } = {}) {
  if (!container || !iframe || !win) return () => {};
  const origins = isOpaqueSandbox(iframe) ? [...allowedOrigins, OPAQUE_ORIGIN] : allowedOrigins;
  /**
   * Recebe as mensagens do frame e as aplica.
   * @param {MessageEvent} ev Evento
   */
  const onMessage = (ev) => {
    const msg = handleFrameMessage(ev, { allowedOrigins: origins, source: iframe.contentWindow });
    if (msg) applyMessage(msg, iframe, onAction);
  };
  win.addEventListener("message", onMessage);
  return () => win.removeEventListener("message", onMessage);
}
