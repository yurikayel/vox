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
 * Uso: `PLAYWRIGHT_CORE_PATH=<.../playwright-core/index.mjs> node scripts/login-e2e.mjs`
 * (ou `npm install --no-save playwright-core`). `CHROMIUM_EXECUTABLE_PATH` aponta para um Chrome já instalado.
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

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_CORE_PATH;
  if (explicit) return import(pathToFileURL(explicit).href);
  try { return await import("playwright-core"); } catch { return import("playwright"); }
}

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

function routeIdOf(page) {
  return page.evaluate(async () => (await import("/js/identity/index.js")).getCachedRouteIdSync() || null);
}

async function openEntry(page) {
  await page.locator("#btn-read-first-enter").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#btn-read-first-enter").click();
  await page.locator("#oauth-custom-name-input").waitFor({ state: "visible", timeout: 15000 });
}

async function acceptPact(page) {
  await page.locator("#pact-age-18").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#pact-age-18").check();
  await page.locator("#btn-pact-accept").click();
  await page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 15000 });
}

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

async function openHave(page) {
  await page.locator('[data-genesis-go="have"]').click();
  await page.locator("#oauth-restore-email-input").waitFor({ state: "visible", timeout: 15000 });
}

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

async function storageDump(page) {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

function checkNoPasswordLeak(device, label) {
  for (const r of device.seen) {
    check(!r.url.includes(PASS) && !r.body.includes(PASS), `${label}: a senha apareceu num pedido`);
    check(!r.url.includes(WRONG_PASS) && !r.body.includes(WRONG_PASS), `${label}: a senha errada apareceu num pedido`);
  }
}

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
    console.log(`PASS [volta ${label}] mesmo routeId`);
  } finally { await dev.context.close(); }
}

async function expectRefusal(env, label, fields) {
  const dev = await newDevice(env.browser, env.baseUrl);
  try {
    await openEntry(dev.page);
    await refuses(dev, label, fields);
  } finally { await dev.context.close(); }
}

async function refuses(dev, label, fields) {
  const out = await comeBack(dev.page, fields);
  check(out.id === null && out.msg, `${label}: devia recusar com mensagem, deu id=${out.id} msg="${out.msg}"`);
  check((await routeIdOf(dev.page)) === out.before, `${label}: a recusa trocou a conta do aparelho`);
  checkNoPasswordLeak(dev, label);
  console.log(`PASS [recusa ${label}] "${out.msg.slice(0, 60)}"`);
}

function phraseFromBody(body) {
  const m = body.match(/mesmo sem senha\):\s*\n([^\n]+)/);
  return m ? m[1].trim() : "";
}

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
    console.log(`PASS [e-mail] ${dev.seen.length} tentativas de rede (${dev.seen.filter((r) => !r.allowed).length} abortadas fora do servidor local), nenhuma com a senha`);
  } finally { await dev.context.close(); }
}

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

await main();
