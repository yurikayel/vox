/**
 * @file Cobertura de `app/context.js` (lote T1): identidade ativa, quarentena por clique e compartilhar.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import * as mod from "../client/js/moderation.js";
import * as localAccount from "../client/js/identity/index.js";
import * as ctx from "../client/js/app/context.js";

const dom = installFakeDom();

test("context — getActiveUser cai na rota da conta local quando não há carteira", async () => {
  await localAccount.ensureLocalAccount();
  const user = await ctx.getActiveUser();
  assert.equal(user, await localAccount.getRouteId());
  assert.match(user, /^vx_/);
});

test("context — makeShellProps usa título e trilha vazios por padrão", () => {
  const props = ctx.makeShellProps("u", "home");
  assert.equal(props.title, "");
  assert.equal(props.subtitle, "");
  assert.equal(props.breadcrumb, null);
  const withCrumb = ctx.makeShellProps("u", "home", "T", "S", "<nav></nav>");
  assert.equal(withCrumb.breadcrumb, "<nav></nav>");
});

function quarantineFixture(id) {
  const btn = makeEl();
  btn.dataset.id = id;
  const label = makeEl();
  btn.querySelector = (sel) => (sel === ".toolbar-overflow-label" ? label : null);
  const article = makeEl();
  btn.closest = (sel) => (sel === "article.post" ? article : null);
  const share = makeEl();
  share.dataset.id = id;
  const other = makeEl();
  other.dataset.id = "outro";
  dom.group(".btn-share-post", [share, other]);
  return { btn, label, article, share, other };
}

test("context — onQuarantinePostClick esconde o post, desabilita o compartilhar e marca o botão", () => {
  const id = "cov-t1-q1";
  const f = quarantineFixture(id);
  try {
    ctx.onQuarantinePostClick(f.btn);
    assert.equal(mod.isPostQuarantined(id), true);
    assert.equal(f.article.removed, true);
    assert.equal(f.share.disabled, true);
    assert.equal(f.share.getAttribute("aria-disabled"), "true");
    assert.equal(f.other.disabled, false);
    assert.equal(f.btn.getAttribute("aria-pressed"), "true");
    assert.equal(f.btn.classes.has("is-quarantined"), true);
    assert.equal(f.label.textContent, "Tirar da quarentena local");
  } finally {
    mod.unquarantinePost(id);
  }
});

test("context — onQuarantinePostClick de novo tira da quarentena e reabilita o compartilhar", () => {
  const id = "cov-t1-q2";
  const f = quarantineFixture(id);
  try {
    ctx.onQuarantinePostClick(f.btn);
    ctx.onQuarantinePostClick(f.btn);
    assert.equal(mod.isPostQuarantined(id), false);
    assert.equal(f.share.disabled, false);
    assert.equal(f.share.getAttribute("aria-disabled"), "false");
    assert.equal(f.btn.getAttribute("aria-pressed"), "false");
    assert.equal(f.label.textContent, mod.QUARANTINE_ACTION_LABEL);
  } finally {
    mod.unquarantinePost(id);
  }
});

test("context — onQuarantinePostClick sem botão ou sem id não muda nada", () => {
  ctx.onQuarantinePostClick(null);
  const btn = makeEl();
  ctx.onQuarantinePostClick(btn);
  assert.equal(btn.attrs.size, 0);
});

test("context — attachQuarantineHandlers delega o clique só para .btn-quarantine-post e liga uma vez", () => {
  const id = "cov-t1-q3";
  const f = quarantineFixture(id);
  try {
    ctx.attachQuarantineHandlers();
    ctx.attachQuarantineHandlers();
    let prevented = false;
    dom.document.docFire("click", { target: { closest: () => null }, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, false);
    assert.equal(mod.isPostQuarantined(id), false);
    dom.document.docFire("click", { target: { closest: () => f.btn }, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(mod.isPostQuarantined(id), true);
    assert.equal(f.btn.getAttribute("aria-pressed"), "true", "um único ouvinte: não alterna duas vezes");
  } finally {
    mod.unquarantinePost(id);
  }
});

test("context — attachPostShareHandlers liga cada botão ao compartilhar respeitando a quarentena", () => {
  const id = "cov-t1-q4";
  const btn = makeEl();
  btn.dataset.id = id;
  dom.group(".btn-share-post", [btn]);
  ctx.attachPostShareHandlers();
  assert.equal(btn.listeners.get("click").length, 1);
  mod.quarantinePost(id);
  try {
    let threw = false;
    try {
      btn.fire("click");
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
    assert.equal(mod.canEchoPost(id), false);
  } finally {
    mod.unquarantinePost(id);
  }
});
