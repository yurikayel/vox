import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as wallet from "../client/js/wallet.js";

test("wallet-encryption - fluxo de cifra, bloqueio e desbloqueio com passphrase", async () => {
  localStorage.clear();
  wallet.__resetSessionForTests();

  // Gera carteira inicial sem senha
  const { jwk, address } = await wallet.generateNewWallet();
  assert.equal(wallet.isWalletEncrypted(), false);
  assert.equal(wallet.hasWallet(), true);
  assert.equal(await wallet.getAddress(), address);

  // Cifra a carteira com senha
  const passphrase = "senha_secreta_cidadao";
  const envelope = await wallet.encryptStoredWallet(passphrase);
  assert.equal(envelope.kind, wallet.WALLET_KIND_ENCRYPTED);
  assert.equal(wallet.isWalletEncrypted(), true);

  // Bloqueia a sessão (como ao fechar a aba)
  wallet.lockWallet();
  assert.equal(wallet.getStoredJwk(), null);
  assert.equal(await wallet.getAddress(), null);

  // Tenta desbloquear com senha errada
  await assert.rejects(
    () => wallet.unlockWallet("senha_incorreta"),
    /Senha incorreta para decifrar a carteira/
  );
  assert.equal(wallet.getStoredJwk(), null);

  // Desbloqueia com a senha correta
  const restored = await wallet.unlockWallet(passphrase);
  assert.ok(restored);
  assert.equal(restored.n, jwk.n);
  assert.equal(await wallet.getAddress(), address);
  assert.equal(wallet.hasWallet(), true);
});

test("wallet-encryption - saveJwk armazena com compatibilidade plaintext", () => {
  localStorage.clear();
  wallet.__resetSessionForTests();

  const mockJwk = { kty: "RSA", n: "teste_n", e: "AQAB" };
  wallet.saveJwk(mockJwk);

  assert.equal(wallet.isWalletEncrypted(), false);
  assert.deepEqual(wallet.getStoredJwk(), mockJwk);
});

test("wallet-encryption - removeWallet limpa dados e sessão", async () => {
  localStorage.clear();
  wallet.__resetSessionForTests();

  await wallet.generateNewWallet();
  wallet.removeWallet();

  assert.equal(wallet.hasWallet(), false);
  assert.equal(wallet.getStoredJwk(), null);
});
