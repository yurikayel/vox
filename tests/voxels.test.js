import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as voxels from "../client/js/voxels.js";
import * as profileVoxels from "../client/js/render/profile-voxels.js";
import * as profileRender from "../client/js/render/profile.js";

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

test("voxels: sw.js armazena voxels.js e profile-voxels.js em cache offline", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes("./js/voxels.js"), "sw.js deve conter ./js/voxels.js no SHELL_ASSETS");
  assert.ok(sw.includes("./js/render/profile-voxels.js"), "sw.js deve conter ./js/render/profile-voxels.js no SHELL_ASSETS");
});

test("voxels-ui: renderProfileVoxelsTab renderiza hero, 3 trilhas e conquistas", () => {
  const receipts = [
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_1",
      routeId: "vx_cidadao_1",
      category: "forja",
      action: "relay_cache_uptime",
      amount: 25,
      timestamp: 1000,
      metadata: { uptimeHours: 2 },
    },
    {
      schema: voxels.SCHEMA_VOXEL_RECEIPT,
      id: "vxr_2",
      routeId: "vx_cidadao_1",
      category: "agora",
      action: "agora_consensus_synthesis",
      amount: 30,
      timestamp: 2000,
    },
  ];

  const html = profileVoxels.renderProfileVoxelsTab({
    address: "vx_cidadao_1",
    isCurrentWallet: true,
    receipts,
  });

  assert.ok(html.includes("55"), "Deve exibir saldo total de 55 voxels");
  assert.ok(html.includes("Passaporte Cívico"), "Deve conter título do passaporte");
  assert.ok(html.includes("Forja"), "Deve renderizar card da Forja");
  assert.ok(html.includes("Ágora"), "Deve renderizar card da Ágora");
  assert.ok(html.includes("Cuidado"), "Deve renderizar card do Cuidado");
  assert.ok(html.includes("Farol de Entrada"), "Deve conter insígnia Farol de Entrada");
  assert.ok(html.includes("Conquistado"), "Deve exibir badge conquistado para farol");
  assert.ok(html.includes("btn-export-voxel-passport"), "Usuário dono deve ver botão de exportar passaporte");
});

test("voxels-ui: renderProfileVoxelsTab oculta botão de exportação para terceiros", () => {
  const html = profileVoxels.renderProfileVoxelsTab({
    address: "vx_outro_usuario",
    isCurrentWallet: false,
    receipts: [],
  });

  assert.ok(!html.includes("btn-export-voxel-passport"), "Terceiros não devem ver botão de exportar passaporte");
  assert.ok(html.includes("0"), "Saldo zerado exibido com clareza");
});

test("voxels-ui: renderProfileTabContent integra aba voxels no perfil", () => {
  const html = profileRender.renderProfileTabContent("voxels", {
    address: "vx_cidadao_1",
    isCurrentWallet: true,
  });

  assert.ok(!html.includes("profile-grid-header"), "Aba voxels não deve repetir header do perfil");
  assert.ok(html.includes("profile-grid-voxels"), "Deve incluir container da aba voxels");
  assert.ok(html.includes("Passaporte Cívico"));
});

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

test("voxels-storage: saveVoxelReceipt e loadVoxelReceipts persistem e recuperam recibos", async () => {
  const storage = createMockStorage();
  const receipt = await voxels.createVoxelReceipt({
    routeId: "vx_persist_user",
    category: "agora",
    action: "agora_structured_proposal",
    amount: 20,
    timestamp: 1000,
  });

  const res = voxels.saveVoxelReceipt(receipt, storage);
  assert.equal(res.ok, true);
  assert.equal(res.count, 1);

  const loaded = voxels.loadVoxelReceipts("vx_persist_user", storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, receipt.id);
  assert.equal(loaded[0].amount, 20);

  voxels.clearVoxelReceipts("vx_persist_user", storage);
  assert.equal(voxels.loadVoxelReceipts("vx_persist_user", storage).length, 0);
});

test("voxels-storage: saveVoxelReceipt poda histórico excedente acima de MAX_STORED_RECEIPTS", async () => {
  const storage = createMockStorage();
  const baseReceipt = {
    schema: voxels.SCHEMA_VOXEL_RECEIPT,
    id: "vxr_sample",
    routeId: "vx_bulk_user",
    category: "cuidado",
    action: "cuidado_peer_onboarding",
    amount: 15,
    timestamp: 1000,
  };

  // Simula armazenamento com 502 itens
  const bulk = Array.from({ length: 502 }, (_, i) => ({ ...baseReceipt, id: `vxr_${i}` }));
  storage.setItem(voxels.getStorageKey("vx_bulk_user"), JSON.stringify(bulk));

  const newReceipt = { ...baseReceipt, id: "vxr_new_503" };
  const res = voxels.saveVoxelReceipt(newReceipt, storage);
  assert.equal(res.ok, true);
  assert.equal(res.count, voxels.MAX_STORED_RECEIPTS);

  const loaded = voxels.loadVoxelReceipts("vx_bulk_user", storage);
  assert.equal(loaded.length, voxels.MAX_STORED_RECEIPTS);
  assert.equal(loaded[loaded.length - 1].id, "vxr_new_503");
});

test("voxels-storage: recordCivicAction cria e armazena recibo em 1 passo", async () => {
  const storage = createMockStorage();
  const receipt = await voxels.recordCivicAction({
    routeId: "vx_action_user",
    category: "forja",
    action: "seed_blob_share",
  }, storage);

  assert.ok(receipt.id.startsWith("vxr_"));
  const stored = voxels.loadVoxelReceipts("vx_action_user", storage);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].action, "seed_blob_share");
});

test("voxels-passport: exportSignedVoxelPassport e verifySignedVoxelPassport validam envelope criptográfico", async () => {
  const mockSign = async (payload) => ({
    ...payload,
    author: payload.routeId,
    pubKey: { kty: "EC", crv: "P-256", x: "mockX", y: "mockY" },
    sig: "mock_ecdsa_signature",
    ts: 1793894400000,
  });

  const exportResult = await voxels.exportSignedVoxelPassport("vx_signed_user", [], [], mockSign);
  assert.equal(exportResult.ok, true);
  assert.equal(exportResult.isSigned, true);
  assert.ok(exportResult.filename.includes("vox-passaporte-civico-vx_signed_user"));

  const mockVerifyValid = async () => true;
  const checkValid = await voxels.verifySignedVoxelPassport(exportResult.signedPassport, mockVerifyValid);
  assert.equal(checkValid.isValid, true);
  assert.equal(checkValid.isSigned, true);

  const mockVerifyInvalid = async () => false;
  const checkInvalid = await voxels.verifySignedVoxelPassport(exportResult.signedPassport, mockVerifyInvalid);
  assert.equal(checkInvalid.isValid, false);
  assert.equal(checkInvalid.reason, "signature-failed");
});

test("voxels-node: checkAndRecordNodeZeroReward bonifica nó ativo e respeita cooldown de 1h", async () => {
  const storage = createMockStorage();
  const now = 10_000_000;

  // Nó offline não gera recompensa
  const offlineCheck = await voxels.checkAndRecordNodeZeroReward("vx_node_host", false, now, storage);
  assert.equal(offlineCheck.rewarded, false);
  assert.equal(offlineCheck.reason, "node-offline");

  // Nó online gera 10 voxels de forja
  const firstReward = await voxels.checkAndRecordNodeZeroReward("vx_node_host", true, now, storage);
  assert.equal(firstReward.rewarded, true);
  assert.equal(firstReward.amount, 10);

  // Chamada repetida antes de 1h aciona cooldown
  const cooldownCheck = await voxels.checkAndRecordNodeZeroReward("vx_node_host", true, now + 1000, storage);
  assert.equal(cooldownCheck.rewarded, false);
  assert.equal(cooldownCheck.reason, "cooldown-active");

  // Após 1h (3600_000 ms), nova recompensa é concedida
  const secondReward = await voxels.checkAndRecordNodeZeroReward("vx_node_host", true, now + 3600_001, storage);
  assert.equal(secondReward.rewarded, true);
  assert.equal(secondReward.amount, 10);
});
