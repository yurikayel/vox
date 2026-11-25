/**
 * @file Testes Tier A para `shared/device-merge`, integração em `contacts` e restore multi-aparelho em `inbox-backup`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "./setup.js";
import {
  isDeviceTombstone,
  mergeContactLists,
  mergeDeviceRecords,
  mergeFollowedCommunities,
  mergeLocalLists,
} from "../client/js/shared/device-merge.js";
import * as contacts from "../client/js/contacts.js";
import * as backup from "../client/js/identity/inbox-backup.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as keyLock from "../client/js/identity/key-lock.js";

/** PRNG determinístico (Mulberry32) com semente fixa para testes de propriedade algébrica. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gera coleções sintéticas determinísticas para testar comutatividade, associatividade e idempotência. */
function genRecords(rng, kind, count) {
  const keys = ["k1", "k2", "k3", "k4", "k5"];
  const sigs = ["", "sig_a", "sig_b", "sig_c"];
  const out = [];
  for (let i = 0; i < count; i++) {
    const id = keys[Math.floor(rng() * keys.length)];
    const ts = Math.floor(rng() * 6) * 100;
    const deleted = rng() < 0.35;
    const sig = sigs[Math.floor(rng() * sigs.length)];
    if (kind === "contact") {
      out.push(deleted ? { routeId: id, deleted: true, deletedAt: ts, sig } : { routeId: id, label: `N${i}`, addedAt: ts, editedAt: ts, sig });
    } else if (kind === "community") {
      out.push(deleted ? { communityId: id, removed: true, deletedAt: ts, sig } : { communityId: id, editedAt: ts, sig });
    } else if (kind === "list") {
      out.push(deleted ? { id, deleted: true, editedAt: ts, sig } : { id, name: `L${i}`, items: [`p${i % 3}`, "p0"], editedAt: ts, sig });
    } else {
      out.push({ id, editedAt: ts, sig, deleted, meta: { tag: `t${i % 2}`, n: i % 3 } });
    }
  }
  return out;
}

/** Verifica as três leis de semireticulado (comutatividade, associatividade e idempotência). */
function assertSemilattice(mergeFn, kind, seed) {
  const rng = mulberry32(seed);
  for (let round = 0; round < 30; round++) {
    const a = genRecords(rng, kind, 6);
    const b = genRecords(rng, kind, 6);
    const c = genRecords(rng, kind, 6);
    const ab = mergeFn(a, b);
    const ba = mergeFn(b, a);
    assert.deepEqual(ab, ba, `${kind} rodada ${round}: comutatividade`);
    assert.deepEqual(mergeFn(ab, c), mergeFn(a, mergeFn(b, c)), `${kind} rodada ${round}: associatividade`);
    assert.deepEqual(mergeFn(a, a), mergeFn(a, []), `${kind} rodada ${round}: idempotência (a,a)`);
    assert.deepEqual(mergeFn(ab, ab), ab, `${kind} rodada ${round}: idempotência (ab,ab)`);
  }
}

test("propriedades algébricas (semente fixa): mergeDeviceRecords, contatos, comunidades e listas", () => {
  assertSemilattice((x, y) => mergeDeviceRecords(x, y, (r) => r.id), "raw", 202601);
  assertSemilattice(mergeContactLists, "contact", 202602);
  assertSemilattice(mergeFollowedCommunities, "community", 202603);
  assertSemilattice(mergeLocalLists, "list", 202604);
});

test("isDeviceTombstone reconhece deleted, removed e deletedAt > 0 e ignora inválidos", () => {
  assert.equal(isDeviceTombstone({ deleted: true }), true);
  assert.equal(isDeviceTombstone({ removed: true }), true);
  assert.equal(isDeviceTombstone({ deletedAt: 100 }), true);
  assert.equal(isDeviceTombstone({ deleted: false, removed: false, deletedAt: 0 }), false);
  assert.equal(isDeviceTombstone({ deletedAt: Number.NaN }), false);
  assert.equal(isDeviceTombstone(null), false);
  assert.equal(isDeviceTombstone([]), false);
  assert.equal(isDeviceTombstone("deleted"), false);
});

test("mergeDeviceRecords: LWW (Math.max de ts finitos), desempate determinístico e ordem de chaves", () => {
  const old = { id: "b", ts: 100, sig: "z", v: "old" };
  const newer = { id: "b", editedAt: 200, ts: 50, sig: "a", v: "new" };
  // Math.max(editedAt=0, ts=9999)=9999 vence Math.max(ts=1)=1
  const highTs = { id: "a", editedAt: 0, ts: 9999, sig: "z", v: "zero" };
  const lowTs = { id: "a", ts: 1, sig: "a", v: "one" };
  const res = mergeDeviceRecords([old, highTs], [newer, lowTs]);
  assert.deepEqual(res.map((r) => [r.id, r.v]), [["a", "zero"], ["b", "new"]]);
  assert.deepEqual(mergeDeviceRecords([newer, lowTs], [old, highTs]), res);
});

test("mergeDeviceRecords: empate em timestamp decide por sig, tombstone e payload canônico independente da ordem", () => {
  const sigLow = { id: "x", editedAt: 500, sig: "sig_1", label: "low" };
  const sigHigh = { id: "x", editedAt: 500, sig: "sig_9", label: "high" };
  assert.equal(mergeDeviceRecords([sigLow], [sigHigh])[0].sig, "sig_9");
  assert.equal(mergeDeviceRecords([sigHigh], [sigLow])[0].sig, "sig_9");

  const alive = { id: "y", editedAt: 500, deleted: false, extra: { b: 2, a: 1 } };
  const tomb = { id: "y", editedAt: 500, deleted: true, deletedAt: 500 };
  assert.equal(mergeDeviceRecords([alive], [tomb])[0].deleted, true);
  assert.equal(mergeDeviceRecords([tomb], [alive])[0].deleted, true);

  const p1 = { id: "z", editedAt: 500, data: { b: 2, a: 1 }, tags: ["x"] };
  const p2 = { id: "z", editedAt: 500, data: { a: 1, b: 3 }, tags: ["x"] };
  assert.deepEqual(mergeDeviceRecords([p1], [p2]), mergeDeviceRecords([p2], [p1]));
});

test("tombstone com deletedAt > editedAt vence vivo intermediário (não ressuscita)", () => {
  const tomb = { routeId: "vx_a", editedAt: 1000, deleted: true, deletedAt: 2000 };
  const live = { routeId: "vx_a", label: "Vivo", addedAt: 1500, editedAt: 1500, deleted: false };
  const ab = mergeContactLists([tomb], [live]);
  const ba = mergeContactLists([live], [tomb]);
  assert.equal(ab.length, 1);
  assert.equal(ab[0].deleted, true);
  assert.equal(ab[0].deletedAt, 2000);
  assert.deepEqual(ab, ba);
});

test("tombstones datados mais novos vencem adição antiga e re-adição mais nova vence tombstone antigo", () => {
  const added = { routeId: "vx_ana", label: "Ana", addedAt: 100, editedAt: 100, deleted: false };
  const removed = { routeId: "vx_ana", deleted: true, deletedAt: 200, editedAt: 200 };
  const reAdded = { routeId: "vx_ana", label: "Ana voltou", addedAt: 300, editedAt: 300, deleted: false };

  const afterRemove = mergeContactLists([added], [removed]);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].deleted, true);
  assert.equal(afterRemove[0].deletedAt, 200);
  assert.deepEqual(mergeContactLists([removed], [added]), afterRemove);

  const afterReAdd = mergeContactLists(afterRemove, [reAdded]);
  assert.equal(afterReAdd[0].deleted, false);
  assert.equal(afterReAdd[0].label, "Ana voltou");
  assert.deepEqual(mergeContactLists([reAdded], afterRemove), afterReAdd);
});

test("mergeContactLists, mergeFollowedCommunities e mergeLocalLists resistem a entradas inválidas", () => {
  assert.deepEqual(mergeContactLists(null, [null, 42, [], { routeId: "  " }, { routeId: "vx_ok", label: " Ok ", addedAt: 10 }]), [
    { routeId: "vx_ok", label: "Ok", addedAt: 10, editedAt: 10, deleted: false },
  ]);

  const comm = mergeFollowedCommunities([" geral ", "", null, { id: "dev", editedAt: 10 }], [{ communityId: "dev", removed: true, deletedAt: 20 }]);
  assert.deepEqual(comm, [
    { communityId: "dev", editedAt: 20, deleted: true, deletedAt: 20 },
    { communityId: "geral", editedAt: 0, deleted: false },
  ]);

  const lists = mergeLocalLists(
    [null, { id: "  " }, { id: "l1", name: "Favoritos", items: ["b", "a", "a", 7, null, " "], editedAt: 50 }],
    [{ id: "l1", name: "Favoritos v2", items: ["c", "a"], editedAt: 80 }, { id: "l2", deleted: true, deletedAt: 90 }],
  );
  assert.deepEqual(lists, [
    { id: "l1", name: "Favoritos v2", items: ["a", "c"], editedAt: 80, deleted: false },
    { id: "l2", name: "", items: [], editedAt: 90, deleted: true, deletedAt: 90 },
  ]);
  assert.deepEqual(mergeDeviceRecords("invalido", [{ id: "ok", editedAt: Number.POSITIVE_INFINITY }, { id: "" }]), [
    { id: "ok", editedAt: Number.POSITIVE_INFINITY },
  ]);
});

test("normalização de timestamps fallback, preservação de sig não-vazio e itens numéricos em listas", () => {
  const c = mergeContactLists(
    [{ routeId: "vx_1", label: "Um", editedAt: 150, sig: "" }],
    [{ routeId: "vx_2", deleted: true, editedAt: 250, sig: "sig_2" }],
  );
  assert.deepEqual(c, [
    { routeId: "vx_1", label: "Um", addedAt: 150, editedAt: 150, deleted: false },
    { routeId: "vx_2", label: "", addedAt: 0, editedAt: 250, deleted: true, deletedAt: 250, sig: "sig_2" },
  ]);

  const comm = mergeFollowedCommunities(
    [{ communityId: "c1", deleted: true, editedAt: 300, sig: "" }],
    [{ communityId: "c2", editedAt: 310, sig: "sig_c2" }],
  );
  assert.deepEqual(comm, [
    { communityId: "c1", editedAt: 300, deleted: true, deletedAt: 300 },
    { communityId: "c2", editedAt: 310, deleted: false, sig: "sig_c2" },
  ]);

  const lists = mergeLocalLists(
    [{ id: "l1", name: "Mix", items: [7, "a", {}, true], editedAt: 10, sig: "sig_l1" }],
    [{ id: "l2", deleted: true, editedAt: 20, sig: "" }],
  );
  assert.deepEqual(lists, [
    { id: "l1", name: "Mix", items: ["7", "a"], editedAt: 10, deleted: false, sig: "sig_l1" },
    { id: "l2", name: "", items: [], editedAt: 20, deleted: true, deletedAt: 20 },
  ]);
});

test("integração contacts.js: remove grava tombstone e mergeRemoteContacts converge sem ressuscitar removidos", () => {
  contacts.__resetContactsForTests();
  assert.equal(contacts.addContact("   ", "Vazio"), false);
  contacts.addContact("vx_a", "Alice", 1000);
  contacts.addContact("vx_b", "Bob", 1005);
  contacts.removeContact("vx_a", 2000);
  contacts.removeContact("  ");

  assert.equal(contacts.hasContact("vx_a"), false);
  assert.equal(contacts.hasContact("vx_b"), true);
  assert.equal(contacts.exportContactRecords().find((c) => c.routeId === "vx_a")?.deleted, true);

  // Remoto antigo com vx_a não ressuscita o contato removido em 2000; remoto novo vx_c entra.
  const active = contacts.mergeRemoteContacts([
    { routeId: "vx_a", label: "Alice antiga", addedAt: 1500, editedAt: 1500, deleted: false },
    { routeId: "vx_c", label: "Carol", addedAt: 2500, editedAt: 2500, deleted: false },
  ]);
  assert.deepEqual(active.map((c) => c.routeId), ["vx_c", "vx_b"]);

  // Remoto com re-adição mais nova (3000) volta a ativar vx_a; tombstone remoto (4000) remove vx_b.
  const converged = contacts.mergeRemoteContacts([
    { routeId: "vx_a", label: "Alice nova", addedAt: 3000, editedAt: 3000, deleted: false },
    { routeId: "vx_b", deleted: true, deletedAt: 4000, editedAt: 4000 },
  ]);
  assert.deepEqual(converged.map((c) => [c.routeId, c.label]), [["vx_a", "Alice nova"], ["vx_c", "Carol"]]);
});

test("integração inbox-backup.js: restore multi-aparelho converge contatos em qualquer ordem sem ressuscitar removidos", async () => {
  const wipe = () => {
    localStorage.clear();
    for (const store of mockStores.values()) store.map?.clear();
    keyLock.__resetKeyLockForTests?.();
  };
  const senha = "senha soberana multi aparelho 2026";
  wipe();
  await localAccount.ensureLocalAccount();
  contacts.addContact("vx_manter", "Manter", 1000);
  contacts.addContact("vx_remover", "Remover", 1100);
  await backup.enableInboxBackup(senha);
  const backupAntigo = await backup.buildInboxBackup("completo", 1200);

  contacts.removeContact("vx_remover", 2000);
  contacts.addContact("vx_novo", "Novo", 2100);
  const backupNovo = await backup.buildInboxBackup("completo", 2200);

  // Ordem 1: restaura antigo depois novo.
  wipe();
  await backup.restoreInboxBackup(backupAntigo.text, senha);
  assert.equal(contacts.hasContact("vx_remover"), true);
  await backup.restoreInboxBackup(backupNovo.text, senha);
  assert.equal(contacts.hasContact("vx_remover"), false);
  assert.equal(contacts.hasContact("vx_manter"), true);
  assert.equal(contacts.hasContact("vx_novo"), true);

  // Ordem 2 (reversa): restaura novo depois antigo -> tombstone mais novo impede ressurreição!
  wipe();
  await backup.restoreInboxBackup(backupNovo.text, senha);
  await backup.restoreInboxBackup(backupAntigo.text, senha);
  assert.equal(contacts.hasContact("vx_remover"), false);
  assert.equal(contacts.hasContact("vx_manter"), true);
  assert.equal(contacts.hasContact("vx_novo"), true);
});
