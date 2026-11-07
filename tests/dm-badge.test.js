import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, "..", rel), "utf8");

const { sumUnreadDms, formatDmBadge } = await import("../client/js/render/shell.js");
const feed = await import("../client/js/render/feed.js");

test("dm badge — soma não lidas de todas as conversas", () => {
  assert.equal(sumUnreadDms([]), 0);
  assert.equal(sumUnreadDms([{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: "3" }, {}]), 5);
});

test("dm badge — formato do contador", () => {
  assert.equal(formatDmBadge(0), "");
  assert.equal(formatDmBadge(-1), "");
  assert.equal(formatDmBadge(7), "7");
  assert.equal(formatDmBadge(120), "99+");
});

test("dm badge — contador no item Mensagens e no ícone móvel, atualizado por evento", () => {
  const shell = read("client/js/render/shell.js");
  assert.ok(shell.includes('item.tab === "dm" ? DM_BADGE_HTML : ""'));
  assert.ok(shell.includes('aria-label="Mensagens">${ICONS.dmTop}${DM_BADGE_HTML}</a>'));
  assert.ok(shell.includes('addEventListener("vox:dm-changed"'));
  assert.ok(read("client/js/cache-node.js").includes('new CustomEvent("vox:dm-changed")'));
  assert.ok(read("client/js/dm-messenger.js").includes('new CustomEvent("vox:dm-changed")'));
  assert.match(read("client/css/agora.css"), /\.agora-dm-badge \{[\s\S]*background: var\(--sa-secondary\)/);
});

test("feed — sem cabeçalho da Ágora e sem aviso 'te mandou uma mensagem'", () => {
  const main = { innerHTML: "" };
  feed.renderFeed(main, [], { activeFeed: "for-you", userRouteId: "vx_me" });
  assert.ok(!main.innerHTML.includes("agora-page-head"));
  assert.ok(!main.innerHTML.includes("Debates, pautas e registros"));
  assert.ok(!main.innerHTML.includes("welcome-feed-hint"));
  assert.ok(!read("client/js/app/screens-home.js").includes("te mandou uma mensagem"));
});

test("composer — prévia do anexo alterna atributo hidden junto com a classe", () => {
  const src = read("client/js/inline-composer.js");
  assert.ok(src.includes("function setPreviewVisible(el, visible)"));
  assert.ok(src.includes("el.hidden = !visible;"));
  assert.ok(!/preview(Wrap|Img|AudioWrap|VideoWrap)\??\.classList\.(add|remove)\("hidden"\)/.test(src),
    "as peças da prévia não podem alternar só a classe");
  assert.ok(feed.renderInlineComposer({ userRouteId: "vx_me" }).includes('id="inline-topic-attach-meta"'));
});
