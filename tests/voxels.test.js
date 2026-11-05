import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as voxels from "../client/js/voxels.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "client");

test("voxels: createVoxelReceipt gera recibo válido e determinístico", async () => {
  const receipt = await voxels.createVoxelReceipt({
    routeId: "vx_militante_123",
    category: "forja",
    action: "relay_cache_uptime",
    witnessRouteId: "vx_no_zero_argon",
    metadata: { uptimeHours: 24, bytesRelayed: 1048576 },
    timestamp: 1793894400000,
  });

  assert.equal(receipt.schema, voxels.SCHEMA_VOXEL_RECEIPT);
  assert.ok(receipt.id.startsWith("vxr_"));
  assert.equal(receipt.routeId, "vx_militante_123");
  assert.equal(receipt.category, "forja");
  assert.equal(receipt.amount, 10); // padrão para relay_cache_uptime
  assert.equal(receipt.witnessRouteId, "vx_no_zero_argon");
  assert.equal(receipt.metadata.uptimeHours, 24);

  const validation = voxels.validateVoxelReceipt(receipt);
  assert.equal(validation.ok, true);
});

test("voxels: createVoxelReceipt aceita valor customizado e valida entradas", async () => {
  const receipt = await voxels.createVoxelReceipt({
    routeId: "vx_agora_456",
    category: "agora",
    action: "agora_consensus_synthesis",
    amount: 50,
  });

  assert.equal(receipt.amount, 50);
  assert.equal(receipt.category, "agora");

  await assert.rejects(
    async () => voxels.createVoxelReceipt({ routeId: "", category: "forja" }),
    /routeId do cidadão é obrigatório/
  );

  await assert.rejects(
    async () => voxels.createVoxelReceipt({ routeId: "vx_test", category: "invalida" }),
    /Categoria inválida/
  );

  await assert.rejects(
    async () => voxels.createVoxelReceipt({ routeId: "vx_test", category: "cuidado", amount: -10 }),
    /Valor do Voxel deve ser número positivo/
  );
});

test("voxels: validateVoxelReceipt rejeita recibos adulterados ou malformados", () => {
  assert.equal(voxels.validateVoxelReceipt(null).ok, false);
  assert.equal(voxels.validateVoxelReceipt({}).ok, false);

  const validMock = {
    schema: voxels.SCHEMA_VOXEL_RECEIPT,
    id: "vxr_1234567890abcdef",
    routeId: "vx_valid",
    category: "forja",
    action: "relay_cache_uptime",
    amount: 10,
    timestamp: 1793894400000,
  };

  assert.equal(voxels.validateVoxelReceipt(validMock).ok, true);
  assert.equal(voxels.validateVoxelReceipt({ ...validMock, schema: "vox-bad-schema" }).ok, false);
  assert.equal(voxels.validateVoxelReceipt({ ...validMock, category: "mercado_financeiro" }).ok, false);
  assert.equal(voxels.validateVoxelReceipt({ ...validMock, amount: 0 }).ok, false);
  assert.equal(voxels.validateVoxelReceipt({ ...validMock, amount: -5 }).ok, false);
  assert.equal(voxels.validateVoxelReceipt({ ...validMock, amount: Infinity }).ok, false);
});

test("voxels: computeVoxelBalance agrega valores e aplica decaimento suave para forja", () => {
  const now = 1793894400000;
  const thirtyDaysAgo = now - 30 * 86_400_000;

  const receipts = [
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_1",
      routeId: "vx_user",
      category: "forja",
      action: "relay_cache_uptime",
      amount: 100,
      timestamp: thirtyDaysAgo,
    },
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_2",
      routeId: "vx_user",
      category: "agora",
      action: "agora_consensus_synthesis",
      amount: 30,
      timestamp: thirtyDaysAgo,
    },
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_3",
      routeId: "vx_user",
      category: "cuidado",
      action: "cuidado_peer_onboarding",
      amount: 20,
      timestamp: now,
    },
  ];

  // Sem decaimento: soma direta
  const rawBalance = voxels.computeVoxelBalance(receipts, { now });
  assert.equal(rawBalance.byCategory.forja, 100);
  assert.equal(rawBalance.byCategory.agora, 30);
  assert.equal(rawBalance.byCategory.cuidado, 20);
  assert.equal(rawBalance.total, 150);
  assert.equal(rawBalance.validReceiptsCount, 3);

  // Com decaimento de meia-vida de 30 dias na forja:
  // forja de 30 dias atrás deve cair pela metade (~50)
  // agora e cuidado devem permanecer sem decaimento
  const decayedBalance = voxels.computeVoxelBalance(receipts, { now, decayHalfLifeDays: 30 });
  assert.equal(decayedBalance.byCategory.forja, 50);
  assert.equal(decayedBalance.byCategory.agora, 30);
  assert.equal(decayedBalance.byCategory.cuidado, 20);
  assert.equal(decayedBalance.total, 100);
});

test("voxels: evaluateAchievements desbloqueia insígnias conforme critérios atingidos", () => {
  const receipts = [
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_1",
      routeId: "vx_user",
      category: "forja",
      action: "relay_cache_uptime",
      amount: 10,
      timestamp: 1000,
      metadata: { uptimeHours: 200, bytesRelayed: 2 * 1024 * 1024 * 1024 },
    },
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_2",
      routeId: "vx_user",
      category: "agora",
      action: "agora_consensus_synthesis",
      amount: 30,
      timestamp: 2000,
    },
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_3",
      routeId: "vx_user",
      category: "cuidado",
      action: "cuidado_peer_onboarding",
      amount: 15,
      timestamp: 3000,
    },
  ];

  const evalResult = voxels.evaluateAchievements(receipts, []);
  assert.ok(evalResult.totalUnlockedCount >= 5);
  const unlockedIds = evalResult.unlocked.map((a) => a.id);
  assert.ok(unlockedIds.includes("forja_farol_iniciante"));
  assert.ok(unlockedIds.includes("forja_guardiao_malha"));
  assert.ok(unlockedIds.includes("forja_semeador_permaweb"));
  assert.ok(unlockedIds.includes("agora_escriba_sintese"));
  assert.ok(unlockedIds.includes("cuidado_guia_boas_vindas"));

  // Nova avaliação com id já desbloqueado anteriormente não o duplica em newlyUnlocked
  const secondEval = voxels.evaluateAchievements(receipts, ["forja_farol_iniciante", "agora_escriba_sintese"]);
  const newlyIds = secondEval.newlyUnlocked.map((a) => a.id);
  assert.ok(!newlyIds.includes("forja_farol_iniciante"));
  assert.ok(!newlyIds.includes("agora_escriba_sintese"));
  assert.ok(newlyIds.includes("forja_guardiao_malha"));
});

test("voxels: buildVoxelPassport consolida passaporte cívico local", () => {
  const receipts = [
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_1",
      routeId: "vx_cidadao_soberano",
      category: "forja",
      action: "relay_cache_uptime",
      amount: 10,
      timestamp: 1000,
      metadata: { uptimeHours: 2 },
    },
  ];

  const passport = voxels.buildVoxelPassport("vx_cidadao_soberano", receipts, []);
  assert.equal(passport.schema, voxels.SCHEMA_VOXEL_PASSPORT);
  assert.equal(passport.routeId, "vx_cidadao_soberano");
  assert.equal(passport.receiptCount, 1);
  assert.equal(passport.balance.total, 10);
  assert.ok(passport.achievements.some((a) => a.id === "forja_farol_iniciante"));
});

test("voxels: sw.js armazena voxels.js em cache offline", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes("./js/voxels.js"), "sw.js deve conter ./js/voxels.js no SHELL_ASSETS");
});
