import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { bskyClientConfig, appBaseUrl, dpopProof, b64url, BSKY_SCOPE } from "../client/js/bsky-oauth.js";
import { buildAuthorizeUrl, OAUTH_PROVIDERS } from "../client/js/social-login.js";
import { buildBskyClientMetadata, resolveSiteUrl } from "../tools/write-oauth-deploy-config.mjs";

const linked = await import("../client/js/linked-accounts.js");
const linkedUi = await import("../client/js/render/linked-accounts-ui.js");

const loc = (href) => new URL(href);

test("bluesky oauth — loopback em dev e metadados publicados em produção", () => {
  const dev = bskyClientConfig(loc("http://localhost:5175/"));
  assert.equal(dev.redirectUri, "http://127.0.0.1:5175/oauth-callback.html");
  assert.ok(dev.clientId.startsWith("http://localhost?redirect_uri="));
  assert.ok(dev.clientId.includes(encodeURIComponent(BSKY_SCOPE)));
  const prod = bskyClientConfig(loc("https://yurikayel.github.io/vox/index.html"));
  assert.equal(appBaseUrl(loc("https://yurikayel.github.io/vox/index.html")), "https://yurikayel.github.io/vox/");
  assert.equal(prod.clientId, "https://yurikayel.github.io/vox/oauth/bsky-client-metadata.json");
  assert.equal(prod.redirectUri, "https://yurikayel.github.io/vox/oauth-callback.html");
});

test("bluesky oauth — metadados do deploy batem com o client_id e redirect do cliente", () => {
  const site = resolveSiteUrl({ GITHUB_REPOSITORY: "yurikayel/vox" });
  const meta = buildBskyClientMetadata(site);
  const prod = bskyClientConfig(loc(site));
  assert.equal(meta.client_id, prod.clientId);
  assert.deepEqual(meta.redirect_uris, [prod.redirectUri]);
  assert.equal(meta.dpop_bound_access_tokens, true);
  assert.equal(meta.token_endpoint_auth_method, "none");
  assert.equal(resolveSiteUrl({ VOX_SITE_URL: "https://vox.org" }), "https://vox.org/");
});

test("bluesky oauth — prova DPoP ES256 com htm/htu/nonce/ath e assinatura válida", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = { privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey), publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey) };
  const jwt = await dpopProof(keys, "POST", "https://bsky.social/oauth/par?x=1", { nonce: "n1", accessToken: "tok" });
  const [h, p, sig] = jwt.split(".");
  const dec = (s) => JSON.parse(Buffer.from(s, "base64url").toString());
  assert.equal(dec(h).typ, "dpop+jwt");
  assert.equal(dec(h).jwk.d, undefined, "chave privada nunca vai no header");
  assert.equal(dec(p).htu, "https://bsky.social/oauth/par");
  assert.equal(dec(p).nonce, "n1");
  assert.equal(dec(p).ath, b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tok"))));
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  assert.equal(ok, true);
});

test("login social — URL de autorização com PKCE e parâmetro de id de cada rede", () => {
  const url = new URL(buildAuthorizeUrl("tiktok", { clientId: "ck", redirectUri: "https://v/cb", state: "s", challenge: "c" }));
  assert.equal(url.searchParams.get("client_key"), "ck");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const x = new URL(buildAuthorizeUrl("twitter", { clientId: "xid", redirectUri: "https://v/cb", state: "s", challenge: "c" }));
  assert.equal(x.searchParams.get("client_id"), "xid");
  assert.ok(OAUTH_PROVIDERS.instagram.note.includes("profissionais"));
});

test("login social — conta conectada por login (sem @ no Facebook) persiste e mostra o nome", () => {
  localStorage.clear();
  linked.saveLinkedAccount("facebook", { handle: "", accountId: "123", displayName: "Yuri Kayel", via: "oauth", verified: true });
  linked.saveLinkedAccount("twitter", { handle: "yurix", accountId: "9", via: "oauth", verified: true });
  const acc = linked.loadLinkedAccounts();
  assert.equal(acc.facebook.displayName, "Yuri Kayel");
  assert.equal(acc.twitter.via, "oauth");
  const html = linkedUi.renderLinkedAccountsHtml();
  assert.ok(html.includes("Conectado por login como"));
  assert.ok(html.includes("Yuri Kayel"));
  assert.ok(html.includes("🟢 Verificado"));
  assert.ok(html.includes('data-login-net="bsky"'), "Bluesky sempre oferece login");
});
