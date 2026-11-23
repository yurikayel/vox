/**
 * @file Endereços e transporte da memória central: servidor escolhido ou sugerido (PM-91), lista de candidatos
 * e POST ao primeiro que responder, preferindo o último bom.
 *
 * @module central-memory-urls
 */
import { fetchWithTimeout, readResponseText } from "./fetch-timeout.js";
import { getRelayHttpUrls } from "./inbox.js";
import * as serverChoice from "./memory-server-choice.js";

const DEFAULT_MEMORY_URLS = ["http://127.0.0.1:3921", "http://127.0.0.1:3920"];
const REQUEST_TIMEOUT_MS = 3000;

let preferredUrl = null;

/** PM-91: servidor anunciado por um par (ou pelo próprio servidor) só vira sugestão; nada muda sem a pessoa. 
 * @param {*} [rawUrl] URL bruta descoberta.
 * @param {*} [source] Origem da sugestão de memória.
 * @returns {*} Resultado da operação.*/
export function registerDiscoveredMemoryUrl(rawUrl, source = "par") {
  return serverChoice.suggestMemoryServer(rawUrl, source);
}

/** O servidor escolhido, se for público (é o que este aparelho anuncia aos pares). 
 * @returns {*} Resultado da operação.*/
export function getDiscoveredPublicMemoryUrl() {
  const chosen = serverChoice.getChosenMemoryServer();
  return /^https:\/\//i.test(chosen) ? chosen : "";
}

/**
 * Lê o parâmetro de memória da URL atual.
 * @returns {string} Valor ou texto vazio.
 */
function extractMemoryParamFromLocation() {
  if (typeof window === "undefined" || !window.location) return "";
  try {
    const searchParams = new URLSearchParams(window.location.search || "");
    const fromSearch = searchParams.get("memory") || searchParams.get("relay") || "";
    if (fromSearch) return fromSearch.trim();
    const hash = String(window.location.hash || "");
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const hashParams = new URLSearchParams(hash.slice(qIdx + 1));
    return (hashParams.get("memory") || hashParams.get("relay") || "").trim();
  } catch {
    return "";
  }
}

/** Link com `?memory=` (ou `?relay=`): vira sugestão, perguntada ao abrir o app (PM-91). 
 * @returns {*} Resultado da operação.*/
export function captureMemoryUrlFromLocation() {
  return serverChoice.suggestMemoryServer(extractMemoryParamFromLocation(), "link");
}

/** Obtém CentralMemoryUrls.
 * @returns {*} Resultado da operação.
 */
export function getCentralMemoryUrls() {
  const storedMemoryUrl = serverChoice.getChosenMemoryServer();
  const configured = typeof getRelayHttpUrls === "function" ? getRelayHttpUrls() : [];
  const merged = [storedMemoryUrl, ...configured, ...DEFAULT_MEMORY_URLS]
    .map((u) => String(u || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(merged)];
}

/**
 * Faz uma requisição com timeout e lê o JSON.
 * @param {string} url Endereço
 * @param {object} [options={}] Opções do `fetch`
 * @returns {Promise<object>} Resposta decodificada.
 */
async function fetchJsonWithTimeout(url, options = {}) {
  try {
    const res = await fetchWithTimeout(url, options, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (typeof res.text === "function") {
      const text = await readResponseText(res);
      if (!res.ok) return null;
      if (text) return JSON.parse(text);
    }
    if (!res.ok) return null;
    return typeof res.json === "function" ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Envia o corpo ao primeiro servidor de memória que responder, preferindo o último bom.
 * @param {string} path Caminho da rota
 * @param {object} payload Corpo
 * @returns {Promise<object|null>} Resposta ou `null` se nenhum respondeu.
 */
export async function postToFirstAvailable(path, payload) {
  const urls = preferredUrl
    ? [preferredUrl, ...getCentralMemoryUrls().filter((u) => u !== preferredUrl)]
    : getCentralMemoryUrls();
  const body = JSON.stringify(payload);
  for (const base of urls) {
    const data = await fetchJsonWithTimeout(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (data && typeof data === "object") {
      preferredUrl = base;
      return data;
    }
  }
  return null;
}
