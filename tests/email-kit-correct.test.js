/**
 * LT-03 (plano-testes-login §3.3) — "Corrigir e-mail" do cartão §6.5 (ADR-032, ameaça T26): o cofre do endereço
 * errado é revogado com a prova de dono, o e-mail certo com a mesma senha abre a mesma conta, e a senha não vaza.
 * Criptografia real (PBKDF2/AES); só o servidor de memória e o `localStorage` são falsos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as vaultCrypto from "../client/js/vault/vault-crypto.js";
import * as emailKit from "../client/js/email-kit.js";

const PASS = "minha senha soberana 12";
const WRONG = "errado@exemplo.com";
const RIGHT = "certo@exemplo.com";

/** Servidor de memória falso com a regra do relay: o primeiro dono de um endereço fixa a prova; outra prova é recusada. */
function installMemoryServer() {
  const origFetch = globalThis.fetch;
  const store = new Map();
  const owners = new Map();
  const posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const key = String(url).split("/memory/vault/")[1];
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    if (opts.method === "POST") {
      const { record, ownerToken } = JSON.parse(opts.body);
      posts.push({ key, record, ownerToken, body: opts.body });
      if (owners.has(key) && owners.get(key) !== ownerToken) return { ok: false, status: 403, json: async () => ({}) };
      owners.set(key, ownerToken);
      store.set(key, record);
      return { ok: true, json: async () => ({ status: "saved" }) };
    }
    const record = store.get(key);
    return record ? { ok: true, json: async () => ({ record }) } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { store, posts, restore: () => (globalThis.fetch = origFetch) };
}

function freshDevice() {
  localStorage.clear();
  localAccount.wipeLocalAccount();
}

/** Cria a conta com `WRONG` e corrige para `correctTo`, como o cartão faz (mesmo `draftState`). */
async function createThenCorrect(correctTo = RIGHT) {
  const draftState = { email: "", pass: "" };
  const first = await emailKit.createEmailAccountKit({ rawName: "Bia", email: WRONG, pass: PASS, draftState });
  const fixed = await emailKit.createEmailAccountKit({ rawName: "Bia", email: correctTo, pass: PASS, draftState });
  return { first, fixed, draftState };
}

test("LT-03: depois de corrigir, o endereço do e-mail errado não abre mais (nem local nem na rede)", async () => {
  freshDevice();
  const server = installMemoryServer();
  try {
    const { first, fixed } = await createThenCorrect();
    assert.equal(first.ok && fixed.ok, true);
    const wrongAddr = await vaultCrypto.deriveVaultAddress(PASS, WRONG);
    assert.ok(server.store.has(wrongAddr), "o cofre errado chegou a ser publicado");
    assert.equal(vaultCrypto.isRevokedRecord(server.store.get(wrongAddr)), true, "na rede, o endereço errado ficou revogado");
    assert.equal(localStorage.getItem(`vox-vault-v2:${wrongAddr}`), null, "a cópia local do endereço errado saiu");

    freshDevice();
    const viaWrong = await emailKit.restoreAccountFromInputs({ email: WRONG, pass: PASS });
    assert.equal(viaWrong.ok, false, "e-mail errado + senha não devolve a conta");
    assert.equal(viaWrong.notFound, true);
  } finally {
    server.restore();
  }
});

test("LT-03: a revogação do endereço errado vai com a prova de dono derivada de e-mail errado + senha", async () => {
  freshDevice();
  const server = installMemoryServer();
  try {
    await createThenCorrect();
    const wrongAddr = await vaultCrypto.deriveVaultAddress(PASS, WRONG);
    const wrongToken = await vaultCrypto.deriveVaultOwnerToken(PASS, WRONG);
    const revokes = server.posts.filter((p) => p.key === wrongAddr && vaultCrypto.isRevokedRecord(p.record));
    assert.ok(revokes.length >= 1, "houve um POST de revogação no endereço errado");
    assert.ok(revokes.every((p) => p.ownerToken === wrongToken), "e a prova é a do dono daquele endereço");
    const rightAddr = await vaultCrypto.deriveVaultAddress(PASS, RIGHT);
    assert.equal(server.posts.some((p) => p.key === rightAddr && vaultCrypto.isRevokedRecord(p.record)), false, "o endereço certo nunca é revogado");
  } finally {
    server.restore();
  }
});

test("LT-03: o e-mail certo com a mesma senha abre e devolve o mesmo routeId", async () => {
  freshDevice();
  const server = installMemoryServer();
  try {
    const { first, fixed } = await createThenCorrect();
    assert.equal(fixed.routeId, first.routeId, "corrigir não troca a conta");
    freshDevice();
    const opened = await emailKit.restoreAccountFromInputs({ email: RIGHT, pass: PASS });
    assert.equal(opened.ok, true);
    assert.equal(opened.routeId, first.routeId);
    freshDevice();
    const viaKit = await emailKit.restoreAccountFromInputs({ email: RIGHT, pass: PASS, kitText: fixed.kit.body });
    assert.equal(viaKit.ok, true, "o kit do e-mail corrigido também abre");
    assert.equal(viaKit.routeId, first.routeId);
  } finally {
    server.restore();
  }
});

test("LT-03: a senha não aparece no mailto:, no corpo do kit, no storage nem no que vai à rede; o Para: é o e-mail certo", async () => {
  freshDevice();
  const server = installMemoryServer();
  try {
    const { fixed } = await createThenCorrect();
    assert.equal(fixed.kit.to, RIGHT);
    assert.ok(fixed.kit.mailtoUrl.startsWith(`mailto:${encodeURIComponent(RIGHT)}?`));
    assert.ok(!decodeURIComponent(fixed.kit.mailtoUrl).includes(WRONG), "o e-mail errado não sobra no rascunho");
    for (const text of [fixed.kit.mailtoUrl, decodeURIComponent(fixed.kit.mailtoUrl), fixed.kit.body, fixed.kit.copyText]) {
      assert.ok(!text.includes(PASS) && !text.includes(encodeURIComponent(PASS)), "senha fora do kit");
    }
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      assert.ok(!key.includes(PASS) && !localStorage.getItem(key).includes(PASS), `senha em claro no storage (${key})`);
    }
    assert.ok(server.posts.every((p) => !p.body.includes(PASS)), "senha fora do que vai à rede");
  } finally {
    server.restore();
  }
});

test("LT-03: corrigir para o mesmo e-mail não revoga nem estraga o cofre", async () => {
  freshDevice();
  const server = installMemoryServer();
  try {
    const { first, fixed } = await createThenCorrect(WRONG);
    assert.equal(fixed.ok, true);
    assert.equal(fixed.routeId, first.routeId);
    const addr = await vaultCrypto.deriveVaultAddress(PASS, WRONG);
    assert.equal(vaultCrypto.isRevokedRecord(server.store.get(addr)), false, "o endereço segue vivo");
    freshDevice();
    const opened = await emailKit.restoreAccountFromInputs({ email: WRONG, pass: PASS });
    assert.equal(opened.ok, true);
    assert.equal(opened.routeId, first.routeId);
  } finally {
    server.restore();
  }
});

test("LT-03: e-mail inválido é barrado antes de gravar, e o cofre anterior continua abrindo", async () => {
  freshDevice();
  const server = installMemoryServer();
  try {
    const draftState = { email: "", pass: "" };
    const first = await emailKit.createEmailAccountKit({ rawName: "Bia", email: WRONG, pass: PASS, draftState });
    const gate = emailKit.validateEmailEntry({ rawName: "Bia", email: "sem-arroba", pass: PASS });
    assert.notEqual(gate, "", "a validação do cartão recusa e-mail sem @");
    const postsBefore = server.posts.length;
    const bad = await emailKit.createEmailAccountKit({ rawName: "Bia", email: "sem-arroba", pass: PASS, draftState });
    assert.equal(bad.ok, false, "a função recusa por conta própria, sem depender da tela");
    assert.deepEqual(draftState, { email: WRONG, pass: PASS }, "o rascunho fica no último e-mail bom");
    const wrongAddr = await vaultCrypto.deriveVaultAddress(PASS, WRONG);
    assert.equal(server.posts.length, postsBefore, "nada foi gravado nem revogado na rede com e-mail inválido");
    assert.equal(vaultCrypto.isRevokedRecord(server.store.get(wrongAddr)), false, "o cofre anterior não foi revogado");
    freshDevice();
    const opened = await emailKit.restoreAccountFromInputs({ email: WRONG, pass: PASS });
    assert.equal(opened.ok, true);
    assert.equal(opened.routeId, first.routeId);
  } finally {
    server.restore();
  }
});
