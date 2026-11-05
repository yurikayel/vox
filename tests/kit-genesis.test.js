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

test("kit-genesis - validateKitManifest valida schemas e rejeita anomalias", () => {
  assert.equal(validateKitManifest(KIT_BAIRRO), true);
  assert.equal(validateKitManifest(KIT_SINDICATO), true);
  assert.equal(validateKitManifest(KIT_COLETIVO), true);

  assert.throws(() => validateKitManifest(null), /objeto válido/);
  assert.throws(() => validateKitManifest({ id: "" }), /campo 'id'/);
  assert.throws(() => validateKitManifest({ id: "k", version: "1" }), /campo 'title'/);
  assert.throws(
    () => validateKitManifest({ id: "k", version: "1", title: "T", roles: {} }),
    /ao menos uma role/
  );
  assert.throws(
    () =>
      validateKitManifest({
        id: "k",
        version: "1",
        title: "T",
        roles: { Admin: ["*"] },
        channels: [],
      }),
    /lista não vazia de canais/
  );
});

test("kit-genesis - instanciação de Kit Bairro gera canais e cartuchos hiperlocais", () => {
  const comm = instantiateCommunityFromKit("kit-bairro", {
    id: "comm_vila_esperanca",
    name: "Comunidade da Vila Esperança",
    creatorAddr: "vx_ed25519_dona_clara",
  });

  assert.equal(comm.communityId, "comm_vila_esperanca");
  assert.equal(comm.name, "Comunidade da Vila Esperança");
  assert.equal(comm.creatorAddr, "vx_ed25519_dona_clara");
  assert.deepEqual(comm.memberRoles["vx_ed25519_dona_clara"], ["Admin"]);

  // Canais
  assert.equal(comm.channels.length, 4);
  assert.equal(comm.channels[0].id, "zeladoria-e-obras");
  assert.equal(comm.channels[0].communityId, "comm_vila_esperanca");
  assert.equal(comm.channels[1].id, "feira-livre-do-bairro");

  // Cartuchos
  assert.equal(comm.cartridges.length, 2);
  assert.equal(comm.cartridges[0].id, "feira-pix");
  assert.equal(comm.cartridges[0].communityId, "comm_vila_esperanca");
  assert.equal(comm.cartridges[1].id, "mural-entregas");

  // Política de segurança
  assert.equal(comm.securityPolicy.requirePresenceQr, true);
  assert.equal(comm.securityPolicy.allowGuestRead, true);
});

test("kit-genesis - instanciação de Kit Sindicato impõe fé pública com PAdES/gov.br", () => {
  const comm = instantiateCommunityFromKit("kit-sindicato", {
    name: "Sindicato dos Metalúrgicos Unidos",
    creatorAddr: "vx_ed25519_secretario_geral",
  });

  assert.ok(comm.communityId.startsWith("comm_sindicato_"));
  assert.equal(comm.name, "Sindicato dos Metalúrgicos Unidos");

  // Canais específicos
  const channelIds = comm.channels.map((c) => c.id);
  assert.ok(channelIds.includes("assembleia-permanente"));
  assert.ok(channelIds.includes("votacoes-e-editais"));
  assert.ok(channelIds.includes("prestacao-de-contas"));

  // Cartucho com estratégia audit-log para deliberação soberana
  const urna = comm.cartridges.find((c) => c.id === "urna-pades-govbr");
  assert.ok(urna);
  assert.equal(urna.crdtStrategy, "audit-log");
  assert.equal(urna.epochThreshold, 20);

  // Segurança sindical estrita
  assert.equal(comm.securityPolicy.requirePadesGovBrOnVote, true);
  assert.equal(comm.securityPolicy.requireWorkerRegistration, true);
  assert.equal(comm.securityPolicy.allowGuestRead, false);
});

test("kit-genesis - instanciação de Kit Coletivo ativa acervo aberto e caderno compartilhado", () => {
  const comm = instantiateCommunityFromKit("kit-coletivo", {
    name: "Coletivo Cultural Flor do Campo",
    securityPolicyOverrides: { allowGuestRead: false },
  });

  assert.equal(comm.name, "Coletivo Cultural Flor do Campo");
  assert.equal(comm.securityPolicy.allowGuestRead, false); // override aceito
  assert.equal(comm.securityPolicy.requireHashVerifiedPin, true);

  const cartIds = comm.cartridges.map((c) => c.id);
  assert.ok(cartIds.includes("biblioteca-bolso"));
  assert.ok(cartIds.includes("caderno-coletivo"));
});
