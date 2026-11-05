/**
 * webxdc-host.js — Gerenciador de Host para Cartuchos Cívicos em Sandbox (Vox)
 *
 * Implementa:
 * 1. Iframe sandbox rigoroso com sandbox="allow-scripts" e referrerpolicy="no-referrer";
 * 2. Origem opaca (Origin: null) sem allow-same-origin;
 * 3. Validação estrita de postMessage por igualdade de janela (event.source === iframe.contentWindow);
 * 4. Validação de esquema do objeto de update e ciclo de vida do cartucho.
 */

export const MAX_INFO_LEN = 50;
export const MAX_SUMMARY_LEN = 20;

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

export function createSandboxedIframe(srcdoc) {
  if (typeof document === "undefined") {
    return null;
  }
  const iframe = document.createElement("iframe");
  iframe.className = "webxdc-cartridge-frame";
  iframe.setAttribute("sandbox", "allow-scripts"); // Sem allow-same-origin -> Origin: null
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("loading", "lazy");
  iframe.srcdoc = srcdoc;
  return iframe;
}

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
