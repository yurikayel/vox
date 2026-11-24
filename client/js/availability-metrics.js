/**
 * @file PM-75 — Métricas locais de disponibilidade offline de posts (1 h / 6 h / 24 h).
 * Alinhado a `scripts/availability-metrics.mjs`; cálculo 100% local, zero telemetria central.
 */

/** Chave de armazenamento local das observações de disponibilidade (PM-75). @type {string} */
export const AVAILABILITY_STORAGE_KEY = "vox-availability-observations-v1";
/** Versão canônica do esquema de saída do relatório PM-75. @type {string} */
export const SCHEMA_VERSION = "1.0.0";
/** Janelas padrão em horas alinhadas à spec de replicação e a `scripts/availability-metrics.mjs`. @type {readonly number[]} */
export const DEFAULT_WINDOWS_HOURS = Object.freeze([1, 6, 24]);

const MS_PER_HOUR = 3_600_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Diz se o valor é um objeto simples (não nulo e não array).
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Converte número ou data ISO em timestamp em milissegundos, rejeitando valores inválidos.
 * @param {unknown} raw Valor bruto.
 * @param {string} fieldName Nome do campo na mensagem de erro.
 * @returns {number}
 */
function parseTimestampMs(raw, fieldName) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new RangeError(`${fieldName} deve ser um timestamp numérico finito >= 0.`);
    }
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  throw new TypeError(`${fieldName} deve ser timestamp em ms ou string ISO válida.`);
}

/**
 * Exige id de texto não vazio que não seja chave reservada.
 * @param {unknown} raw Valor bruto.
 * @param {string} fieldName Nome do campo na mensagem de erro.
 * @returns {string}
 */
function requireNonEmptyId(raw, fieldName) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new TypeError(`${fieldName} deve ser string não vazia.`);
  }
  const clean = raw.trim();
  if (FORBIDDEN_KEYS.has(clean)) {
    throw new RangeError(`${fieldName} contém chave reservada proibida: ${clean}.`);
  }
  return clean;
}

/**
 * Valida uma publicação e registra seu id para detectar duplicatas.
 * @param {unknown} raw Publicação bruta.
 * @param {number} index Posição na lista.
 * @param {Set<string>} seenIds Ids já vistos.
 * @returns {{ id: string, authorOfflineAt: number }}
 */
function validatePost(raw, index, seenIds) {
  if (!isPlainObject(raw)) {
    throw new TypeError(`posts[${index}] deve ser um objeto.`);
  }
  const id = requireNonEmptyId(raw.id, `posts[${index}].id`);
  if (seenIds.has(id)) {
    throw new RangeError(`posts[${index}].id duplicado: ${id}.`);
  }
  seenIds.add(id);
  const authorOfflineAt = parseTimestampMs(raw.authorOfflineAt, `posts[${index}].authorOfflineAt`);
  return { id, authorOfflineAt };
}

/**
 * Valida a contagem de réplicas de uma sondagem.
 * @param {unknown} raw Valor bruto.
 * @param {boolean} available Se a publicação estava disponível.
 * @param {number} index Posição da sondagem.
 * @returns {number}
 */
function validateReplicaCount(raw, available, index) {
  if (raw === undefined) return available ? 1 : 0;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new RangeError(`probes[${index}].replicaCount deve ser número finito >= 0.`);
  }
  return raw;
}

/**
 * Valida uma sondagem de disponibilidade.
 * @param {unknown} raw Sondagem bruta.
 * @param {number} index Posição na lista.
 * @returns {{ postId: string, observedAt: number, available: boolean, replicaCount: number }}
 */
function validateProbe(raw, index) {
  if (!isPlainObject(raw)) {
    throw new TypeError(`probes[${index}] deve ser um objeto.`);
  }
  const postId = requireNonEmptyId(raw.postId, `probes[${index}].postId`);
  const observedAt = parseTimestampMs(raw.observedAt, `probes[${index}].observedAt`);
  if (typeof raw.available !== "boolean") {
    throw new TypeError(`probes[${index}].available deve ser booleano.`);
  }
  const replicaCount = validateReplicaCount(raw.replicaCount, raw.available, index);
  return { postId, observedAt, available: raw.available, replicaCount };
}

/**
 * Valida e normaliza o payload local de observações de disponibilidade pós-offline.
 * @param {object} data Objeto `{ posts, probes }` com logs locais.
 * @returns {{ posts: Array<{ id: string, authorOfflineAt: number }>, probes: Array<{ postId: string, observedAt: number, available: boolean, replicaCount: number }> }}
 */
export function validateAvailabilityInput(data) {
  if (!isPlainObject(data)) {
    throw new TypeError("Entrada deve ser um objeto JSON com 'posts' e 'probes'.");
  }
  if (!Array.isArray(data.posts)) {
    throw new TypeError("Campo obrigatório 'posts' deve ser um array.");
  }
  if (!Array.isArray(data.probes)) {
    throw new TypeError("Campo obrigatório 'probes' deve ser um array.");
  }
  const seenIds = new Set();
  const posts = data.posts.map((post, idx) => validatePost(post, idx, seenIds));
  const probes = data.probes.map((probe, idx) => validateProbe(probe, idx));
  return { posts, probes };
}

/**
 * Valida as janelas de avaliação em horas.
 * @param {unknown} windowsHours Lista bruta de janelas.
 * @returns {number[]}
 */
function normalizeWindows(windowsHours) {
  if (!Array.isArray(windowsHours) || windowsHours.length === 0) {
    throw new TypeError("windowsHours deve ser um array não vazio de horas positivas.");
  }
  return windowsHours.map((w, idx) => {
    if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
      throw new RangeError(`windowsHours[${idx}] deve ser número finito > 0.`);
    }
    return w;
  });
}

/**
 * Agrupa sondagens por publicação e conta sondagens sem correspondência.
 * @param {Array<{ id: string, authorOfflineAt: number }>} posts Publicações validadas.
 * @param {Array<{ postId: string, observedAt: number, available: boolean, replicaCount: number }>} probes Sondagens validadas.
 * @returns {{ byPost: Map<string, object[]>, unmatchedProbes: number }}
 */
function groupProbesByPost(posts, probes) {
  const knownIds = new Set(posts.map((p) => p.id));
  const byPost = new Map(posts.map((p) => [p.id, []]));
  let unmatchedProbes = 0;
  for (const probe of probes) {
    if (!knownIds.has(probe.postId)) {
      unmatchedProbes += 1;
      continue;
    }
    byPost.get(probe.postId).push(probe);
  }
  for (const list of byPost.values()) {
    list.sort((a, b) => a.observedAt - b.observedAt);
  }
  return { byPost, unmatchedProbes };
}

/**
 * Arredonda para duas casas decimais.
 * @param {number} value Valor a arredondar.
 * @returns {number}
 */
function roundTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Mede a disponibilidade das publicações elegíveis em uma janela de tempo.
 * @param {Array<{ id: string, authorOfflineAt: number }>} posts Publicações validadas.
 * @param {Map<string, object[]>} byPost Sondagens por publicação.
 * @param {number} windowHours Tamanho da janela em horas.
 * @returns {object}
 */
function evaluateWindow(posts, byPost, windowHours) {
  const thresholdMs = windowHours * MS_PER_HOUR;
  let eligiblePosts = 0;
  let availablePosts = 0;
  let replicaSum = 0;

  for (const post of posts) {
    const minObservedAt = post.authorOfflineAt + thresholdMs;
    const list = byPost.get(post.id) || [];
    const probe = list.find((item) => item.observedAt >= minObservedAt);
    if (!probe) continue;
    eligiblePosts += 1;
    if (probe.available) availablePosts += 1;
    replicaSum += probe.replicaCount;
  }

  return {
    windowHours,
    eligiblePosts,
    availablePosts,
    availabilityPct: eligiblePosts > 0 ? roundTwoDecimals((availablePosts / eligiblePosts) * 100) : null,
    avgReplicas: eligiblePosts > 0 ? roundTwoDecimals(replicaSum / eligiblePosts) : null,
    _replicaSum: replicaSum,
  };
}

/**
 * Consolida o resumo geral a partir das janelas avaliadas.
 * @param {{ totalPosts: number, totalProbes: number, unmatchedProbes: number }} totals Contagens base.
 * @param {object[]} rawWindows Janelas avaliadas.
 * @returns {object}
 */
function buildSummary({ totalPosts, totalProbes, unmatchedProbes }, rawWindows) {
  let totalEligibleEvaluations = 0;
  let totalAvailableEvaluations = 0;
  let totalReplicaSum = 0;
  for (const w of rawWindows) {
    totalEligibleEvaluations += w.eligiblePosts;
    totalAvailableEvaluations += w.availablePosts;
    totalReplicaSum += w._replicaSum;
  }
  const hasEligible = totalEligibleEvaluations > 0;
  return {
    totalPosts,
    totalProbes,
    unmatchedProbes,
    windowsEvaluated: rawWindows.length,
    totalEligibleEvaluations,
    totalAvailableEvaluations,
    overallAvailabilityPct: hasEligible ? roundTwoDecimals((totalAvailableEvaluations / totalEligibleEvaluations) * 100) : null,
    overallAvgReplicas: hasEligible ? roundTwoDecimals(totalReplicaSum / totalEligibleEvaluations) : null,
  };
}

/**
 * Calcula métricas de disponibilidade offline (PM-75) para cada janela em horas.
 * @param {object} data Objeto `{ posts, probes }` com registros de offline e sondas P2P.
 * @param {readonly number[]} [windowsHours=DEFAULT_WINDOWS_HOURS] Janelas de avaliação em horas.
 * @returns {{ schemaVersion: string, totalPosts: number, totalProbes: number, unmatchedProbes: number, windows: Array<{ windowHours: number, eligiblePosts: number, availablePosts: number, availabilityPct: number|null, avgReplicas: number|null }>, summary: object }}
 */
export function computeAvailabilityMetrics(data, windowsHours = DEFAULT_WINDOWS_HOURS) {
  const normalized = validateAvailabilityInput(data);
  const windowsList = normalizeWindows(windowsHours);
  const { byPost, unmatchedProbes } = groupProbesByPost(normalized.posts, normalized.probes);
  const rawWindows = windowsList.map((w) => evaluateWindow(normalized.posts, byPost, w));
  const summary = buildSummary(
    { totalPosts: normalized.posts.length, totalProbes: normalized.probes.length, unmatchedProbes },
    rawWindows,
  );
  const windows = rawWindows.map(({ _replicaSum, ...publicFields }) => publicFields);

  return {
    schemaVersion: SCHEMA_VERSION,
    totalPosts: normalized.posts.length,
    totalProbes: normalized.probes.length,
    unmatchedProbes,
    windows,
    summary,
  };
}

/**
 * Lê observações locais de disponibilidade; devolve vazio se ausente ou corrompido.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento local.
 * @returns {{ posts: Array<{ id: string, authorOfflineAt: number }>, probes: Array<{ postId: string, observedAt: number, available: boolean, replicaCount: number }> }}
 */
export function loadAvailabilityObservations(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(AVAILABILITY_STORAGE_KEY);
    if (!raw) return { posts: [], probes: [] };
    return validateAvailabilityInput(JSON.parse(raw));
  } catch {
    return { posts: [], probes: [] };
  }
}

/**
 * Valida e persiste observações locais de disponibilidade no armazenamento do aparelho.
 * @param {object} data Objeto `{ posts, probes }`.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento local.
 * @returns {boolean} `true` se salvou.
 */
export function saveAvailabilityObservations(data, storage = globalThis.localStorage) {
  const normalized = validateAvailabilityInput(data);
  try {
    storage?.setItem?.(AVAILABILITY_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

/**
 * Calcula o resumo PM-75 a partir das observações gravadas apenas neste aparelho.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento local.
 * @param {readonly number[]} [windowsHours=DEFAULT_WINDOWS_HOURS] Janelas em horas.
 * @returns {ReturnType<typeof computeAvailabilityMetrics>}
 */
export function getAvailabilityMetricsSummary(storage = globalThis.localStorage, windowsHours = DEFAULT_WINDOWS_HOURS) {
  const data = loadAvailabilityObservations(storage);
  return computeAvailabilityMetrics(data, windowsHours);
}

/**
 * Apaga as observações locais de disponibilidade deste aparelho.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento local.
 */
export function resetAvailabilityObservations(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(AVAILABILITY_STORAGE_KEY);
  } catch {
    /* sem storage */
  }
}

/**
 * Formata percentual com duas casas ou `N/A` quando ausente.
 * @param {number|null|undefined} value Percentual.
 * @returns {string}
 */
export function formatAvailabilityPct(value) {
  return value === null || value === undefined ? "N/A" : `${Number(value).toFixed(2)}%`;
}

/**
 * Formata número com duas casas ou `N/A` quando ausente.
 * @param {number|null|undefined} value Valor numérico.
 * @returns {string}
 */
export function formatAvailabilityNum(value) {
  return value === null || value === undefined ? "N/A" : Number(value).toFixed(2);
}

/**
 * Monta payload estruturado local-only de exportação das métricas PM-75.
 * @param {ReturnType<typeof computeAvailabilityMetrics>|null|undefined} report Relatório PM-75.
 * @returns {object}
 */
export function buildAvailabilityExportPayload(report) {
  const r = report && Array.isArray(report.windows) ? report : computeAvailabilityMetrics({ posts: [], probes: [] });
  return {
    schemaVersion: r.schemaVersion || SCHEMA_VERSION,
    localOnly: true,
    totalPosts: r.totalPosts,
    totalProbes: r.totalProbes,
    unmatchedProbes: r.unmatchedProbes,
    windows: r.windows.map((w) => ({ ...w })),
    summary: { ...r.summary },
  };
}

/**
 * Formata resumo textual local-only (sem telemetria central) para diagnóstico em `#/status`.
 * @param {ReturnType<typeof computeAvailabilityMetrics>|null|undefined} report Relatório PM-75.
 * @returns {string}
 */
export function formatAvailabilityReport(report) {
  const payload = buildAvailabilityExportPayload(report);
  const windowLines = payload.windows.map(
    (w) =>
      `- Janela ${w.windowHours} h: ${formatAvailabilityPct(w.availabilityPct)} (${w.availablePosts}/${w.eligiblePosts} acessíveis, réplicas médias=${formatAvailabilityNum(w.avgReplicas)})`,
  );
  return [
    "Disponibilidade offline de posts (PM-75 · local-only, zero telemetria central)",
    `- Posts analisados: ${payload.totalPosts} · Sondas: ${payload.totalProbes} · Agregado: ${formatAvailabilityPct(payload.summary.overallAvailabilityPct)}`,
    ...windowLines,
  ].join("\n");
}
