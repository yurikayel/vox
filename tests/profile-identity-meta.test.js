import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/dom-env.js";
import * as localAccount from "../client/js/local-account.js";
import * as profileCard from "../client/js/profile-card.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as peersGossipProfile from "../client/js/peers-gossip-profile.js";
import * as renderProfile from "../client/js/render/profile.js";
import * as renderModals from "../client/js/render/oauth-modals.js";
import * as identityMeta from "../client/js/profile-identity-meta.js";
import { renderIdentityMetaPills } from "../client/js/render/profile-identity-meta.js";

function resetEnv() {
  localStorage.clear();
  localAccount.__resetForTests?.();
  profileDirectory.__resetProfileCardsForTests();
}

test("profile-identity-meta - vazio por padrão e suporta qualquer pronome incl. Jacaré", () => {
  resetEnv();
  const empty = identityMeta.getLocalIdentityMeta("vx_a");
  assert.deepEqual(empty, { pronouns: "", gender: "", orientation: "" });
  assert.equal(identityMeta.hasAnyIdentityMeta(empty), false);

  assert.ok(identityMeta.PRONOUN_PRESETS.some((p) => p.value === "Jacaré 🐊" && p.fun));
  assert.equal(identityMeta.isJokePronoun("Jacaré 🐊"), true);
  assert.equal(identityMeta.isJokePronoun("jacare"), true);
  assert.equal(identityMeta.isJokePronoun("Jacaré"), true);
  assert.equal(identityMeta.isJokePronoun("elu/delu"), false);

  identityMeta.setLocalIdentityMeta("vx_a", {
    pronouns: "  xe/xir  ",
    gender: "Não-binário",
    orientation: "Pansexual",
  });
  identityMeta.setLocalIdentityMeta("vx_b", { pronouns: "Jacaré 🐊" });

  assert.deepEqual(identityMeta.getLocalIdentityMeta("vx_a"), {
    pronouns: "xe/xir",
    gender: "Não-binário",
    orientation: "Pansexual",
  });
  assert.deepEqual(identityMeta.getLocalIdentityMeta("vx_b"), {
    pronouns: "Jacaré 🐊",
    gender: "",
    orientation: "",
  });

  identityMeta.clearLocalIdentityMeta("vx_a");
  assert.equal(identityMeta.hasAnyIdentityMeta(identityMeta.getLocalIdentityMeta("vx_a")), false);
  assert.equal(identityMeta.getLocalIdentityMeta("vx_b").pronouns, "Jacaré 🐊");
});

test("profile-identity-meta - pílulas só aparecem quando preenchidas e trazem hover claro", () => {
  assert.equal(renderIdentityMetaPills({}), "");
  const html = renderIdentityMetaPills({
    pronouns: "Jacaré 🐊",
    gender: "Homem trans",
    orientation: "Bissexual",
  });
  assert.ok(html.includes('title="Pronomes (humor): Jacaré 🐊"'));
  assert.ok(html.includes('title="Gênero: Homem trans"'));
  assert.ok(html.includes('title="Orientação sexual: Bissexual"'));
});

test("renderProfile - exibe formulário opcional na aba Sobre e pílulas no cabeçalho", () => {
  resetEnv();
  identityMeta.setLocalIdentityMeta("vx_self_id", {
    pronouns: "elu/delu",
    gender: "Gênero fluido",
    orientation: "",
  });
  const main = document.createElement("div");
  renderProfile.renderProfile(main, "vx_self_id", [], true, {
    displayName: "Alex",
    activeTab: "about",
    posts: [],
  });
  assert.ok(main.innerHTML.includes("profile-identity-pills"));
  assert.ok(main.innerHTML.includes("elu/delu"));
  assert.ok(main.innerHTML.includes("Gênero fluido"));
  assert.ok(!main.innerHTML.includes("Orientação sexual:"));
  assert.ok(main.innerHTML.includes("form-identity-meta"));
  assert.ok(main.innerHTML.includes("input-profile-gender"));
  assert.ok(main.innerHTML.includes("input-profile-orientation"));
  assert.ok(main.innerHTML.includes("Jacaré 🐊"));
});

test("profile-card & Pessoas - propaga pronomes na malha mantendo hover Conectado", async () => {
  resetEnv();
  const me = await localAccount.ensureLocalAccount();
  identityMeta.setLocalIdentityMeta(me.routeId, {
    pronouns: "ela/dela",
    gender: "Mulher cis",
    orientation: "Lésbica",
  });
  const card = await profileCard.buildSignedProfileCard({ displayName: "Marina", bio: "Oi" });
  assert.equal(card.pronouns, "ela/dela");
  assert.equal(card.gender, "Mulher cis");
  assert.equal(card.orientation, "Lésbica");

  const tags = profileCard.buildProfileCardArweaveTags(card);
  assert.equal(tags.find((t) => t.name === "Pronouns")?.value, "ela/dela");
  assert.equal(tags.find((t) => t.name === "Gender")?.value, "Mulher cis");
  assert.equal(tags.find((t) => t.name === "Orientation")?.value, "Lésbica");

  localAccount.__resetForTests();
  profileDirectory.__resetProfileCardsForTests();
  await localAccount.ensureLocalAccount();
  const applied = await peersGossipProfile.applyVerifiedProfileCardItem(card);
  assert.equal(applied, true);

  const resolved = await profileDirectory.resolveProfile(me.routeId);
  assert.equal(resolved.pronouns, "ela/dela");
  assert.equal(resolved.gender, "Mulher cis");
  assert.equal(resolved.orientation, "Lésbica");

  const main = document.createElement("div");
  main.innerHTML = renderModals.resolvePeopleSearchBody(
    { contacts: [], mesh: [{ routeId: me.routeId, name: "Marina", pronouns: "ela/dela", source: "mesh-card" }], tour: [] },
    [],
    ""
  );
  assert.ok(main.innerHTML.includes('title="Conectado"'));
  assert.ok(main.innerHTML.includes("🔗🟢"));
  assert.ok(main.innerHTML.includes('title="Pronomes">ela/dela</span>'));
});
