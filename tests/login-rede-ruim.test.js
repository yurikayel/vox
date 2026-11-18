/**
 * LT-02 (resto): criar e restaurar conta pelo cofre v2 em memória central com rede ruim.
 * Relay falso programável por `fetch`: fora do ar, lento (timeout), 5xx, JSON corrompido e queda no meio.
 * Cripto real; só rede e storage são falsos. Malha: `tests/login-network-faults.test.js`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { savePassphraseVault, restoreFromPassphraseVault } from "../client/js/vault/passphrase-vault.js";
import { VAULT_STORAGE_PREFIX } from "../client/js/vault/vault-store.js";
import { deriveVaultAddress } from "../client/js/vault/vault-crypto.js";
import { classifyUploadError, honestMessage } from "../client/js/honest-errors.js";
import { handleRestoreFailure } from "../client/js/app/onboarding-email.js";

const PASS = "minha senha bem longa";
const EMAIL = "ana@exemplo.com";
const origFetch = globalThis.fetch;

/** Relay falso: `mode` decide a resposta de cada chamada; guarda o que foi gravado. */
function installRelay(mode) {
  const store = new Map();
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    const key = String(url).split("/memory/vault/")[1];
    calls.push({ method, key });
    const m = typeof mode.current === "function" ? mode.current(method, calls.length) : mode.current;
    if (m === "down") throw new TypeError("Failed to fetch");
    if (m === "5xx") return { ok: false, status: 503, json: async () => ({}) };
    if (m === "badjson") return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } };
    if (m === "garbage") return { ok: true, status: 200, json: async () => ({ record: "lixo" }) };
    if (m === "hang") return new Promise(() => {});
    if (method === "POST") {
      store.set(key, JSON.parse(opts.body).record);
      return { ok: true, status: 200, json: async () => ({ status: "saved" }) };
    }
    const record = store.get(key);
    return record ? { ok: true, json: async () => ({ record }) } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { store, calls };
}

function freshDevice() {
  localStorage.clear();
  localAccount.wipeLocalAccount();
}

async function createAccount() {
  freshDevice();
  const bundle = await localAccount.exportLocalAccountBundle();
  return bundle.routeId;
}

async function emailVaultAddress() {
  return deriveVaultAddress(PASS, EMAIL);
}

function oauthErrorHarness() {
  const err = { textContent: "", hidden: true };
  const kit = { focused: [], focus() { kit.focused.push("oauth-restore-kit-text"); } };
  const byId = new Map([["oauth-enrich-error", err], ["oauth-restore-kit-text", kit]]);
  const prevDoc = globalThis.document;
  globalThis.document = { getElementById: (id) => byId.get(id) ?? null };
  return {
    err,
    kit,
    restore() {
      globalThis.document = prevDoc;
    },
  };
}

test.afterEach(() => {
  globalThis.fetch = origFetch;
});

test("LAN-21: falha de fetch na volta vira texto honesto de offline", () => {
  const kind = classifyUploadError(new TypeError("Failed to fetch"));
  assert.equal(kind, "offline");
  const msg = honestMessage(kind);
  assert.match(msg, /Sem conexão/);
  assert.ok(msg.length > 20);
});

test("onboarding: sem servidor, o aviso honesto aparece e o foco vai para o kit", () => {
  const ui = oauthErrorHarness();
  try {
    handleRestoreFailure({ noServer: true, notFound: true, reason: "Nenhum cofre encontrado para esta senha ou chave." });
    assert.match(ui.err.textContent, /Nenhum servidor respondeu/);
    assert.match(ui.err.textContent, /link do seu e-mail/);
    assert.equal(ui.err.hidden, false, "mensagem visível");
    assert.deepEqual(ui.kit.focused, ["oauth-restore-kit-text"]);
  } finally {
    ui.restore();
  }
});

test("onboarding: cofre corrompido mostra o motivo na região de erro", () => {
  const ui = oauthErrorHarness();
  try {
    const reason = "Dados do cofre inválidos ou corrompidos.";
    handleRestoreFailure({ ok: false, reason });
    assert.equal(ui.err.textContent, reason);
    assert.equal(ui.err.hidden, false);
  } finally {
    ui.restore();
  }
});

test("criar: relay fora do ar grava só neste aparelho, sem exceção e sem contar como saída", async () => {
  const routeId = await createAccount();
  const relay = installRelay({ current: "down" });
  const saved = await savePassphraseVault(PASS, EMAIL);
  assert.equal(saved.ok, true);
  assert.equal(saved.routeId, routeId);
  assert.equal(saved.remote, 0, "nenhum servidor aceitou");
  assert.ok(relay.calls.length > 0);
  assert.ok(localStorage.getItem(VAULT_STORAGE_PREFIX + (await emailVaultAddress())), "cópia local gravada");
});

test("criar: resposta 5xx não conta servidor aceito e não lança", async () => {
  await createAccount();
  installRelay({ current: "5xx" });
  const saved = await savePassphraseVault(PASS, EMAIL);
  assert.equal(saved.ok, true);
  assert.equal(saved.remote, 0);
});

test("criar: corpo de resposta ilegível no POST não lança (o POST não lê o corpo)", async () => {
  await createAccount();
  installRelay({ current: "badjson" });
  const saved = await savePassphraseVault(PASS, EMAIL);
  assert.equal(saved.ok, true);
  assert.ok(saved.remote > 0, "status 200 conta como aceito; o corpo não é lido");
});

test("criar: relay cai no meio (um POST passa, o seguinte falha) deixa a conta íntegra", async () => {
  const routeId = await createAccount();
  installRelay({ current: (method, n) => (n > 1 ? "down" : "ok") });
  const saved = await savePassphraseVault(PASS, EMAIL);
  assert.equal(saved.ok, true);
  assert.equal(localAccount.getCachedRouteIdSync(), routeId, "mesma conta depois da queda");
  freshDevice();
  const again = await restoreFromPassphraseVault(PASS, { email: EMAIL });
  assert.equal(again.ok, false, "o relay caiu: sem cópia remota nem local, nada volta pela rede");
});

test("restaurar: relay fora do ar → notFound com noServer, sem conta parcial", async () => {
  const before = await createAccount();
  await savePassphraseVault(PASS, EMAIL);
  freshDevice();
  installRelay({ current: "down" });
  const res = await restoreFromPassphraseVault(PASS, { email: EMAIL });
  assert.equal(res.ok, false);
  assert.equal(res.notFound, true);
  assert.equal(res.noServer, true, "a tela precisa dizer 'sem servidor', não 'senha errada'");
  assert.notEqual(localAccount.getCachedRouteIdSync(), before, "nada foi importado");
});

test("restaurar: 5xx não marca noServer (a tela não diz 'sem internet')", async () => {
  await createAccount();
  installRelay({ current: "5xx" });
  freshDevice();
  const res = await restoreFromPassphraseVault(PASS, { email: EMAIL });
  assert.equal(res.ok, false);
  assert.equal(res.notFound, true);
  assert.equal(res.noServer, false, "503 conta como servidor alcançado, não como 'sem internet'");
  const ui = oauthErrorHarness();
  try {
    handleRestoreFailure(res);
    assert.doesNotMatch(ui.err.textContent, /Nenhum servidor respondeu/, "erro honesto distingue servidor fora de rede");
  } finally {
    ui.restore();
  }
});

test("restaurar: perda no meio (cofre baixa, relay cai) ainda restaura do que já chegou", async () => {
  const before = await createAccount();
  const relay = installRelay({ current: "ok" });
  await savePassphraseVault(PASS, EMAIL);
  freshDevice();
  const addr = await emailVaultAddress();
  const record = relay.store.get(addr);
  assert.ok(record, "cofre foi para o relay falso");
  installRelay({ current: "down" });
  const res = await restoreFromPassphraseVault(PASS, { email: EMAIL, directRecord: record });
  assert.equal(res.ok, true, "registro direto não depende da rede");
  assert.equal(res.routeId, before);
});

test("restaurar: registro de formato errado vindo do relay falha fechado com mensagem de cofre corrompido", async () => {
  await createAccount();
  installRelay({ current: "garbage" });
  freshDevice();
  const res = await restoreFromPassphraseVault(PASS, { email: EMAIL });
  assert.equal(res.ok, false);
  assert.match(res.reason, /corrompidos/);
});

test.todo("restaurar: JSON corrompido de servidor que respondeu 200 conta como 'sem servidor' (noServer=true) — deveria contar como alcançado (probeVaultUrl)");

test("restaurar: senha errada continua falhando fechado com rede boa", async () => {
  await createAccount();
  installRelay({ current: "ok" });
  await savePassphraseVault(PASS, EMAIL);
  freshDevice();
  const res = await restoreFromPassphraseVault("outra senha bem longa", { email: EMAIL });
  assert.equal(res.ok, false);
});

test.todo("restaurar: GET do cofre sem timeout — relay lento deixa 'Entrar' pendurado para sempre (probeVaultUrl; S3 / fetch-timeout)");
test.todo("criar: conta trava (lockAfterPasswordBackup) mesmo quando nenhum servidor aceitou o cofre (remote=0) e a só cópia está neste aparelho");