import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vox-populi");
const relayDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "relay");

test("vox-populi - config/vox-populi.json possui schema valido e limites de recursos", () => {
  const configPath = path.join(root, "config", "vox-populi.json");
  assert.ok(fs.existsSync(configPath), "config/vox-populi.json deve existir");

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);

  assert.equal(typeof cfg.nodeName, "string");
  assert.equal(typeof cfg.version, "string");
  assert.equal(typeof cfg.network.listenPort, "number");
  assert.equal(cfg.network.listenHost, "127.0.0.1", "listenHost deve ser loopback seguro");
  assert.equal(cfg.network.enableLanDiscovery, false, "enableLanDiscovery deve ser false por padrao");
  assert.equal(cfg.network.enablePublicInbound, false);
  assert.ok(cfg.resources.maxStorageMb <= 10240, "Armazenamento deve ter limite razoavel");
  assert.equal(cfg.resources.maxCpuPercent, 40);
  assert.equal(typeof cfg.resources.maxBandwidthMonthlyGb, "number");
  assert.ok(Array.isArray(cfg.communities), "communities deve ser um array");
  assert.equal(cfg.services.seeder, false, "seeder deve ser honesto (nao implementado no MVP)");
});

test("vox-populi - monitoring/status.json contem estrutura de telemetria inicial honesta", () => {
  const statusPath = path.join(root, "monitoring", "status.json");
  assert.ok(fs.existsSync(statusPath), "monitoring/status.json deve existir");

  const raw = fs.readFileSync(statusPath, "utf8");
  const stat = JSON.parse(raw);

  assert.ok("nodeStatus" in stat);
  assert.ok("system" in stat);
  assert.ok("network" in stat);
  assert.ok("services" in stat);
  assert.ok("arch" in stat.system, "Deve conter identificador de arquitetura em system");
  assert.equal(stat.services.seederActive, false);
  assert.equal(stat.services.seederStatus, "not_implemented");
  assert.equal(typeof stat.system.cpuPercent, "number");
});

test("vox-populi - systemd/vox-populi.service possui argumentos corretos, cgroups e isolamento", () => {
  const servicePath = path.join(root, "systemd", "vox-populi.service");
  assert.ok(fs.existsSync(servicePath), "systemd/vox-populi.service deve existir");

  const content = fs.readFileSync(servicePath, "utf8");

  assert.ok(content.includes("[Unit]"));
  assert.ok(content.includes("[Service]"));
  assert.ok(content.includes("[Install]"));
  assert.ok(content.includes("User=vox-populi"));
  assert.ok(content.includes("--host 127.0.0.1"), "ExecStart deve usar --host em vez de --bind");
  assert.ok(!content.includes("--bind 127.0.0.1"), "ExecStart nao deve usar --bind");
  assert.ok(content.includes('VOX_RELAY_CACHE_DIR=/var/lib/vox-populi/cache'));
  assert.ok(content.includes('VOX_RELAY_MAX_CACHE_MB=2048'));
  assert.ok(content.includes("CPUQuota=40%"), "Deve aplicar limite de CPU via cgroup");
  assert.ok(content.includes("MemoryMax=512M"), "Deve aplicar limite de memoria via cgroup");
  assert.ok(content.includes("NoNewPrivileges=true"));
  assert.ok(content.includes("ProtectSystem=full"));
  assert.ok(content.includes("ProtectHome=true"));
  assert.ok(content.includes("StateDirectory=vox-populi"));
  assert.ok(content.includes("Restart=always"));
});

test("vox-populi - systemd temporizador de saude (5 minutos) existe e possui configuracao valida", () => {
  const timerPath = path.join(root, "systemd", "vox-populi-health.timer");
  const timerServicePath = path.join(root, "systemd", "vox-populi-health.service");

  assert.ok(fs.existsSync(timerPath), "vox-populi-health.timer deve existir");
  assert.ok(fs.existsSync(timerServicePath), "vox-populi-health.service deve existir");

  const timerContent = fs.readFileSync(timerPath, "utf8");
  assert.ok(timerContent.includes("OnUnitActiveSec=5min"), "Timer deve disparar a cada 5 minutos");
  assert.ok(timerContent.includes("WantedBy=timers.target"));

  const srvContent = fs.readFileSync(timerServicePath, "utf8");
  assert.ok(srvContent.includes("Type=oneshot"));
  assert.ok(srvContent.includes("/opt/vox-populi/health-check.sh"));
});

test("vox-populi - install.sh possui verificacao estrita de boot sem ignorar falhas", () => {
  const installCode = fs.readFileSync(path.join(root, "install.sh"), "utf8");

  assert.ok(installCode.includes("systemctl is-active"), "Deve checar se o servico esta ativo");
  assert.ok(installCode.includes("/health"), "Deve consultar o endpoint /health");
  assert.ok(installCode.includes("IS_OPERATIONAL"), "Deve ter controle de prontidao operacional");
  assert.ok(installCode.includes("exit 1"), "Deve falhar explicitamente em caso de erro");
  assert.ok(!installCode.includes("health-check.sh || true"), "Nao deve mascarar falhas no health check");
});

test("vox-populi - health-check.sh calcula metricas reais e diferencia seeder de relay", () => {
  const code = fs.readFileSync(path.join(root, "health-check.sh"), "utf8");

  assert.ok(code.includes("read_storage_metrics"), "Deve medir armazenamento em disco real");
  assert.ok(code.includes("check_gateway_connectivity"), "Deve sondar conectividade com gateways");
  assert.ok(code.includes("read_architecture"), "Deve conter funcao de deteccao de arquitetura");
  assert.ok(code.includes("uname -m"), "Deve usar uname -m para detectar a arquitetura do hardware");
  assert.ok(code.includes("read_temperature"), "Deve aferir temperatura fisica do SoC");
  assert.ok(code.includes('"seederStatus": "not_implemented"'), "Deve reportar seeder honestamente");
  assert.ok(code.includes('"seederActive": false'), "Deve reportar seeder inativo no MVP");
  assert.ok(!code.includes('"storageUsedMb": 0,\n    "storageAvailableMb": 2048'), "Nao deve usar constantes fixas");
});

test("vox-populi - teste de integracao funcional em tempo de execucao (boot, cache, quota)", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "farol_integration_"));
  const cacheDir = path.join(tempDir, "cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  const randomPort = 3980 + Math.floor(Math.random() * 50);
  const pythonBin = process.platform === "win32"
    ? "C:\\Users\\yurik\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
    : "python3";

  const proc = spawn(pythonBin, ["-m", "relay.server", "--port", String(randomPort), "--host", "127.0.0.1"], {
    cwd: path.join(root, ".."),
    env: {
      ...process.env,
      VOX_RELAY_CACHE_DIR: cacheDir,
      VOX_RELAY_MAX_CACHE_MB: "2",
      VOX_RELAY_PORT: String(randomPort),
    },
    stdio: "pipe",
  });

  try {
    // 1. Aguarda inicialização do servidor
    let isUp = false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${randomPort}/health`);
        if (res.ok) {
          const body = await res.json();
          if (body.status === "ok") {
            isUp = true;
            assert.equal(body.app, "vox-relay");
            assert.equal(path.resolve(body.cacheDir), path.resolve(cacheDir));
            break;
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert.ok(isUp, "Servidor relay deve subir e responder no endpoint /health");

    // 2. Exercita gravação no diretório de cache isolado (/vox/mirror)
    const mirrorPayload = {
      communityId: "vox-populi-lab-comm",
      title: "Comunidade Laboratório",
      topics: [{ id: "t100", title: "Primeiro Tópico Vox Populi" }],
    };
    const postRes = await fetch(`http://127.0.0.1:${randomPort}/vox/mirror`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mirrorPayload),
    });
    assert.equal(postRes.status, 200);

    const writtenFile = path.join(cacheDir, "index_vox-populi-lab-comm.json");
    assert.ok(fs.existsSync(writtenFile), "Arquivo de cache deve ser gravado no diretório configurado");
    const writtenData = JSON.parse(fs.readFileSync(writtenFile, "utf8"));
    assert.equal(writtenData.communityId, "vox-populi-lab-comm");

    // 3. Lê de volta o espelho do cache
    const getRes = await fetch(`http://127.0.0.1:${randomPort}/vox/index/vox-populi-lab-comm.json`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("x-vox-cache"), "HIT");
  } finally {
    proc.kill("SIGTERM");
    await new Promise((resolve) => {
      proc.on("exit", () => resolve());
      setTimeout(resolve, 300);
    });
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }
});
