/**
 * Cofre na malha (ADR-037) na tela: "Já tenho conta" com um caminho principal (§3.4), a tentativa de abrir o cofre
 * que chega da malha, a faixa "Foi você?" e o roteamento da DM do cofre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as render from "../client/js/render.js";
import { tryMeshRestoreOnce } from "../client/js/app/onboarding-email.js";
import { NOTICE_BANNER_ID, refreshNoticeBanner, renderNoticeBannerHtml, startMeshVault } from "../client/js/app/mesh-vault-ui.js";
import { ingestDecryptedEnvelope } from "../client/js/app/dm-wire.js";
import * as mesh from "../client/js/vault/mesh-vault.js";

function haveHtml() {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c);
  const html = c.innerHTML;
  const start = html.indexOf('data-genesis-step="have"');
  return html.slice(start, html.indexOf('data-genesis-step="pact"'));
}

test("Já tenho conta — e-mail, senha e Entrar vêm antes de \"Outras formas de voltar\"", () => {
  const html = haveHtml();
  const at = (s) => html.indexOf(s);
  const details = at('id="genesis-other-ways"');
  assert.ok(details > 0, "outras formas num bloco recolhido");
  for (const id of ["oauth-restore-email-input", "oauth-sovereign-passphrase-input", "btn-oauth-restore-passphrase", "oauth-mesh-status"]) {
    assert.ok(at(`id="${id}"`) > 0 && at(`id="${id}"`) < details, `#${id} no caminho principal`);
  }
  for (const id of ["oauth-restore-kit-text", "oauth-restore-phrase", "oauth-restore-files"]) {
    assert.ok(at(`id="${id}"`) > details, `#${id} em outras formas`);
  }
  assert.ok(at('href="#/voltar"') > details, "guardiões em outras formas");
  assert.ok(html.includes("QR para outro aparelho"));
  assert.ok(html.includes("sem servidor de contas"), "a tela diz que não há servidor de contas");
  assert.match(html, /id="oauth-mesh-status"[^>]*role="status"[^>]*hidden/, "aviso da malha começa escondido e é anunciado");
});

test("volta pela malha — esperando, a tentativa só repassa a espera", async () => {
  let restored = 0;
  const res = await tryMeshRestoreOnce({ email: "a@b.c", pass: "p" }, {
    collect: async () => ({ ok: false, reason: "waiting" }),
    restore: async () => { restored++; return { ok: true }; },
    cancel: () => assert.fail("não cancela"),
  });
  assert.deepEqual(res, { ok: false, reason: "waiting" });
  assert.equal(restored, 0);
});

test("volta pela malha — cofre chegou: abre com e-mail e senha digitados e esquece o pedido", async () => {
  const record = { v: 2 };
  let cancelled = 0;
  const res = await tryMeshRestoreOnce({ email: "a@b.c", pass: "senha" }, {
    collect: async () => ({ ok: true, record }),
    restore: async (pass, opts) => {
      assert.equal(pass, "senha");
      assert.deepEqual(opts, { email: "a@b.c", directRecord: record });
      return { ok: true, routeId: "vx_a" };
    },
    cancel: () => cancelled++,
  });
  assert.deepEqual(res, { ok: true, routeId: "vx_a" });
  assert.equal(cancelled, 1);
});

test("volta pela malha — cofre chegou mas não abriu: mantém o pedido e diz por quê", async () => {
  const res = await tryMeshRestoreOnce({ email: "a@b.c", pass: "x" }, {
    collect: async () => ({ ok: true, record: {} }),
    restore: async () => ({ ok: false, reason: "Senha incorreta." }),
    cancel: () => assert.fail("não cancela"),
  });
  assert.deepEqual(res, { ok: false, reason: "Senha incorreta." });
  const silent = await tryMeshRestoreOnce({ email: "", pass: "" }, {
    collect: async () => ({ ok: true, record: {} }), restore: async () => ({ ok: false }), cancel: () => {},
  });
  assert.match(silent.reason, /senha não abriu/);
});

/** Documento mínimo: guarda elementos por id e os botões com seus ouvintes. */
function fakeDoc() {
  const byId = new Map();
  const button = (id) => ({ id, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const doc = {
    body: { appendChild: (el) => byId.set(el.id, el) },
    getElementById: (id) => byId.get(id) || null,
    createElement: () => ({
      set innerHTML(html) {
        const id = /id="([^"]+)"/.exec(html)[1];
        this.firstElementChild = { id, html, remove: () => byId.delete(id) };
        if (id === NOTICE_BANNER_ID) ["btnMeshVaultYes", "btnMeshVaultNo"].forEach((b) => byId.set(b, button(b)));
      },
    }),
  };
  return doc;
}

test("faixa \"Foi você?\" — mostra o pedido mais antigo; os botões mandam sim ou não e a faixa segue para o próximo", async () => {
  const doc = fakeDoc();
  let queue = [{ requestId: "r2", firstSeen: 20, holders: 1 }, { requestId: "r1", firstSeen: 10, holders: 2 }];
  const decided = [];
  const decide = async (id, d) => { decided.push([id, d]); queue = queue.filter((n) => n.requestId !== id); };
  assert.equal(refreshNoticeBanner({ doc, decide, notices: () => [...queue] }), true);
  assert.match(doc.getElementById(NOTICE_BANNER_ID).html, /data-request="r1"/);
  doc.getElementById("btnMeshVaultNo").listeners.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(decided, [["r1", "nao"]]);
  assert.match(doc.getElementById(NOTICE_BANNER_ID).html, /data-request="r2"/, "o próximo aparece");
  doc.getElementById("btnMeshVaultYes").listeners.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(decided[1], ["r2", "sim"]);
  assert.equal(doc.getElementById(NOTICE_BANNER_ID), null, "sem pedidos, sem faixa");
});

test("faixa \"Foi você?\" — texto pergunta e orienta trocar a senha; sem aviso, nada aparece", () => {
  const html = renderNoticeBannerHtml({ requestId: "r", firstSeen: Date.UTC(2026, 10, 17, 12) });
  assert.match(html, /Foi você\?/);
  assert.match(html, /troque sua senha/);
  assert.match(html, /role="alertdialog"/);
  assert.equal(refreshNoticeBanner({ doc: fakeDoc(), decide: async () => {}, notices: () => [] }), false);
});

test("ligar a malha — uma vez por página, e só roda com conta", () => {
  const listeners = {};
  let intervals = 0;
  const win = { addEventListener: (t, fn) => { listeners[t] = fn; }, setInterval: () => { intervals++; } };
  const first = startMeshVault({ win, hasAccount: () => false });
  const second = startMeshVault({ win, hasAccount: () => false });
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(intervals, 1);
  assert.ok(listeners["vox-cofre-malha-mudou"] && listeners["vox-cofre-malha-aviso"]);
});

test("apagar conta local leva junto o cofre na malha: o próprio, as cópias guardadas, o pedido e os avisos", async () => {
  const { wipeLocalDevice } = await import("../client/js/app/onboarding.js");
  const keys = [mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.PENDING_STORAGE, mesh.NOTICES_STORAGE];
  for (const k of keys) localStorage.setItem(k, "{}");
  wipeLocalDevice();
  for (const k of keys) assert.equal(localStorage.getItem(k), null, `${k} apagada`);
});

test("DM do cofre na malha não vira conversa no fio", async () => {
  const signed = { ...mesh.buildReleaseBody({ to: "vx_outro" }), author: "vx_a", sig: "s", pubKey: {} };
  const out = await ingestDecryptedEnvelope({ id: "dm_m", from: "vx_a", to: "vx_b", ts: 1 }, mesh.serializeMeshDm(signed));
  assert.equal(out, "guardian");
});
