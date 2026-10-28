import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as chatBridge from "../client/js/chat-bridge.js";
import * as posse from "../client/js/posse-dispatch.js";
import * as render from "../client/js/render.js";

function createContainer() {
  return { innerHTML: "" };
}

test("chat-bridge: detectWebhookPlatform identifies Discord, Slack, and generic URLs", () => {
  assert.equal(chatBridge.detectWebhookPlatform("https://discord.com/api/webhooks/123/abc"), "discord");
  assert.equal(chatBridge.detectWebhookPlatform("https://discordapp.com/api/webhooks/123/abc"), "discord");
  assert.equal(chatBridge.detectWebhookPlatform("https://hooks.slack.com/services/T00/B00/X00"), "slack");
  assert.equal(chatBridge.detectWebhookPlatform("https://meu-coletivo.org/webhook"), "generic");
});

test("chat-bridge: formatDiscordWebhookPayload formats topic, proposal with diff, and listing", () => {
  const propPayload = posse.buildProposalPossePayload(
    {
      id: "prop_99",
      communityId: "horta-sp",
      title: "Ativar Feira Solidária",
      body: "Proposta para liberar trocas e vendas diretas sem taxa.",
      diffText: "@@ -1,2 +1,2 @@\n- commercialEnabled: false\n+ commercialEnabled: true",
      state: "merged",
    },
    { yes: 12, no: 1, abstain: 0, state: "merged" },
    { origin: "https://vox.test", pathname: "/" }
  );

  const discordBody = chatBridge.formatDiscordWebhookPayload(propPayload);
  assert.equal(discordBody.username, "Vox");
  assert.equal(discordBody.embeds.length, 1);
  assert.ok(discordBody.embeds[0].title.includes("Ativar Feira Solidária"));
  assert.ok(discordBody.embeds[0].description.includes("```diff"));
  assert.ok(discordBody.embeds[0].description.includes("+ commercialEnabled: true"));
  assert.equal(discordBody.embeds[0].color, 0x16a34a);

  const listingBody = chatBridge.formatDiscordWebhookPayload({
    kind: "listing",
    title: "Cesta Agroecológica",
    body: "Colheita de sábado",
    communityId: "feira-sul",
    priceLabel: "R$ 45,00",
    locationLabel: "Centro",
    contactPix: "feira@coop.br",
    canonicalUrl: "https://vox.test/#/c/feira-sul?tab=listings",
  });
  assert.equal(listingBody.embeds[0].color, 0xf59e0b);
  assert.ok(listingBody.embeds[0].fields.some((f) => f.name === "Chave Pix" && f.value.includes("feira@coop.br")));
});

test("chat-bridge: formatSlackWebhookPayload formats Block Kit for Slack", () => {
  const slackBody = chatBridge.formatSlackWebhookPayload({
    kind: "governance-proposal",
    title: "Regimento de Moderação",
    body: "Adota quarentena transparente.",
    communityId: "coletivo-sul",
    diffText: "+ quarentena: true",
    tally: { yes: 8, no: 0, abstain: 1 },
    canonicalUrl: "https://vox.test/#/c/coletivo-sul/proposal/p1",
  });
  assert.ok(slackBody.text.includes("Regimento de Moderação"));
  assert.ok(Array.isArray(slackBody.blocks));
  assert.equal(slackBody.blocks[0].type, "header");
  assert.ok(slackBody.blocks.some((b) => JSON.stringify(b).includes("quarentena: true")));
  assert.ok(slackBody.blocks.some((b) => JSON.stringify(b).includes("Sim: 8")));
});

test("chat-bridge: buildChatSummaryCopy generates copy-paste summary for Discord and Slack", () => {
  const summary = chatBridge.buildChatSummaryCopy(
    {
      kind: "governance-proposal",
      title: "Mutirão de Sábado",
      body: "Definir escala das 9h às 13h.",
      communityId: "bairro-vivo",
      diffText: "+ turno_manha: 09:00-13:00",
      tally: { yes: 15, no: 2, abstain: 1 },
      canonicalUrl: "https://vox.test/#/c/bairro-vivo/proposal/p2",
    },
    { format: "discord" }
  );
  assert.ok(summary.includes("🗳️ **Mutirão de Sábado**"));
  assert.ok(summary.includes("```diff"));
  assert.ok(summary.includes("🟢 Sim: 15"));
  assert.ok(summary.includes("https://vox.test/#/c/bairro-vivo/proposal/p2"));
});

test("chat-bridge: parseChatTranscriptToMarkdown converts Discord and Slack logs into structured Ata", () => {
  const rawDiscord = [
    "Helena — Hoje às 14:30",
    "Camaradas, precisamos fechar o horário da assembleia.",
    "Sugiro sábado às 10h na sede.",
    "Tiago — Hoje às 14:32",
    "De acordo! Já aviso o pessoal da logística.",
    "[14:35] Marina: Vou levar o projetor e o cabo HDMI.",
  ].join("\n");

  const res = chatBridge.parseChatTranscriptToMarkdown(rawDiscord);
  assert.equal(res.messageCount, 3);
  assert.deepEqual(res.participants, ["Helena", "Tiago", "Marina"]);
  assert.ok(res.markdown.includes("Ata importada para memória comunitária no Vox"));
  assert.ok(res.markdown.includes("- **Helena** *(14:30)*:"));
  assert.ok(res.markdown.includes("- **Tiago** *(14:32)*: De acordo!"));
  assert.ok(res.markdown.includes("- **Marina** *(14:35)*: Vou levar o projetor"));
  assert.ok(res.suggestedTitle.includes("Helena, Tiago, Marina"));
});

test("chat-bridge: UI renders Slack/Discord import in compose topic and bridge bar in proposal detail", () => {
  const main = createContainer();
  render.renderComposeTopic(main, "mutirao-sp");
  assert.ok(main.innerHTML.includes('id="chat-transcript-input"'));
  assert.ok(main.innerHTML.includes('id="btn-convert-chat-transcript"'));

  render.renderProposalDetail(
    main,
    {
      id: "prop_1",
      communityId: "mutirao-sp",
      title: "Proposta Teste",
      body: "Texto da proposta",
      diffText: "+ regra: 1",
      state: "open",
    },
    { yes: 3, no: 0, abstain: 0, totalEligible: 3, state: "open", votesDetail: [] }
  );
  assert.ok(main.innerHTML.includes('id="btn-proposal-copy-discord"'));
  assert.ok(main.innerHTML.includes('id="btn-proposal-webhook-echo"'));
});
