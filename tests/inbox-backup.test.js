import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "./setup.js";
import * as backup from "../client/js/inbox-backup.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as contacts from "../client/js/contacts.js";
import * as localAccount from "../client/js/local-account.js";
import * as keyLock from "../client/js/key-lock.js";

const SENHA = "senha soberana de teste 2026";
const DAY = 24 * 60 * 60 * 1000;

function wipeDevice() {
  localStorage.clear();
  for (const store of mockStores.values()) store.map?.clear();
  keyLock.__resetKeyLockForTests?.();
}

async function newAccountWithContent() {
  wipeDevice();
  const acc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Ana do Backup");
  contacts.addContact("vx_contatodaana001", "Bia");
  await cacheNode.saveDmMessage({ id: "dm_1", peerAddress: "vx_contatodaana001", from: acc.routeId, text: "oi Bia", ts: Date.now() });
  await cacheNode.saveLocalPost({ id: "t_backup_1", type: "topic", author: acc.routeId, title: "Meu post", ts: Date.now() });
  return acc;
}

test("backup no e-mail - ligar exige Senha Soberana de 12+ caracteres", async () => {
  wipeDevice();
  await localAccount.ensureLocalAccount();
  await assert.rejects(backup.enableInboxBackup("curta"), /12 caracteres/);
  assert.equal(backup.getInboxBackupSettings().ready, false);
});

test("backup no e-mail - semanal vence em 7 dias, mensal no mês novo, e cada um pode ser desligado", async () => {
  await newAccountWithContent();
  await backup.enableInboxBackup(SENHA);
  const now = Date.now();
  assert.deepEqual(backup.dueInboxBackups(now), []);
  const nextMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 2).getTime();
  assert.ok(backup.dueInboxBackups(now + 7 * DAY + 1).includes("semana"));
  assert.deepEqual(backup.dueInboxBackups(nextMonth + 7 * DAY), ["mes", "semana"]);
  backup.setInboxBackupCadence({ weekly: false });
  assert.deepEqual(backup.dueInboxBackups(nextMonth + 7 * DAY), ["mes"]);
  backup.markInboxBackupSent("mes", nextMonth + 7 * DAY);
  assert.deepEqual(backup.dueInboxBackups(nextMonth + 7 * DAY), []);
});

test("backup no e-mail - o completo restaura conta, contatos, mensagens e posts em outro aparelho", async () => {
  const acc = await newAccountWithContent();
  await backup.enableInboxBackup(SENHA);
  const built = await backup.buildInboxBackup("completo");
  assert.equal(backup.isInboxBackupText(built.text), true);
  assert.equal(built.text.includes("oi Bia"), false, "conteúdo vai cifrado");

  wipeDevice();
  await assert.rejects(backup.restoreInboxBackup(built.text, "senha errada qualquer"), /Senha Soberana incorreta/);
  const restored = await backup.restoreInboxBackup(built.text, SENHA);
  assert.equal(restored.routeId, acc.routeId);
  assert.equal(localAccount.getDisplayName(), "Ana do Backup");
  assert.equal(contacts.hasContact("vx_contatodaana001"), true);
  assert.equal((await cacheNode.getDmMessages("vx_contatodaana001"))[0].text, "oi Bia");
  assert.ok(await cacheNode.getLocalPost("t_backup_1"));
  assert.equal(backup.getInboxBackupSettings().ready, true, "os backups seguem no aparelho novo");
});

test("backup no e-mail - o semanal leva só o que é do período", async () => {
  await newAccountWithContent();
  await backup.enableInboxBackup(SENHA);
  const built = await backup.buildInboxBackup("semana", Date.now() + DAY);
  wipeDevice();
  await backup.restoreInboxBackup(built.text, SENHA);
  assert.equal((await cacheNode.getDmMessages("vx_contatodaana001")).length, 0, "a mensagem é de antes de ligar");
  assert.equal(contacts.hasContact("vx_contatodaana001"), true, "contatos vão inteiros em todo backup");
});

test("backup no e-mail - chaves vão num só envelope de 600 mil iterações", async () => {
  await newAccountWithContent();
  await backup.enableInboxBackup(SENHA);
  const file = JSON.parse((await backup.buildInboxBackup("completo")).text);
  assert.equal(file.secrets.iter, 600_000);
  assert.equal("account" in file, false, "nada de .voxid de 210 mil iterações no arquivo");
  assert.equal(JSON.stringify(file).includes("privateJwk"), false);
});

test("backup no e-mail - post editado e post apagado no período entram no semanal", async () => {
  const acc = await newAccountWithContent();
  await backup.enableInboxBackup(SENHA);
  const later = Date.now() + 1000;
  await cacheNode.saveLocalPost({ id: "t_backup_1", type: "topic", author: acc.routeId, title: "Editado", ts: Date.now() - DAY, editedAt: later });
  await cacheNode.saveLocalPost({ id: "t_backup_2", type: "topic", author: acc.routeId, title: "Vai sumir", ts: Date.now() - DAY });
  await cacheNode.saveTombstone({ id: "t_backup_2", author: acc.routeId, ts: later, deleted: true });
  const built = await backup.buildInboxBackup("semana", later + 1000);
  wipeDevice();
  await backup.restoreInboxBackup(built.text, SENHA);
  assert.equal((await cacheNode.getLocalPost("t_backup_1")).title, "Editado");
  assert.ok(await cacheNode.getTombstone("t_backup_2"), "a lápide volta junto");
});
