/**
 * Mesa Soberana E1 — testes da ponte Obsidian (`obsidian-bridge.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  chronicleToMarkdown,
  extractWikilinks,
  markdownToNote,
  markdownToSheet,
  noteToMarkdown,
  parseSimpleYaml,
  sheetToMarkdown,
  splitGmSecrets,
} from "../client/js/dungeon/obsidian-bridge.js";
import { createCampaign, createChronicleEntry } from "../client/js/dungeon/vtt-schema.js";

test("obsidian-bridge: splitGmSecrets remove %%...%% e callout > [!gm] sem vazar no texto público", () => {
  const raw = [
    "# Lord Varen",
    "Conselheiro respeitado de [[Vila Nova]].",
    "%%SEGREDO_INLINE: Ele roubou a chave da comporta%%",
    "",
    "> [!gm] Plano Oculto",
    "> Vai trair o grupo na sessão 3.",
    "> Usa um anel falso.",
    "",
    "Sempre visto na [[Taberna do Javali|Taberna]].",
  ].join("\n");
  const split = splitGmSecrets(raw);
  assert.equal(split.hadSecrets, true);
  assert.ok(!split.publicMarkdown.includes("SEGREDO_INLINE"));
  assert.ok(!split.publicMarkdown.includes("trair o grupo"));
  assert.ok(!split.publicMarkdown.includes("anel falso"));
  assert.ok(split.publicMarkdown.includes("[[Vila Nova]]"));
  assert.ok(split.gmSecretMarkdown.includes("SEGREDO_INLINE"));
  assert.ok(split.gmSecretMarkdown.includes("trair o grupo"));
});

test("obsidian-bridge: roundtrip de ficha .md preserva atributos, ações clicáveis, wikilinks e omite segredo quando pedido", () => {
  const md = [
    "---",
    "tipo: ficha",
    "id: kora",
    "nome: Kora da Fonte",
    "classe: Ladina",
    "nivel: 3",
    "ca: 15",
    "hp_max: 21",
    "ouro: 42",
    "atributos:",
    "  for: 10",
    "  des: 18",
    "  con: 12",
    "  int: 14",
    "  sab: 11",
    "  car: 13",
    "acoes:",
    "  - Adaga | 1d20+@des+@prof | 1d4+@des",
    "---",
    "",
    "# Kora da Fonte",
    "",
    "Aliada de [[Lyra]] na [[Cripta]].",
    "",
    "%%Sabe onde está o cofre secreto%%",
  ].join("\n");
  const sheet = markdownToSheet(md);
  assert.equal(sheet.character_id, "kora");
  assert.equal(sheet.attributes_lww.name, "Kora da Fonte");
  assert.equal(sheet.attributes_lww.abilities.dex, 18);
  assert.equal(sheet.pools_base.hp_max, 21);
  assert.equal(sheet.sheet_meta.clickable_actions[0].label, "Adaga");
  assert.ok(!sheet.sheet_meta.notes_public.includes("cofre secreto"));
  assert.ok(sheet.sheet_meta.notes_gm.includes("cofre secreto"));

  const pubMd = sheetToMarkdown(sheet, { includeGmNotes: false });
  assert.ok(!pubMd.includes("cofre secreto"));
  assert.ok(pubMd.includes("[[Lyra]]"));
  const fullMd = sheetToMarkdown(sheet, { includeGmNotes: true });
  assert.ok(fullMd.includes("%%Sabe onde está o cofre secreto%%"));
  const again = markdownToSheet(fullMd);
  assert.equal(again.attributes_lww.abilities.dex, 18);
  assert.equal(again.sheet_meta.clickable_actions[0].roll, "1d20+@des+@prof");
});

test("obsidian-bridge: YAML estrito recusa constructos inseguros; wikilinks e crônica preservam formato", () => {
  assert.throws(() => parseSimpleYaml("x: !!js/function foo"), /não suportado/i);
  assert.throws(() => parseSimpleYaml("__proto__: 1"), /inválida/i);

  const links = extractWikilinks("Veja [[NPC A]] e [[Cidade|Capital]] e ![[mapa.webp]]");
  assert.equal(links.length, 3);
  assert.equal(links[1].label, "Capital");
  assert.equal(links[2].embed, true);

  const note = markdownToNote("---\ntitulo: Pista\ntags:\n  - cripta\n---\nTexto [[Altar]]\n%%Segredo%%");
  assert.deepEqual(note.links, ["Altar"]);
  assert.ok(!noteToMarkdown(note, { includeGmSecrets: false }).includes("Segredo"));

  const camp = createCampaign({
    name: "Mesa Teste",
    chronicle: [
      createChronicleEntry({ speaker: "Lyra", text: "Abro a porta", visibility: "public" }),
      createChronicleEntry({ speaker: "Mestre", text: "Rolagem secreta", visibility: "gm" }),
    ],
  });
  const cronPub = chronicleToMarkdown(camp, { includePrivate: false });
  assert.ok(cronPub.includes("[[Lyra, A Espada da Vila]]"));
  assert.ok(cronPub.includes("Abro a porta"));
  assert.ok(!cronPub.includes("Rolagem secreta"));
});
