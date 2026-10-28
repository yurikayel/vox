/**
 * @module chat-bridge
 * Ponte cívica sem servidor central para Slack & Discord:
 * 1) Detecção automática de URLs de Webhook (Discord Rich Embeds / Slack Block Kit / Genérico)
 * 2) Formatação de Posts, Propostas de Governança (com diff e placar) e Ofertas da Feira
 * 3) Gerador de resumo copia-e-cola (/vox-resumo) para canais sem permissão de webhook
 * 4) Cápsula de Memória Anti-90-dias: conversor de transcrições do Slack/Discord em Ata Markdown
 */

function clip(str, max = 280) {
  const s = String(str || "").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function detectWebhookPlatform(url = "") {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return "generic";
  if (
    u.includes("discord.com/api/webhooks/") ||
    u.includes("discordapp.com/api/webhooks/")
  ) {
    return "discord";
  }
  if (u.includes("hooks.slack.com/services/")) {
    return "slack";
  }
  return "generic";
}

function resolveKind(payload = {}) {
  const k = String(payload.kind || payload.contentType || payload.type || "").toLowerCase();
  if (k.includes("proposal") || payload.diffText != null || payload.tally != null) return "proposal";
  if (k.includes("listing") || payload.priceLabel || payload.contactPix) return "listing";
  return "topic";
}

function buildDiscordProposalEmbed(p) {
  const state = String(p.state || p.tally?.state || "open").toLowerCase();
  const color = state === "merged" ? 0x16a34a : state === "rejected" ? 0xdc2626 : 0x2b5fb8;
  const statusLabel = state === "merged" ? "🟣 Aprovada (Merged)" : state === "rejected" ? "🔴 Rejeitada" : "🟢 Em votação";
  const diffSnippet = p.diffText ? `\n\n\`\`\`diff\n${clip(p.diffText, 600)}\n\`\`\`` : "";
  const tally = p.tally || {};
  const tallyStr =
    tally.yes != null
      ? `🟢 Sim: ${tally.yes || 0} · 🔴 Não: ${tally.no || 0} · ⚪ Abst: ${tally.abstain || 0}`
      : "1 membro = 1 voto (corte anti-brigading)";
  return {
    title: clip(`🗳️ ${p.title || "Proposta de Governança"}`, 240),
    url: p.canonicalUrl || undefined,
    description: `${clip(p.body || "", 400)}${diffSnippet}`.trim(),
    color,
    fields: [
      { name: "Comunidade", value: p.communityId || "geral", inline: true },
      { name: "Status", value: statusLabel, inline: true },
      { name: "Apuração", value: tallyStr, inline: false },
    ],
    footer: { text: "Vox · Governança Cívica Auditável" },
  };
}

function buildDiscordListingEmbed(p) {
  const fields = [{ name: "Comunidade", value: p.communityId || "feira", inline: true }];
  if (p.priceLabel) fields.push({ name: "Preço", value: String(p.priceLabel), inline: true });
  if (p.locationLabel) fields.push({ name: "Local", value: String(p.locationLabel), inline: true });
  if (p.contactPix) fields.push({ name: "Chave Pix", value: `\`${p.contactPix}\``, inline: false });
  return {
    title: clip(`🛒 ${p.title || "Oferta na Feira"}`, 240),
    url: p.canonicalUrl || undefined,
    description: clip(p.body || "", 500),
    color: 0xf59e0b,
    fields,
    footer: { text: "Vox · Feira Comunitária P2P (0% taxa)" },
  };
}

function buildDiscordTopicEmbed(p) {
  const embed = {
    title: clip(p.title || "Publicação no Vox", 240),
    url: p.canonicalUrl || undefined,
    description: clip(p.body || "", 600),
    color: 0x2b5fb8,
    fields: p.communityId ? [{ name: "Comunidade", value: String(p.communityId), inline: true }] : [],
    footer: { text: "Vox · Rede Comunitária Soberana" },
  };
  if (p.image && /^https?:\/\//i.test(p.image)) {
    embed.thumbnail = { url: p.image };
  }
  return embed;
}

export function formatDiscordWebhookPayload(payload = {}) {
  const kind = resolveKind(payload);
  const embed =
    kind === "proposal"
      ? buildDiscordProposalEmbed(payload)
      : kind === "listing"
        ? buildDiscordListingEmbed(payload)
        : buildDiscordTopicEmbed(payload);
  const linkLine = payload.canonicalUrl ? `🔗 ${payload.canonicalUrl}` : "";
  return {
    username: "Vox",
    content: linkLine,
    embeds: [embed],
  };
}

function buildSlackExtraBlocks(payload, kind) {
  const blocks = [];
  if (kind === "proposal" && payload.diffText) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Patch proposto (Diff):*\n\`\`\`${clip(payload.diffText, 500)}\`\`\`` },
    });
  }
  if (kind === "proposal" && payload.tally?.yes != null) {
    const t = payload.tally;
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `📊 *Placar:* 🟢 Sim: ${t.yes || 0} · 🔴 Não: ${t.no || 0} · ⚪ Abst: ${t.abstain || 0}` }],
    });
  }
  if (kind === "listing" && (payload.priceLabel || payload.contactPix)) {
    const meta = [
      payload.priceLabel ? `*Preço:* ${payload.priceLabel}` : "",
      payload.contactPix ? `*Pix:* \`${payload.contactPix}\`` : "",
    ].filter(Boolean).join(" · ");
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `🛒 ${meta}` }] });
  }
  return blocks;
}

export function formatSlackWebhookPayload(payload = {}) {
  const kind = resolveKind(payload);
  const prefix = kind === "proposal" ? "🗳️ Proposta:" : kind === "listing" ? "🛒 Oferta:" : "📣";
  const headText = clip(`${prefix} ${payload.title || "Publicação no Vox"}`, 140);
  const bodyText = clip(payload.body || "", 600);
  const url = String(payload.canonicalUrl || "").trim();
  const blocks = [
    { type: "header", text: { type: "plain_text", text: headText, emoji: true } },
  ];
  if (bodyText) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: bodyText } });
  }
  blocks.push(...buildSlackExtraBlocks(payload, kind));
  if (url) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `🔗 *Vox* (${payload.communityId || "geral"}): <${url}|Abrir no Vox →>` }],
    });
  }
  return {
    text: `${headText}${url ? ` — ${url}` : ""}`,
    blocks,
  };
}

export function adaptWebhookPayloadForUrl(url, payload) {
  const platform = detectWebhookPlatform(url);
  if (platform === "discord") return formatDiscordWebhookPayload(payload);
  if (platform === "slack") return formatSlackWebhookPayload(payload);
  return payload;
}

export function buildChatSummaryCopy(payload = {}, { format = "discord" } = {}) {
  const kind = resolveKind(payload);
  const bold = format === "slack" ? "*" : "**";
  const icon = kind === "proposal" ? "🗳️" : kind === "listing" ? "🛒" : "📣";
  const title = payload.title || "Publicação no Vox";
  const comm = payload.communityId ? ` · \`#${payload.communityId}\`` : "";
  const lines = [`${icon} ${bold}${title}${bold}${comm}`];
  if (payload.body) lines.push(clip(payload.body, 320));
  if (kind === "proposal" && payload.diffText) {
    lines.push(`\`\`\`diff\n${clip(payload.diffText, 400)}\n\`\`\``);
  }
  if (kind === "proposal" && payload.tally?.yes != null) {
    const t = payload.tally;
    lines.push(`📊 ${bold}Placar (1 membro = 1 voto):${bold} 🟢 Sim: ${t.yes} · 🔴 Não: ${t.no} · ⚪ Abst: ${t.abstain}`);
  }
  if (kind === "listing" && (payload.priceLabel || payload.contactPix)) {
    const parts = [payload.priceLabel ? `💰 ${payload.priceLabel}` : "", payload.contactPix ? `⚡ Pix: \`${payload.contactPix}\`` : ""].filter(Boolean);
    lines.push(parts.join(" · "));
  }
  if (payload.canonicalUrl) lines.push(`🔗 ${payload.canonicalUrl}`);
  return lines.join("\n\n");
}

function matchTranscriptHeaderLine(line) {
  // Discord: "Nome — Hoje às 14:32" ou "Nome - 28/10/2026 14:32"
  const discordMatch = line.match(/^([^—\-:\[\]]{1,42}?)\s*[—–-]\s*(?:Hoje às\s*|Ontem às\s*|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*)?(\d{1,2}:\d{2})\s*$/i);
  if (discordMatch) return { author: discordMatch[1].trim(), time: discordMatch[2], inlineText: "" };
  // Slack: "Nome  14:32" ou "Nome [14:32]"
  const slackMatch = line.match(/^([^:\[\]]{1,42}?)(?:\s{2,}|\s+\[)(\d{1,2}:\d{2})\]?\s*$/);
  if (slackMatch) return { author: slackMatch[1].trim(), time: slackMatch[2], inlineText: "" };
  // Inline: "[14:32] Nome: mensagem" ou "Nome (14:32): mensagem"
  const bracketInline = line.match(/^(?:\[(\d{1,2}:\d{2})\]\s*)?([A-Za-zÀ-ÿ0-9_.@\s-]{1,36}?)(?:\s*\((\d{1,2}:\d{2})\))?:\s+(.+)$/);
  if (bracketInline && !/^https?$/i.test(bracketInline[2].trim())) {
    return {
      author: bracketInline[2].trim(),
      time: bracketInline[1] || bracketInline[3] || "",
      inlineText: bracketInline[4].trim(),
    };
  }
  return null;
}

function collectTranscriptEntries(lines) {
  const entries = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const hdr = matchTranscriptHeaderLine(line);
    if (hdr) {
      if (current && current.text) entries.push(current);
      current = { author: hdr.author, time: hdr.time, text: hdr.inlineText };
    } else if (current) {
      current.text = current.text ? `${current.text}\n  ${line}` : line;
    } else {
      current = { author: "Participante", time: "", text: line };
    }
  }
  if (current && current.text) entries.push(current);
  return entries;
}

export function parseChatTranscriptToMarkdown(rawTranscript = "") {
  const raw = String(rawTranscript || "").trim();
  if (!raw) return { markdown: "", messageCount: 0, participants: [], suggestedTitle: "" };
  const lines = raw.split(/\r?\n/);
  const entries = collectTranscriptEntries(lines);
  const participants = [...new Set(entries.map((e) => e.author).filter(Boolean))];
  const header = `> 📋 **Ata importada para memória comunitária no Vox** (${entries.length} ${entries.length === 1 ? "intervenção" : "intervenções"} · Participantes: ${participants.join(", ") || "Coletivo"})`;
  const bodyLines = entries.map((e) => {
    const timeTag = e.time ? ` *(${e.time})*` : "";
    return `- **${e.author}**${timeTag}: ${e.text}`;
  });
  const dateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return {
    markdown: `${header}\n\n${bodyLines.join("\n")}`,
    messageCount: entries.length,
    participants,
    suggestedTitle: `Ata do Coletivo (${dateStr}) — ${participants.slice(0, 3).join(", ")}`,
  };
}
