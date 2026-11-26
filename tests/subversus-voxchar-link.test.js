/**
 * @file Link só de leitura e cópia-modelo do `.voxchar` (docs/specs/voxchar-v0.md §9). O link é dado de outra pessoa:
 * passa pelo mesmo `checkVoxchar`, tem teto de entrada e de descompressão, e abrir não grava nem usa a rede.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { mutateSheetInventory, updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { exportVoxchar, importVoxchar } from "../client/js/dungeon/voxchar.js";
import { checkVoxchar } from "../client/js/dungeon/voxchar-check.js";
import {
  buildVoxcharLink, parseVoxcharLink, inflateCapped, VOXCHAR_LINK_MAX_INPUT, VOXCHAR_LINK_MAX_GENERATE,
} from "../client/js/dungeon/voxchar-link.js";
import { renderFichaView, renderFichaError } from "../client/js/app/screens-ficha-ver.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";

async function kaelState() {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", class_name: "Mago", con: 14 });
  await mutateSheetInventory(state, "add", { label: "Cota", qty: 2, weightLb: 20, armor: { kind: "media", ac: 14 } });
  state.sheet = { ...state.sheet, owner_pubkey_p256: "CHAVE-SECRETA", campaign_id: "camp_x", sheet_meta: { ...state.sheet.sheet_meta, notes_gm: "segredo do mestre", notes_public: "olá" } };
  return state;
}

async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const linkOf = (bytes) => `#/ficha/ver#voxchar=${Buffer.from(bytes).toString("base64url")}`;
const hostile = async (doc) => parseVoxcharLink(linkOf(await deflate(new TextEncoder().encode(doc))));
const stored = () => JSON.stringify(Object.entries(globalThis.localStorage));

test("1. ida e volta: gerar e abrir o link devolve uma ficha que passa no checkVoxchar", async () => {
  const built = await buildVoxcharLink((await kaelState()).sheet);
  assert.equal(built.ok, true);
  assert.match(built.href, /^#\/ficha\/ver#voxchar=[A-Za-z0-9_-]+$/);
  const out = await parseVoxcharLink(built.href);
  assert.equal(out.ok, true);
  assert.equal(out.doc.sheet.attributes_lww.name, "Kael");
  assert.equal(checkVoxchar(out.bytes).ok, true);
});

test("2. ficha grande demais não vira link e o motivo manda para o arquivo", async () => {
  const state = await kaelState();
  const noise = Array.from({ length: 20000 }, () => Math.random().toString(36)[2]).join("");
  state.sheet = { ...state.sheet, sheet_meta: { ...state.sheet.sheet_meta, notes_public: noise } };
  const out = await buildVoxcharLink(state.sheet);
  assert.equal(out.ok, false);
  assert.match(out.reason, /arquivo \.voxchar/);
  assert.ok(VOXCHAR_LINK_MAX_GENERATE < VOXCHAR_LINK_MAX_INPUT);
});

test("3. bomba de compressão: a descompressão aborta no teto e o link é recusado", async () => {
  const bomb = await deflate(new Uint8Array(5 * 1024 * 1024));
  assert.ok(bomb.length < 9000, "a bomba cabe no teto de entrada");
  assert.equal(await inflateCapped(bomb, 256 * 1024), null);
  const out = await parseVoxcharLink(linkOf(bomb));
  assert.equal(out.ok, false);
  assert.match(out.issues[0], /tamanho permitido/);
});

test("4. link malformado, truncado ou de formato maior é recusado com motivo e nada é gravado", async () => {
  const before = stored();
  const good = (await buildVoxcharLink((await kaelState()).sheet)).href;
  for (const bad of ["#/ficha/ver", "#/ficha/ver#voxchar=", "#/ficha/ver#voxchar=%%%", good.slice(0, -12), "#/ficha/ver#voxchar=AAAA"]) {
    const out = await parseVoxcharLink(bad);
    assert.equal(out.ok, false, bad);
    assert.ok(out.issues.length > 0);
  }
  const newer = await hostile(JSON.stringify({ kind: "voxchar", format: 99, system: { id: "dnd5e-2024", version: 1 }, sheet: {} }));
  assert.equal(newer.ok, false);
  assert.equal(stored(), before);
});

test("5. conteúdo hostil é recusado ou escapado, igual ao arquivo", async () => {
  const proto = await hostile('{"kind":"voxchar","format":1,"system":{"id":"dnd5e-2024","version":1},"sheet":{"__proto__":{"x":1},"attributes_lww":{"name":"A","armor_class":9999}}}');
  assert.equal(proto.ok, false);
  assert.equal({}.x, undefined);
  const xss = "<img src=x onerror=alert(1)>";
  const html = renderFichaView({ sheet: { attributes_lww: { name: xss, class_name: xss, abilities: { str: xss } }, inventory_orset: { a: { label: xss, qty: 2 } }, sheet_meta: { notes_public: xss } } });
  assert.equal(html.includes("<img"), false);
  assert.equal(renderFichaError([xss]).includes("<img"), false);
});

test("6. abrir o link não grava (localStorage) e não usa a rede", async () => {
  const calls = [];
  const real = { fetch: globalThis.fetch, xhr: globalThis.XMLHttpRequest };
  globalThis.fetch = (...a) => { calls.push(a[0]); throw new Error("rede"); };
  globalThis.XMLHttpRequest = function Xhr() { calls.push("xhr"); throw new Error("rede"); };
  const before = stored();
  try {
    const built = await buildVoxcharLink((await kaelState()).sheet);
    const out = await parseVoxcharLink(built.href);
    assert.equal(out.ok, true);
    renderFichaView(out.doc);
  } finally { Object.assign(globalThis, { fetch: real.fetch, XMLHttpRequest: real.xhr }); }
  assert.deepEqual(calls, []);
  assert.equal(stored(), before);
});

test("7. usar como modelo cria ficha com id novo, campanha da instalação e estado de jogo no padrão", async () => {
  const src = await kaelState();
  const out = await parseVoxcharLink((await buildVoxcharLink(src.sheet)).href);
  const dst = createDungeonSessionState();
  assert.equal((await importVoxchar(dst, { bytes: out.bytes })).ok, true);
  assert.notEqual(dst.sheet.character_id, src.sheet.character_id);
  assert.notEqual(dst.sheet.owner_pubkey_p256, "CHAVE-SECRETA");
  assert.equal(dst.sheet.pools_base.hp_max, 20);
  assert.deepEqual(dst.sheet.delta_ledger, []);
});

test("8. o link gerado não leva identidade, campanha, notas do Mestre nem retrato", async () => {
  const state = await kaelState();
  const built = await buildVoxcharLink(state.sheet);
  const bytes = await inflateCapped(Buffer.from(built.href.split("voxchar=")[1], "base64url"), 256 * 1024);
  const raw = new TextDecoder().decode(bytes);
  for (const banned of ["owner_pubkey_p256", "CHAVE-SECRETA", "campaign_id", "character_id", "notes_gm", "segredo do mestre", "portrait"]) {
    assert.equal(raw.includes(banned), false, banned);
  }
  assert.equal(JSON.parse(raw).sheet.attributes_lww.name, JSON.parse(new TextDecoder().decode(exportVoxchar(state.sheet).bytes)).sheet.attributes_lww.name);
});

test("9. entrada acima do teto é recusada antes de decodificar", async () => {
  const realAtob = globalThis.atob;
  let decoded = false;
  globalThis.atob = (...a) => { decoded = true; return realAtob(...a); };
  try {
    const out = await parseVoxcharLink(`#/ficha/ver#voxchar=${"A".repeat(VOXCHAR_LINK_MAX_INPUT + 4)}`);
    assert.equal(out.ok, false);
    assert.match(out.issues[0], /grande demais/);
  } finally { globalThis.atob = realAtob; }
  assert.equal(decoded, false);
});

test("10. sem compressão nativa não gera link, cai para o arquivo e explica; abrir também recusa com motivo", async () => {
  const good = (await buildVoxcharLink((await kaelState()).sheet)).href;
  const real = { c: globalThis.CompressionStream, d: globalThis.DecompressionStream };
  globalThis.CompressionStream = undefined;
  globalThis.DecompressionStream = undefined;
  try {
    const built = await buildVoxcharLink((await kaelState()).sheet);
    assert.equal(built.ok, false);
    assert.match(built.reason, /arquivo \.voxchar/);
    const opened = await parseVoxcharLink(good);
    assert.equal(opened.ok, false);
    assert.match(opened.issues[0], /\.voxchar/);
  } finally { Object.assign(globalThis, { CompressionStream: real.c, DecompressionStream: real.d }); }
});

test("11. a geração confirma o que vai e avisa histórico, sincronização e falta de revogação; cancelar limpa", async () => {
  const state = await kaelState();
  await ACTION_HANDLERS["share-voxchar-link"](state);
  assert.ok(state.voxcharLink.href);
  const html = renderSheetEditPanel(state.sheet, { link: state.voxcharLink });
  assert.match(html, /histórico e na sincronização/);
  assert.match(html, /não pode ser revogado/);
  assert.match(html, /data-dungeon="copy-voxchar-link"/);
  ACTION_HANDLERS["cancel-voxchar-link"](state);
  assert.equal(state.voxcharLink, null);
});

test("12. os módulos do link não estão em SHELL_ASSETS nem importados estaticamente pelo shell", () => {
  const sw = fs.readFileSync("client/sw.js", "utf8");
  for (const name of ["voxchar-link", "screens-ficha-ver"]) assert.equal(sw.includes(name), false, name);
  for (const f of ["client/js/app/route.js", "client/js/dungeon/dungeon-controller-actions.js", "client/js/dungeon/screen-sheet.js"]) {
    assert.equal(/from\s+["'][^"']*(voxchar-link|screens-ficha-ver)/.test(fs.readFileSync(f, "utf8")), false, f);
  }
});

test("13. a rota #/ficha/ver abre a visualização e carrega o hash completo", async () => {
  const { parseRoute } = await import("../client/js/app/route-parse.js");
  const prev = globalThis.location.hash;
  globalThis.location.hash = "#/ficha/ver#voxchar=AAAA";
  try {
    assert.deepEqual(parseRoute(), { name: "ficha-ver", hash: "#/ficha/ver#voxchar=AAAA" });
    globalThis.location.hash = "#/ficha/outra";
    assert.notEqual(parseRoute().name, "ficha-ver");
  } finally { globalThis.location.hash = prev; }
});

test("14. a visualização troca a URL antes de qualquer await e o hash completo ainda chega ao parser", async () => {
  const { showFichaVer } = await import("../client/js/app/screens-ficha-ver.js");
  const real = { history: globalThis.history, location: globalThis.location };
  const events = [];
  const full = "#/ficha/ver#voxchar=AAAA";
  globalThis.location = { hash: full, pathname: "/app/", search: "?x=1" };
  globalThis.history = { replaceState: (_s, _t, url) => events.push(["replace", url]) };
  const main = { innerHTML: "", querySelector: () => null };
  const deps = {
    parse: async (hash) => { events.push(["parse", hash]); return { ok: false, issues: ["x"] }; },
    mountShell: async () => main,
  };
  try {
    const job = showFichaVer({ hash: full }, deps);
    assert.deepEqual(events, [["replace", "/app/?x=1#/ficha/ver"]], "a URL já foi trocada antes de qualquer await");
    await job;
  } finally { Object.assign(globalThis, real); }
  assert.deepEqual(events[1], ["parse", full], "o parser recebe o hash completo, não o já limpo");
  assert.match(main.innerHTML, /Ficha não aberta/);
});

test("15. 'Usar como modelo' cria a ficha com id novo, dono da instalação e vai para a ficha; bytes vazios não criam nada", async () => {
  const { useAsTemplate } = await import("../client/js/app/screens-ficha-ver.js");
  const { getDungeonSession } = await import("../client/js/dungeon/dungeon-state.js");
  const src = await kaelState();
  const out = await parseVoxcharLink((await buildVoxcharLink(src.sheet)).href);
  const session = getDungeonSession(true);
  session.sheet = { ...session.sheet, owner_pubkey_p256: "DONO-DESTA-INSTALACAO" };
  const before = session.sheet.character_id;
  const realLocation = globalThis.location;
  globalThis.location = { hash: "#/ficha/ver", pathname: "/", search: "" };
  const status = { textContent: "" };
  try {
    await useAsTemplate(new Uint8Array(0), status);
    assert.equal(globalThis.location.hash, "#/ficha/ver", "bytes vazios não navegam");
    assert.ok(status.textContent.length > 0);
    assert.equal(getDungeonSession().sheet.character_id, before);
    await useAsTemplate(out.bytes, status);
    assert.equal(globalThis.location.hash, "#/dungeon/ficha");
  } finally { globalThis.location = realLocation; }
  const made = getDungeonSession().sheet;
  assert.equal(made.attributes_lww.name, "Kael");
  assert.notEqual(made.character_id, before);
  assert.notEqual(made.character_id, src.sheet.character_id);
  assert.equal(made.owner_pubkey_p256, "DONO-DESTA-INSTALACAO");
});
