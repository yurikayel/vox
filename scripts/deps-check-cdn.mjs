#!/usr/bin/env node
/**
 * LAN-20 — rotina mensal: baixa cada URL que tem `sha384-…` na mesma linha de docs/DEPENDENCIAS.md
 * e compara o hash. Só calcula hash; nunca executa o que baixou.
 * Uso: node scripts/deps-check-cdn.mjs   (sai com 1 se algum hash mudou ou a URL falhou)
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const UA = "vox-deps-check/1 (+https://github.com/yurikayel/vox)";
const doc = readFileSync(new URL("../docs/DEPENDENCIAS.md", import.meta.url), "utf8");

const pins = [];
for (const line of doc.split("\n")) {
  const sri = line.match(/sha384-[A-Za-z0-9+/=]+/)?.[0];
  const url = line.match(/https:\/\/[^\s`)|]+/)?.[0];
  if (sri && url) pins.push({ url, sri });
}

async function check({ url, sri }) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) return { url, sri, got: `HTTP ${res.status}`, ok: false };
    const body = Buffer.from(await res.arrayBuffer());
    const got = `sha384-${createHash("sha384").update(body).digest("base64")}`;
    return { url, sri, got, ok: got === sri, bytes: body.length };
  } catch (err) {
    return { url, sri, got: String(err?.message || err), ok: false };
  }
}

const results = await Promise.all(pins.map(check));
const lines = ["### LAN-20 — hashes de CDN", "", "| URL | esperado | obtido | ok |", "|---|---|---|---|"];
for (const r of results) lines.push(`| ${r.url} | \`${r.sri}\` | \`${r.got}\` | ${r.ok ? "✅" : "❌"} |`);
if (!pins.length) lines.push("| (nenhuma URL com sha384 no inventário) | | | ❌ |");
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
// exitCode em vez de exit(): no Windows, sair com o fetch ainda fechando derruba o libuv.
process.exitCode = pins.length && results.every((r) => r.ok) ? 0 : 1;
