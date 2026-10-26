/** @file Porta da Cantina — policy + in-page link passthrough under overlay. */

export const CANTINA_STORAGE_KEY = "vox-cantina-v1";

/**
 * @param {Storage | null | undefined} [storage]
 */
export function hasPassedCantinaGate(storage = globalThis.localStorage) {
  return storage?.getItem(CANTINA_STORAGE_KEY) === "true";
}

/**
 * @param {string} routeName
 * @param {Storage | null | undefined} [storage]
 */
export function shouldShowCantinaGate(routeName, storage = globalThis.localStorage) {
  if (hasPassedCantinaGate(storage)) return false;
  if (routeName === "ajuda-teste") return false;
  return true;
}

/**
 * @param {string | null | undefined} href
 */
export function hrefTargetsAjudaTeste(href) {
  if (!href || typeof href !== "string") return false;
  const trimmed = href.trim();
  const hashIdx = trimmed.indexOf("#");
  const pathPart = hashIdx >= 0 ? trimmed.slice(hashIdx + 1).replace(/^\/?/, "") : trimmed.replace(/^\/?/, "");
  const parts = pathPart.split("?")[0].split("/").filter(Boolean);
  return parts[0] === "ajuda" && parts[1] === "teste";
}

/**
 * @param {string} href
 */
export function hashFromAjudaTesteHref(href) {
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) return trimmed.startsWith("#/") ? trimmed : `#/${trimmed.replace(/^#+/, "")}`;
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx >= 0) {
    const h = trimmed.slice(hashIdx);
    return h.startsWith("#/") ? h : `#/${h.replace(/^#+/, "")}`;
  }
  return "#/ajuda/teste";
}

let passthroughWired = false;

export function wireCantinaOverlayPassthrough() {
  if (passthroughWired || typeof document === "undefined") return;
  passthroughWired = true;
  document.addEventListener(
    "click",
    (ev) => {
      const overlay = ev.target instanceof Element ? ev.target.closest("#cantina-modal-overlay") : null;
      if (!overlay || (ev.target instanceof Element && ev.target.closest(".cantina-dialog"))) return;

      const overlayEl = /** @type {HTMLElement} */ (overlay);
      overlayEl.style.pointerEvents = "none";
      const under =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(ev.clientX, ev.clientY)
          : null;
      overlayEl.style.pointerEvents = "";

      const link = under instanceof Element ? under.closest("a[href]") : null;
      if (!link) return;
      const href = link.getAttribute("href");
      if (!hrefTargetsAjudaTeste(href)) return;

      ev.preventDefault();
      ev.stopPropagation();
      globalThis.location.hash = hashFromAjudaTesteHref(href);
    },
    true,
  );
}
