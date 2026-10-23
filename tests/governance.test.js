import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as gov from "../client/js/governance.js";

test("governance - validateProposalInput valida campos obrigatórios e limites", () => {
  const invalidComm = gov.validateProposalInput({ title: "Título", body: "Texto", communityId: "" });
  assert.equal(invalidComm.valid, false);

  const emptyTitle = gov.validateProposalInput({ title: "  ", body: "Texto", communityId: "c1" });
  assert.equal(emptyTitle.valid, false);

  const valid = gov.validateProposalInput({
    title: "Ativar feira comunitária",
    body: "Proposta para abrir classificados locais.",
    diffText: "+ commercialEnabled: true",
    communityId: "demo-aprenda-vox",
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.title, "Ativar feira comunitária");
  assert.equal(valid.communityId, "demo-aprenda-vox");
});

test("governance - normalizeVoteChoice reconhece português, inglês e sinônimos", () => {
  assert.equal(gov.normalizeVoteChoice("yes"), "yes");
  assert.equal(gov.normalizeVoteChoice("sim"), "yes");
  assert.equal(gov.normalizeVoteChoice("aprovar"), "yes");

  assert.equal(gov.normalizeVoteChoice("no"), "no");
  assert.equal(gov.normalizeVoteChoice("não"), "no");
  assert.equal(gov.normalizeVoteChoice("rejeitar"), "no");

  assert.equal(gov.normalizeVoteChoice("abstain"), "abstain");
  assert.equal(gov.normalizeVoteChoice("abstenção"), "abstain");
  assert.equal(gov.normalizeVoteChoice("abster"), "abstain");

  assert.equal(gov.normalizeVoteChoice("outro"), "");
  assert.equal(gov.normalizeVoteChoice(""), "");
});

test("governance - isEligibleToVote respeita o marco de corte (Eligibility-Cutoff)", () => {
  const cutoff = 1000;

  // Membro antigo (antes do cutoff)
  assert.equal(gov.isEligibleToVote({ membershipTs: 500, proposalCreatedAt: cutoff }), true);

  // Membro no exato momento
  assert.equal(gov.isEligibleToVote({ membershipTs: 1000, proposalCreatedAt: cutoff }), true);

  // Membro que entrou DEPOIS do corte (brigading) -> INELEGÍVEL
  assert.equal(gov.isEligibleToVote({ membershipTs: 1001, proposalCreatedAt: cutoff }), false);
  assert.equal(gov.isEligibleToVote({ membershipTs: 2000, proposalCreatedAt: cutoff }), false);

  // Dados inválidos
  assert.equal(gov.isEligibleToVote({ membershipTs: null, proposalCreatedAt: cutoff }), false);
});

test("governance - computeTally apura 1 membro = 1 voto, descarta brigading e atualiza votos", () => {
  const proposalCreatedAt = 10000;
  const proposalClosesAt = 20000;
  const proposal = {
    id: "prop-1",
    createdAt: proposalCreatedAt,
    closesAt: proposalClosesAt,
    minQuorum: 2,
  };

  const memberships = [
    { author: "membro_alice", ts: 5000 },
    { author: "membro_bob", ts: 8000 },
    { author: "membro_carol", ts: 9999 },
    // David entrou após o cutoff (tentativa de brigading)
    { author: "membro_david", ts: 12000 },
  ];

  const votes = [
    // Alice vota SIM
    { author: "membro_alice", choice: "yes", ts: 11000 },
    // Bob vota NÃO inicialmente
    { author: "membro_bob", choice: "no", ts: 11100 },
    // Bob muda de ideia e vota SIM mais tarde (deve prevalecer)
    { author: "membro_bob", choice: "yes", ts: 11500 },
    // Carol vota ABSTENÇÃO
    { author: "membro_carol", choice: "abstain", ts: 11200 },
    // David tenta votar NÃO, mas entrou depois do cutoff
    { author: "membro_david", choice: "no", ts: 12500 },
    // Estranho não-membro tenta votar
    { author: "estranho_eve", choice: "no", ts: 13000 },
  ];

  // 1. Tally durante votação aberta (now = 15000)
  const tallyOpen = gov.computeTally({ proposal, votes, memberships, now: 15000 });
  assert.equal(tallyOpen.yes, 2); // Alice + Bob (último voto)
  assert.equal(tallyOpen.no, 0); // Bob mudou para SIM, David e Eve inelegíveis
  assert.equal(tallyOpen.abstain, 1); // Carol
  assert.equal(tallyOpen.totalEligible, 3);
  assert.equal(tallyOpen.totalVotes, 5); // Alice, Bob, Carol, David, Eve
  assert.equal(tallyOpen.ineligibleCount, 2); // David + Eve
  assert.equal(tallyOpen.state, "open");

  // Detalhe de votos
  const davidDetail = tallyOpen.votesDetail.find((d) => d.author === "membro_david");
  assert.ok(davidDetail);
  assert.equal(davidDetail.eligible, false);
  assert.ok(davidDetail.reason.includes("marco de corte"));

  const eveDetail = tallyOpen.votesDetail.find((d) => d.author === "estranho_eve");
  assert.ok(eveDetail);
  assert.equal(eveDetail.eligible, false);
  assert.ok(eveDetail.reason.includes("não é membro"));

  // 2. Tally após encerramento (now = 25000) -> deve dar merged (Sim venceu)
  const tallyClosed = gov.computeTally({ proposal, votes, memberships, now: 25000 });
  assert.equal(tallyClosed.state, "merged");
  assert.equal(tallyClosed.isPassed, true);
});

test("governance - parseUnifiedDiff divide em adições, remoções e contexto", () => {
  const diff = `@@ -1,3 +1,3 @@
- commercialEnabled: false
+ commercialEnabled: true
  rules: "respeito mútuo"`;

  const parsed = gov.parseUnifiedDiff(diff);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].type, "hunk");
  assert.equal(parsed[1].type, "del");
  assert.ok(parsed[1].text.includes("commercialEnabled: false"));
  assert.equal(parsed[2].type, "add");
  assert.ok(parsed[2].text.includes("commercialEnabled: true"));
  assert.equal(parsed[3].type, "ctx");
});
