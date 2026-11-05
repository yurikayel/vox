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

test("kit-genesis - coerência cruzada de permissões nos 3 kits oficiais", () => {
  // Kit Bairro: VerifiedPeer escreve em mural-entregas, mas NÃO em avisos-comunitarios
  assert.ok(KIT_BAIRRO.roles.VerifiedPeer.includes("write:channel:mural-entregas"));
  assert.ok(!KIT_BAIRRO.roles.VerifiedPeer.includes("write:channel:avisos-comunitarios"));

  // Kit Sindicato: Delegate escreve em votacoes e assembleia, mas NÃO em prestacao-de-contas
  assert.ok(KIT_SINDICATO.roles.Delegate.includes("write:channel:votacoes-e-editais"));
  assert.ok(KIT_SINDICATO.roles.Delegate.includes("write:channel:assembleia-permanente"));
  assert.ok(!KIT_SINDICATO.roles.Delegate.includes("write:channel:*"));
  assert.ok(!KIT_SINDICATO.roles.Delegate.includes("write:channel:prestacao-de-contas"));

  // Kit Coletivo: Member escreve em agenda-cultural e leituras-e-debates
  assert.ok(KIT_COLETIVO.roles.Member.includes("write:channel:agenda-cultural"));
  assert.ok(KIT_COLETIVO.roles.Member.includes("write:channel:leituras-e-debates"));
});

test("kit-genesis - validateKitManifest checagens cruzadas e rejeição de anomalias", () => {
  assert.equal(validateKitManifest(KIT_BAIRRO), true);
  assert.equal(validateKitManifest(KIT_SINDICATO), true);
  assert.equal(validateKitManifest(KIT_COLETIVO), true);

  // Rejeita canal cujo writeRole não existe em roles
  assert.throws(
    () =>
      validateKitManifest({
        id: "teste",
        version: "1.0.0",
        title: "Teste",
        roles: { Admin: ["*"] },
        channels: [{ id: "c1", title: "C1", writeRole: "Fantasma" }],
        cartridges: [],
        securityPolicy: {},
      }),
    /não existe no mapa de roles/
  );

  // Rejeita canal cujo writeRole não tem permissão para escrever nele
  assert.throws(
    () =>
      validateKitManifest({
        id: "teste",
        version: "1.0.0",
        title: "Teste",
        roles: { Admin: ["*"], Writer: ["read:channel:*"] },
        channels: [{ id: "c1", title: "C1", writeRole: "Writer" }],
        cartridges: [],
        securityPolicy: {},
      }),
    /não possui permissão de escrita/
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

  // Rejeita IDs duplicados
  assert.throws(
    () =>
      validateKitManifest({
        id: "teste",
        version: "1.0.0",
        title: "Teste",
        roles: { Admin: ["*"] },
        channels: [
          { id: "c1", title: "C1", writeRole: "Admin" },
          { id: "c1", title: "C1 Duplicado", writeRole: "Admin" },
        ],
        cartridges: [],
        securityPolicy: {},
      }),
    /ID de canal duplicado/
  );
});

test("kit-genesis - exige creatorAddr válido e rejeita criação sem admin", () => {
  // creatorAddr ausente deve lançar erro
  assert.throws(
    () => instantiateCommunityFromKit("kit-bairro", { name: "Sem Criador" }),
    /creatorAddr é obrigatório/
  );

  // creatorAddr inválido (sem prefixo vx_)
  assert.throws(
    () => instantiateCommunityFromKit("kit-bairro", { creatorAddr: "joao_silva" }),
    /prefixo 'vx_'/
  );

  // Sucesso com endereço válido
  const comm = instantiateCommunityFromKit("kit-bairro", {
    creatorAddr: "vx_ed25519_dona_clara_123",
  });
  assert.deepEqual(comm.memberRoles["vx_ed25519_dona_clara_123"], ["Admin"]);
});

test("kit-genesis - gera ID aleatório seguro e valida formato de ID customizado", () => {
  // Geração automática livre de colisões com sufixo randômico
  const c1 = instantiateCommunityFromKit("kit-bairro", { creatorAddr: "vx_ed25519_user1" });
  const c2 = instantiateCommunityFromKit("kit-bairro", { creatorAddr: "vx_ed25519_user2" });
  assert.notEqual(c1.communityId, c2.communityId);
  assert.ok(c1.communityId.startsWith("comm_bairro_"));

  // ID customizado válido
  const c3 = instantiateCommunityFromKit("kit-bairro", {
    id: "bairro-santa-teresa_01",
    creatorAddr: "vx_ed25519_user1",
  });
  assert.equal(c3.communityId, "bairro-santa-teresa_01");

  // ID customizado com caracteres perigosos (paths, injeções) é rejeitado
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-bairro", {
        id: "../etc/passwd",
        creatorAddr: "vx_ed25519_user1",
      }),
    /ID de comunidade inválido/
  );
});

test("kit-genesis - regra No-Downgrade em securityPolicyOverrides", () => {
  // Proíbe desativar flags de segurança obrigatórias do kit
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-sindicato", {
        creatorAddr: "vx_ed25519_diretor",
        securityPolicyOverrides: { requirePadesGovBrOnVote: false },
      }),
    /Não é permitido rebaixar a política de segurança/
  );

  // Proíbe reduzir minTrustScore
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-bairro", {
        creatorAddr: "vx_ed25519_vizinho",
        securityPolicyOverrides: { minTrustScore: 0 },
      }),
    /Não é permitido reduzir o limiar numérico/
  );

  // Proíbe chaves desconhecidas
  assert.throws(
    () =>
      instantiateCommunityFromKit("kit-bairro", {
        creatorAddr: "vx_ed25519_vizinho",
        securityPolicyOverrides: { backdoorFlag: true },
      }),
    /Chave desconhecida em securityPolicyOverrides/
  );

  // Permite endurecimento legítimo (aumentar exigência de minTrustScore)
  const endurecido = instantiateCommunityFromKit("kit-bairro", {
    creatorAddr: "vx_ed25519_vizinho",
    securityPolicyOverrides: { minTrustScore: 5 },
  });
  assert.equal(endurecido.securityPolicy.minTrustScore, 5);
});
