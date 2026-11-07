import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { appendPollOptionsToBody, parsePollOptions } from "../client/js/civic-post.js";
import { renderVoteConfirmHtml, voteChoiceLabel } from "../client/js/app/vote-confirm.js";
import { renderNetworkWizard, renderBackupWizard, renderWalletWizard } from "../client/js/render/guided-setup.js";
import { parseRoute } from "../client/js/app/route-parse.js";

const render = await import("../client/js/render.js");
const steps = (html) => (html.match(/class="compose-step"/g) || []).length;

function routeFor(hash) {
  const loc = { hash, search: "" };
  const pw = globalThis.window;
  const pl = globalThis.location;
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try { return parseRoute(); } finally { globalThis.window = pw; globalThis.location = pl; }
}

test("etapas — proposta, comunidade e feira preservam campos e declaram obrigatórios", () => {
  const m = { innerHTML: "" };
  render.renderComposeProposal(m, "vox", "Vox");
  assert.equal(steps(m.innerHTML), 4);
  assert.ok(m.innerHTML.includes('data-step-required="prop-title"') && m.innerHTML.includes('id="btn-submit-proposal"'));
  render.renderComposeCommunity(m);
  assert.equal(steps(m.innerHTML), 5);
  assert.ok(m.innerHTML.includes('data-step-required="comm-title,comm-id"'));
  for (const id of ["comm-photo-file", "comm-type", "comm-category", "comm-desc", "btn-submit-comm"]) assert.ok(m.innerHTML.includes(`id="${id}"`), id);
  render.renderComposeListing(m, "feira", "Feira", { defaultPix: "a@b.org" });
  assert.equal(steps(m.innerHTML), 5);
  assert.ok(m.innerHTML.includes("a@b.org") && m.innerHTML.includes('data-review-from="listing-body"'));
});

test("enquete — opções do construtor viram linhas lidas pelo classificador", () => {
  const body = appendPollOptionsToBody("Onde fazer a feira?", ["Praça A", " ", "Praça B", "praça a"]);
  assert.deepEqual(parsePollOptions(body), ["Praça A", "Praça B"]);
  assert.equal(appendPollOptionsToBody("Texto", []), "Texto");
  const m = { innerHTML: "" };
  render.renderComposeTopic(m, "");
  assert.ok(m.innerHTML.includes('id="civic-poll-builder"') && m.innerHTML.includes('id="btn-civic-poll-add"'));
});

test("voto — confirmação em duas etapas mostra a pauta e a escolha", () => {
  const html = renderVoteConfirmHtml({ title: "Feira na praça", body: "Liberar a praça aos sábados." }, "yes");
  assert.ok(html.includes('data-vote-step="understand"') && html.includes('data-vote-step="confirm" hidden'));
  assert.ok(html.includes("Feira na praça") && html.includes("Sim (aprovar)"));
  assert.equal(voteChoiceLabel("abstain"), "Abstenção");
});

test("assistentes — rede, Senha Soberana e carteira em etapas com rotas próprias", () => {
  const m = { innerHTML: "" };
  renderNetworkWizard(m, { enabled: true, dailyCapMb: 150, wifiOnly: true });
  assert.equal(steps(m.innerHTML), 5);
  assert.ok(m.innerHTML.includes('<option value="150" selected>'));
  renderBackupWizard(m);
  assert.equal(steps(m.innerHTML), 4);
  assert.ok(m.innerHTML.includes('data-step-required="bk-pass3"'));
  renderWalletWizard(m, { hasWallet: true, pix: "x@y.org" });
  assert.ok(m.innerHTML.includes('value="manter" selected') && m.innerHTML.includes("x@y.org"));
  assert.deepEqual(routeFor("#/settings/network/guia"), { name: "network-wizard" });
  assert.deepEqual(routeFor("#/backup"), { name: "backup-wizard" });
  assert.deepEqual(routeFor("#/wallet/guia"), { name: "wallet-wizard" });
  assert.deepEqual(routeFor("#/wallet"), { name: "wallet" });
});
