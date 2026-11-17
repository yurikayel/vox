/**
 * Reconhecer o login social de uma conta do cofre local pela foto: o host vem do parser de URL,
 * nunca de trecho do texto (CodeQL js/incomplete-url-substring-sanitization).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAccountSocialKey,
  detectSocialAvatarType,
  matchesOAuthEnrichment,
} from "../client/js/account-social-match.js";

test("foto do Google e da Meta são reconhecidas pelo host", () => {
  assert.equal(detectSocialAvatarType("https://lh3.googleusercontent.com/a/foto=s96-c"), "google");
  assert.equal(detectSocialAvatarType("https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=1"), "meta");
  assert.equal(detectSocialAvatarType("https://scontent.xx.fbcdn.net/v/foto.jpg"), "meta");
  assert.equal(detectSocialAvatarType("https://graph.facebook.com/1/picture"), "meta");
});

test("nome do provedor no caminho, na consulta ou colado ao host não conta", () => {
  for (const url of [
    "https://atacante.example/?x=googleusercontent.com/foto=s96",
    "https://googleusercontent.com.atacante.example/foto=s96",
    "https://falsogoogleusercontent.com/foto=s96",
    "https://atacante.example/facebook.com/foto.jpg",
    "https://fbcdn.net.atacante.example/foto.jpg",
    "https://notfbsbx.com/foto.jpg",
    "http://lh3.googleusercontent.com/a/foto=s96",
    "não é url",
    "",
  ]) {
    assert.equal(detectSocialAvatarType(url), null, url);
  }
});

test("chave social de foto falsa não junta contas como se fossem a mesma", () => {
  const fake = { displayName: "Ana", enrichment: { avatarUrl: "https://atacante.example/?x=googleusercontent.com/f=s96" } };
  assert.equal(computeAccountSocialKey(fake), "name-av:Ana:https://atacante.example/?x=googleusercontent.com/f=s96");
  const real = { enrichment: { avatarUrl: "https://lh3.googleusercontent.com/a/f=s96" } };
  assert.equal(computeAccountSocialKey(real), "https://lh3.googleusercontent.com/a/f");
});

test("foto da Meta só casa quando é a mesma URL de um host da Meta", () => {
  const base = { cleanSub: "", cleanEmail: "", isGoogleAv: false };
  const metaAv = "https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=1";
  assert.equal(matchesOAuthEnrichment({ ...base, enrich: { avatarUrl: metaAv }, cleanAv: metaAv }), true);
  const fakeAv = "https://atacante.example/fbsbx.com/foto.jpg";
  assert.equal(matchesOAuthEnrichment({ ...base, enrich: { avatarUrl: fakeAv }, cleanAv: fakeAv }), false);
});
