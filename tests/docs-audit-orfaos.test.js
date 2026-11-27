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

/** Projeto mínimo em pasta temporária (apagada ao fim do teste): a cópia do script, o índice e os arquivos dados. */
function project(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-docs-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
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

test("um .md gerado em docs/metrics/ não conta como órfão", (t) => {
  const r = audit(project(t, { "docs/metrics/baseline-2026-01-01.md": "# Métricas geradas\n" }));
  assert.doesNotMatch(r.out, /orphan/, r.out);
  assert.equal(r.status, 0, r.out);
});

test("órfãos fora de docs/metrics/ contam: docs/, docs/specs/ e docs/metrics-x/", (t) => {
  const doc = (title) => `# ${title}\n\n${BANNER}`;
  const r = audit(project(t, { "docs/orfao.md": doc("Órfão"), "docs/specs/x.md": doc("Spec"), "docs/metrics-x/x.md": doc("Irmã") }));
  assert.match(r.out, /docs\/orfao\.md orphan/, r.out);
  assert.match(r.out, /docs\/specs\/x\.md orphan/, r.out);
  assert.match(r.out, /docs\/metrics-x\/x\.md orphan/, r.out);
  assert.equal(r.status, 1, r.out);
});

test("um doc linkado a partir do índice não é órfão", (t) => {
  const r = audit(project(t, { "docs/README.md": `# Índice\n\n${BANNER}\n[ligado](./ligado.md)\n`, "docs/ligado.md": `# Ligado\n\n${BANNER}` }));
  assert.equal(r.status, 0, r.out);
});
