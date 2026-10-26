/** @file Network settings, participation layers, steward wizard. */
import { escapeHtml, shortId } from "./util.js";

const PARTICIPATION_LAYERS = [
  {
    id: "passive",
    title: "Passivo",
    desc: "Você navega e publica, mas não repassa cache nem ajuda outros aparelhos. Ideal para economizar dados ou pausar a contribuição.",
    control: '<a class="participation-link" href="#net-pause">Pausar ajuda à rede (modo somente leitura)</a>',
  },
  {
    id: "active",
    title: "Ativo",
    desc: "Padrão do Pacto Vox: entrega leve de conteúdo público já em cache, com tetos de banda, limite de disco e preferência por Wi-Fi.",
    control: '<span class="meta">Desmarque “Pausar ajuda” e ajuste os limites abaixo.</span>',
  },
  {
    id: "supporter",
    title: "Apoiador",
    desc: "Prioriza os espaços digitais em que você participa: o compartilhamento na malha foca nas suas comunidades, não no feed global inteiro.",
    control: '<a class="participation-link" href="#net-comm-only-wrap">Compartilhar apenas minhas comunidades</a> (<code>commOnly</code>)',
  },
  {
    id: "steward",
    title: "Steward",
    desc: "Apoia a malha com relay desktop ou servidor de conexão (LAN/VPS), espelhando índices e sinalização para quem está por perto.",
    control: '<a class="participation-link" href="#net-relay-steward">Relay e servidor de conexão</a>',
  },
];

/** Camada inferida para destaque na UI (não persiste estado separado). */
export function inferParticipationLayer(settings = {}, { customSignalingUrl = "" } = {}) {
  if (settings.enabled === false) return "passive";
  const signaling = String(customSignalingUrl || "").trim();
  if (settings.backgroundRelay || signaling) return "steward";
  if (settings.commOnly) return "supporter";
  return "active";
}

function renderParticipationLayers(settings, customSignalingUrl) {
  const current = inferParticipationLayer(settings, { customSignalingUrl });
  const cards = PARTICIPATION_LAYERS.map((layer) => {
    const isCurrent = layer.id === current;
    const border = isCurrent ? "border:2px solid var(--accent);" : "border:1px solid var(--border);";
    const badge = isCurrent
      ? `<span class="pill" style="font-size:0.7rem; margin-left:0.35rem;">Você está aqui</span>`
      : "";
    return `
      <div class="participation-layer" data-layer="${layer.id}" style="${border} border-radius:var(--radius-sm); padding:0.65rem 0.75rem; margin-bottom:0.5rem;">
        <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(layer.title)}${badge}</div>
        <p class="desc" style="font-size:0.8rem; margin:0.35rem 0;">${escapeHtml(layer.desc)}</p>
        <div style="font-size:0.8rem;">${layer.control}</div>
      </div>`;
  }).join("");

  return `
    <details class="advanced-settings participation-layers">
      <summary>Camadas de participação (Passivo → Steward)</summary>
      <div style="margin-top:0.75rem;">
        <p class="desc" style="font-size:0.8rem; margin:0 0 0.75rem;">
          Opt-in em etapas: ninguém precisa virar steward para usar o Vox. Escolha o nível que combina com seu aparelho e com os espaços digitais que você habita.
        </p>
        ${cards}
      </div>
    </details>`;
}

function renderGatewayHealthBlock(gatewayHealth) {
  const state = gatewayHealth?.state || "all_ok";
  if (state === "all_ok") {
    return `<p class="desc" style="font-size:0.8rem; margin:0.5rem 0 0;">Leitura Arweave: gateways respondendo normalmente neste aparelho.</p>`;
  }
  const label =
    state === "critical"
      ? "Leitura reserva — gateways falharam recentemente; conteúdo pode vir só do cache local ou relay comunitário."
      : "Leitura reserva ocasional — um ou mais gateways falharam; a malha ou relay comunitário ajudam.";
  return `
    <div class="card" style="margin-top:0.65rem; padding:0.65rem 0.75rem; border-color:var(--warning-border, #fde68a); background:var(--warning-soft, #fef3c7);">
      <strong style="font-size:0.85rem;">📡 ${escapeHtml(label)}</strong>
      <p class="desc" style="font-size:0.75rem; margin:0.35rem 0 0;">Sem envio de dados externos — só histórico local. <a href="#/settings/network">Ajustar rede</a></p>
    </div>`;
}

function renderNetworkHeader(isEnabled, relayStatus, rtcStatus, gatewayHealth) {
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  const statusBadge = isEnabled
    ? `<span class="pill" style="background:var(--success); color:#fff;">🟢 Ajudando a rede</span>`
    : `<span class="pill" style="background:var(--danger); color:#fff;">⏸️ Ajuda pausada</span>`;
  const peerBadge = rtcCount > 0
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">${rtcCount} ${rtcCount === 1 ? "aparelho conectado" : "aparelhos conectados"}</span>`
    : `<span class="badge-pill">Conectando a aparelhos próximos…</span>`;
  const reservePill =
    gatewayHealth?.state && gatewayHealth.state !== "all_ok"
      ? `<span class="badge-pill" style="background:var(--amber-soft, #fef3c7); color:var(--amber, #b45309);">Leitura reserva</span>`
      : "";

  return `
    <div class="card network-card">
      <h2>Sua rede</h2>
      <p class="desc">Você ajuda a manter o Vox funcionando para todo mundo, direto do seu aparelho.</p>
      
      <div class="network-status" style="margin-top:0.75rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
        ${statusBadge}
        ${peerBadge}
        ${reservePill}
      </div>
      ${renderGatewayHealthBlock(gatewayHealth)}
    </div>`;
}

function renderNetworkStats(metrics, cacheStats, dailyUsage, settings) {
  const capMb = settings?.dailyCapMb || 50;
  const servedTodayMb = ((dailyUsage?.bytesServedToday || 0) / (1024 * 1024)).toFixed(1);
  const pct = Math.min(100, Math.round((servedTodayMb / capMb) * 100));

  return `
    <div class="actions-bar">
      <span class="section-title">Estatísticas de Ajuda</span>
    </div>

    <div class="stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.5rem; margin-bottom:1rem;">
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${metrics?.blobsServed || 0}</div>
        <div class="meta">Conteúdos entregues</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${((metrics?.bytesServed || 0) / 1024).toFixed(1)} KB</div>
        <div class="meta">Dados compartilhados</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${servedTodayMb} / ${capMb} MB</div>
        <div class="usage-meter"><div class="usage-fill" style="width:${pct}%;"></div></div>
        <div class="meta" style="margin-top:0.25rem;">Uso hoje (${pct}%)</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${cacheStats?.count || 0}</div>
        <div class="meta">Em cache (${cacheStats?.sizeKb || "0"} KB)</div>
      </div>
    </div>`;
}

function renderTurnFields(customTurn) {
  return `
    <div style="border-top:1px solid var(--border); padding-top:0.75rem; margin-top:0.75rem;">
      <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.35rem;">Servidor auxiliar para conexões móveis (TURN)</label>
      <div class="form-group">
        <label for="net-turn-url">Endereço do servidor:</label>
        <input type="text" id="net-turn-url" class="form-control" placeholder="turn:turn.comunidade.org:3478" value="${customTurn?.urls || ""}" />
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
        <div class="form-group">
          <label for="net-turn-user">Usuário:</label>
          <input type="text" id="net-turn-user" class="form-control" placeholder="vox" value="${customTurn?.username || ""}" />
        </div>
        <div class="form-group">
          <label for="net-turn-pass">Credencial:</label>
          <input type="password" id="net-turn-pass" class="form-control" placeholder="••••••" value="${customTurn?.credential || ""}" />
        </div>
      </div>
    </div>`;
}

function relayHealthLabel(relayStatus, relayHttpUrl) {
  const host = relayHttpUrl ? new URL(relayHttpUrl).host : "";
  if (relayStatus?.online) {
    return host ? `🟢 Conectado (${host})` : "🟢 Conectado";
  }
  return host ? `⚪ Offline (${host})` : "⚪ Offline";
}

function renderNetworkForm(settings, notifPermission, customSignalingUrl, customRelayHttpUrl, customTurn, relayStatus, rtcStatus, metrics, relayHttpUrl, meshDiscoverable = false) {
  const isEnabled = Boolean(settings?.enabled);
  const isBg = Boolean(settings?.backgroundRelay);
  const notifNotice = notifPermission === "granted"
    ? `<span style="font-size:0.8rem; color:var(--success);">✓ Notificações permitidas</span>`
    : `<button type="button" id="btn-request-notif" class="btn btn-outline btn-sm">Ativar Notificações</button>`;
  const rtcCount = rtcStatus?.remotePeersConnected || 0;

  return `
    <div class="card">
      <h3>Preferências de Ajuda</h3>
      <form id="form-network-settings">
        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.5rem;">
          <input type="checkbox" id="net-pause" ${!isEnabled ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <label for="net-pause" style="margin:0; font-weight:600; color:var(--danger);">Pausar ajuda à rede (modo somente leitura)</label>
        </div>

        <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem;">
          <input type="checkbox" id="net-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
          <div>
            <label for="net-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
            <p class="desc" style="font-size:0.78rem; margin:0.25rem 0 0;">Cartão de perfil assinado (opt-in) propagado via gossip — ver COMPLIANCE-BR.md.</p>
          </div>
        </div>

        <div class="form-group">
          <label for="net-daily-cap">Teto diário de dados compartilhados (MB):</label>
          <input type="number" id="net-daily-cap" class="form-control" min="5" max="1000" value="${settings?.dailyCapMb || 50}" />
        </div>

        <div class="form-group">
          <label for="net-max-mb">Limite de espaço em disco (MB):</label>
          <input type="number" id="net-max-mb" class="form-control" min="5" max="500" value="${settings?.maxMb || 25}" />
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-wifi" ${settings?.wifiOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-wifi" style="margin:0;">Ajudar apenas quando estiver no Wi-Fi</label>
        </div>

        <div id="net-comm-only-wrap" class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-comm-only" ${settings?.commOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-comm-only" style="margin:0;">Compartilhar apenas minhas comunidades (camada Apoiador)</label>
        </div>

        ${renderParticipationLayers(settings, customSignalingUrl)}

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-webrtc" ${settings?.webrtcEnabled !== false ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-webrtc" style="margin:0;">Conectar diretamente a outros aparelhos</label>
        </div>

        <details class="advanced-settings">
          <summary>Avançado (Conexões e Servidores)</summary>
          <div id="net-relay-steward" style="margin-top:0.75rem;">
            <p class="desc" style="font-size:0.8rem; margin-bottom:0.5rem;">Detalhes técnicos da malha WebRTC, relay e camada Steward.</p>
            <p style="margin-bottom:0.75rem;"><a href="#/settings/network/steward" class="btn btn-outline btn-sm">Assistente steward (5 passos)</a></p>

            <div class="form-group">
              <label for="net-signaling-url">Servidor de conexão (opcional):</label>
              <input type="text" id="net-signaling-url" class="form-control" placeholder="wss://signal.comunidade.org" value="${customSignalingUrl || ""}" />
            </div>

            <div class="form-group">
              <label for="net-relay-http-url">Relay HTTP (cache e inbox, opcional):</label>
              <input type="text" id="net-relay-http-url" class="form-control" placeholder="https://relay.comunidade.org ou 192.168.0.10:3920" value="${customRelayHttpUrl || ""}" />
              <p class="desc" style="font-size:0.75rem; margin:0.35rem 0 0;">Usado para buscar posts e mensagens efêmeras. Vazio = derivado do servidor de conexão ou localhost.</p>
            </div>

            ${renderTurnFields(customTurn)}

            <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.75rem;">
              <input type="checkbox" id="net-bg-relay" ${isBg ? "checked" : ""} style="width:1rem; height:1rem;" />
              <div style="flex:1;">
                <label for="net-bg-relay" style="margin:0; font-weight:600;">Segundo plano via Service Worker (Wi-Fi)</label>
                <div style="margin-top:0.2rem;">${notifNotice}</div>
              </div>
            </div>

            <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
              <div class="meta" style="margin-bottom:0.4rem;">
                Conexões ativas: <strong>${rtcCount} aparelhos</strong> · Conteúdos via WebRTC: <strong>${metrics?.blobsServedRtc || 0}</strong>
              </div>
              <button type="button" id="btn-check-relay" class="btn btn-outline btn-sm">Verificar Relay HTTP</button>
              <span class="meta" style="margin-left:0.5rem;">${relayHealthLabel(relayStatus, relayHttpUrl)}</span>
            </div>

            <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
              <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.25rem;">Tour de Demonstração</label>
              <p class="desc" style="font-size:0.8rem; margin:0 0 0.4rem;">Recarrega os 5 perfis e posts educativos de exemplo no seu aparelho:</p>
              <button type="button" id="btn-reset-demo" class="btn btn-outline btn-sm">🔄 Restaurar tour demo</button>
            </div>
          </div>
        </details>

        <div class="actions-row" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary">Salvar Preferências</button>
          <button type="button" id="btn-clear-cache" class="btn btn-outline">Limpar Cache Local</button>
        </div>
      </form>
    </div>`;
}

function renderStatusLinkBlock() {
  return `
    <div class="card" style="margin-top:1rem;">
      <h3>Telemetria honesta</h3>
      <p class="desc" style="font-size:0.85rem;">Gateways e relay vistos só neste aparelho — sem phone-home.</p>
      <a class="btn btn-sm btn-outline" href="#/status">Abrir #/status</a>
    </div>`;
}

function renderPosseWebhooksSection(webhooks = []) {
  const lines = escapeHtml((webhooks || []).join("\n"));
  return `
    <div class="card" style="margin-top:1rem;">
      <h3>Ecoe POSSE — Webhooks</h3>
      <p class="desc" style="font-size:0.85rem;">URLs (Discord, Telegram, n8n…) recebem POST JSON ao exportar POSSE no cockpit pós-publicação. Máx. 8 linhas.</p>
      <div class="form-group">
        <label for="net-posse-webhooks">URLs de webhook (uma por linha)</label>
        <textarea id="net-posse-webhooks" class="form-control" rows="3" placeholder="https://discord.com/api/webhooks/…">${lines}</textarea>
      </div>
    </div>`;
}

function renderModerationSettingsSection(blockedUsers = [], mutedUsers = []) {
  const blockedList = blockedUsers.length
    ? blockedUsers.map((u) => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;"><code>${escapeHtml(shortId(u))}</code><button type="button" class="btn btn-sm btn-outline btn-unblock-item" data-route="${escapeHtml(u)}">Desbloquear</button></div>`).join("")
    : `<p class="meta" style="margin:0;">Nenhum autor bloqueado.</p>`;

  const mutedList = mutedUsers.length
    ? mutedUsers.map((u) => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;"><code>${escapeHtml(shortId(u))}</code><button type="button" class="btn btn-sm btn-outline btn-unmute-item" data-route="${escapeHtml(u)}">Desilenciar</button></div>`).join("")
    : `<p class="meta" style="margin:0;">Nenhum autor silenciado.</p>`;

  return `
    <div class="card" style="margin-top:1rem;">
      <h3>Moderação Local & Filtros</h3>
      <p class="desc" style="font-size:0.85rem; margin-bottom:0.6rem;">Filtros de conteúdo soberanos salvos apenas neste aparelho.</p>
      
      <div style="margin-bottom:0.75rem;">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Autores Bloqueados (${blockedUsers.length})</h4>
        <div class="card" style="background:var(--surface-soft); padding:8px 10px;">${blockedList}</div>
      </div>

      <div style="margin-bottom:0.75rem;">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Autores Silenciados (${mutedUsers.length})</h4>
        <div class="card" style="background:var(--surface-soft); padding:8px 10px;">${mutedList}</div>
      </div>

      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
        <button type="button" id="btn-export-moderation" class="btn btn-sm btn-outline">💾 Exportar Regras</button>
        <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
          📥 Importar Regras
          <input type="file" id="file-import-moderation" accept="application/json,.json" style="display:none;" />
        </label>
      </div>
    </div>`;
}
export function renderNetworkSettings(main, {
  settings,
  metrics,
  cacheStats,
  relayStatus,
  dailyUsage,
  notifPermission,
  rtcStatus,
  customSignalingUrl,
  customRelayHttpUrl,
  customTurn,
  relayHttpUrl,
  gatewayHealth,
  blockedUsers = [],
  mutedUsers = [],
  meshDiscoverable = false,
  posseWebhooks = [],
}) {
  const isEnabled = Boolean(settings?.enabled);
  let html = renderNetworkHeader(isEnabled, relayStatus, rtcStatus, gatewayHealth);
  html += renderNetworkStats(metrics, cacheStats, dailyUsage, settings);
  html += renderNetworkForm(
    settings,
    notifPermission,
    customSignalingUrl,
    customRelayHttpUrl,
    customTurn,
    relayStatus,
    rtcStatus,
    metrics,
    relayHttpUrl,
    meshDiscoverable,
  );
  html += renderStatusLinkBlock();
  html += renderPosseWebhooksSection(posseWebhooks);
  html += renderModerationSettingsSection(blockedUsers, mutedUsers);
  main.innerHTML = html;
}

/** Wizard operador steward (V-P01) — MVP 5 passos. */
export function renderStewardWizard(main, { draft = {}, step = 1, mirrorLast = null } = {}) {
  const s = Math.min(5, Math.max(1, Number(step) || 1));
  const d = draft || {};
  main.innerHTML = `
    <a class="back-link" href="#/settings/network">← Voltar às preferências de rede</a>
    <div class="card">
      <h2>Assistente steward</h2>
      <p class="desc">Voluntário da <strong>comunidade</strong> — não o mantenedor do código. Passo ${s} de 5.</p>
      <form id="form-steward-wizard">
        ${s === 1 ? `
          <p class="desc" style="font-size:0.85rem;">Camada Steward: espelho e relay para leitura mais rápida. Leia <code>COMPLIANCE-BR.md</code> no repositório Vox (Marco Civil, espelho).</p>
          <label style="display:flex; gap:0.5rem; align-items:flex-start; margin-top:0.75rem;">
            <input type="checkbox" id="sw-pledge" ${d.pledge ? "checked" : ""} required style="margin-top:0.2rem;" />
            <span>Comprometo-me a operar infra <strong>voluntária</strong>, com quotas e sem inspecionar DMs.</span>
          </label>
        ` : ""}
        ${s === 2 ? `
          <div class="form-group">
            <label for="sw-community-id">Community-Id ou slug da comunidade</label>
            <input type="text" id="sw-community-id" class="form-control" value="${escapeHtml(d.communityId || "")}" placeholder="ex. bairro-centro" required />
          </div>
        ` : ""}
        ${s === 3 ? `
          <p class="desc">Deploy relay + Caddy + Coturn: siga <code>relay/deploy/README.md</code> no repositório (Docker).</p>
          <p class="desc" style="font-size:0.8rem;">Checklist rápido: doc <code>docs/steward-seed-15min.md</code> no repositório.</p>
        ` : ""}
        ${s === 4 ? `
          <div class="form-group">
            <label for="sw-signaling">WSS signaling</label>
            <input type="text" id="sw-signaling" class="form-control" value="${escapeHtml(d.signalingUrl || "")}" placeholder="wss://signal.coletivo.org" />
          </div>
          <div class="form-group">
            <label for="sw-relay-http">URL HTTP relay</label>
            <input type="text" id="sw-relay-http" class="form-control" value="${escapeHtml(d.relayHttpUrl || "")}" placeholder="https://relay.coletivo.org" />
          </div>
          <button type="button" id="sw-verify-relay" class="btn btn-outline btn-sm">Verificar Relay HTTP</button>
          <span id="sw-verify-result" class="meta" style="margin-left:0.5rem;"></span>
        ` : ""}
        ${s === 5 ? `
          <p class="desc">Salve as URLs acima em <a href="#/settings/network">Preferências de rede</a>. Depois, teste o espelho no relay e compartilhe <code>#/c/&lt;slug&gt;</code>.</p>
          <button type="button" id="sw-test-mirror" class="btn btn-outline btn-sm">Testar espelho agora</button>
          <span id="sw-mirror-result" class="meta" style="margin-left:0.5rem;"></span>
          ${mirrorLast && !mirrorLast.ok ? `<p class="meta" id="sw-mirror-last-code">Último código: <code>${escapeHtml(mirrorLast.code || "—")}</code></p>` : ""}
          <div class="form-group" style="margin-top:0.75rem;">
            <label for="sw-share-link">Link para compartilhar</label>
            <input type="text" id="sw-share-link" class="form-control" value="${escapeHtml(d.shareLink || "")}" placeholder="#/c/minha-comunidade" />
          </div>
        ` : ""}
        <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
          ${s > 1 ? `<button type="button" id="sw-prev" class="btn btn-outline">← Anterior</button>` : ""}
          ${s < 5 ? `<button type="submit" class="btn btn-primary">Próximo →</button>` : `<button type="submit" class="btn btn-primary">Concluir</button>`}
        </div>
      </form>
    </div>`;
}
