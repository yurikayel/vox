/**
 * Diretório de perfis: dois cartões são a mesma pessoa pela foto de login social só quando o host da URL é do
 * Google ou da Meta (https), nunca por trecho do texto. Antes, "googleusercontent.com/" ou "fbcdn.net" em qualquer
 * parte da URL cortava o resto, e fotos diferentes de um mesmo site colidiam; a deduplicação apagava um cartão.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as profileDirectory from "../client/js/profile-directory.js";

const card = (avatarUrl) => ({ name: "Ana", avatarUrl });
const same = (a, b) => profileDirectory.isSameCardIdentity(card(a), card(b));

test("perfis - foto do Google: mesma foto em tamanhos diferentes é a mesma pessoa", () => {
  assert.equal(same("https://lh3.googleusercontent.com/a/foto=s96-c", "https://lh3.googleusercontent.com/a/foto=s120"), true);
  assert.equal(same("https://lh3.googleusercontent.com/a/foto=s96", "https://lh3.googleusercontent.com/a/outra=s96"), false);
});

test("perfis - foto da Meta: psid/asid identificam a conta; sem eles, o caminho", () => {
  const base = "https://platform-lookaside.fbsbx.com/platform/profilepic/";
  assert.equal(same(`${base}?psid=1&height=50`, `${base}?psid=1&height=50#x`), true);
  assert.equal(same(`${base}?psid=1`, `${base}?psid=2`), false);
  assert.equal(same("https://scontent.xx.fbcdn.net/v/p.jpg?oh=a", "https://scontent.xx.fbcdn.net/v/p.jpg?oh=b"), true);
});

test("perfis - trecho de domínio fora do host não une fotos diferentes", () => {
  assert.equal(same("https://atacante.example/?x=googleusercontent.com/foto=s96", "https://atacante.example/?x=googleusercontent.com/foto=s120"), false);
  assert.equal(same("https://atacante.example/a.png?u=fbcdn.net", "https://atacante.example/a.png?u=fbcdn.net&v=2"), false);
  assert.equal(same("https://googleusercontent.com.atacante.example/foto=s96", "https://googleusercontent.com.atacante.example/foto=s120"), false);
  assert.equal(same("http://lh3.googleusercontent.com/a/foto=s96", "http://lh3.googleusercontent.com/a/foto=s120"), false);
  assert.equal(same("https://example.org/ana.png", "https://example.org/ana.png"), true, "a mesma URL inteira continua igual");
  assert.equal(same("", ""), false);
});

test("perfis - poda pelo login social não apaga cartão de outro site com trecho parecido", () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  profileDirectory.setProfileCard("vx_outra_pessoa0001", { name: "Bia", avatarUrl: "https://atacante.example/?x=fbcdn.net&id=1" });
  profileDirectory.setProfileCard("vx_mesma_conta00001", { name: "Ana", avatarUrl: "https://lh3.googleusercontent.com/a/foto=s96" });
  profileDirectory.pruneCardsMatchingSocialIdentity({
    canonicalRouteId: "vx_canonica000000001",
    avatarUrl: "https://atacante.example/?x=fbcdn.net&id=2",
  });
  assert.ok(profileDirectory.getProfileCard("vx_outra_pessoa0001"), "foto diferente fica");
  profileDirectory.pruneCardsMatchingSocialIdentity({
    canonicalRouteId: "vx_canonica000000001",
    avatarUrl: "https://lh3.googleusercontent.com/a/foto=s200",
  });
  assert.equal(profileDirectory.getProfileCard("vx_mesma_conta00001"), null, "a mesma foto do Google é podada");
});
