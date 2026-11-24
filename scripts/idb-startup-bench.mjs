#!/usr/bin/env node
/**
 * @file Benchmark real de inicialização e leitura de IndexedDB no Chromium (LAN-23).
 *
 * Mede, em página loopback servida via `scripts/e2e-lib.mjs` com IndexedDB real e WebCrypto:
 *  - gravação inicial de um dataset sintético determinístico na store `local-posts`;
 *  - abertura fria do banco (`openDB`) em nova página no mesmo contexto (cache JS zerado);
 *  - 1ª leitura de feed (`getLocalPosts`) e 2ª leitura com cache quente;
 *  - amostra de verificação criptográfica (`verifyPayload` ECDSA P-256 + SHA-256 WebCrypto).
 *
 * A saída inclui estimativa com fator `3x` de CPU (`androidEntryEstimateMs`) para aproximar
 * dispositivos Android de entrada. As funções puras exportadas permitem validar determinismo
 * e contrato JSON em Node sem simular latência de IndexedDB em RAM.
 *
 * Uso: `node scripts/idb-startup-bench.mjs [--authors 20] [--per-author 25] [--seed 20261124] [--json]`
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startStaticClientServer,
  loadPlaywright,
  createIsolatedPage,
} from "./e2e-lib.mjs";

/** Identificador canônico do motor real de benchmark. */
export const BENCH_ENGINE = "chromium-indexeddb";

/** Fator multiplicador de CPU aplicado para estimar Android de entrada. */
export const ANDROID_ENTRY_CPU_FACTOR = 3;

/** Nota explícita incluída no relatório JSON sobre o fator de CPU 3x. */
export const ANDROID_CPU_NOTE =
  "Estimativa obtida aplicando fator 3x de CPU sobre a medição real em Chromium desktop para aproximar Android de entrada; não substitui medição direta no aparelho.";

/** Opções padrão determinísticas do benchmark. */
export const DEFAULT_BENCH_OPTIONS = Object.freeze({
  authors: 20,
  perAuthor: 25,
  seed: 20261124,
  verifySampleSize: 20,
  json: false,
});

const BASE_TIMESTAMP_MS = 1760000000000;
const COMMUNITIES = Object.freeze(["com-01", "com-02", "com-03", "com-04"]);
const VOCAB = Object.freeze([
  "assembleia", "bairro", "agenda", "leitura", "oficina", "mutirao",
  "praca", "escola", "saude", "transporte", "biblioteca", "encontro",
  "registro", "memoria", "comunidade", "relato", "mapa", "arquivo",
  "coletivo", "rede", "aviso", "ata", "calendario", "local",
]);
const REQUIRED_METRIC_KEYS = Object.freeze([
  "initialWriteMs",
  "coldOpenMs",
  "firstFeedReadMs",
  "warmFeedReadMs",
  "verifySampleMs",
  "sha256SampleMs",
]);

/**
 * Cria gerador pseudoaleatório determinístico (Mulberry32) a partir de uma semente inteira.
 * @param {number} [seed=DEFAULT_BENCH_OPTIONS.seed] Semente numérica inteira.
 * @returns {() => number} Função que retorna números determinísticos em `[0, 1)`.
 */
export function createSeededRng(seed = DEFAULT_BENCH_OPTIONS.seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monta um corpo de texto sintético determinístico usando o vocabulário neutro.
 * @param {() => number} rng Gerador determinístico.
 * @returns {string} Texto sintético com hashtag comunitária.
 */
function buildSyntheticBody(rng) {
  const wordCount = 12 + Math.floor(rng() * 18);
  const words = [];
  for (let i = 0; i < wordCount; i += 1) {
    words.push(VOCAB[Math.floor(rng() * VOCAB.length)]);
  }
  const tag = VOCAB[Math.floor(rng() * 8)];
  return `${words.join(" ")} #${tag}`;
}

/**
 * Cria um único post sintético compatível com a store `local-posts`.
 * @param {object} ctx Contexto determinístico de criação do post.
 * @returns {object} Post sintético pronto para persistência.
 */
function buildSyntheticPost(ctx) {
  const { rng, seed, authorIdx, postIdx, ts, topics } = ctx;
  const isReply = topics.length > 0 && rng() < 0.25;
  const hex = Math.floor(rng() * 0xffffffff).toString(16).padStart(8, "0");
  const id = `bench-${seed}-a${authorIdx}-p${postIdx}-${hex}`;
  const replyTo = isReply ? topics[Math.floor(rng() * topics.length)] : "";
  return {
    id,
    type: isReply ? "reply" : "topic",
    author: `vx_bench_${String(authorIdx).padStart(4, "0")}`,
    authorDisplay: `Autor ${authorIdx + 1}`,
    communityId: COMMUNITIES[Math.floor(rng() * COMMUNITIES.length)],
    replyTo,
    ts,
    body: buildSyntheticBody(rng),
    sigv: 2,
  };
}

/**
 * Gera dataset sintético determinístico de autores e posts para o benchmark.
 * @param {object} [options] Parâmetros do gerador.
 * @param {number} [options.authors=20] Quantidade de autores sintéticos (>= 1).
 * @param {number} [options.perAuthor=25] Quantidade de posts por autor (>= 1).
 * @param {number} [options.seed=20261124] Semente determinística.
 * @returns {{ seed: number, authors: number, perAuthor: number, totalPosts: number, posts: object[] }}
 */
export function generateSyntheticDataset(options = {}) {
  const authors = options.authors ?? DEFAULT_BENCH_OPTIONS.authors;
  const perAuthor = options.perAuthor ?? DEFAULT_BENCH_OPTIONS.perAuthor;
  const seed = options.seed ?? DEFAULT_BENCH_OPTIONS.seed;
  if (!Number.isInteger(authors) || authors < 1) {
    throw new RangeError(`authors deve ser inteiro >= 1 (recebeu ${authors})`);
  }
  if (!Number.isInteger(perAuthor) || perAuthor < 1) {
    throw new RangeError(`perAuthor deve ser inteiro >= 1 (recebeu ${perAuthor})`);
  }
  const rng = createSeededRng(seed);
  const posts = [];
  const topics = [];
  let ts = BASE_TIMESTAMP_MS;
  for (let a = 0; a < authors; a += 1) {
    for (let p = 0; p < perAuthor; p += 1) {
      ts += 1000 + Math.floor(rng() * 60000);
      const post = buildSyntheticPost({ rng, seed, authorIdx: a, postIdx: p, ts, topics });
      if (post.type === "topic") topics.push(post.id);
      posts.push(post);
    }
  }
  return { seed, authors, perAuthor, totalPosts: posts.length, posts };
}

/**
 * Valida e converte valor inteiro de flag CLI.
 * @param {string} flag Nome da flag.
 * @param {string|undefined} raw Valor textual recebido.
 * @param {number} min Valor mínimo permitido.
 * @returns {number} Inteiro validado.
 */
function parseIntFlag(flag, raw, min) {
  if (raw === undefined || !/^-?\d+$/.test(String(raw))) {
    throw new RangeError(`Valor inválido para ${flag}: ${raw}`);
  }
  const val = Number(raw);
  if (!Number.isSafeInteger(val) || val < min) {
    throw new RangeError(`${flag} deve ser inteiro >= ${min} (recebeu ${raw})`);
  }
  return val;
}

/**
 * Extrai nome e valor opcional de um argumento CLI (`--flag=val` ou `--flag val`).
 * @param {string[]} argv Lista de argumentos.
 * @param {number} index Índice atual.
 * @returns {{ flag: string, raw: string|undefined, nextIndex: number }}
 */
function readFlagToken(argv, index) {
  const token = String(argv[index] || "");
  const eq = token.indexOf("=");
  if (eq !== -1) {
    return { flag: token.slice(0, eq), raw: token.slice(eq + 1), nextIndex: index + 1 };
  }
  return { flag: token, raw: argv[index + 1], nextIndex: index + 2 };
}

/**
 * Faz parsing determinístico das flags CLI do benchmark.
 * @param {string[]} [argv=[]] Argumentos de linha de comando (sem `node` e caminho do script).
 * @returns {{ authors: number, perAuthor: number, seed: number, verifySampleSize: number, json: boolean }}
 */
export function parseBenchArgs(argv = []) {
  const parsed = { ...DEFAULT_BENCH_OPTIONS };
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--json") {
      parsed.json = true;
      i += 1;
      continue;
    }
    const { flag, raw, nextIndex } = readFlagToken(argv, i);
    if (flag === "--authors") parsed.authors = parseIntFlag(flag, raw, 1);
    else if (flag === "--per-author") parsed.perAuthor = parseIntFlag(flag, raw, 1);
    else if (flag === "--seed") parsed.seed = parseIntFlag(flag, raw, 0);
    else if (flag === "--verify-sample") parsed.verifySampleSize = parseIntFlag(flag, raw, 1);
    else throw new RangeError(`Flag desconhecida: ${flag}`);
    i = nextIndex;
  }
  return parsed;
}

/**
 * Arredonda milissegundos para 2 casas decimais.
 * @param {number} value Valor numérico finito.
 * @returns {number} Valor arredondado.
 */
function roundMs(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Valida que todas as métricas obrigatórias são números finitos não negativos.
 * @param {Record<string, number>} metrics Métricas coletadas no navegador.
 * @returns {Record<string, number>} Métricas normalizadas e arredondadas.
 */
function normalizeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    throw new TypeError("metrics deve ser um objeto com medições reais");
  }
  const out = {};
  for (const key of REQUIRED_METRIC_KEYS) {
    const val = metrics[key];
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      throw new TypeError(`Métrica inválida para ${key}: ${val}`);
    }
    out[key] = roundMs(val);
  }
  out.startupTotalMs = roundMs(out.coldOpenMs + out.firstFeedReadMs + out.verifySampleMs);
  out.feedPostCount = Number(metrics.feedPostCount) || 0;
  out.verifiedCount = Number(metrics.verifiedCount) || 0;
  return out;
}

/**
 * Calcula estimativa de tempos em Android de entrada aplicando fator 3x de CPU.
 * @param {Record<string, number>} norm Métricas normalizadas em ms.
 * @returns {object} Objeto `androidEntryEstimateMs` com fator, nota e métricas escaladas.
 */
function buildAndroidEstimate(norm) {
  const f = ANDROID_ENTRY_CPU_FACTOR;
  return {
    cpuFactor: f,
    note: ANDROID_CPU_NOTE,
    initialWriteMs: roundMs(norm.initialWriteMs * f),
    coldOpenMs: roundMs(norm.coldOpenMs * f),
    firstFeedReadMs: roundMs(norm.firstFeedReadMs * f),
    warmFeedReadMs: roundMs(norm.warmFeedReadMs * f),
    verifySampleMs: roundMs(norm.verifySampleMs * f),
    sha256SampleMs: roundMs(norm.sha256SampleMs * f),
    startupTotalMs: roundMs(norm.startupTotalMs * f),
  };
}

/**
 * Constrói o contrato JSON estruturado do relatório de benchmark real no Chromium.
 * @param {object} params Dados coletados no benchmark.
 * @param {object} params.config Configuração do dataset e amostra.
 * @param {object} params.metrics Métricas em milissegundos coletadas no IndexedDB real.
 * @param {object} [params.environment] Metadados do ambiente de execução.
 * @returns {object} Relatório estruturado com estimativa Android de entrada (`3x` CPU).
 */
export function buildBenchReport({ config, metrics, environment = {} }) {
  const norm = normalizeMetrics(metrics);
  return {
    schemaVersion: 1,
    engine: BENCH_ENGINE,
    measurementType: "real-browser-indexeddb",
    recordedAt: environment.recordedAt || new Date().toISOString(),
    config: {
      authors: config.authors,
      perAuthor: config.perAuthor,
      totalPosts: config.totalPosts,
      seed: config.seed,
      verifySampleSize: config.verifySampleSize,
    },
    metrics: norm,
    androidEntryEstimateMs: buildAndroidEstimate(norm),
    environment: {
      browserVersion: environment.browserVersion || "unknown",
      platform: environment.platform || process.platform,
      nodeVersion: environment.nodeVersion || process.version,
    },
  };
}

/**
 * Formata resumo textual legível do relatório de benchmark para saída padrão.
 * @param {object} report Relatório retornado por `buildBenchReport`.
 * @returns {string} Texto resumido com medições reais e estimativa 3x.
 */
export function formatBenchSummary(report) {
  const { config: cfg, metrics: m, androidEntryEstimateMs: est } = report;
  return [
    `IndexedDB Startup Bench (${report.engine})`,
    `Dataset: ${cfg.authors} autores x ${cfg.perAuthor} posts = ${cfg.totalPosts} posts (seed=${cfg.seed})`,
    `Gravação inicial: ${m.initialWriteMs} ms (Android 3x: ${est.initialWriteMs} ms)`,
    `Abertura fria:    ${m.coldOpenMs} ms (Android 3x: ${est.coldOpenMs} ms)`,
    `1ª leitura feed:  ${m.firstFeedReadMs} ms [${m.feedPostCount} posts] (Android 3x: ${est.firstFeedReadMs} ms)`,
    `2ª leitura warm:  ${m.warmFeedReadMs} ms (Android 3x: ${est.warmFeedReadMs} ms)`,
    `Verificação:      ${m.verifySampleMs} ms [${m.verifiedCount}/${cfg.verifySampleSize} ECDSA] | SHA-256: ${m.sha256SampleMs} ms`,
    `Total startup:    ${m.startupTotalMs} ms (Android 3x: ${est.startupTotalMs} ms)`,
    `Nota (${est.cpuFactor}x CPU): ${est.note}`,
  ].join("\n");
}

/**
 * Assina a amostra de posts com ECDSA P-256 real via WebCrypto no navegador.
 * @param {any} page Página Playwright em contexto seguro loopback.
 * @param {object[]} posts Dataset sintético gerado.
 * @param {number} sampleSize Quantidade de posts a assinar para verificação.
 * @returns {Promise<object[]>} Lista de posts com a amostra assinada.
 */
function signSampleInPage(page, posts, sampleSize) {
  return page.evaluate(async ({ items, limit }) => {
    const { canonicalString } = await import("/js/sig-format.js");
    const { bytesToB64Url, computeRouteId } = await import("/js/signed-verify.js");
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const pubKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const author = await computeRouteId(pubKey);
    const enc = new TextEncoder();
    const count = Math.min(limit, items.length);
    for (let i = 0; i < count; i += 1) {
      const target = { ...items[i], author };
      const sigBuf = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        enc.encode(canonicalString(target))
      );
      items[i] = { ...target, pubKey, sig: bytesToB64Url(sigBuf) };
    }
    return items;
  }, { items: posts, limit: sampleSize });
}

/**
 * Limpa `vox-cache-db` e mede a gravação inicial em lote no IndexedDB real.
 * @param {any} page Página Playwright.
 * @param {object[]} posts Posts prontos para gravação.
 * @returns {Promise<number>} Tempo de gravação inicial em ms.
 */
function writePostsToIdbInPage(page, posts) {
  return page.evaluate(async (items) => {
    await new Promise((resolve) => {
      const del = indexedDB.deleteDatabase("vox-cache-db");
      del.onsuccess = del.onerror = del.onblocked = () => resolve();
    });
    const { openDB, LOCAL_POSTS_STORE } = await import("/js/cache-node-db.js");
    const { toStoredRecord } = await import("/js/post-wire.js");
    const db = await openDB();
    const t0 = performance.now();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_POSTS_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_POSTS_STORE);
      for (const post of items) store.put(toStoredRecord(post));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const elapsed = performance.now() - t0;
    db.close();
    return elapsed;
  }, posts);
}

/**
 * Mede abertura fria (`openDB`), 1ª leitura e 2ª leitura (cache quente) em página recém-aberta.
 * @param {any} page Nova página Playwright no mesmo contexto de storage.
 * @returns {Promise<{ coldOpenMs: number, firstFeedReadMs: number, warmFeedReadMs: number, feedPostCount: number }>}
 */
function measureColdAndWarmReadInPage(page) {
  return page.evaluate(async () => {
    const { openDB } = await import("/js/cache-node-db.js");
    const { getLocalPosts } = await import("/js/cache-node-posts.js");
    const tOpen = performance.now();
    await openDB();
    const coldOpenMs = performance.now() - tOpen;
    const tFirst = performance.now();
    const firstFeed = await getLocalPosts();
    const firstFeedReadMs = performance.now() - tFirst;
    const tWarm = performance.now();
    await getLocalPosts();
    const warmFeedReadMs = performance.now() - tWarm;
    return { coldOpenMs, firstFeedReadMs, warmFeedReadMs, feedPostCount: firstFeed.length };
  });
}

/**
 * Mede verificação `verifyPayload` (ECDSA P-256) e SHA-256 WebCrypto sobre amostra lida do IDB.
 * @param {any} page Página Playwright com o banco já populado.
 * @param {number} sampleSize Quantidade máxima de posts assinados a verificar.
 * @returns {Promise<{ verifySampleMs: number, verifiedCount: number, sha256SampleMs: number }>}
 */
function measureVerifySampleInPage(page, sampleSize) {
  return page.evaluate(async (limit) => {
    const { getWirePosts } = await import("/js/cache-node-posts.js");
    const { verifyPayload } = await import("/js/signed-verify.js");
    const { canonicalString } = await import("/js/sig-format.js");
    const signed = (await getWirePosts()).filter((p) => p.sig && p.pubKey).slice(0, limit);
    const enc = new TextEncoder();
    const tVerify = performance.now();
    let verifiedCount = 0;
    for (const item of signed) {
      if (await verifyPayload(item)) verifiedCount += 1;
    }
    const verifySampleMs = performance.now() - tVerify;
    const tHash = performance.now();
    for (const item of signed) {
      await crypto.subtle.digest("SHA-256", enc.encode(canonicalString(item)));
    }
    return { verifySampleMs, verifiedCount, sha256SampleMs: performance.now() - tHash };
  }, sampleSize);
}

/**
 * Executa o benchmark completo em Chromium real via `scripts/e2e-lib.mjs`.
 * @param {object} [options] Opções do benchmark (mesmo contrato de `parseBenchArgs`).
 * @returns {Promise<object>} Relatório JSON estruturado de `buildBenchReport`.
 */
export async function runBrowserIdbBenchmark(options = {}) {
  const cfg = { ...DEFAULT_BENCH_OPTIONS, ...options };
  const dataset = generateSyntheticDataset(cfg);
  const sampleSize = Math.min(cfg.verifySampleSize, dataset.totalPosts);
  const server = await startStaticClientServer();
  const { chromium } = await loadPlaywright();
  const launch = { headless: true, args: ["--no-sandbox"] };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(launch);
  const session = await createIsolatedPage(browser, server.baseUrl, { installProbe: false });
  try {
    const signedPosts = await signSampleInPage(session.page, dataset.posts, sampleSize);
    const initialWriteMs = await writePostsToIdbInPage(session.page, signedPosts);
    await session.page.close();
    const coldPage = await session.context.newPage();
    await coldPage.goto(`${server.baseUrl}/#/`, { waitUntil: "domcontentloaded" });
    const reads = await measureColdAndWarmReadInPage(coldPage);
    const verify = await measureVerifySampleInPage(coldPage, sampleSize);
    return buildBenchReport({
      config: { ...dataset, verifySampleSize: sampleSize },
      metrics: { initialWriteMs, ...reads, ...verify },
      environment: { browserVersion: browser.version() },
    });
  } finally {
    await session.context.close();
    await browser.close();
    await server.close();
  }
}

/**
 * Ponto de entrada CLI: interpreta argumentos, executa o benchmark real e imprime saída.
 * @param {string[]} [argv=process.argv.slice(2)] Argumentos CLI.
 * @returns {Promise<void>}
 */
async function runCli(argv = process.argv.slice(2)) {
  const opts = parseBenchArgs(argv);
  const report = await runBrowserIdbBenchmark(opts);
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatBenchSummary(report));
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  await runCli();
}
