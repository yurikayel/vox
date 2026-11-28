/**
 * @file Os 7 botões de escolher arquivo da Vox (foto, áudio e vídeo do compositor, Restaurar de um arquivo, Importar
 * Regras e as 2 fotos de comunidade) recebem foco pelo teclado (WCAG 2.1.1): o campo `input[type=file]` fica em
 * `.sr-only` e não em `hidden` nem em `display:none`, que o tiram da ordem de Tab; e o botão visível mostra o foco do campo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderInlineComposer } from "../client/js/render/feed-composer.js";
import { renderOwnPostsSection } from "../client/js/app/own-posts-ui.js";
import { renderModerationSettingsSection } from "../client/js/render/network-sections.js";
import * as render from "../client/js/render.js";
import { readCss, ruleBody } from "./helpers/css-contrato.js";

/** Contêiner mínimo para as telas que escrevem em `main.innerHTML`. */
function container() {
  return { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
}

function communityHtml() {
  const main = container();
  const meta = { id: "cinema", title: "Cinema", owner: "vx_9kN6qN", memberCount: 1, createdAt: 1729000000000 };
  render.renderCommunity(main, "cinema", [], meta, { isMember: false, walletAddress: "vx_9kN6qN", activeTab: "posts" });
  return main.innerHTML;
}

function composeCommunityHtml() {
  const main = container();
  render.renderComposeCommunity(main);
  return main.innerHTML;
}

const TELAS = {
  composer: () => renderInlineComposer({ userRouteId: "vx_x", displayName: "Ana" }),
  "meus posts": () => renderOwnPostsSection(),
  moderação: () => renderModerationSettingsSection([], []),
  "foto da comunidade": communityHtml,
  "criar comunidade": composeCommunityHtml,
};

/** Cada `<input ... type="file" ...>` do HTML, com o `id`. */
function fileInputs(html) {
  return [...html.matchAll(/<input\b[^>]*\btype="file"[^>]*>/g)].map((m) => ({ tag: m[0], id: /\bid="([^"]+)"/.exec(m[0])?.[1] }));
}

test("os 7 campos de arquivo saem sem hidden nem display:none, com .sr-only", () => {
  const achados = Object.entries(TELAS).flatMap(([tela, render]) => fileInputs(render()).map((i) => ({ tela, ...i })));
  const ids = achados.map((i) => i.id).sort();
  assert.deepEqual(ids, ["comm-photo-file", "file-import-moderation", "inline-topic-audio", "inline-topic-file", "inline-topic-video", "input-comm-photo-file", "own-posts-import"]);
  for (const { tela, id, tag } of achados) {
    assert.doesNotMatch(tag, /\bhidden\b/, `${tela} (${id}): hidden tira o campo do Tab`);
    assert.doesNotMatch(tag, /display\s*:\s*none/, `${tela} (${id}): display:none tira o campo do Tab`);
    assert.doesNotMatch(tag, /tabindex="-1"/, `${tela} (${id}): fica na ordem de Tab`);
    assert.match(tag, /class="[^"]*\bsr-only\b/, `${tela} (${id}): fica em .sr-only`);
  }
});

test("o campo de anexo do compositor tem nome acessível próprio (o rótulo só tem ícone)", () => {
  const nomes = Object.fromEntries(fileInputs(renderInlineComposer({ userRouteId: "vx_x", displayName: "Ana" })).map((i) => [i.id, /aria-label="([^"]+)"/.exec(i.tag)?.[1]]));
  assert.deepEqual(nomes, { "inline-topic-file": "Anexar foto", "inline-topic-audio": "Anexar áudio", "inline-topic-video": "Anexar vídeo" });
});

test("style.css mostra o foco do campo no botão visível (rótulo que envolve o campo, ou que vem logo antes)", () => {
  const css = readCss("style.css");
  for (const seletor of ['label:has(> input.sr-only[type="file"]:focus-visible)', 'label:has(+ input.sr-only[type="file"]:focus-visible)']) {
    assert.match(ruleBody(css, seletor), /outline:\s*2px solid var\(--brand-chrome\)/, `${seletor}: contorno visível`);
  }
  assert.match(ruleBody(css, 'label:has(> input.sr-only[type="file"])'), /position:\s*relative/, "o campo absoluto não desloca a página");
});

test("o campo do Restaurar vem logo depois do rótulo, o que o :has(+ …) exige", () => {
  assert.match(renderOwnPostsSection(), /<label[^>]*for="own-posts-import"[^>]*>[^<]+<\/label>\s*<input[^>]*id="own-posts-import"/);
});
