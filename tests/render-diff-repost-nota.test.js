/**
 * Testes de render/diff-html, render/repost-cite e render/profile-note-bubble:
 * conteúdo vindo de outras pessoas (diff de pauta, trecho de repost, nota de perfil) sai escapado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const { renderUnifiedDiffHtml } = await import("../client/js/render/diff-html.js");
const { renderRepostCiteHtml } = await import("../client/js/render/repost-cite.js");
const bubble = await import("../client/js/render/profile-note-bubble.js");
const profileNote = await import("../client/js/profile-note.js");

const XSS = '<img src=x onerror=alert(1)>"\'';

test("diff-html - diff vazio não gera viewer", () => {
  assert.equal(renderUnifiedDiffHtml(""), "");
  assert.equal(renderUnifiedDiffHtml(undefined), "");
});

test("diff-html - classes por tipo de linha e prefixos", () => {
  const html = renderUnifiedDiffHtml("@@ -1 +1 @@\n-velho\n+novo\n contexto");
  assert.match(html, /diff-line-hunk">@@ -1 \+1 @@</);
  assert.match(html, /diff-line-del">- velho</);
  assert.match(html, /diff-line-add">\+ novo</);
  assert.match(html, /diff-line-ctx">  ?contexto</);
  assert.ok(html.startsWith('<div class="diff-viewer post-md-diff">'));
});

test("diff-html - HTML dentro do diff vira texto", () => {
  const html = renderUnifiedDiffHtml(`+${XSS}\n-<script>alert(1)</script>`);
  assert.ok(!html.includes("<img"), "sem tag img");
  assert.ok(!html.includes("<script"), "sem tag script");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;"));
});

test("repost-cite - post sem originalId não gera citação", () => {
  assert.equal(renderRepostCiteHtml({ id: "p1", excerpt: "x" }), "");
  assert.equal(renderRepostCiteHtml(null), "");
});

test("repost-cite - monta link para o original e usa o ID quando falta trecho", () => {
  const html = renderRepostCiteHtml({ originalId: "p_abc", originalAuthor: "Ana" });
  assert.match(html, /href="#\/t\/p_abc"/);
  assert.match(html, />p_abc</);
  assert.match(html, /De Ana/);
  assert.match(renderRepostCiteHtml({ originalId: "p_abc" }), /De publicação original/);
});

test("repost-cite - trecho, autor e id hostis não abrem tag nem atributo", () => {
  const html = renderRepostCiteHtml({ originalId: `a"><script>1</script>`, excerpt: XSS, originalAuthor: XSS });
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("%22%3E%3Cscript%3E"), "id codificado na URL");
});

test("profile-note-bubble - sem nota e perfil alheio não renderiza", () => {
  globalThis.localStorage?.clear?.();
  assert.equal(bubble.renderProfileNoteBubbleHtml("vx_alheio00000001"), "");
});

test("profile-note-bubble - dono sem nota vê convite vazio", () => {
  globalThis.localStorage?.clear?.();
  const html = bubble.renderProfileNoteBubbleHtml("vx_dono000000000001", { isOwn: true });
  assert.match(html, /profile-note-bubble--empty/);
  assert.match(html, /data-note-own="1"/);
  assert.match(html, /Adicionar nota neste aparelho/);
});

test("profile-note-bubble - nota de outra pessoa sai escapada em texto e atributos", () => {
  globalThis.localStorage?.clear?.();
  const route = `vx_x"onmouseover="1`;
  profileNote.setNote(route, XSS);
  const html = bubble.renderProfileNoteBubbleHtml(route);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('"onmouseover="1'), "route não fecha o atributo");
  assert.ok(html.includes("&lt;img"));
  assert.match(html, /data-note-own=""/);
});

test("profile-note-bubble - painel do editor traz o limite e as três ações", () => {
  const html = bubble.noteEditorSheetMarkup();
  assert.ok(html.includes(`maxlength="${profileNote.NOTE_MAX}"`));
  for (const a of ["save", "clear", "cancel"]) assert.ok(html.includes(`data-note-action="${a}"`));
});
