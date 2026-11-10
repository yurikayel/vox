/**
 * @file PM-91 — o servidor de memória central só muda por escolha da pessoa.
 * Link com `?memory=`, aviso de um par (MEMORY_BEACON) ou o endereço de túnel que o próprio servidor
 * informa viram **sugestão**; o aparelho pergunta, mostrando o domínio, antes de mandar qualquer coisa.
 * Antes, cada um desses trocava o servidor sozinho, e tudo o que o aparelho gravava passava a ir para lá.
 */

const CHOSEN_KEY = "vox-central-memory-chosen-v2";
const LEGACY_KEY = "vox-central-memory-url";
const SUGGESTION_KEY = "vox-central-memory-suggested";
const DISMISSED_KEY = "vox-central-memory-dismissed";
const BUDDY_KEY = "vox-relay-buddy-http-url";
const DISMISSED_MAX = 20;

const SOURCE_TEXT = {
  link: "Um link que você abriu",
  par: "Um aparelho conectado a você",
  servidor: "O servidor de memória que você usa",
  anterior: "Uma versão anterior do app (sem perguntar)",
};

function read(storage, key) {
  try {
    return storage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(storage, key, value) {
  try {
    if (value) storage?.setItem(key, value);
    else storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** `https://…`, ou `http://` só no próprio aparelho (loopback). Devolve sem barra no fim, ou "". */
export function normalizeMemoryServerUrl(raw) {
  const url = String(raw || "").trim().replace(/\/+$/, "");
  if (/^https:\/\/[^\s/]+/i.test(url)) return url;
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url) ? url : "";
}

export function memoryServerHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "");
  }
}

export function getChosenMemoryServer(storage = globalThis.localStorage) {
  return normalizeMemoryServerUrl(read(storage, CHOSEN_KEY));
}

export function getMemorySuggestion(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(read(storage, SUGGESTION_KEY) || "null");
    return parsed && normalizeMemoryServerUrl(parsed.url) ? parsed : null;
  } catch {
    return null;
  }
}

function dismissedList(storage) {
  try {
    const list = JSON.parse(read(storage, DISMISSED_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Registra a sugestão sem trocar nada. Devolve a URL sugerida, ou "" se foi ignorada. */
export function suggestMemoryServer(raw, source, storage = globalThis.localStorage) {
  const url = normalizeMemoryServerUrl(raw);
  if (!url || url === getChosenMemoryServer(storage) || dismissedList(storage).includes(url)) return "";
  write(storage, SUGGESTION_KEY, JSON.stringify({ url, source: SOURCE_TEXT[source] ? source : "par", at: Date.now() }));
  return url;
}

/** Escolha explícita: passa a ser o servidor da memória central e o relay de reserva das DMs. */
export function chooseMemoryServer(raw, storage = globalThis.localStorage) {
  const url = normalizeMemoryServerUrl(raw);
  if (!url) return "";
  write(storage, CHOSEN_KEY, url);
  write(storage, BUDDY_KEY, url);
  write(storage, SUGGESTION_KEY, "");
  return url;
}

export function dismissMemorySuggestion(storage = globalThis.localStorage) {
  const suggestion = getMemorySuggestion(storage);
  write(storage, SUGGESTION_KEY, "");
  if (!suggestion) return;
  const list = [suggestion.url, ...dismissedList(storage).filter((u) => u !== suggestion.url)].slice(0, DISMISSED_MAX);
  write(storage, DISMISSED_KEY, JSON.stringify(list));
}

/**
 * O endereço gravado sem perguntar (chave antiga) vira sugestão. O relay de reserva só sai junto
 * se foi gravado pelo mesmo caminho (mesmo valor); um relay escolhido na tela Rede fica.
 */
export function migrateLegacyMemoryServer(storage = globalThis.localStorage) {
  const legacy = read(storage, LEGACY_KEY).trim().replace(/\/+$/, "");
  if (!legacy) return "";
  write(storage, LEGACY_KEY, "");
  if (read(storage, BUDDY_KEY).trim().replace(/\/+$/, "") === legacy) write(storage, BUDDY_KEY, "");
  return suggestMemoryServer(legacy, "anterior", storage);
}

export function memorySuggestionQuestion({ url, source }) {
  return [
    `${SOURCE_TEXT[source] || SOURCE_TEXT.par} sugere guardar uma cópia dos seus dados no servidor:`,
    "",
    `    ${memoryServerHost(url)}`,
    "",
    "Se aceitar, seus posts, remoções, cartões e o cofre de recuperação passam a ser enviados para esse servidor, e quem o controla vê tudo isso.",
    "Aceite só se você conhece e confia em quem cuida dele.",
    "",
    "Usar este servidor?",
  ].join("\n");
}

/** Pergunta uma vez sobre a sugestão pendente. Devolve a URL escolhida, ou "". */
export function askAboutMemorySuggestion({ confirmFn = globalThis.confirm, storage = globalThis.localStorage } = {}) {
  const suggestion = getMemorySuggestion(storage);
  if (!suggestion || typeof confirmFn !== "function") return "";
  if (confirmFn(memorySuggestionQuestion(suggestion))) return chooseMemoryServer(suggestion.url, storage);
  dismissMemorySuggestion(storage);
  return "";
}
