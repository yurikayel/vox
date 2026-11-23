#!/usr/bin/env node
/**
 * @file LT-08 (docs/process/plano-testes-login.md §5) — login de ponta a ponta num Chromium real, só em loopback.
 * Sobe um servidor estático de `client/`, bloqueia toda rede que não seja ele e percorre:
 * criar só com nome → apagar; criar com e-mail + senha (+ frase) → kit → apagar → voltar por link, código `VOX1:`,
 * arquivo `.txt` e frase; casos negativos (senha errada, cofre inexistente, link e frase inválidos).
 * Prova INV-1 (mesmo `routeId`), INV-2 (a senha não sai nem fica em claro), INV-4 (falha fechada) e INV-5/INV-3 só
 * no que um aparelho sozinho alcança. Guardiões, QR entre aparelhos e a malha precisam de mais de um aparelho e
 * continuam nos testes de fluxo (`mesh-vault-flow.test.js`, `guardian*.test.js`).
 *
 * Ambiente (Playwright + Chromium):
 * - `playwright-core` no `node_modules` da raiz, **ou** `PLAYWRIGHT_CORE_PATH` apontando para `playwright-core/index.mjs`
 *   (senão: `npm install --no-save playwright-core` na raiz).
 * - `CHROMIUM_EXECUTABLE_PATH` (opcional): Chrome/Chromium instalado; sem isso usa o binário do pacote (`npx playwright-core install chromium`).
 * Execução: `node scripts/login-e2e.mjs`. Exit 0 só com todos os cenários passando; falha real → exit 1 (sem falso verde).
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(ROOT, "client");
const PASS = "senha-longa-do-e2e-login-42";
const WRONG_PASS = "outra-senha-longa-do-e2e-99";
const EMAIL = "pessoa.e2e@example.com";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Carrega o Playwright (por `PLAYWRIGHT_CORE_PATH` ou pelos pacotes instalados).
 * @returns {Promise<object>}
 */
async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_CORE_PATH;
  if (explicit) return import(pathToFileURL(explicit).href);
  try {
    return await import("playwright-core");
  } catch (errCore) {
    try {
      return await import("playwright");
    } catch (errFull) {
      const hint = errFull?.message || errCore?.message || String(errFull);
      throw new Error(`FALHOU: playwright indisponível (defina PLAYWRIGHT_CORE_PATH ou instale playwright-core). ${hint}`);
    }
  }
}

/**
 * Sobe um servidor estático local que serve `client/`.
 * @returns {Promise<{server: object, baseUrl: string}>}
 */
function startStaticServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(String(req.url || "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(CLIENT_DIR, rel);
    const ok = file.startsWith(CLIENT_DIR) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) return void res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((d) => server.close(d)) });
    });
  });
}

/**
 * Falha o cenário com `FALHOU: msg` se a condição for falsa.
 * @param {boolean} cond Condição esperada.
 * @param {string} msg Mensagem do erro.
 */
function check(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

/** Um aparelho: contexto isolado, rede que não é do servidor local abortada, toda tentativa anotada em `seen` (a senha é checada em todas, inclusive nas abortadas). */
async function newDevice(browser, baseUrl) {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  const seen = [];
  const errors = [];
  await context.route("**/*", (route) => {
    const req = route.request();
    const url = req.url();
    seen.push({ url, body: req.postData() || "", allowed: url.startsWith(baseUrl) });
    if (url.endsWith("/config/signaling.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signalingUrls: [], nostrRelays: [], nostrSignaling: { enabled: false }, stun: [], turn: [] }) });
    }
    if (url.endsWith("/config/oauth.json")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return url.startsWith(baseUrl) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${baseUrl}/#/`, { waitUntil: "domcontentloaded" });
  return { context, page, seen, errors, baseUrl };
}

/**
 * Lê o id de rota da conta ativa na página, ou `null`.
 * @param {object} page Página do Playwright.
 * @returns {Promise<string|null>}
 */
function routeIdOf(page) {
  return page.evaluate(async () => (await import("/js/identity/index.js")).getCachedRouteIdSync() || null);
}

/**
 * Abre a tela de entrada até o campo de nome.
 * @param {object} page Página do Playwright.
 * @returns {Promise<void>}
 */
async function openEntry(page) {
  await page.locator("#btn-read-first-enter").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#btn-read-first-enter").click();
  await page.locator("#oauth-custom-name-input").waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Aceita o pacto de convivência (maioridade e aceite).
 * @param {object} page Página do Playwright.
 * @returns {Promise<void>}
 */
async function acceptPact(page) {
  await page.locator("#pact-age-18").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#pact-age-18").check();
  await page.locator("#btn-pact-accept").click();
  await page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Cria uma conta só com nome.
 * @param {object} page Página do Playwright.
 * @param {string} name Nome de exibição.
 * @returns {Promise<void>}
 */
async function createNameOnly(page, name) {
  await openEntry(page);
  await page.locator("#oauth-custom-name-input").fill(name);
  await page.locator("#btn-oauth-name-only").click();
  await acceptPact(page);
  return routeIdOf(page);
}

/** Cria com e-mail + senha, lê o kit do cartão e confirma o envio. Devolve `{ routeId, mailto, body, file }`. */
async function createWithEmail(page, name) {
  await openEntry(page);
  await page.locator("#oauth-custom-name-input").fill(name);
  await page.locator("#oauth-entry-email-input").fill(EMAIL);
  await page.locator("#oauth-entry-pass-input").fill(PASS);
  await page.locator("#oauth-entry-include-phrase").check();
  await page.locator("#btn-oauth-save-name").click();
  await page.locator("#btn-email-kit-download").waitFor({ state: "visible", timeout: 30000 });
  const mailto = await page.locator("#btn-email-kit-open-app").getAttribute("href");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#btn-email-kit-download").click()]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vox-login-e2e-")), "vox-acesso.txt");
  await download.saveAs(file);
  const body = new URL(mailto).searchParams.get("body") || "";
  await page.locator("#btn-email-kit-confirm").click();
  await acceptPact(page);
  return { routeId: await routeIdOf(page), mailto, body, file };
}

/** "Apagar chaves deste navegador" pelo botão do Perfil (aceita as duas confirmações) e recarrega a página. */
async function wipeDevice(page, baseUrl) {
  await page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 15000 });
  await page.evaluate(() => { location.hash = "#/perfil?tab=about"; });
  const btn = page.locator("#btn-wipe-local-account");
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForFunction(async () => !(await import("/js/identity/index.js")).getCachedRouteIdSync(), null, { timeout: 15000 });
  await page.goto(`${baseUrl}/#/`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
}

/**
 * Abre a tela de quem já tem conta.
 * @param {object} page Página do Playwright.
 * @returns {Promise<void>}
 */
async function openHave(page) {
  await page.locator('[data-genesis-go="have"]').click();
  await page.locator("#oauth-restore-email-input").waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Preenche os campos da tela de quem já tem conta.
 * @param {object} page Página do Playwright.
 * @param {object} options Campos a preencher.
 * @param {string} [options.email=""] E-mail.
 * @param {string} [options.pass=""] Senha.
 * @param {string} [options.kit=""] Kit de recuperação.
 * @param {string} [options.phrase=""] Frase de recuperação.
 * @param {string} [options.file=""] Arquivo de backup.
 * @returns {Promise<void>}
 */
async function fillHave(page, { email = "", pass = "", kit = "", phrase = "", file = "" }) {
  await page.locator("#oauth-restore-email-input").fill(email);
  await page.locator("#oauth-sovereign-passphrase-input").fill(pass);
  await page.evaluate(() => { document.getElementById("genesis-other-ways").open = true; });
  await page.locator("#oauth-restore-kit-text").fill(kit);
  await page.locator("#oauth-restore-phrase").fill(phrase);
  if (file) await page.locator("#oauth-restore-files").setInputFiles(file);
  await page.locator("#btn-oauth-restore-passphrase").click();
}

/** Espera a conta do aparelho mudar de `prev` ou aparecer um aviso do formulário (erro, ou "esperando a malha"). */
async function pollOutcome(page, prev, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = await page.evaluate(async () => {
      const id = (await import("/js/identity/index.js")).getCachedRouteIdSync();
      const err = document.getElementById("oauth-enrich-error");
      const wait = document.getElementById("oauth-mesh-status");
      const text = [err, wait].map((el) => (el && !el.hidden ? el.textContent.trim() : "")).find(Boolean);
      return { id, msg: text || "" };
    });
    if (now.id !== prev || now.msg) return { id: now.id !== prev ? now.id : null, msg: now.msg };
    await page.waitForTimeout(300);
  }
  throw new Error("FALHOU: nem a conta mudou nem apareceu mensagem em 30 s");
}

/** Volta pelo formulário "Já tenho conta" e espera ou a conta abrir (`routeId`) ou a mensagem de erro. */
async function comeBack(page, fields) {
  await openHave(page);
  const before = await routeIdOf(page);
  await fillHave(page, fields);
  const res = await pollOutcome(page, before);
  return { ...res, before };
}

/** Valores brutos das chaves que guardam segredo da conta (semente, par DM, conta local, cofre). */
function keyMaterial(page) {
  return page.evaluate(() => ["vox-identity-seed-v1", "vox-dm-keypair", "vox-local-account-v1", "vox-accounts-vault-v1"].map((k) => localStorage.getItem(k)).filter(Boolean));
}

/**
 * Despeja `localStorage` e `sessionStorage` em texto, para procurar vazamento.
 * @param {object} page Página do Playwright.
 * @returns {Promise<string>}
 */
async function storageDump(page) {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

/**
 * Garante que nenhuma senha (certa ou errada) apareceu em pedidos de rede.
 * @param {object} device Aparelho simulado com os pedidos vistos.
 * @param {string} label Rótulo usado na mensagem de erro.
 */
function checkNoPasswordLeak(device, label) {
  for (const r of device.seen) {
    check(!r.url.includes(PASS) && !r.body.includes(PASS), `${label}: a senha apareceu num pedido`);
    check(!r.url.includes(WRONG_PASS) && !r.body.includes(WRONG_PASS), `${label}: a senha errada apareceu num pedido`);
  }
}

/**
 * Garante que a página não registrou erros de JavaScript.
 * @param {object} device Aparelho simulado com os erros vistos.
 * @param {string} label Rótulo usado na mensagem de erro.
 */
function checkNoPageErrors(device, label) {
  check(device.errors.length === 0, `${label}: erros JS na página: ${device.errors.join(" | ")}`);
}

/**
 * Cenário: criar conta só com nome e conferir o resultado.
 * @param {object} browser Navegador do Playwright.
 * @param {string} baseUrl URL base do servidor local.
 * @returns {Promise<void>}
 */
async function scenarioNameOnly(browser, baseUrl) {
  const dev = await newDevice(browser, baseUrl);
  try {
    const id = await createNameOnly(dev.page, "Ana E2E");
    check(/^vx_/.test(id || ""), "conta só com nome nasce com routeId vx_");
    await dev.page.reload({ waitUntil: "domcontentloaded" });
    check((await routeIdOf(dev.page)) === id, "routeId estável depois de recarregar");
    const secrets = await keyMaterial(dev.page);
    check(secrets.length >= 2, "há material de chave no storage antes de apagar");
    await wipeDevice(dev.page, baseUrl);
    check((await routeIdOf(dev.page)) !== id, "apagar remove a conta do aparelho (o boot pode semear outra, nunca a mesma)");
    const dump = await storageDump(dev.page);
    check(secrets.every((v) => !dump.includes(v)), "nenhuma chave da conta apagada sobra no storage");
    checkNoPasswordLeak(dev, "só nome");
    checkNoPageErrors(dev, "só nome");
    console.log(`PASS [só nome] routeId=${id.slice(0, 10)}… criado, estável, apagado`);
  } finally { await dev.context.close(); }
}

/** Volta num aparelho novo (contexto limpo): é o que a pessoa faz depois de perder o aparelho. */
async function expectReturn(env, label, fields, routeId) {
  const dev = await newDevice(env.browser, env.baseUrl);
  try {
    await openEntry(dev.page);
    const out = await comeBack(dev.page, fields);
    check(out.id === routeId, `${label}: voltou com outro routeId (${out.id}) ou falhou: ${out.msg}`);
    check(!(await storageDump(dev.page)).includes(PASS), `${label}: senha ficou no storage`);
    checkNoPasswordLeak(dev, label);
    checkNoPageErrors(dev, label);
    console.log(`PASS [volta ${label}] mesmo routeId`);
  } finally { await dev.context.close(); }
}

/**
 * Confere que o aparelho recusa a volta com os campos dados, sem mudar de conta.
 * @param {object} env Ambiente do cenário (navegador e URL base).
 * @param {string} label Rótulo usado na mensagem de erro.
 * @param {object} fields Campos a preencher.
 * @returns {Promise<void>}
 */
async function expectRefusal(env, label, fields) {
  const dev = await newDevice(env.browser, env.baseUrl);
  try {
    await openEntry(dev.page);
    await refuses(dev, label, fields);
  } finally { await dev.context.close(); }
}

/**
 * Confere que a volta com os campos dados é recusada com mensagem e sem trocar a conta.
 * @param {object} dev Aparelho simulado.
 * @param {string} label Rótulo usado na mensagem de erro.
 * @param {object} fields Campos a preencher.
 * @returns {Promise<void>}
 */
async function refuses(dev, label, fields) {
  const out = await comeBack(dev.page, fields);
  check(out.id === null && out.msg, `${label}: devia recusar com mensagem, deu id=${out.id} msg="${out.msg}"`);
  check((await routeIdOf(dev.page)) === out.before, `${label}: a recusa trocou a conta do aparelho`);
  checkNoPasswordLeak(dev, label);
  checkNoPageErrors(dev, label);
  console.log(`PASS [recusa ${label}] "${out.msg.slice(0, 60)}"`);
}

/**
 * Extrai a frase de recuperação do corpo do e-mail enviado.
 * @param {string} body Corpo do e-mail.
 * @returns {string}
 */
function phraseFromBody(body) {
  const m = body.match(/mesmo sem senha\):\s*\n([^\n]+)/);
  return m ? m[1].trim() : "";
}

/**
 * Cenário: backup por e-mail e volta com e sem senha.
 * @param {object} env Ambiente do cenário (navegador e URL base).
 * @returns {Promise<void>}
 */
async function scenarioEmail(env) {
  const { browser, baseUrl } = env;
  const dev = await newDevice(browser, baseUrl);
  try {
    const kit = await createWithEmail(dev.page, "Bia E2E");
    check(/^vx_/.test(kit.routeId || ""), "conta com e-mail nasce com routeId");
    check(!kit.mailto.includes(PASS) && !kit.body.includes(PASS) && !fs.readFileSync(kit.file, "utf8").includes(PASS), "kit sem a senha");
    const phrase = phraseFromBody(kit.body);
    check(phrase.split(/\s+/).length === 12, "frase de 12 palavras no kit quando marcada");
    check(!(await storageDump(dev.page)).includes(PASS), "senha não fica no storage");
    const secrets = await keyMaterial(dev.page);
    await wipeDevice(dev.page, baseUrl);
    const left = await storageDump(dev.page);
    check(secrets.every((v) => !left.includes(v)), "apagar (com cofre) não deixa chave nem cofre da conta antiga");
    const link = kit.body.match(/https?:\/\/\S+#\/sync\?b=\S+/)?.[0] || "";
    const code = kit.body.match(/VOX1:\S+/)?.[0] || "";
    check(link && code, "kit traz link e código");
    await expectRefusal(env, "link com senha errada", { email: EMAIL, pass: WRONG_PASS, kit: link });
    await expectRefusal(env, "texto sem link nem código", { email: EMAIL, pass: PASS, kit: "isto não é um kit" });
    await expectRefusal(env, "frase com palavra trocada", { phrase: phrase.replace(/^\S+/, "zzzz") });
    await expectReturn(env, "link + senha", { email: EMAIL, pass: PASS, kit: link }, kit.routeId);
    await expectReturn(env, "código VOX1 + senha", { email: EMAIL, pass: PASS, kit: code }, kit.routeId);
    await expectReturn(env, "arquivo .txt + senha", { email: EMAIL, pass: PASS, file: kit.file }, kit.routeId);
    await expectReturn(env, "frase (sem senha)", { phrase }, kit.routeId);
    await expectRefusal(env, "e-mail e senha sem cofre em lugar nenhum (cai na malha: aviso, sem conta)", { email: EMAIL, pass: PASS });
    checkNoPasswordLeak(dev, "e-mail");
    checkNoPageErrors(dev, "e-mail");
    console.log(`PASS [e-mail] ${dev.seen.length} tentativas de rede (${dev.seen.filter((r) => !r.allowed).length} abortadas fora do servidor local), nenhuma com a senha`);
  } finally { await dev.context.close(); }
}

/**
 * Roda os cenários de login e sai com código 1 se algum falhar.
 * @returns {Promise<void>}
 */
async function main() {
  const { chromium } = await loadPlaywright();
  const srv = await startStaticServer();
  const launch = { headless: true, args: ["--no-sandbox"] };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(launch);
  try {
    await scenarioNameOnly(browser, srv.baseUrl);
    await scenarioEmail({ browser, baseUrl: srv.baseUrl });
    console.log("LT-08 E2E do login: todos os cenários passaram.");
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
