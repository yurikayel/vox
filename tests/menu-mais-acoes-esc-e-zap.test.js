/**
 * @file Menu ⋯ da barra do post (feed e post aberto): Esc fecha e devolve o foco ao summary (menos com modal aberto ou
 * Esc já tratado), e todo item dentro do `role="menu"`, o zap (Pix) e a moderação inclusive, tem papel de item de menu.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom } from "./helpers/cov-t5-dom.mjs";
import * as feedToolbar from "../client/js/render/feed-post-toolbar.js";
import * as topic from "../client/js/render/topic.js";

const { initSocialInteractions } = await import("../client/js/app/init-social-actions.js");

const post = { id: "p_f38", title: "Post", author: "vx_a", ts: 1, contactPix: "pix@vox.test" };
const semPix = { ...post, contactPix: "" };

const RENDERS = {
  feed: (p) => feedToolbar.renderPostToolbar(p, "vx_a", "Autor", "@autor"),
  "post aberto": (p) => {
    const main = { innerHTML: "" };
    topic.renderTopic(main, p.id, p, []);
    return main.innerHTML;
  },
  "post aberto (moderação)": (p) => {
    const main = { innerHTML: "" };
    topic.renderTopic(main, p.id, p, [], { isMod: true });
    return main.innerHTML;
  },
};

/** Miolo do `role="menu"` do post. */
const menuOf = (html) => /<div class="toolbar-overflow-menu" role="menu">([\s\S]*?)<\/div>\s*<\/details>/.exec(html)?.[1] ?? "";

/** Tag de abertura do zap no HTML. */
const zapTag = (html) => /<button[^>]*\bbtn-zap-post\b[^>]*>/.exec(html)?.[0] ?? "";

for (const [nome, render] of Object.entries(RENDERS)) {
  test(`${nome}: o zap dentro do menu tem role="menuitem", com e sem Pix`, () => {
    for (const p of [post, semPix]) {
      const html = render(p);
      const tag = zapTag(html);
      assert.ok(tag, "zap renderizado");
      assert.match(tag, /role="menuitem"/, p.contactPix ? "zap com Pix" : "zap sem Pix");
      assert.ok(zapTag(menuOf(html)), "o zap está dentro do role=menu (menuitem fora do menu é erro de ARIA)");
    }
  });

  test(`${nome}: todo botão dentro do role="menu" tem papel de item`, () => {
    const html = render(post);
    const menu = menuOf(html);
    const botoes = menu.match(/<button[^>]*>/g) ?? [];
    assert.ok(botoes.length >= 3, "o menu tem botões");
    for (const tag of botoes) assert.match(tag, /role="menuitem(?:checkbox)?"/, tag.slice(0, 80));
  });
}

test("com isMod o menu ganha Fixar, Trancar e Ocultar, e os três são menuitem dentro do menu", () => {
  const menu = menuOf(RENDERS["post aberto (moderação)"](post));
  const base = menuOf(RENDERS["post aberto"](post));
  const mod = (menu.match(/<button[^>]*\bbtn-mod-(?:action|hide)\b[^>]*>/g) ?? []);
  assert.equal(mod.length, 3, "Fixar, Trancar, Ocultar");
  assert.equal((base.match(/btn-mod-/g) ?? []).length, 0, "sem isMod não há botão de moderação");
  for (const tag of mod) assert.match(tag, /role="menuitem"/, tag.slice(0, 80));
});

test("Esc fecha o menu ⋯ aberto e devolve o foco ao summary; outras teclas não fecham", async () => {
  const doc = installDom();
  initSocialInteractions();
  const summary = makeEl({ tagName: "SUMMARY" });
  const menu = makeEl({ tagName: "DETAILS", kids: { summary } });
  menu.setAttribute("open", "");
  const item = makeEl({ up: { "details.toolbar-overflow[open]": menu } });
  const press = async (key, target) => {
    const ev = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    assert.ok(doc.docListeners.keydown?.length, "initSocialInteractions registra um ouvinte de keydown no document");
    for (const fn of doc.docListeners.keydown) await fn(ev);
    return ev;
  };
  await press("Enter", item);
  assert.equal(menu.getAttribute("open"), "", "Enter não fecha");
  const ev = await press("Escape", item);
  assert.equal(menu.getAttribute("open"), null, "Esc fecha o menu");
  assert.equal(summary.focused, 1, "o foco volta ao summary");
  assert.ok(ev.defaultPrevented);
  const fora = await press("Escape", makeEl());
  assert.equal(fora.defaultPrevented, false, "Esc fora de um menu aberto não é consumido");
});

/** Modal no DOM falso: `ariaModal` casa com `[aria-modal="true"]`, `overlay` com `.modal-overlay`; `hidden` o esconde. */
const modal = ({ hidden = false, ariaModal = true, overlay = false } = {}) => ({ hidden, ariaModal, overlay });

/** Casa o seletor do guarda: cada parte pode vir com `:not([hidden])`, que o DOM real avalia e o falso imita aqui. */
function achaModal(modais, sel) {
  return modais.find((m) => sel.split(",").some((parte) => {
    const p = parte.trim();
    const casa = (p.startsWith('[aria-modal="true"]') && m.ariaModal) || (p.startsWith(".modal-overlay") && m.overlay);
    return casa && !(p.endsWith(":not([hidden])") && m.hidden);
  })) ?? null;
}

/** Menu aberto com o foco num item; `modais` são os diálogos presentes no DOM falso (`document.querySelector`). */
function menuAberto(modais = []) {
  const doc = installDom();
  doc.querySelector = (sel) => achaModal(modais, sel);
  initSocialInteractions();
  const summary = makeEl({ tagName: "SUMMARY" });
  const menu = makeEl({ tagName: "DETAILS", kids: { summary } });
  menu.setAttribute("open", "");
  const item = makeEl({ up: { "details.toolbar-overflow[open]": menu } });
  const esc = async (extra = {}) => {
    assert.ok(doc.docListeners.keydown?.length, "ouvinte de keydown registrado");
    const ev = { key: "Escape", target: item, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const fn of doc.docListeners.keydown) await fn(ev);
    return ev;
  };
  return { menu, summary, esc };
}

test("com modal aberto (o do Pix não move o foco) o Esc não fecha o menu atrás do overlay", async () => {
    const { menu, summary, esc } = menuAberto([modal({ ariaModal: false, overlay: true })]);
    const ev = await esc();
    assert.equal(menu.getAttribute("open"), "", "o menu continua aberto");
    assert.equal(summary.focused ?? 0, 0, "o foco não vai ao ⋯ atrás do modal");
    assert.equal(ev.defaultPrevented, false);
});

test("com aria-modal aberto o Esc não fecha o menu", async () => {
  const { menu, esc } = menuAberto([modal()]);
  await esc();
  assert.equal(menu.getAttribute("open"), "");
});

test("diálogos fixos do shell ocultos (visualização de imagem, gaveta de identidade) não bloqueiam o Esc", async () => {
  const { menu, summary, esc } = menuAberto([modal({ hidden: true }), modal({ hidden: true })]);
  await esc();
  assert.equal(menu.getAttribute("open"), null, "o menu fechou");
  assert.equal(summary.focused, 1);
});

test("overlay de modal oculto também não bloqueia o Esc", async () => {
  const { menu, esc } = menuAberto([modal({ ariaModal: false, overlay: true, hidden: true })]);
  await esc();
  assert.equal(menu.getAttribute("open"), null);
});

test("um diálogo oculto antes de um aberto não esconde o aberto (o seletor filtra, não só olha o primeiro)", async () => {
  const { menu, esc } = menuAberto([modal({ hidden: true }), modal({ ariaModal: false, overlay: true })]);
  await esc();
  assert.equal(menu.getAttribute("open"), "");
});

test("Esc que outro ouvinte já tratou (defaultPrevented) não fecha o menu", async () => {
  const { menu, summary, esc } = menuAberto();
  await esc({ defaultPrevented: true });
  assert.equal(menu.getAttribute("open"), "");
  assert.equal(summary.focused ?? 0, 0);
});

test("sem modal aberto o Esc fecha o menu normalmente (a consulta de modal não bloqueia tudo)", async () => {
  const { menu, summary, esc } = menuAberto();
  await esc();
  assert.equal(menu.getAttribute("open"), null);
  assert.equal(summary.focused, 1);
});
