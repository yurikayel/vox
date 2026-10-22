const root = () => document.getElementById("app-root");

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function renderShell({ title, subtitle, breadcrumb, walletAddress }) {
  const walletBadge = walletAddress
    ? `<a class="wallet-badge connected" href="#/u/${walletAddress}">👤 ${escapeHtml(shortId(walletAddress))}</a>`
    : `<a class="wallet-badge" href="#/wallet">🔑 Conectar Carteira</a>`;

  root().innerHTML = `
    <header class="app-header">
      <div class="header-top">
        <a class="home-link" href="#/">Vox</a>
        <nav class="header-nav">
          <a href="#/">A Rua</a>
          <a href="#/wallet">Carteira</a>
          <a href="#/settings/network">Nó</a>
          ${walletBadge}
        </nav>
      </div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="header-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </header>
    <main id="app-main"></main>
    <footer class="app-footer">Fase 3 — nós participativos e espelho local · permaweb</footer>
  `;
  const main = document.getElementById("app-main");
  if (breadcrumb) main.insertAdjacentHTML("afterbegin", breadcrumb);
  return main;
}

export function renderLoading(main, msg = "Carregando…") {
  main.innerHTML = `<p class="loading">${escapeHtml(msg)}</p>`;
}

export function renderError(main, message) {
  main.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

export function renderDemoBanner(main) {
  main.insertAdjacentHTML(
    "afterbegin",
    `<div class="banner demo">Modo demonstração — gateways indisponíveis ou sem dados indexados.</div>`
  );
}

export function renderGatewayBanner(main, label) {
  main.insertAdjacentHTML(
    "afterbegin",
    `<div class="banner">Lendo via ${escapeHtml(label)}</div>`
  );
}

export function renderHome(main, communities) {
  let html = `
    <div class="actions-bar">
      <span class="section-title">Comunidades Ativas</span>
      <a class="btn btn-primary" href="#/compose/community">+ Nova Comunidade</a>
    </div>`;

  if (!communities.length) {
    html += `
      <div class="empty">
        <p>Nenhuma comunidade <code>vox-brasil</code> encontrada ainda.</p>
        <p>Crie a primeira comunidade clicando no botão acima!</p>
      </div>`;
    main.innerHTML += html;
    return;
  }

  const items = communities
    .map(
      (c) => `
    <li class="card">
      <a href="#/c/${encodeURIComponent(c.id)}">
        <h2>${escapeHtml(c.title)}${c.category ? `<span class="pill">${escapeHtml(c.category)}</span>` : ""}</h2>
      </a>
      <p class="desc">${escapeHtml(c.description || "Sem descrição.")}</p>
      <div class="card-footer">
        <span class="meta">ID: ${escapeHtml(shortId(c.id))}</span>
        <a class="btn btn-sm btn-outline" href="#/c/${encodeURIComponent(c.id)}">Entrar no Fórum →</a>
      </div>
    </li>`
    )
    .join("");

  html += `<ul class="card-list">${items}</ul>`;
  main.innerHTML += html;
}

export function renderCommunity(main, communityId, topics, meta = {}, { isMember = false, isMod = false, walletAddress = null } = {}) {
  const commTitle = meta.title || communityId;
  const commDesc = meta.description || "";
  const commCat = meta.category ? `<span class="pill">${escapeHtml(meta.category)}</span>` : "";

  let html = `
    <div class="community-header card">
      <h2>${escapeHtml(commTitle)} ${commCat}</h2>
      ${commDesc ? `<p class="desc">${escapeHtml(commDesc)}</p>` : ""}
      <p class="meta">Criador: <a href="#/u/${encodeURIComponent(meta.owner || "")}">${escapeHtml(shortId(meta.owner))}</a></p>
      <div class="actions-row">
        <button id="btn-share-comm" class="btn btn-outline" data-id="${escapeHtml(communityId)}" data-title="${escapeHtml(commTitle)}">🔗 Compartilhar</button>
        <button id="btn-join-comm" class="btn ${isMember ? "btn-secondary" : "btn-primary"}" data-id="${escapeHtml(communityId)}">
          ${isMember ? "✓ Já é Membro" : "★ Entrar na Comunidade"}
        </button>
        <a class="btn btn-primary" href="#/compose/topic?c=${encodeURIComponent(communityId)}">+ Novo Tópico</a>
      </div>
    </div>
    <div class="actions-bar">
      <span class="section-title">Tópicos do Fórum</span>
    </div>`;

  if (!topics.length) {
    html += `<div class="empty"><p>Nenhum tópico nesta comunidade ainda. Seja o primeiro a postar!</p></div>`;
    main.innerHTML += html;
    return;
  }

  const items = topics
    .map((t) => {
      const modBtn = isMod
        ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(t.id)}" data-type="topic">🛡️ Ocultar</button>`
        : "";
      return `
      <li class="card">
        <div class="card-body">
          <a href="#/t/${encodeURIComponent(t.id)}">
            <h3>${escapeHtml(t.title)}</h3>
          </a>
          <p class="meta">por <a href="#/u/${encodeURIComponent(t.owner)}">${escapeHtml(shortId(t.owner))}</a></p>
        </div>
        <div class="card-actions">
          <a class="btn btn-sm btn-outline" href="#/t/${encodeURIComponent(t.id)}">Ver discussão</a>
          ${modBtn}
        </div>
      </li>`;
    })
    .join("");

  html += `<ul class="card-list">${items}</ul>`;
  main.innerHTML += html;
}

export function renderTopic(main, topicId, topic, replies, { topicData = null, isMod = false, communityId = "" } = {}) {
  const commId = communityId || topic?.communityId || "";
  const backLink = commId ? `<a class="back-link" href="#/c/${encodeURIComponent(commId)}">← Voltar à comunidade</a>` : "";
  const bodyText = topicData?.body || topic?.body || "Sem conteúdo textual.";

  const modBtn = isMod
    ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(topicId)}" data-type="topic">🛡️ Ocultar Tópico</button>`
    : "";

  let html = `
    ${backLink}
    <div class="card topic-main">
      <h2>${escapeHtml(topic?.title || "Tópico")}</h2>
      <p class="meta">Autor: <a href="#/u/${encodeURIComponent(topic?.owner || "")}">${escapeHtml(shortId(topic?.owner))}</a> · TX: ${escapeHtml(shortId(topicId))}</p>
      <div class="topic-body">${escapeHtml(bodyText)}</div>
      <div class="actions-row">
        <button id="btn-share-topic" class="btn btn-outline" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}">🔗 Compartilhar (WhatsApp/Redes)</button>
        <a class="btn btn-primary" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">+ Responder</a>
        ${modBtn}
      </div>
    </div>
    <div class="actions-bar">
      <span class="section-title">Respostas (${replies.length})</span>
      <a class="btn btn-sm btn-primary" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">+ Responder</a>
    </div>`;

  if (!replies.length) {
    html += `<div class="empty"><p>Sem respostas ainda. Inicie o debate respondendo a este tópico!</p></div>`;
    main.innerHTML += html;
    return;
  }

  const items = replies
    .map((r) => {
      const replyModBtn = isMod
        ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(r.id)}" data-type="reply">🛡️ Ocultar</button>`
        : "";
      return `
      <li class="card reply" id="reply-${escapeHtml(r.id)}">
        <div class="reply-header">
          <span class="meta">por <a href="#/u/${encodeURIComponent(r.owner)}">${escapeHtml(shortId(r.owner))}</a></span>
          ${replyModBtn}
        </div>
        <p class="reply-body">${escapeHtml(r.body || "(carregando conteúdo...)")}</p>
      </li>`;
    })
    .join("");

  html += `<ul class="card-list">${items}</ul>`;
  main.innerHTML += html;
}

export function renderProfile(main, address, memberships = [], isCurrentWallet = false) {
  let html = `
    <div class="card profile-card">
      <h2>Perfil de Membro</h2>
      <p class="meta">Endereço: <code>${escapeHtml(address)}</code></p>
      ${isCurrentWallet ? `<p class="badge-pill">Sua Carteira Ativa</p>` : ""}
    </div>
    <div class="actions-bar">
      <span class="section-title">Comunidades que Participa (${memberships.length})</span>
    </div>`;

  if (!memberships.length) {
    html += `<div class="empty"><p>Nenhuma comunidade registrada neste perfil ainda.</p></div>`;
  } else {
    const list = memberships
      .map(
        (m) => `
      <li class="card">
        <a href="#/c/${encodeURIComponent(m.communityId)}">
          <h3>${escapeHtml(m.communityId)}</h3>
        </a>
        <p class="meta">Membro confirmado via permaweb</p>
      </li>`
      )
      .join("");
    html += `<ul class="card-list">${list}</ul>`;
  }

  main.innerHTML += html;
}

export function renderWallet(main, { address = null, balance = "0.000", hasWallet = false, error = null } = {}) {
  let statusBox = "";
  if (hasWallet && address) {
    statusBox = `
      <div class="card wallet-info">
        <h3>Carteira Conectada</h3>
        <p class="meta">Endereço: <code>${escapeHtml(address)}</code></p>
        <p class="balance">Saldo: <strong>${escapeHtml(balance)} AR</strong></p>
        <div class="actions-row">
          <a class="btn btn-outline" href="#/u/${encodeURIComponent(address)}">Ver Meu Perfil</a>
          <button id="btn-disconnect-wallet" class="btn btn-danger">Desconectar Carteira</button>
        </div>
      </div>`;
  } else {
    statusBox = `
      <div class="card wallet-warning">
        <p>Nenhuma carteira ativa no navegador. Conecte ou gere uma para poder criar comunidades, tópicos e participar dos fóruns.</p>
        <button id="btn-generate-wallet" class="btn btn-primary">⚡ Gerar Nova Carteira (Instantâneo)</button>
      </div>`;
  }

  let html = `
    <div class="section-title">Gerenciador de Carteira Arweave</div>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    ${statusBox}
    <div class="card wallet-import">
      <h3>Importar Carteira (JWK)</h3>
      <p class="meta">Cole o conteúdo JSON da sua chave privada (obtida em ArConnect ou faucet):</p>
      <form id="form-import-wallet">
        <textarea id="wallet-jwk-input" rows="5" class="form-control" placeholder='{"kty":"RSA","n":"...","e":"AQAB",...}' required></textarea>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Salvar Carteira no Navegador</button>
        </div>
      </form>
    </div>
    <div class="card info-box">
      <h4>Ambiente de Desenvolvimento & Testes</h4>
      <p class="desc">Chaves são mantidas estritamente no seu <code>localStorage</code> e nunca transmitidas a servidores. Obtenha saldo de teste no <a href="https://faucet.arweave.net" target="_blank" rel="noopener">faucet Arweave</a>. Consulte <code>client/DEV.md</code>.</p>
    </div>`;

  main.innerHTML += html;
}

export function renderComposeCommunity(main, { hasWallet = false } = {}) {
  if (!hasWallet) {
    main.innerHTML = `
      <div class="card">
        <h2>Criar Comunidade</h2>
        <div class="error">Você precisa conectar uma carteira em <a href="#/wallet">#/wallet</a> antes de publicar.</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/">← Voltar</a>
      <h2>Criar Nova Comunidade</h2>
      <p class="meta">A comunidade ficará indexada permanentemente no permaweb sob a tag <code>vox-brasil</code>.</p>
      <form id="form-compose-community">
        <div class="form-group">
          <label for="comm-id">Identificador único (slug):</label>
          <input type="text" id="comm-id" class="form-control" placeholder="ex: cinema-nacional" required pattern="^[a-z0-9-]+$" title="Apenas letras minúsculas, números e hífens." />
        </div>
        <div class="form-group">
          <label for="comm-title">Título da Comunidade:</label>
          <input type="text" id="comm-title" class="form-control" placeholder="ex: Cinema Brasileiro e Independente" required maxlength="100" />
        </div>
        <div class="form-group">
          <label for="comm-category">Categoria:</label>
          <input type="text" id="comm-category" class="form-control" placeholder="ex: Cultura, Tecnologia, Política" maxlength="40" />
        </div>
        <div class="form-group">
          <label for="comm-desc">Descrição e Regras:</label>
          <textarea id="comm-desc" class="form-control" rows="4" placeholder="Sobre o que é esta comunidade? Quais são as regras de convivência?" required maxlength="500"></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-comm">Publicar Comunidade</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeTopic(main, communityId, { hasWallet = false } = {}) {
  if (!hasWallet) {
    main.innerHTML = `
      <div class="card">
        <h2>Novo Tópico</h2>
        <div class="error">Você precisa conectar uma carteira em <a href="#/wallet">#/wallet</a> antes de publicar.</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/c/${encodeURIComponent(communityId)}">← Voltar à comunidade</a>
      <h2>Novo Tópico em <code>${escapeHtml(communityId)}</code></h2>
      <form id="form-compose-topic">
        <input type="hidden" id="topic-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <label for="topic-title">Título do Tópico:</label>
          <input type="text" id="topic-title" class="form-control" placeholder="Qual o assunto em debate?" required maxlength="120" />
        </div>
        <div class="form-group">
          <label for="topic-body">Mensagem / Conteúdo:</label>
          <textarea id="topic-body" class="form-control" rows="6" placeholder="Escreva sua mensagem aqui..." required></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-topic">Publicar Tópico</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeReply(main, topicId, communityId, { hasWallet = false } = {}) {
  if (!hasWallet) {
    main.innerHTML = `
      <div class="card">
        <h2>Responder</h2>
        <div class="error">Você precisa conectar uma carteira em <a href="#/wallet">#/wallet</a> antes de publicar.</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/t/${encodeURIComponent(topicId)}">← Voltar ao tópico</a>
      <h2>Responder ao Tópico</h2>
      <form id="form-compose-reply">
        <input type="hidden" id="reply-topic-id" value="${escapeHtml(topicId)}" />
        <input type="hidden" id="reply-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <label for="reply-body">Sua Resposta:</label>
          <textarea id="reply-body" class="form-control" rows="5" placeholder="Contribua com o debate..." required></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-reply">Enviar Resposta</button>
        </div>
      </form>
    </div>`;
}

export function renderPactModal(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="modal-overlay" id="pact-modal-overlay">
      <div class="modal-dialog">
        <div style="text-align:center; margin-bottom:1.25rem;">
          <span style="font-size:2rem;">🇧🇷 🌐</span>
          <h2 style="margin:0.5rem 0 0.25rem; font-size:1.35rem; color:var(--text);">Pacto Vox: Rede Distribuída</h2>
          <p class="desc" style="margin:0;">Seus dados são seus. A infraestrutura é de todos.</p>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🛡️</div>
          <div>
            <strong>1. Soberania e Autoria Total</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Nenhuma Big Tech é dona da sua conta. Suas postagens são assinadas por sua chave criptográfica no permaweb Arweave.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">⚡</div>
          <div>
            <strong>2. Nó Leve Ativo por Padrão</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Enquanto o app estiver aberto, ele serve fragmentos públicos de leitura do cache local para outros clientes, tornando o Vox livre de servidores centrais caros.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🔒</div>
          <div>
            <strong>3. Proteção e Salvaguardas</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Respeita conexão Wi-Fi, teto diário de banda (padrão 50 MB) e limite de cache (25 MB). Você tem direito de pausar ou desligar a qualquer momento.</p>
          </div>
        </div>

        <div style="margin-top:1.5rem; display:flex; flex-direction:column; gap:0.5rem;">
          <button id="btn-pact-accept" class="btn btn-primary" style="padding:0.75rem; font-weight:700;">Concordar e Entrar</button>
          <button id="btn-pact-settings" class="btn btn-outline" style="padding:0.6rem; font-size:0.88rem;">Ajustar Limites de Rede Primeiro</button>
        </div>
      </div>
    </div>
  `;
}

export function closePactModal(container) {
  if (container) container.innerHTML = "";
}

function renderNetworkHeader(isEnabled, relayStatus, rtcStatus) {
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  const relayBadge = relayStatus?.online
    ? `<span class="badge-pill" style="background:#e6f8ed; color:#18794e;">🟢 Relay Online (127.0.0.1:3920) — ${relayStatus.data?.cachedCount || 0} itens</span>`
    : `<span class="badge-pill" style="background:#f4f6f9; color:var(--muted);">⚪ Relay Desktop Desconectado</span>`;
  const rtcBadge = `<span class="badge-pill" style="background:#eef2ff; color:#3730a3;">🌐 WebRTC: ${rtcCount} ${rtcCount === 1 ? "par remoto" : "pares remotos"}</span>`;

  return `
    <div class="card network-card">
      <h2>Rede Distribuída (Pacto Vox)</h2>
      <p class="desc">Infraestrutura cooperativa transparente: soberania dos seus dados ↔ nós leves de leitura e cache local entre dispositivos, sem servidores caros.</p>
      
      <div class="network-status" style="margin-top:1rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
        <span class="pill" style="background:${isEnabled ? "var(--success)" : "var(--danger)"}">
          ${isEnabled ? "🟢 Nó Leve Ativo (Padrão)" : "⏸️ Contribuição Pausada"}
        </span>
        ${relayBadge}
        ${rtcBadge}
      </div>
    </div>`;
}

function renderNetworkStats(metrics, cacheStats, dailyUsage, settings) {
  const capMb = settings?.dailyCapMb || 50;
  const servedTodayMb = ((dailyUsage?.bytesServedToday || 0) / (1024 * 1024)).toFixed(1);
  const pct = Math.min(100, Math.round((servedTodayMb / capMb) * 100));

  return `
    <div class="actions-bar">
      <span class="section-title">Estatísticas e Uso Coletivo</span>
    </div>

    <div class="stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.6rem; margin-bottom:1rem;">
      <div class="card" style="text-align:center; padding:0.75rem;">
        <div style="font-size:1.3rem; font-weight:700; color:var(--accent);">${metrics?.blobsServed || 0}</div>
        <div class="meta">Itens Servidos (${metrics?.blobsServedRtc || 0} RTC)</div>
      </div>
      <div class="card" style="text-align:center; padding:0.75rem;">
        <div style="font-size:1.3rem; font-weight:700; color:var(--accent);">${((metrics?.bytesServed || 0) / 1024).toFixed(1)} KB</div>
        <div class="meta">Banda Total</div>
      </div>
      <div class="card" style="text-align:center; padding:0.75rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${servedTodayMb} / ${capMb} MB</div>
        <div class="usage-meter"><div class="usage-fill" style="width:${pct}%;"></div></div>
        <div class="meta" style="margin-top:0.25rem;">Uso Hoje (${pct}%)</div>
      </div>
      <div class="card" style="text-align:center; padding:0.75rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${cacheStats?.count || 0}</div>
        <div class="meta">Cache (${cacheStats?.sizeKb || "0"} KB)</div>
      </div>
    </div>`;
}

function renderNetworkForm(settings, notifPermission, customSignalingUrl) {
  const isEnabled = Boolean(settings?.enabled);
  const isBg = Boolean(settings?.backgroundRelay);
  const notifNotice = notifPermission === "granted"
    ? `<span style="font-size:0.8rem; color:var(--success);">✓ Notificações do sistema permitidas</span>`
    : `<button type="button" id="btn-request-notif" class="btn btn-outline" style="font-size:0.78rem; padding:0.2rem 0.5rem; margin-left:0.5rem;">Ativar Notificações de Status</button>`;

  return `
    <div class="card">
      <h3>Preferências de Nó & Limites</h3>
      <form id="form-network-settings">
        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.75rem;">
          <input type="checkbox" id="net-pause" ${!isEnabled ? "checked" : ""} style="width:1.2rem; height:1.2rem;" />
          <label for="net-pause" style="margin:0; font-weight:600; color:var(--danger);">Pausar contribuição (desativar nó leve e usar apenas modo leitura)</label>
        </div>

        <div class="form-group">
          <label for="net-daily-cap">Teto diário de banda servida (MB/dia):</label>
          <input type="number" id="net-daily-cap" class="form-control" min="5" max="1000" value="${settings?.dailyCapMb || 50}" />
        </div>

        <div class="form-group">
          <label for="net-max-mb">Limite máximo de armazenamento de cache (MB):</label>
          <input type="number" id="net-max-mb" class="form-control" min="5" max="500" value="${settings?.maxMb || 25}" />
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-wifi" ${settings?.wifiOnly ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <label for="net-wifi" style="margin:0;">Priorizar compartilhamento apenas quando conectado em Wi-Fi (não gastar 4G/5G)</label>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-comm-only" ${settings?.commOnly ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <label for="net-comm-only" style="margin:0;">Espelhar apenas comunidades que sou membro</label>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-webrtc" ${settings?.webrtcEnabled !== false ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <label for="net-webrtc" style="margin:0;">Permitir pares em outras redes e dispositivos (WebRTC)</label>
        </div>

        <div class="form-group">
          <label for="net-signaling-url">Servidor de Sinalização WebRTC (opcional):</label>
          <input type="text" id="net-signaling-url" class="form-control" placeholder="ws://127.0.0.1:3921" value="${customSignalingUrl || ""}" />
          <span class="meta" style="font-size:0.75rem;">URL WebSocket para pareamento direto com outros dispositivos (padrão: 3921).</span>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; background:var(--accent-soft); padding:0.6rem; border-radius:var(--radius);">
          <input type="checkbox" id="net-bg-relay" ${isBg ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <div style="flex:1;">
            <label for="net-bg-relay" style="margin:0; font-weight:600;">Atuar em segundo plano via Service Worker (somente Wi-Fi)</label>
            <div style="margin-top:0.2rem;">${notifNotice}</div>
          </div>
        </div>

        <div class="actions-row" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary">Salvar Preferências</button>
          <button type="button" id="btn-clear-cache" class="btn btn-outline">Limpar Cache Local</button>
          <button type="button" id="btn-check-relay" class="btn btn-outline">Verificar Relay Desktop</button>
        </div>
      </form>
    </div>

    <div class="card info-box" style="margin-top:1rem;">
      <h4>Pacto Vox: Transparência e LGPD</h4>
      <p class="desc">O Vox inverte a lógica das redes corporativas: sua identidade e seus dados não são minerados nem vendidos. Em troca, o app funciona como um nó cooperativo leve enquanto aberto. Todas as salvaguardas (Wi-Fi, teto de dados e botão de pausa) estão sob o seu controle a qualquer momento.</p>
    </div>`;
}

export function renderNetworkSettings(main, { settings, metrics, cacheStats, relayStatus, dailyUsage, notifPermission, rtcStatus, customSignalingUrl }) {
  const isEnabled = Boolean(settings?.enabled);
  let html = renderNetworkHeader(isEnabled, relayStatus, rtcStatus);
  html += renderNetworkStats(metrics, cacheStats, dailyUsage, settings);
  html += renderNetworkForm(settings, notifPermission, customSignalingUrl);
  main.innerHTML = html;
}
