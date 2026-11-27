/**
 * @file `docs-audit`: órfãos. `docs/metrics/` é gerado e fica fora do git, então não conta; um doc órfão em `docs/` conta.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANNER = "> **Status:** canônico\n";

/** Projeto mínimo em pasta temporária: a cópia do script, o índice e os arquivos dados (caminho → texto). */
function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-docs-audit-"));
  const all = { "docs/README.md": `# Índice\n\n${BANNER}`, "scripts/docs-debt.json": '{"_leia":"teste"}', ...files };
  for (const [rel, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  fs.copyFileSync(path.join(ROOT, "scripts", "docs-audit.mjs"), path.join(dir, "scripts", "docs-audit.mjs"));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "junction");
  return dir;
}

/** Roda o script copiado na pasta temporária. */
function audit(dir) {
  const r = spawnSync("node", ["scripts/docs-audit.mjs"], { cwd: dir, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("um .md gerado em docs/metrics/ não conta como órfão", () => {
  const dir = project({ "docs/metrics/baseline-2026-01-01.md": "# Métricas geradas\n" });
  const r = audit(dir);
  assert.doesNotMatch(r.out, /orphan/, r.out);
  assert.equal(r.status, 0, r.out);
});

test("um .md órfão em docs/ continua contando", () => {
  const dir = project({ "docs/orfao.md": `# Órfão\n\n${BANNER}` });
  const r = audit(dir);
  assert.match(r.out, /docs\/orfao\.md orphan/, r.out);
  assert.equal(r.status, 1, r.out);
});

test("um doc linkado a partir do índice não é órfão", () => {
  const dir = project({ "docs/README.md": `# Índice\n\n${BANNER}\n[ligado](./ligado.md)\n`, "docs/ligado.md": `# Ligado\n\n${BANNER}` });
  const r = audit(dir);
  assert.equal(r.status, 0, r.out);
});
