/**
 * @file Host sandboxed para cartuchos Webxdc no DOM (laboratório).
 * @module labs/parado/webxdc-host
 */

/**
 * Limite de caracteres do campo `info` de um update.
 * @type {number}
 */
export const MAX_INFO_LEN = 50;

/**
 * Limite de caracteres do campo `summary` de um update.
 * @type {number}
 */
export const MAX_SUMMARY_LEN = 20;

/**
 * Valida esquema mínimo de update vindo do cartucho.
 * @param {unknown} update Objeto de update.
 * @returns {true}
 * @throws {Error} Quando payload falta ou texto excede limites.
 */
export function validateWebxdcUpdate(update) {
  if (!update || typeof update !== "object") {
    throw new Error("Update do webxdc deve ser um objeto");
  }
  if (update.payload === undefined) {
    throw new Error("Update deve conter o campo payload");
  }
  if (update.info && String(update.info).length > MAX_INFO_LEN) {
    throw new Error(`Campo info não pode exceder ${MAX_INFO_LEN} caracteres`);
  }
  if (update.summary && String(update.summary).length > MAX_SUMMARY_LEN) {
    throw new Error(`Campo summary não pode exceder ${MAX_SUMMARY_LEN} caracteres`);
  }
  return true;
}

/**
 * Cria iframe com sandbox estrito (`allow-scripts` apenas).
 * @param {string} srcdoc HTML do cartucho.
 * @returns {HTMLIFrameElement|null} Null fora de ambiente com `document`.
 */
export function createSandboxedIframe(srcdoc) {
  if (typeof document === "undefined") {
    return null;
  }
  const iframe = document.createElement("iframe");
  iframe.className = "webxdc-cartridge-frame";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("loading", "lazy");
  iframe.srcdoc = srcdoc;
  return iframe;
}

/**
 * Monta host com bridge `postMessage` e ciclo de vida.
 * @param {object} options Parâmetros do host.
 * @param {string} options.srcdoc HTML do cartucho.
 * @param {HTMLElement|null} [options.container] Onde anexar o iframe.
 * @param {(update: object, description: string) => void} [options.onSendUpdate] Callback de update do cartucho.
 * @param {(serial: number) => void} [options.onReady] Cartucho pronto.
 * @param {string} [options.instanceId="cartucho_default"] Id da instância.
 * @returns {{iframe: HTMLIFrameElement|null, instanceId: string, sendUpdate: (update: object) => void, destroy: () => void}}
 */
export function createWebxdcHost({
  srcdoc,
  container,
  onSendUpdate,
  onReady,
  instanceId = "cartucho_default",
}) {
  const iframe = createSandboxedIframe(srcdoc);
  if (container && iframe) {
    container.appendChild(iframe);
  }

  const handleMessage = createHostMessageHandler(iframe, onSendUpdate, onReady);
  if (typeof window !== "undefined") {
    window.addEventListener("message", handleMessage);
  }

  return {
    iframe,
    instanceId,
    sendUpdate: (update) => dispatchUpdateToIframe(iframe, update),
    destroy: () => teardownHost(iframe, handleMessage),
  };
}

function createHostMessageHandler(iframe, onSendUpdate, onReady) {
  return function handleMessage(event) {
    if (!iframe || event.source !== iframe.contentWindow) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "webxdc_send_update") {
      processSendUpdate(data, onSendUpdate);
    } else if (data.type === "webxdc_ready" && typeof onReady === "function") {
      onReady(Number(data.serial || 0));
    }
  };
}

function processSendUpdate(data, onSendUpdate) {
  try {
    validateWebxdcUpdate(data.update);
    if (typeof onSendUpdate === "function") {
      onSendUpdate(data.update, String(data.description || ""));
    }
  } catch (err) {
    console.error("Validação do update Webxdc falhou:", err.message);
  }
}

function dispatchUpdateToIframe(iframe, update) {
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: "webxdc_update", update }, "*");
  }
}

function teardownHost(iframe, listener) {
  if (typeof window !== "undefined") {
    window.removeEventListener("message", listener);
  }
  if (iframe && iframe.parentElement) {
    iframe.parentElement.removeChild(iframe);
  }
}