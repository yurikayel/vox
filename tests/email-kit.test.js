/**
 * ADR-032 §6.4–§6.8 — kit de retorno por e-mail (`mailto:`), extração de `#/sync?b=…` / `VOX1:…`,
 * teto de 2.000 caracteres e registro local da frase opcional em Perfil → Soberania.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as vaultCrypto from "../client/js/vault-crypto.js";
import * as accountExit from "../client/js/account-exit.js";
import * as emailKit from "../client/js/email-kit.js";
import { renderProfileTabContent } from "../client/js/render/profile.js";

const PASS = "minha senha soberana 12";
const PHRASE_12 = "abacate acender acordo adepto adiar afago agora aguia ainda ajudar aluno amigo";

function stubOfflineFetch() {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  return () => {
    globalThis.fetch = orig;
  };
}

test("email-kit: nunca inclui a senha e só inclui a frase quando a caixa está marcada (§6.4)", async () => {
  const rec = await vaultCrypto.encryptVaultV2({ routeId: "vx_1", seed: "AAAAAAAAAAAAAAAAAAAAAA" }, PASS, undefined, "ana@exemplo.com");
  const encoded = vaultCrypto.encodeVaultBundleForUrl(rec);
  const common = { email: "  Ana@Exemplo.com ", displayName: "Ana", routeId: "vx_1", encodedVault: encoded, phrase: PHRASE_12, baseUrl: "https://vox.app/" };

  const withoutPhrase = emailKit.buildEmailKit({ ...common, includePhrase: false });
  assert.equal(withoutPhrase.to, "ana@exemplo.com");
  assert.equal(withoutPhrase.includePhrase, false);
  assert.ok(!withoutPhrase.body.includes(PASS), "a senha nunca pode ir no corpo");
  assert.ok(!withoutPhrase.mailtoUrl.includes(encodeURIComponent(PASS)), "a senha nunca pode ir no mailto:");
  assert.ok(!withoutPhrase.body.includes(PHRASE_12), "com caixa desmarcada, a frase não vai");
  assert.ok(withoutPhrase.mailtoUrl.length < 1500, `mailto com semente deve caber folgado (<1500, deu ${withoutPhrase.mailtoUrl.length})`);

  const withPhrase = emailKit.buildEmailKit({ ...common, includePhrase: true });
  assert.equal(withPhrase.includePhrase, true);
  assert.ok(withPhrase.body.includes(PHRASE_12));
  assert.ok(!withPhrase.body.includes(PASS));
  assert.ok(withPhrase.mailtoUrl.length < 2000);
});

test("email-kit: omite cópia dupla no mailto: de payload antigo grande mantendo < 2.000 chars (§6.7)", () => {
  const bigEncoded = `v2.${"A".repeat(1300)}`;
  const kit = emailKit.buildEmailKit({ email: "antigo@exemplo.com", displayName: "Antigo", routeId: "vx_old", encodedVault: bigEncoded, baseUrl: "https://vox.app/" });
  assert.equal(kit.truncatedForMailto, true);
  assert.ok(kit.mailtoUrl.length < 2000, `mailto grande passou de 2000 chars: ${kit.mailtoUrl.length}`);
  assert.ok(kit.body.includes(kit.syncUrl) && kit.body.includes(kit.kitCode), "copiar/baixar mantém link e VOX1:");
});

test("email-kit: cria cofre por e-mail/senha, corrige e-mail revogando o anterior e registra frase no Perfil", async () => {
  localStorage.clear();
  localAccount.wipeLocalAccount();
  const restoreFetch = stubOfflineFetch();
  try {
    const draftState = { email: "", pass: "" };
    const first = await emailKit.createEmailAccountKit({ rawName: "Bia", email: "errado@exemplo.com", pass: PASS, includePhrase: true, draftState });
    assert.equal(first.ok, true);
    assert.ok(emailKit.formatPhraseSentInEmailNotice(first.routeId).includes("Frase enviada por e-mail"));
    const aboutWithNotice = renderProfileTabContent("about", { address: first.routeId, isCurrentWallet: true });
    assert.ok(aboutWithNotice.includes("phrase-in-email-notice"));

    const wrongAddr = await vaultCrypto.deriveVaultAddress(PASS, "errado@exemplo.com");
    const fixed = await emailKit.createEmailAccountKit({ rawName: "Bia", email: "certo@exemplo.com", pass: PASS, includePhrase: false, draftState });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.routeId, first.routeId);
    assert.equal(localStorage.getItem(`vox-vault-v2:${wrongAddr}`), null, "endereço anterior removido localmente");
    assert.equal(emailKit.formatPhraseSentInEmailNotice(fixed.routeId), "", "aviso limpo ao desmarcar a frase");
  } finally {
    restoreFetch();
  }
});

test("email-kit: extrai e restaura conta a partir de link #/sync?b=…, VOX1:… ou corpo inteiro do e-mail (§6.3.8)", async () => {
  localStorage.clear();
  localAccount.wipeLocalAccount();
  const restoreFetch = stubOfflineFetch();
  try {
    const draftState = { email: "", pass: "" };
    const created = await emailKit.createEmailAccountKit({ rawName: "Caio", email: "caio@exemplo.com", pass: PASS, includePhrase: false, draftState });
    const { syncUrl, kitCode, body } = created.kit;

    for (const pasted of [syncUrl, kitCode, body]) {
      localStorage.clear();
      localAccount.wipeLocalAccount();
      const res = await emailKit.restoreAccountFromInputs({ email: "caio@exemplo.com", pass: PASS, kitText: pasted });
      assert.equal(res.ok, true, `falhou ao restaurar com trecho colado: ${pasted.slice(0, 24)}`);
      assert.equal(res.routeId, created.routeId);
      assert.ok(accountExit.getAccountExits(created.routeId).email, "marca saída por e-mail após restaurar");
    }

    const badKit = await emailKit.restoreAccountFromInputs({ email: "caio@exemplo.com", pass: PASS, kitText: "texto qualquer sem código" });
    assert.equal(badKit.ok, false);
  } finally {
    restoreFetch();
  }
});

test("email-kit: validateEmailEntry aceita entrada só com nome e valida e-mail + 12 caracteres (§6.2)", () => {
  assert.notEqual(emailKit.validateEmailEntry({ rawName: "", email: "", pass: "" }), "");
  assert.equal(emailKit.validateEmailEntry({ rawName: "Duda", email: "", pass: "" }), "");
  assert.notEqual(emailKit.validateEmailEntry({ rawName: "Duda", email: "sem-arroba", pass: PASS }), "");
  assert.notEqual(emailKit.validateEmailEntry({ rawName: "Duda", email: "duda@exemplo.com", pass: "curta" }), "");
  assert.equal(emailKit.validateEmailEntry({ rawName: "Duda", email: "duda@exemplo.com", pass: PASS }), "");
});
