/**
 * @file Testes Tier A para convergência multi-aparelho de comunidades seguidas e listas locais no backup/restore (PM-13).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "./setup.js";
import * as backup from "../client/js/identity/inbox-backup.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as keyLock from "../client/js/identity/key-lock.js";

const SENHA = "senha soberana comunidades listas 2026";

/** Limpa completamente o estado do aparelho simulado. */
function wipeDevice() {
  localStorage.clear();
  for (const store of mockStores.values()) store.map?.clear();
  keyLock.__resetKeyLockForTests?.();
}

/** Cria um envelope de backup customizado (ex.: legado sem campos novos ou com payload inválido). */
async function buildCustomEnvelope(content) {
  const baseText = (await backup.buildInboxBackup("completo", 5000)).text;
  const envelope = JSON.parse(baseText);
  const stateKey = `vox-inbox-backup-v1:${localAccount.getCachedRouteIdSync()}`;
  const state = JSON.parse(localStorage.getItem(stateKey));
  const sealed = await cryptoDm.seal(state.backupPub, JSON.stringify(content));
  return JSON.stringify({ ...envelope, sealed });
}

test("PM-13: export e restore preservam comunidades seguidas e listas locais cifradas no backup", async () => {
  wipeDevice();
  await localAccount.ensureLocalAccount();
  backup.mergeStoredFollowedCommunities([
    { communityId: "com_b", editedAt: 1000, deleted: false },
    { communityId: "com_a", editedAt: 1100, deleted: false, sig: "sig_a" },
  ]);
  backup.mergeStoredLocalLists([
    { id: "list_fav", name: "Favoritos", items: ["p2", "p1", "p1"], editedAt: 1200, deleted: false },
  ]);
  await backup.enableInboxBackup(SENHA);

  const built = await backup.buildInboxBackup("completo", 1500);
  assert.equal(built.text.includes("com_a"), false, "comunidades seguidas vão cifradas");
  assert.equal(built.text.includes("list_fav"), false, "listas locais vão cifradas");

  wipeDevice();
  await backup.restoreInboxBackup(built.text, SENHA);
  assert.deepEqual(backup.readFollowedCommunities(), [
    { communityId: "com_a", editedAt: 1100, deleted: false, sig: "sig_a" },
    { communityId: "com_b", editedAt: 1000, deleted: false },
  ]);
  assert.deepEqual(backup.readLocalLists(), [
    { id: "list_fav", name: "Favoritos", items: ["p1", "p2"], editedAt: 1200, deleted: false },
  ]);
});

/** Produz backups de dois aparelhos divergentes sobre a mesma conta para testar convergência. */
async function buildDivergentDeviceBackups() {
  wipeDevice();
  await localAccount.ensureLocalAccount();
  await backup.enableInboxBackup(SENHA);
  backup.mergeStoredFollowedCommunities([
    { communityId: "com_a", editedAt: 1000, deleted: false },
    { communityId: "com_shared", editedAt: 1000, deleted: false },
  ]);
  backup.mergeStoredLocalLists([
    { id: "list_a", name: "Do celular", items: ["p1"], editedAt: 1000, deleted: false },
    { id: "list_shared", name: "Leitura v1", items: ["p1"], editedAt: 1000, deleted: false },
  ]);
  const backupA = await backup.buildInboxBackup("completo", 1500);

  wipeDevice();
  await backup.restoreInboxBackup(backupA.text, SENHA);
  localStorage.removeItem(backup.FOLLOWED_COMMUNITIES_KEY);
  localStorage.removeItem(backup.LOCAL_LISTS_KEY);
  backup.mergeStoredFollowedCommunities([
    { communityId: "com_b", editedAt: 2000, deleted: false },
    { communityId: "com_shared", editedAt: 2000, deleted: false },
  ]);
  backup.mergeStoredLocalLists([
    { id: "list_b", name: "Do notebook", items: ["p9"], editedAt: 2000, deleted: false },
    { id: "list_shared", name: "Leitura v2", items: ["p2", "p1"], editedAt: 2100, deleted: false },
  ]);
  const backupB = await backup.buildInboxBackup("completo", 2500);
  return { backupA, backupB };
}

test("PM-13: restore multi-aparelho converge comunidades e listas de forma comutativa e idempotente", async () => {
  const { backupA, backupB } = await buildDivergentDeviceBackups();

  wipeDevice();
  await backup.restoreInboxBackup(backupA.text, SENHA);
  await backup.restoreInboxBackup(backupB.text, SENHA);
  const commAB = backup.readFollowedCommunities();
  const listsAB = backup.readLocalLists();

  wipeDevice();
  await backup.restoreInboxBackup(backupB.text, SENHA);
  await backup.restoreInboxBackup(backupA.text, SENHA);
  const commBA = backup.readFollowedCommunities();
  const listsBA = backup.readLocalLists();

  assert.deepEqual(commAB, commBA, "convergência comutativa de comunidades seguidas");
  assert.deepEqual(listsAB, listsBA, "convergência comutativa de listas locais");
  assert.deepEqual(commAB.map((c) => c.communityId), ["com_a", "com_b", "com_shared"]);
  assert.deepEqual(listsAB, [
    { id: "list_a", name: "Do celular", items: ["p1"], editedAt: 1000, deleted: false },
    { id: "list_b", name: "Do notebook", items: ["p9"], editedAt: 2000, deleted: false },
    { id: "list_shared", name: "Leitura v2", items: ["p1", "p2"], editedAt: 2100, deleted: false },
  ]);

  await backup.restoreInboxBackup(backupB.text, SENHA);
  assert.deepEqual(backup.readFollowedCommunities(), commAB);
  assert.deepEqual(backup.readLocalLists(), listsAB);
});

test("PM-13: tombstones datados mais novos vencem inscrições/listas antigas em qualquer ordem e re-adição mais nova vence", async () => {
  wipeDevice();
  await localAccount.ensureLocalAccount();
  backup.mergeStoredFollowedCommunities([
    { communityId: "com_manter", editedAt: 1000, deleted: false },
    { communityId: "com_sair", editedAt: 1100, deleted: false },
  ]);
  backup.mergeStoredLocalLists([
    { id: "list_manter", name: "Manter", items: ["x"], editedAt: 1000, deleted: false },
    { id: "list_apagar", name: "Apagar", items: ["y"], editedAt: 1100, deleted: false },
  ]);
  await backup.enableInboxBackup(SENHA);
  const backupAntigo = await backup.buildInboxBackup("completo", 1200);

  // Novo aparelho/estado remove com_sair e list_apagar com tombstones mais novos.
  backup.mergeStoredFollowedCommunities([{ communityId: "com_sair", deleted: true, deletedAt: 2000, editedAt: 2000 }]);
  backup.mergeStoredLocalLists([{ id: "list_apagar", deleted: true, deletedAt: 2000, editedAt: 2000 }]);
  const backupRemocao = await backup.buildInboxBackup("completo", 2200);

  // Ordem reversa: restaura remoção primeiro, depois backup antigo -> tombstones impedem ressurreição.
  wipeDevice();
  await backup.restoreInboxBackup(backupRemocao.text, SENHA);
  await backup.restoreInboxBackup(backupAntigo.text, SENHA);
  assert.deepEqual(backup.readFollowedCommunities(), [
    { communityId: "com_manter", editedAt: 1000, deleted: false },
    { communityId: "com_sair", editedAt: 2000, deleted: true, deletedAt: 2000 },
  ]);
  assert.deepEqual(backup.readLocalLists(), [
    { id: "list_apagar", name: "", items: [], editedAt: 2000, deleted: true, deletedAt: 2000 },
    { id: "list_manter", name: "Manter", items: ["x"], editedAt: 1000, deleted: false },
  ]);

  // Re-inscrição / re-criação mais nova (3000) vence o tombstone de 2000.
  backup.mergeStoredFollowedCommunities([{ communityId: "com_sair", editedAt: 3000, deleted: false }]);
  backup.mergeStoredLocalLists([{ id: "list_apagar", name: "Voltou", items: ["z"], editedAt: 3000, deleted: false }]);
  assert.equal(backup.readFollowedCommunities().find((c) => c.communityId === "com_sair")?.deleted, false);
  assert.equal(backup.readLocalLists().find((l) => l.id === "list_apagar")?.deleted, false);
  assert.equal(backup.readLocalLists().find((l) => l.id === "list_apagar")?.name, "Voltou");
});

test("PM-13: retrocompatibilidade com backup legado sem followedCommunities nem localLists", async () => {
  wipeDevice();
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Legado");
  await backup.enableInboxBackup(SENHA);
  const legacyText = await buildCustomEnvelope({
    profile: { displayName: "Legado" },
    contacts: [],
    postEntries: [],
    tombstones: [],
    dms: [],
  });

  // Em aparelho limpo, restaurar backup legado não cria chaves novas no localStorage.
  wipeDevice();
  await backup.restoreInboxBackup(legacyText, SENHA);
  assert.equal(localAccount.getDisplayName(), "Legado");
  assert.equal(localStorage.getItem(backup.FOLLOWED_COMMUNITIES_KEY), null);
  assert.equal(localStorage.getItem(backup.LOCAL_LISTS_KEY), null);
  assert.deepEqual(backup.readFollowedCommunities(), []);
  assert.deepEqual(backup.readLocalLists(), []);

  // Em aparelho com dados existentes, restaurar backup legado preserva tudo que já existe.
  backup.mergeStoredFollowedCommunities([{ communityId: "com_local", editedAt: 500, deleted: false }]);
  backup.mergeStoredLocalLists([{ id: "list_local", name: "Local", items: ["a"], editedAt: 500, deleted: false }]);
  await backup.restoreInboxBackup(legacyText, SENHA);
  assert.deepEqual(backup.readFollowedCommunities(), [{ communityId: "com_local", editedAt: 500, deleted: false }]);
  assert.deepEqual(backup.readLocalLists(), [{ id: "list_local", name: "Local", items: ["a"], editedAt: 500, deleted: false }]);
});

test("PM-13: resiste a storage corrompido, tipos não-array e entradas inválidas no envelope", async () => {
  wipeDevice();
  await localAccount.ensureLocalAccount();
  await backup.enableInboxBackup(SENHA);

  // Storage com JSON corrompido ou não-array devolve lista vazia sem lançar.
  localStorage.setItem(backup.FOLLOWED_COMMUNITIES_KEY, "{invalido");
  localStorage.setItem(backup.LOCAL_LISTS_KEY, '{"nao":"array"}');
  assert.deepEqual(backup.readFollowedCommunities(), []);
  assert.deepEqual(backup.readLocalLists(), []);

  // Envelope com campos de tipo inválido (não-array) é ignorado sem sobrescrever chaves locais.
  const badTypesText = await buildCustomEnvelope({
    profile: {},
    followedCommunities: "invalido",
    localLists: { not: "array" },
  });
  wipeDevice();
  await backup.restoreInboxBackup(badTypesText, SENHA);
  assert.equal(localStorage.getItem(backup.FOLLOWED_COMMUNITIES_KEY), null);
  assert.equal(localStorage.getItem(backup.LOCAL_LISTS_KEY), null);

  // Envelope com entradas inválidas misturadas a válidas descarta lixo e converge os válidos.
  const mixedText = await buildCustomEnvelope({
    profile: {},
    followedCommunities: [null, 42, { communityId: "  " }, " geral ", { id: "dev", editedAt: 100 }],
    localLists: [null, "lixo", { id: "  " }, { id: "l1", name: " Boas ", items: ["b", "a", null, 7], editedAt: 150 }],
  });
  wipeDevice();
  await backup.restoreInboxBackup(mixedText, SENHA);
  assert.deepEqual(backup.readFollowedCommunities(), [
    { communityId: "dev", editedAt: 100, deleted: false },
    { communityId: "geral", editedAt: 0, deleted: false },
  ]);
  assert.deepEqual(backup.readLocalLists(), [
    { id: "l1", name: "Boas", items: ["7", "a", "b"], editedAt: 150, deleted: false },
  ]);
});
