import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vox-farol");

test("vox-farol - config/farol.json possui schema valido e limites de recursos", () => {
  const configPath = path.join(root, "config", "farol.json");
  assert.ok(fs.existsSync(configPath), "config/farol.json deve existir");

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);

  assert.equal(typeof cfg.nodeName, "string");
  assert.equal(typeof cfg.version, "string");
  assert.equal(typeof cfg.network.listenPort, "number");
  assert.equal(cfg.network.enablePublicInbound, false);
  assert.ok(cfg.resources.maxStorageMb <= 10240, "Armazenamento deve ter limite razoavel");
  assert.equal(typeof cfg.resources.maxBandwidthMonthlyGb, "number");
  assert.ok(Array.isArray(cfg.communities), "communities deve ser um array");
});

test("vox-farol - monitoring/status.json contem estrutura de telemetria inicial", () => {
  const statusPath = path.join(root, "monitoring", "status.json");
  assert.ok(fs.existsSync(statusPath), "monitoring/status.json deve existir");

  const raw = fs.readFileSync(statusPath, "utf8");
  const stat = JSON.parse(raw);

  assert.ok("nodeStatus" in stat);
  assert.ok("system" in stat);
  assert.ok("network" in stat);
  assert.ok("services" in stat);
  assert.equal(typeof stat.system.cpuPercent, "number");
});

test("vox-farol - systemd/vox-farol.service possui sandboxing estrito e usuario isolado", () => {
  const servicePath = path.join(root, "systemd", "vox-farol.service");
  assert.ok(fs.existsSync(servicePath), "systemd/vox-farol.service deve existir");

  const content = fs.readFileSync(servicePath, "utf8");

  assert.ok(content.includes("[Unit]"));
  assert.ok(content.includes("[Service]"));
  assert.ok(content.includes("[Install]"));
  assert.ok(content.includes("User=vox-farol"));
  assert.ok(content.includes("NoNewPrivileges=true"));
  assert.ok(content.includes("ProtectSystem=full"));
  assert.ok(content.includes("ProtectHome=true"));
  assert.ok(content.includes("Restart=always"));
});

test("vox-farol - scripts bash possuem shebang, modo estrito e confirmacao explicita", () => {
  const scripts = ["install.sh", "uninstall.sh", "update.sh", "health-check.sh"];

  for (const s of scripts) {
    const p = path.join(root, s);
    assert.ok(fs.existsSync(p), `Script ${s} deve existir`);

    const code = fs.readFileSync(p, "utf8");
    assert.ok(code.startsWith("#!/usr/bin/env bash"), `${s} deve ter shebang bash padrao`);
    assert.ok(code.includes("set -euo pipefail"), `${s} deve ativar modo de execucao estrito`);
    assert.ok(!code.includes("sudo rm -rf / "), `${s} nao deve conter comandos destrutivos`);
  }

  const installCode = fs.readFileSync(path.join(root, "install.sh"), "utf8");
  assert.ok(installCode.includes("Deseja prosseguir"), "install.sh deve solicitar confirmacao explicita");

  const uninstallCode = fs.readFileSync(path.join(root, "uninstall.sh"), "utf8");
  assert.ok(uninstallCode.includes("Tem certeza"), "uninstall.sh deve solicitar confirmacao explicita");
});
