/**
 * @file Cartão de perfil que chega de fora (memória central e sincronização da malha) só entra assinado pelo dono.
 * Cobre `applyDirectoryProfileCard` e a validação antes do vencimento em `applyVerifiedProfileCardItem`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as centralMemory from "../client/js/central-memory.js";
import * as profileCard from "../client/js/profile-card.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as gossipProfile from "../client/js/peers-gossip-profile.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { person } from "./signer.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const fresh = () => {
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
};

/** Cartão assinado por `who`; `fields` sobrescreve o corpo (ex.: outro `routeId` ou data antiga). */
const signedCard = (who, displayName, fields = {}) =>
  who.sign({
    id: `pc_${who.routeId}`,
    type: "profile-card",
    routeId: who.routeId,
    displayName,
    avatarUrl: "",
    bio: "",
    discoverable: true,
    editedAt: Date.now(),
    ...fields,
  });

/** Sincroniza com uma memória central falsa que devolve `profiles`. */
async function hydrateFromCentralMemory(profiles) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (!String(url).endsWith("/memory/sync")) return { ok: false };
    return { ok: true, json: async () => ({ status: "ok", revision: 1, posts: [], tombstones: [], profiles }) };
  };
  try {
    return await centralMemory.syncWithCentralMemory();
  } finally {
    globalThis.fetch = originalFetch;
    centralMemory.setCentralMemoryAutoPush(false);
  }
}

test("assinatura - memória central: cartão sem assinatura não renomeia ninguém", async () => {
  fresh();
  const dono = await person();
  await gossipProfile.applyVerifiedProfileCardItem(await signedCard(dono, "Nome Verdadeiro"));
  await hydrateFromCentralMemory([{ routeId: dono.routeId, name: "Nome Trocado", updatedAt: Date.now() + DAY_MS }]);
  assert.equal(profileDirectory.getProfileCard(dono.routeId).name, "Nome Verdadeiro");
  await hydrateFromCentralMemory([{ routeId: "vx_semassinatura01", name: "Alguém" }]);
  assert.equal(profileDirectory.getProfileCard("vx_semassinatura01"), null);
});

test("assinatura - malha: PROFILE_CARD sem cartão assinado é ignorado", async () => {
  fresh();
  const applied = await gossipProfile.applyDirectoryProfileCard({ routeId: "vx_semassinatura02", name: "Bia", discoverable: true });
  assert.equal(applied, false);
  assert.equal(profileDirectory.getProfileCard("vx_semassinatura02"), null);
});

test("assinatura - cartão assinado de outra conta não vale para este routeId", async () => {
  fresh();
  const [a, b] = [await person(), await person()];
  const applied = await gossipProfile.applyDirectoryProfileCard({ routeId: b.routeId, signedCard: await signedCard(a, "Ana") });
  assert.equal(applied, false);
  assert.equal(profileDirectory.getProfileCard(b.routeId), null);
});

test("assinatura - cartão assinado e depois alterado é recusado", async () => {
  fresh();
  const dono = await person();
  const card = await signedCard(dono, "Original");
  const applied = await gossipProfile.applyDirectoryProfileCard({ routeId: dono.routeId, signedCard: { ...card, displayName: "Alterado" } });
  assert.equal(applied, false);
  assert.equal(profileDirectory.getProfileCard(dono.routeId), null);
});

test("assinatura - cartão vencido assinado por A com o routeId de B não apaga o cartão de B", async () => {
  fresh();
  const [a, b] = [await person(), await person()];
  // B só é conhecida pelos posts (sem marca de cartão), então o cartão forjado não é barrado como "já visto".
  profileDirectory.setProfileCard(b.routeId, { name: "Bia", discoverable: true });
  const forged = await signedCard(a, "", { id: `pc_${b.routeId}`, routeId: b.routeId, editedAt: Date.now() - 40 * DAY_MS });
  assert.equal(await gossipProfile.applyVerifiedProfileCardItem(forged), false);
  assert.equal(profileDirectory.getProfileCard(b.routeId).name, "Bia");
});

test("assinatura - cartão assinado válido entra pela memória central e pela malha", async () => {
  fresh();
  const [viaMemoria, viaMalha] = [await person(), await person()];
  const result = await hydrateFromCentralMemory([{ routeId: viaMemoria.routeId, signedCard: await signedCard(viaMemoria, "Caio") }]);
  assert.equal(result.hydratedCount, 1);
  assert.equal(profileDirectory.getProfileCard(viaMemoria.routeId).name, "Caio");
  const applied = await gossipProfile.applyDirectoryProfileCard({ routeId: viaMalha.routeId, signedCard: await signedCard(viaMalha, "Duda") });
  assert.equal(applied, true);
  assert.equal(profileDirectory.getProfileCard(viaMalha.routeId).name, "Duda");
});

test("assinatura - o cartão do próprio aparelho sai com o cartão assinado, que confere depois de viajar", async () => {
  fresh();
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Eva da Praça");
  const own = await profileCard.buildSignedProfileCard();
  await gossipProfile.applyVerifiedProfileCardItem(own);
  const shared = profileDirectory.listShareableProfileCards().find((c) => c.routeId === acc.routeId);
  assert.ok(shared?.signedCard, "o cartão compartilhado leva a versão assinada");
  // Depois de viajar como JSON, a assinatura ainda confere e o cartão é o do dono.
  const received = JSON.parse(JSON.stringify(shared)).signedCard;
  assert.equal(await localAccount.verifyPayload(received), true);
  assert.equal(received.routeId, acc.routeId);
  assert.equal(received.displayName, "Eva da Praça");
});
