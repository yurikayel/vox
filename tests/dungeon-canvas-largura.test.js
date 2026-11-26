/**
 * @file O canvas do mapa respeita a coluna mesmo antes de `dungeon-layout.css` (carregada sob demanda) chegar:
 * a regra de largura mora em `agora.css`, que é sempre carregada.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agora = readFileSync(new URL("../client/css/agora.css", import.meta.url), "utf8");

test("agora.css limita .dungeon-vtt-canvas a width:100% e max-width:100%", () => {
  const rule = /(?:^|\})\s*\.dungeon-vtt-canvas\s*\{([^}]*)\}/m.exec(agora);
  assert.ok(rule, "regra .dungeon-vtt-canvas ausente em agora.css");
  assert.match(rule[1], /(?:^|[;\s])width:\s*100%/);
  assert.match(rule[1], /max-width:\s*100%/);
});
