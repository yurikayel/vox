import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  KIT_BAIRRO,
  KIT_SINDICATO,
  KIT_COLETIVO,
  listAvailableKits,
  getKitManifest,
  validateKitManifest,
  instantiateCommunityFromKit,
} from "../client/js/kit-genesis.js";

test("kit-genesis - lista os 3 arquétipos oficiais de comunidade soberana", () => {
  const kits = listAvailableKits();
  assert.equal(kits.length, 3);
  assert.equal(kits[0].id, "kit-bairro");
  assert.equal(kits[1].id, "kit-sindicato");
  assert.equal(kits[2].id, "kit-coletivo");
});

test("kit-genesis - getKitManifest localiza por ID e retorna null para inexistente", () => {
  assert.equal(getKitManifest("kit-bairro"), KIT_BAIRRO);
  assert.equal(getKitManifest("kit-sindicato"), KIT_SINDICATO);
  assert.equal(getKitManifest("kit-coletivo"), KIT_COLETIVO);
  assert.equal(getKitManifest("kit-inexistente"), null);
  assert.equal(getKitManifest(null), null);
});

test("kit-genesis - manifestos são profundamente congelados e imutáveis", () => {
  assert.ok(Object.isFrozen(KIT_BAIRRO));
  assert.ok(Object.isFrozen(KIT_BAIRRO.roles));
  assert.ok(Object.isFrozen(KIT_BAIRRO.channels));
  assert.ok(Object.isFrozen(KIT_BAIRRO.cartridges));
  assert.ok(Object.isFrozen(KIT_BAIRRO.securityPolicy));

  assert.throws(() => {
    KIT_BAIRRO.title = "Nome Alterado";
  });
  assert.throws(() => {
    KIT_BAIRRO.channels.push({ id: "hacked", title: "Invasão" });
  });
});

test("kit-genesis - coerência cruzada e isolamento de canais nos kits oficiais", () => {
  // Kit Bairro: VerifiedPeer escreve em mural-entregas, mas NÃO em avisos-comunitarios
  assert.ok(KIT_BAIRRO.roles.VerifiedPeer.includes("write:channel:mural-entregas"));
  assert.ok(!KIT_BAIRRO.roles.VerifiedPeer.includes("write:channel:avisos-comunitarios"));

  // Kit Sindicato: Delegate escreve em votacoes-e-editais; VerifiedWorker escreve em assembleia-permanente
  assert.ok(KIT_SINDICATO.roles.Delegate.includes("write:channel:votacoes-e-editais"));
  assert.ok(!KIT_SINDICATO.roles.Delegate.includes("write:channel:assembleia-permanente"));
  assert.ok(KIT_SINDICATO.roles.VerifiedWorker.includes("write:channel:assembleia-permanente"));
  assert.ok(!KIT_SINDICATO.roles.Delegate.includes("write:channel:*"));
  assert.ok(!KIT_SINDICATO.roles.Delegate.includes("write:channel:prestacao-de-contas"));

  // Kit Coletivo: Member escreve em agenda-cultural e leituras-e-debates
  assert.ok(KIT_COLETIVO.roles.Member.includes("write:channel:agenda-cultural"));
  assert.ok(KIT_COLETIVO.roles.Member.includes("write:channel:leituras-e-debates"));
});

test("kit-genesis - validateKitManifest checagens cruzadas e isolamento de canal", () => {
  assert.equal(validateKitManifest(KIT_BAIRRO), true);
  assert.equal(validateKitManifest(KIT_SINDICATO), true);
  assert.equal(validateKitManifest(KIT_COLETIVO), true);

  // Rejeita outro papel com permissão explícita no canal de outrem
  assert.throws(
    () =>
      validateKitManifest({
        id: "teste_invasao",
        version: "1.0.0",
        title: "Teste",
        roles: {
          Admin: ["*"],
          Auditor: ["read:channel:*", "write:channel:canal_secreto"],
          Official: ["write:channel:canal_secreto"],
        },
        channels: [{ id: "canal_secreto", title: "Segredo", writeRole: "Official" }],
        cartridges: [],
        securityPolicy: {},
      }),
    /não pode ter permissão de escrita no canal 'canal_secreto'/
  );

  // Rejeita cartucho cujo channelId não existe
  assert.throws(
    () =>
      validateKitManifest({
        id: "teste",
        version: "1.0.0",
        title: "Teste",
        roles: { Admin: ["*"] },
        channels: [{ id: "c1", title: "C1", writeRole: "Admin" }],
        cartridges: [{ id: "cart1", filename: "cart.xdc", channelId: "c_inexistente", crdtStrategy: "id-lookup", epochThreshold: 50 }],
        securityPolicy: {},
      }),
    /não existe na lista de canais/
  );
});

test("kit-genesis - exige creatorAddr válido e rejeita criação sem admin", () => {
  assert.throws(
    () => instantiateCommunityFromKit("kit-bairro", { name: "Sem Criador" }),
    /creatorAddr é obrigatório/
  );

  assert.throws(
    () => instantiateCommunityFromKit("kit-bairro", { creatorAddr: "joao_silva" }),
    /prefixo 'vx_'/
  );

  const comm = instantiateCommunityFromKit("kit-bairro", {
    creatorAddr: "vx_ed25519_dona_clara_123",
  });
  assert.deepEqual(comm.memberRoles["vx_ed25519_dona_clara_123"], ["Admin"]);
});

test("kit-genesis - gera ID criptográfico e valida formato customizado", () => {
  const c1 = instantiateCommunityFromKit("kit-bairro", { creatorAddr: "vx_ed25519_user1" });
  const c2 = instantiateCommunityFromKit("kit-bairro", { creatorAddr: "vx_ed25519_user2" });
  assert.notEqual(c1.communityId, c2.communityId);
  assert.ok(c1.communityId.startsWith("comm_bairro_"));

  const c3 = instantiateCommunityFromKit("kit-bairro", {
    id: "bairro-santa-teresa_01",
    creatorAddr: "vx_ed25519_user1",
  });
  assert.equal(c3.communityId, "bairro-santa-teresa_01");

  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-bairro", {
        id: "../etc/passwd",
        creatorAddr: "vx_ed25519_user1",
      }),
    /ID de comunidade inválido/
  );
});

test("kit-genesis - regra No-Downgrade estrita com allowGuestRead e tipagem", () => {
  // Proíbe abrir leitura a convidados se o kit restringe (Sindicato tem allowGuestRead: false)
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-sindicato", {
        creatorAddr: "vx_ed25519_diretor",
        securityPolicyOverrides: { allowGuestRead: true },
      }),
    /Não é permitido abrir leitura pública/
  );

  // Proíbe desativar flags de proteção obrigatórias do kit
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-sindicato", {
        creatorAddr: "vx_ed25519_diretor",
        securityPolicyOverrides: { requirePadesGovBrOnVote: false },
      }),
    /Não é permitido desativar proteção obrigatória/
  );

  // Proíbe bypass de tipo com strings ou números falsy
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-sindicato", {
        creatorAddr: "vx_ed25519_diretor",
        securityPolicyOverrides: { requirePadesGovBrOnVote: "false" },
      }),
    /deve ser estritamente booleano/
  );

  // Proíbe minTrustScore inválido ou rebaixado
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-bairro", {
        creatorAddr: "vx_ed25519_vizinho",
        securityPolicyOverrides: { minTrustScore: "0" },
      }),
    /minTrustScore deve ser um número inteiro/
  );
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-bairro", {
        creatorAddr: "vx_ed25519_vizinho",
        securityPolicyOverrides: { minTrustScore: 0 }, // base do kit-bairro é 1
      }),
    /Não é permitido reduzir o score mínimo/
  );

  // Permite endurecimento legítimo (fechar leitura a convidados no coletivo)
  const coletivoFechado = instantiateCommunityFromKit("kit-coletivo", {
    creatorAddr: "vx_ed25519_curador",
    securityPolicyOverrides: { allowGuestRead: false },
  });
  assert.equal(coletivoFechado.securityPolicy.allowGuestRead, false);
});
