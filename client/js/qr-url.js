/** QR of a canonical Vox page URL (not Pix EMV). Zero npm. */

import { connectShareUrl, topicShareUrl, communityShareUrl } from "./share.js";
import {
  VERSIONS,
  assertVoxShareUrl,
  isVoxShareUrl,
  urlToBytes,
  chooseVersion,
  encodeBytePayload,
  codewordsToBits,
  parseBytePayload,
} from "./qr-url-codec.js";
import { rsDivisor, rsRemainder } from "./qr-url-gf.js";
import {
  buildFunctionGrid,
  pickMaskedGrid,
  cloneModules,
  applyMask,
  readFormatMask,
  walkData,
} from "./qr-url-layout.js";

export { isVoxShareUrl };

export const QR_URL_HONEST_COPY =
  "O outro celular precisa de câmera e de alcançar o PWA (rede ou shell em cache). O navegador não faz Wi-Fi Direct. Mutirão offline não é panfleto mágico para qualquer transeunte.";

const SHEET_ID = "qr-url-sheet";

function encodeCodewords(url) {
  const text = assertVoxShareUrl(url);
  const bytes = urlToBytes(text);
  const version = chooseVersion(bytes.length);
  const spec = VERSIONS[version];
  const data = encodeBytePayload(bytes, spec.data);
  const ecc = rsRemainder(data, rsDivisor(spec.ec));
  return { text, version, bits: codewordsToBits(data, ecc) };
}

export function encodeVoxUrl(url) {
  const { text, version, bits } = encodeCodewords(url);
  const picked = pickMaskedGrid(buildFunctionGrid(version), bits);
  return { url: text, version, mask: picked.mask, size: picked.size, modules: picked.modules };
}

export function decodeQrModules(modules) {
  const size = modules.length;
  const version = (size - 17) / 4;
  if (!VERSIONS[version]) throw new Error("QR: unsupported version");
  const func = buildFunctionGrid(version).func;
  const grid = { modules: cloneModules(modules), func, size, version };
  const mask = readFormatMask(grid.modules);
  applyMask(grid, mask);
  const bits = [];
  walkData(grid, (x, y) => bits.push(grid.modules[y][x] ? 1 : 0));
  return parseBytePayload(bits.slice(0, VERSIONS[version].data * 8));
}

export function modulesToSvg(modules) {
  const n = modules.length;
  const q = 4;
  const dim = n + q * 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`,
    `<rect width="${dim}" height="${dim}" fill="#fff"/>`,
  ];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) parts.push(`<rect x="${x + q}" y="${y + q}" width="1" height="1"/>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

function qrSheetTemplate() {
  return `
    <div class="qr-url-panel" role="document">
      <h2 class="qr-url-title">QR deste link</h2>
      <div class="qr-url-svg" aria-hidden="true"></div>
      <p class="qr-url-copy"></p>
      <p class="qr-url-href meta"></p>
      <button type="button" class="btn btn-sm btn-primary" data-qr-url-close>Fechar</button>
    </div>`;
}

function ensureQrSheet() {
  let root = document.getElementById(SHEET_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "qr-url-sheet modal-overlay modal-sheet";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "QR deste link");
  root.innerHTML = qrSheetTemplate();
  document.body.appendChild(root);
  return root;
}

function setQrSheetOpen(root, open) {
  root.hidden = !open;
  root.classList.toggle("is-open", open);
  root.setAttribute("aria-hidden", open ? "false" : "true");
}

export function closeQrUrlSheet() {
  const root = document.getElementById(SHEET_ID);
  if (root) setQrSheetOpen(root, false);
}

export function openQrUrlSheet(url) {
  const encoded = encodeVoxUrl(url);
  const root = ensureQrSheet();
  root.querySelector(".qr-url-svg").innerHTML = modulesToSvg(encoded.modules);
  root.querySelector(".qr-url-copy").textContent = QR_URL_HONEST_COPY;
  root.querySelector(".qr-url-href").textContent = encoded.url;
  setQrSheetOpen(root, true);
}

function urlFromButton(btn) {
  if (btn.dataset.qrUrl) return btn.dataset.qrUrl;
  const kind = btn.dataset.qrShare;
  const id = btn.dataset.qrId || "";
  if (kind === "connect") return connectShareUrl(id);
  if (kind === "topic") return topicShareUrl(id);
  if (kind === "community") return communityShareUrl(id);
  return "";
}

function onQrDocClick(e) {
  if (e.target.id === SHEET_ID || e.target.closest("[data-qr-url-close]")) {
    closeQrUrlSheet();
    return;
  }
  const btn = e.target.closest("[data-qr-share], [data-qr-url]");
  if (!btn || btn.hasAttribute("data-qr-url-close")) return;
  const url = urlFromButton(btn);
  if (!url) return;
  e.preventDefault();
  openQrUrlSheet(url);
}

let wired = false;

export function attachQrUrlHandlers() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("click", onQrDocClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeQrUrlSheet();
  });
}
