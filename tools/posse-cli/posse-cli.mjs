#!/usr/bin/env node
/** Headless POSSE — consome export JSON do Vox PWA (vox-posse-export). */

export function validatePosseExportPayload(raw) {
  if (!raw || typeof raw !== "object") return { valid: false, error: "Payload ausente" };
  if (raw.v !== 1) return { valid: false, error: "Versão v!=1" };
  if (raw.type !== "vox-posse-export") return { valid: false, error: "type inválido" };
  if (!String(raw.topicId || "").trim()) return { valid: false, error: "topicId obrigatório" };
  return { valid: true, payload: raw };
}

export function buildPosseShareText(payload) {
  const title = String(payload.title || "").trim() || "Publicação no Vox";
  const body = String(payload.body || "").trim();
  const url = String(payload.canonicalUrl || "").trim();
  const excerpt = body.length > 280 ? `${body.slice(0, 277)}…` : body;
  const lines = [title];
  if (excerpt) lines.push(excerpt);
  if (url) lines.push(`🔗 ${url}`);
  return lines.join("\n\n");
}

export async function postWebhook(url, payload, { dryRun = false, fetchImpl = fetch } = {}) {
  const u = String(url || "").trim();
  if (!u) return { ok: false, reason: "url vazia" };
  if (dryRun) return { ok: true, dryRun: true, url: u };
  try {
    const res = await fetchImpl(u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status, url: u };
  } catch (err) {
    return { ok: false, reason: err?.message || "fetch failed", url: u };
  }
}

export async function dispatchPosseExport(payload, { webhooks = [], dryRun = false, fetchImpl = fetch } = {}) {
  const val = validatePosseExportPayload(payload);
  if (!val.valid) return { ok: false, error: val.error };
  const results = [];
  for (const url of webhooks) {
    results.push(await postWebhook(url, val.payload, { dryRun, fetchImpl }));
  }
  const failed = results.filter((r) => !r.ok).length;
  return { ok: failed === 0, results, shareText: buildPosseShareText(val.payload) };
}

async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const fileIdx = argv.indexOf("--file");
  let payload = null;
  if (fileIdx !== -1 && argv[fileIdx + 1]) {
    const fs = await import("node:fs/promises");
    payload = JSON.parse(await fs.readFile(argv[fileIdx + 1], "utf8"));
  } else if (!process.stdin.isTTY) {
    payload = await readStdinJson();
  }
  if (!payload) {
    console.error("Uso: posse-cli.mjs [--dry-run] (--file export.json | stdin JSON)");
    process.exit(2);
  }
  const webhooks = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--webhook" && argv[i + 1]) webhooks.push(argv[i + 1]);
  }
  const out = await dispatchPosseExport(payload, { webhooks, dryRun });
  if (!out.ok && out.error) {
    console.error(out.error);
    process.exit(1);
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

import path from "node:path";
import { pathToFileURL } from "node:url";

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
