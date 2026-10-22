import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as wallet from "../client/js/wallet.js";

test("wallet - armazenamento de JWK local", () => {
  localStorage.clear();
  assert.equal(wallet.hasWallet(), false);
  assert.equal(wallet.getStoredJwk(), null);

  const mockJwk = {
    kty: "RSA",
    n: "sample_n",
    e: "AQAB",
    d: "sample_d",
  };

  wallet.saveJwk(mockJwk);
  assert.equal(wallet.hasWallet(), true);
  assert.deepEqual(wallet.getStoredJwk(), mockJwk);

  wallet.removeWallet();
  assert.equal(wallet.hasWallet(), false);
  assert.equal(wallet.getStoredJwk(), null);
});

test("wallet - validação de entrada inválida", () => {
  assert.throws(() => wallet.saveJwk(null), /JWK inválido/);
  assert.throws(() => wallet.saveJwk("string_invalida"), /JWK inválido/);
});
