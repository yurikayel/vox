/**
 * @file Cobertura de `app/profile-screen-account.js`: contas do cofre local (criar, alternar, remover),
 * backup de soberania (.voxid) e apagar conta local, conferidos por estado, downloads e toasts.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl, waitFor, withToasts } from "./helpers/cov-t3-dom.mjs";

const account = await import("../client/js/app/profile-screen-account.js");
const localAccount = await import("../client/js/identity/index.js");

const fileOf = (text) => ({ text: async () => text });

function collectReloads() {
  const calls = [];
  return { calls, fn: async (...a) => { calls.push(a); } };
}

test("cofre local: criar conta nova ativa a identidade e recarrega na aba Sobre", async () => {
  await withToasts(async () => {
    await localAccount.ensureLocalAccount();
    const before = await localAccount.getRouteId();
    const form = makeEl();
    const { toasts } = installDom({ ids: { "form-create-vault-account": form, "input-new-account-name": makeEl({ value: " Segunda " }) } });
    const r = collectReloads();
    account.bindVaultAccountButtons(before, true, r.fn);
    await form.fire("submit");
    const after = await localAccount.getRouteId();
    assert.notEqual(after, before, "a conta nova virou a ativa");
    assert.deepEqual(r.calls, [[after, "about"]]);
    assert.equal(toasts.at(-1).text, 'Nova conta "Segunda" criada e ativada!');
  });
});

test("cofre local: nome vazio não cria nada e perfil alheio não liga o formulário", async () => {
  const form = makeEl();
  installDom({ ids: { "form-create-vault-account": form, "input-new-account-name": makeEl({ value: "  " }) } });
  const before = await localAccount.getRouteId();
  account.bindVaultAccountButtons(before, false, undefined);
  assert.equal(form.listeners.submit, undefined);
  account.bindVaultAccountButtons(before, true, undefined);
  await form.fire("submit");
  assert.equal(await localAccount.getRouteId(), before);
});

test("cofre local: alternar volta à conta anterior; remover pede confirmação", async () => {
  await withToasts(async () => {
    const active = await localAccount.getRouteId();
    const vault = await localAccount.listVaultAccounts?.();
    const other = (vault || []).map((a) => a.routeId).find((id) => id !== active);
    assert.ok(other, "o cofre guarda a conta anterior");
    const sw = makeEl({ dataset: { route: other } });
    const noRoute = makeEl({ dataset: {} });
    const rm = makeEl({ dataset: { route: other } });
    const { toasts } = installDom({ all: { ".btn-switch-vault-account": [sw, noRoute], ".btn-remove-vault-account": [rm] } });
    const r = collectReloads();
    account.bindVaultAccountButtons(active, true, r.fn);
    await noRoute.fire("click");
    assert.equal(r.calls.length, 0, "sem rota nada acontece");
    await sw.fire("click");
    assert.equal(await localAccount.getRouteId(), other);
    assert.equal(toasts.at(-1).text, "Identidade alternada com sucesso!");
    assert.deepEqual(r.calls.at(-1), [other, "about"]);

    globalThis.confirm = () => false;
    await rm.fire("click");
    assert.equal(r.calls.length, 1, "cancelar não recarrega");
    globalThis.confirm = () => true;
    await rm.fire("click");
    assert.equal(toasts.at(-1).text, "Conta removida do cofre.");
    assert.equal(r.calls.length, 2);
  });
});

test("soberania: perfil alheio não liga exportar nem importar", () => {
  const btn = makeEl();
  const input = makeEl();
  installDom({ ids: { "btn-export-account": btn, "file-import-account": input } });
  account.bindSovereigntyBackup(false, "about", undefined);
  assert.equal(btn.listeners.click, undefined);
  assert.equal(input.listeners.change, undefined);
});

test("soberania: exporta o .voxid com senha, baixa o arquivo e restaura em seguida", async () => {
  await withToasts(async () => {
    await localAccount.ensureLocalAccount();
    const me = await localAccount.getRouteId();
    const downloads = [];
    globalThis.URL.createObjectURL = (b) => { downloads.push(b); return "blob:t3"; };
    globalThis.URL.revokeObjectURL = () => {};
    const exportBtn = makeEl();
    const input = makeEl({ files: [] });
    const pass = makeEl({ value: "senha soberana t3 longa" });
    const { toasts } = installDom({
      ids: { "btn-export-account": exportBtn, "file-import-account": input, "input-sovereignty-passphrase": pass },
    });
    const r = collectReloads();
    account.bindSovereigntyBackup(true, "about", r.fn);
    await exportBtn.fire("click");
    assert.equal(downloads.length, 1);
    assert.equal(toasts.at(-1).text, "Arquivo de soberania exportado — guarde offline.");
    const text = await downloads[0].text();
    assert.equal(JSON.parse(text).routeId, me);
    assert.equal(JSON.parse(text).kind, "vox-account-backup-wrapped", "cifrado pela senha");

    input.files = [fileOf(text)];
    await input.fire("change");
    assert.equal(toasts.at(-1).text, "Identidade restaurada com sucesso!");
    assert.deepEqual(r.calls, [[null, "about"]]);
    assert.equal(await localAccount.getRouteId(), me);

    window.prompt = () => "senha soberana t3 longa";
    pass.value = "";
    input.files = [fileOf(text)];
    await input.fire("change");
    assert.equal(toasts.at(-1).text, "Identidade restaurada com sucesso!", "pergunta a senha quando o campo está vazio");
  });
});

test("soberania: arquivo inválido e mistura de arquivos mostram o erro; sem arquivo nada acontece", async () => {
  await withToasts(async () => {
    const input = makeEl({ files: [] });
    const { toasts } = installDom({
      ids: { "file-import-account": input, "input-sovereignty-passphrase": makeEl({ value: "x" }) },
    });
    account.bindSovereigntyBackup(true, "about", undefined);
    await input.fire("change");
    assert.equal(toasts.length, 0);
    input.files = [fileOf("isto não é um backup")];
    await input.fire("change");
    assert.equal(toasts.at(-1).text, "Erro ao importar: Formato de backup inválido (não é JSON)");
    assert.equal(toasts.at(-1).type, "error");
    input.files = [fileOf("a"), fileOf("b")];
    await input.fire("change");
    assert.equal(toasts.at(-1).text, "Erro ao importar: Escolha um .voxid sozinho ou só backups do e-mail (.txt).");
  });
});

test("apagar conta local: recusar a confirmação não apaga; confirmar apaga, limpa a senha e avisa", async () => {
  await withToasts(async () => {
    await localAccount.ensureLocalAccount();
    const btn = makeEl();
    const pass = makeEl({ value: "segredo" });
    const { toasts } = installDom({ ids: { "btn-wipe-local-account": btn, "input-sovereignty-passphrase": pass } });
    const r = collectReloads();
    account.bindLocalWipe(false, "about", r.fn);
    assert.equal(btn.listeners.click, undefined);
    account.bindLocalWipe(true, "about", r.fn);
    globalThis.confirm = () => false;
    await btn.fire("click");
    assert.equal(pass.value, "segredo");
    assert.equal(r.calls.length, 0);
    globalThis.confirm = () => true;
    await btn.fire("click");
    await waitFor(() => r.calls.length > 0);
    assert.equal(pass.value, "");
    assert.deepEqual(r.calls, [[null, "about"]]);
    assert.equal(toasts.at(-1).text, "Chaves deste navegador apagadas.");
  });
});
