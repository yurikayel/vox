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

export function renderNetworkChip(metrics, rtcStatus, settings) {
  const isEnabled = settings?.enabled !== false;
  if (!isEnabled) {
    return `<a class="network-chip paused" href="#/settings/network" title="Modo somente leitura · Toque para configurar"><span class="chip-dot"></span><span>Só leitura</span></a>`;
  }
  const rtcCount = rtcStatus?.remotePeersConnected || 0;
  let text = "Rede ativa";
  if (rtcCount > 0) {
    text = `${rtcCount} ${rtcCount === 1 ? "aparelho" : "aparelhos"}`;
  } else if (metrics?.blobsServed > 0) {
    text = `${metrics.blobsServed} servidos`;
  }
  return `<a class="network-chip active" href="#/settings/network" title="Sua rede está ajudando outros nós"><span class="chip-dot"></span><span>${escapeHtml(text)}</span></a>`;
}

function renderWalletBadge(walletAddress) {
  return walletAddress
    ? `<a class="wallet-badge connected" href="#/u/${walletAddress}">👤 ${escapeHtml(shortId(walletAddress))}</a>`
    : `<a class="wallet-badge" href="#/wallet">🔑 Entrar</a>`;
}

function renderTabBar(activeTab, walletAddress) {
  const profileHref = walletAddress ? `#/u/${walletAddress}` : `#/wallet`;
  const isHome = activeTab === "home";
  const isComm = activeTab === "communities";
  const isCompose = activeTab === "compose";
  const isDm = activeTab === "dm";
  const isProfile = activeTab === "profile" || activeTab === "wallet";

  return `
    <aside class="tab-bar">
      <div class="sidebar-brand">
        <a class="brand-link" href="#/">Vox</a>
      </div>
      <nav class="tab-nav">
        <a href="#/" class="tab-item ${isHome ? "active" : ""}">
          <span class="tab-icon">🏠</span>
          <span class="tab-label">Início</span>
        </a>
        <a href="#/communities" class="tab-item ${isComm ? "active" : ""}">
          <span class="tab-icon">👥</span>
          <span class="tab-label">Comunidades</span>
        </a>
        <a href="#/compose/topic" class="tab-item compose-tab ${isCompose ? "active" : ""}">
          <span class="tab-icon">➕</span>
          <span class="tab-label">Postar</span>
        </a>
        <a href="#/dm" class="tab-item ${isDm ? "active" : ""}">
          <span class="tab-icon">💬</span>
          <span class="tab-label">Mensagens</span>
        </a>
        <a href="${profileHref}" class="tab-item ${isProfile ? "active" : ""}">
          <span class="tab-icon">👤</span>
          <span class="tab-label">Perfil</span>
        </a>
      </nav>
    </aside>`;
}

export function renderShell({ title, subtitle, breadcrumb, walletAddress, activeTab = "home", metrics, rtcStatus, settings }) {
  const chipHtml = renderNetworkChip(metrics, rtcStatus, settings);
  const walletBadge = renderWalletBadge(walletAddress);
  const tabBarHtml = renderTabBar(activeTab, walletAddress);

  root().innerHTML = `
    <div class="app-layout">
      ${tabBarHtml}
      <div class="main-column">
        <header class="top-bar">
          <div class="top-brand">
            <a class="home-link" href="#/">Vox</a>
          </div>
          <div class="top-center">
            ${chipHtml}
          </div>
          <div class="top-actions">
            ${walletBadge}
          </div>
        </header>
        <main id="app-main"></main>
        <footer class="app-footer">Vox · Rede livre nos aparelhos de quem usa · <a href="./proposta-vox.html" target="_blank">Proposta</a></footer>
      </div>
    </div>
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
    `<div class="banner demo">Modo demonstração — dados locais simulados.</div>`
  );
}

export function renderGatewayBanner(main, label) {
  main.insertAdjacentHTML(
    "afterbegin",
    `<div class="banner">Conectado via ${escapeHtml(label)}</div>`
  );
}

function renderPostItem(t) {
  const authorInitial = (t.owner || "V").slice(0, 1).toUpperCase();
  const commPill = t.communityId
    ? `<a class="post-community-pill" href="#/c/${encodeURIComponent(t.communityId)}">c/${escapeHtml(t.communityId)}</a>`
    : "";
  const bodySnippet = t.body ? `<p class="post-body">${escapeHtml(t.body)}</p>` : "";

  return `
    <article class="post">
      <a class="avatar" href="#/u/${encodeURIComponent(t.owner)}">${authorInitial}</a>
      <div class="post-content">
        <div class="post-header">
          <a class="post-author" href="#/u/${encodeURIComponent(t.owner)}">${escapeHtml(shortId(t.owner))}</a>
          <span class="post-meta">· recente</span>
          ${commPill}
        </div>
        <div class="post-title">
          <a href="#/t/${encodeURIComponent(t.id)}">${escapeHtml(t.title)}</a>
        </div>
        ${bodySnippet}
        <div class="post-actions">
          <a class="post-action-btn" href="#/t/${encodeURIComponent(t.id)}" aria-label="Ver discussão e responder">💬 Responder</a>
          <button class="post-action-btn btn-share-post" data-id="${escapeHtml(t.id)}" data-title="${escapeHtml(t.title)}" aria-label="Compartilhar post">↗ Compartilhar</button>
        </div>
      </div>
    </article>`;
}

export function renderFeed(main, topics = []) {
  let html = `
    <div class="actions-bar">
      <span class="section-title">A Rua — Timeline Recente</span>
      <a class="btn btn-primary btn-sm" href="#/compose/topic">+ Postar</a>
    </div>`;

  if (!topics.length) {
    html += `
      <div class="empty">
        <p>Nenhum post recente na rede.</p>
        <a class="btn btn-primary" href="#/compose/topic">Criar primeiro post</a>
      </div>`;
    main.innerHTML += html;
    return;
  }

  const items = topics.map(renderPostItem).join("");
  html += `<div class="feed-container">${items}</div>`;
  main.innerHTML += html;
}

export function renderHome(main, communities) {
  let html = `
    <div class="actions-bar">
      <span class="section-title">Comunidades</span>
      <a class="btn btn-primary btn-sm" href="#/compose/community">+ Nova</a>
    </div>`;

  if (!communities.length) {
    html += `
      <div class="empty">
        <p>Nenhuma comunidade criada ainda.</p>
        <a class="btn btn-primary" href="#/compose/community">+ Criar Comunidade</a>
      </div>`;
    main.innerHTML += html;
    return;
  }

  const items = communities
    .map(
      (c) => `
    <div class="community-card card">
      <div>
        <a href="#/c/${encodeURIComponent(c.id)}">
          <h3>${escapeHtml(c.title)} ${c.category ? `<span class="pill">${escapeHtml(c.category)}</span>` : ""}</h3>
        </a>
        <p class="desc">${escapeHtml(c.description || "Sem descrição.")}</p>
      </div>
      <div class="community-card-footer">
        <span class="meta">${escapeHtml(shortId(c.id))}</span>
        <a class="btn btn-sm btn-outline" href="#/c/${encodeURIComponent(c.id)}">Entrar →</a>
      </div>
    </div>`
    )
    .join("");

  html += `<div class="community-grid">${items}</div>`;
  main.innerHTML += html;
}

export function renderCommunity(main, communityId, topics, meta = {}, { isMember = false, isMod = false, walletAddress = null } = {}) {
  const commTitle = meta.title || communityId;
  const commDesc = meta.description || "";
  const commCat = meta.category ? `<span class="pill">${escapeHtml(meta.category)}</span>` : "";

  let html = `
    <div class="card community-header">
      <h2>${escapeHtml(commTitle)} ${commCat}</h2>
      ${commDesc ? `<p class="desc">${escapeHtml(commDesc)}</p>` : ""}
      <p class="meta">Criador: <a href="#/u/${encodeURIComponent(meta.owner || "")}">${escapeHtml(shortId(meta.owner))}</a></p>
      <div class="actions-row">
        <button id="btn-share-comm" class="btn btn-outline" data-id="${escapeHtml(communityId)}" data-title="${escapeHtml(commTitle)}">↗ Compartilhar</button>
        <button id="btn-join-comm" class="btn ${isMember ? "btn-secondary" : "btn-primary"}" data-id="${escapeHtml(communityId)}">
          ${isMember ? "✓ Já é Membro" : "★ Entrar"}
        </button>
        <a class="btn btn-primary" href="#/compose/topic?c=${encodeURIComponent(communityId)}">+ Novo Tópico</a>
      </div>
    </div>
    <div class="actions-bar">
      <span class="section-title">Tópicos do Fórum</span>
    </div>`;

  if (!topics.length) {
    html += `<div class="empty"><p>Nenhum tópico nesta comunidade ainda.</p></div>`;
    main.innerHTML += html;
    return;
  }

  const items = topics.map((t) => renderPostItem({ ...t, communityId })).join("");
  html += `<div class="feed-container">${items}</div>`;
  main.innerHTML += html;
}

export function renderTopic(main, topicId, topic, replies, { topicData = null, isMod = false, communityId = "" } = {}) {
  const commId = communityId || topic?.communityId || "";
  const backLink = commId ? `<a class="back-link" href="#/c/${encodeURIComponent(commId)}">← Voltar à comunidade</a>` : "";
  const bodyText = topicData?.body || topic?.body || "Sem conteúdo textual.";
  const authorInitial = (topic?.owner || "V").slice(0, 1).toUpperCase();

  const modBtn = isMod
    ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(topicId)}" data-type="topic">🛡️ Ocultar</button>`
    : "";

  let html = `
    ${backLink}
    <article class="topic-root">
      <div class="post-header">
        <span class="avatar">${authorInitial}</span>
        <div>
          <a class="post-author" href="#/u/${encodeURIComponent(topic?.owner || "")}">${escapeHtml(shortId(topic?.owner))}</a>
          <div class="post-meta">TX: ${escapeHtml(shortId(topicId))}</div>
        </div>
      </div>
      <h2>${escapeHtml(topic?.title || "Tópico")}</h2>
      <div class="post-body">${escapeHtml(bodyText)}</div>
      <div class="actions-row">
        <button id="btn-share-topic" class="btn btn-outline btn-sm" data-id="${escapeHtml(topicId)}" data-title="${escapeHtml(topic?.title || "")}">↗ Compartilhar</button>
        <a class="btn btn-primary btn-sm" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">💬 Responder</a>
        ${modBtn}
      </div>
    </article>

    <div class="actions-bar">
      <span class="section-title">Respostas (${replies.length})</span>
      <a class="btn btn-sm btn-primary" href="#/compose/reply?t=${encodeURIComponent(topicId)}&c=${encodeURIComponent(commId)}">+ Responder</a>
    </div>`;

  if (!replies.length) {
    html += `<div class="empty"><p>Sem respostas ainda. Inicie o debate!</p></div>`;
    main.innerHTML += html;
    return;
  }

  const replyItems = replies.map((r) => {
    const rInitial = (r.owner || "V").slice(0, 1).toUpperCase();
    const replyModBtn = isMod
      ? `<button class="btn btn-sm btn-danger btn-mod-hide" data-id="${escapeHtml(r.id)}" data-type="reply">🛡️</button>`
      : "";
    return `
      <div class="reply-item card reply" id="reply-${escapeHtml(r.id)}">
        <span class="avatar">${rInitial}</span>
        <div class="post-content">
          <div class="reply-header" style="display:flex; justify-content:space-between; align-items:center;">
            <a class="post-author" href="#/u/${encodeURIComponent(r.owner)}">${escapeHtml(shortId(r.owner))}</a>
            ${replyModBtn}
          </div>
          <p class="reply-body">${escapeHtml(r.body || "(carregando conteúdo...)")}</p>
        </div>
      </div>`;
  }).join("");

  html += `<div class="thread-replies">${replyItems}</div>`;
  main.innerHTML += html;
}

function renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants) {
  const title = handle ? `@${escapeHtml(handle)}` : "Perfil de Membro";
  const initial = (handle || address || "U").slice(0, 1).toUpperCase();
  const conflictBanner = isConflict
    ? `<div class="card error" style="margin-top:0.6rem;">
        ⚠️ <strong>Conflito de Handle:</strong> <code>@${escapeHtml(handle)}</code> reivindicado por mais de uma conta.
        <div style="font-size:0.8rem; margin-top:0.3rem;">
          ${claimants.map((c) => `<div>• <a href="#/u/${c.owner}">${escapeHtml(shortId(c.owner))}</a></div>`).join("")}
        </div>
      </div>`
    : "";

  return `
    <div class="card profile-card">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
        <span class="avatar" style="width:52px; height:52px; font-size:1.3rem;">${initial}</span>
        <div>
          <h2 style="margin:0;">${title}</h2>
          <p class="meta" style="margin:2px 0 0;"><code>${escapeHtml(shortId(address))}</code></p>
        </div>
      </div>
      ${conflictBanner}
      ${isCurrentWallet ? `<span class="badge-pill" style="margin-top:0.4rem;">Sua Carteira Ativa</span>` : ""}
    </div>`;
}

function renderProfileActions(address, isCurrentWallet, handle) {
  if (isCurrentWallet) {
    return `
      <div class="card" style="margin-top:0.75rem;">
        <h3>Identidade & Chaves</h3>
        <form id="form-claim-handle" style="margin-top:0.5rem;">
          <label style="font-size:0.85rem; font-weight:600;">Reivindicar @handle on-chain:</label>
          <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
            <input type="text" id="input-handle-slug" class="form-control" placeholder="ex: maria" value="${handle || ""}" required />
            <button type="submit" id="btn-submit-handle" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar @handle</button>
          </div>
        </form>
        <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
          <button id="btn-copy-dmpub" class="btn btn-sm btn-outline">📋 Copiar Chave Dm-Pub</button>
          <button id="btn-publish-dmpub" class="btn btn-sm btn-primary">🌐 Anunciar Dm-Pub on-chain</button>
        </div>
      </div>`;
  }
  return `
    <div class="card" style="margin-top:0.75rem;">
      <a class="btn btn-primary btn-sm" href="#/dm/${encodeURIComponent(address)}">💬 Mensagem Privada</a>
    </div>`;
}

export function renderProfile(main, address, memberships = [], isCurrentWallet = false, dmPubStr = "", { handle = "", isConflict = false, claimants = [] } = {}) {
  let html = renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants);
  html += renderProfileActions(address, isCurrentWallet, handle);

  html += `
    <div class="actions-bar">
      <span class="section-title">Comunidades (${memberships.length})</span>
    </div>`;

  if (!memberships.length) {
    html += `<div class="empty"><p>Nenhuma comunidade registrada neste perfil.</p></div>`;
  } else {
    const list = memberships
      .map(
        (m) => `
      <div class="card" style="padding:10px 14px;">
        <a href="#/c/${encodeURIComponent(m.communityId)}">
          <h3 style="margin:0 0 2px;">${escapeHtml(m.communityId)}</h3>
        </a>
        <span class="meta">Membro confirmado</span>
      </div>`
      )
      .join("");
    html += `<div class="card-list">${list}</div>`;
  }

  main.innerHTML = html;
}

export function renderHandleConflict(main, slug, claimants = []) {
  const items = claimants
    .map(
      (c) => `
    <li class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3><a href="#/u/${encodeURIComponent(c.owner)}">${escapeHtml(shortId(c.owner))}</a></h3>
          <p class="meta">Endereço: <code>${escapeHtml(c.owner)}</code></p>
          <p class="meta">TX: <code>${escapeHtml(shortId(c.txId))}</code></p>
        </div>
        <a class="btn btn-outline" href="#/u/${encodeURIComponent(c.owner)}">Ver Perfil →</a>
      </div>
    </li>`
    )
    .join("");

  main.innerHTML = `
    <div class="card error">
      <h2>⚠️ Ambiguidade: Múltiplas contas reivindicam @${escapeHtml(slug)}</h2>
      <p class="desc">No Vox não há tribunal para confiscar nomes. Mais de um endereço publicou este identificador. Escolha qual conta deseja acessar:</p>
    </div>
    <ul class="card-list" style="margin-top:1rem;">${items}</ul>
  `;
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
          <a class="btn btn-outline" href="#/u/${encodeURIComponent(address)}">Meu Perfil</a>
          <button id="btn-disconnect-wallet" class="btn btn-danger">Desconectar</button>
        </div>
      </div>`;
  } else {
    statusBox = `
      <div class="card wallet-warning">
        <p>Conecte ou gere uma carteira para postar e criar comunidades.</p>
        <button id="btn-generate-wallet" class="btn btn-primary">⚡ Gerar Carteira Instantânea</button>
      </div>`;
  }

  let html = `
    <div class="actions-bar">
      <span class="section-title">Carteira Arweave</span>
    </div>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    ${statusBox}
    <div class="card wallet-import">
      <h3>Importar Carteira (JWK)</h3>
      <p class="meta">Cole o JSON da sua chave privada:</p>
      <form id="form-import-wallet">
        <textarea id="wallet-jwk-input" rows="4" class="form-control" placeholder='{"kty":"RSA","n":"...","e":"AQAB",...}' required></textarea>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Salvar Carteira</button>
        </div>
      </form>
    </div>`;

  main.innerHTML += html;
}

export function renderComposeCommunity(main, { hasWallet = false } = {}) {
  if (!hasWallet) {
    main.innerHTML = `
      <div class="card">
        <h2>Criar Comunidade</h2>
        <div class="error">Conecte uma carteira em <a href="#/wallet">#/wallet</a> antes de publicar.</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/">← Voltar</a>
      <h2>Nova Comunidade</h2>
      <form id="form-compose-community">
        <div class="form-group">
          <label for="comm-id">Identificador único (slug):</label>
          <input type="text" id="comm-id" class="form-control" placeholder="ex: cinema-nacional" required pattern="^[a-z0-9-]+$" title="Apenas letras minúsculas, números e hífens." />
        </div>
        <div class="form-group">
          <label for="comm-title">Título:</label>
          <input type="text" id="comm-title" class="form-control" placeholder="ex: Cinema Brasileiro" required maxlength="100" />
        </div>
        <div class="form-group">
          <label for="comm-category">Categoria:</label>
          <input type="text" id="comm-category" class="form-control" placeholder="ex: Cultura, Tecnologia" maxlength="40" />
        </div>
        <div class="form-group">
          <label for="comm-desc">Descrição e Regras:</label>
          <textarea id="comm-desc" class="form-control" rows="3" placeholder="Qual o propósito desta comunidade?" required maxlength="500"></textarea>
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
        <h2>Novo Post</h2>
        <div class="error">Conecte uma carteira em <a href="#/wallet">#/wallet</a> antes de publicar.</div>
      </div>`;
    return;
  }

  const backLink = communityId
    ? `<a class="back-link" href="#/c/${encodeURIComponent(communityId)}">← Voltar à comunidade</a>`
    : `<a class="back-link" href="#/">← Voltar</a>`;

  main.innerHTML = `
    <div class="card compose-card">
      ${backLink}
      <h2>${communityId ? `Postar em ${escapeHtml(communityId)}` : "Novo Post na Rede"}</h2>
      <form id="form-compose-topic">
        ${communityId ? `<input type="hidden" id="topic-comm-id" value="${escapeHtml(communityId)}" />` : `
          <div class="form-group">
            <label for="topic-comm-id">Slug da Comunidade:</label>
            <input type="text" id="topic-comm-id" class="form-control" placeholder="ex: cinema-nacional" required />
          </div>
        `}
        <div class="form-group">
          <label for="topic-title">Título:</label>
          <input type="text" id="topic-title" class="form-control" placeholder="O que está acontecendo?" required maxlength="120" />
        </div>
        <div class="form-group">
          <label for="topic-body">Mensagem:</label>
          <textarea id="topic-body" class="form-control" rows="5" placeholder="Escreva seu post aqui..." required></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-submit-topic">Publicar Post</button>
        </div>
      </form>
    </div>`;
}

export function renderComposeReply(main, topicId, communityId, { hasWallet = false } = {}) {
  if (!hasWallet) {
    main.innerHTML = `
      <div class="card">
        <h2>Responder</h2>
        <div class="error">Conecte uma carteira em <a href="#/wallet">#/wallet</a> antes de publicar.</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/t/${encodeURIComponent(topicId)}">← Voltar ao post</a>
      <h2>Responder</h2>
      <form id="form-compose-reply">
        <input type="hidden" id="reply-topic-id" value="${escapeHtml(topicId)}" />
        <input type="hidden" id="reply-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <textarea id="reply-body" class="form-control" rows="4" placeholder="Sua resposta..." required></textarea>
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
        <div style="text-align:center; margin-bottom:1rem;">
          <h2 style="margin:0 0 0.25rem; font-size:1.25rem;">Pacto Vox: Rede Distribuída</h2>
          <p class="desc" style="margin:0;">O Vox roda nos aparelhos de quem usa. Você pode pausar quando quiser.</p>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🛡️</div>
          <div>
            <strong>1. Soberania e Autoria Total</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Seus posts e chaves são seus. Nenhuma empresa é dona da sua conta.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">⚡</div>
          <div>
            <strong>2. Nó Cooperativo Leve</strong>
            <p class="desc" style="margin:0.2rem 0 0;">O app aberto ajuda a servir leituras para outros usuários sem servidores caros.</p>
          </div>
        </div>

        <div class="pact-feature">
          <div class="pact-feature-icon">🔒</div>
          <div>
            <strong>3. Controle e Salvaguardas</strong>
            <p class="desc" style="margin:0.2rem 0 0;">Respeita Wi-Fi, teto diário de banda e botão de pausa a qualquer momento.</p>
          </div>
        </div>

        <div style="margin-top:1.25rem; display:flex; flex-direction:column; gap:0.5rem;">
          <button id="btn-pact-accept" class="btn btn-primary" style="padding:0.65rem; font-weight:700;">Concordar e Entrar</button>
          <button id="btn-pact-settings" class="btn btn-outline" style="padding:0.5rem; font-size:0.85rem;">Ajustar Limites de Rede Primeiro</button>
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
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">🟢 Relay Online (127.0.0.1:3920)</span>`
    : `<span class="badge-pill" style="background:var(--surface-soft); color:var(--muted);">⚪ PC offline</span>`;
  const rtcBadge = `<span class="badge-pill">🌐 WebRTC: ${rtcCount} ${rtcCount === 1 ? "par remoto" : "pares remotos"}</span>`;

  return `
    <div class="card network-card">
      <h2>Sua rede</h2>
      <p class="desc">Rede Distribuída (Pacto Vox) — você ajuda a levar o Vox adiante sem servidores centrais caros.</p>
      
      <div class="network-status" style="margin-top:0.75rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
        <span class="pill" style="background:${isEnabled ? "var(--success)" : "var(--danger)"}; color:#fff;">
          ${isEnabled ? "🟢 Nó Ativo" : "⏸️ Ajuda Pausada"}
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
      <span class="section-title">Estatísticas de Ajuda</span>
    </div>

    <div class="stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.5rem; margin-bottom:1rem;">
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${metrics?.blobsServed || 0}</div>
        <div class="meta">Itens Servidos (${metrics?.blobsServedRtc || 0} RTC)</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${((metrics?.bytesServed || 0) / 1024).toFixed(1)} KB</div>
        <div class="meta">Banda Total</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${servedTodayMb} / ${capMb} MB</div>
        <div class="usage-meter"><div class="usage-fill" style="width:${pct}%;"></div></div>
        <div class="meta" style="margin-top:0.25rem;">Uso Hoje (${pct}%)</div>
      </div>
      <div class="card" style="text-align:center; padding:0.65rem;">
        <div style="font-size:1.1rem; font-weight:700; color:var(--text);">${cacheStats?.count || 0}</div>
        <div class="meta">Cache (${cacheStats?.sizeKb || "0"} KB)</div>
      </div>
    </div>`;
}

function renderTurnFields(customTurn) {
  return `
    <div style="border-top:1px solid var(--border); padding-top:0.75rem; margin-top:0.75rem;">
      <label style="font-weight:600; font-size:0.85rem; display:block; margin-bottom:0.35rem;">TURN Comunitário (Travessia 4G / NAT Simétrico)</label>
      <div class="form-group">
        <label for="net-turn-url">URL do Servidor TURN:</label>
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

function renderNetworkForm(settings, notifPermission, customSignalingUrl, customTurn) {
  const isEnabled = Boolean(settings?.enabled);
  const isBg = Boolean(settings?.backgroundRelay);
  const notifNotice = notifPermission === "granted"
    ? `<span style="font-size:0.8rem; color:var(--success);">✓ Notificações permitidas</span>`
    : `<button type="button" id="btn-request-notif" class="btn btn-outline btn-sm">Ativar Notificações</button>`;

  return `
    <div class="card">
      <h3>Preferências de Ajuda</h3>
      <form id="form-network-settings">
        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.5rem;">
          <input type="checkbox" id="net-pause" ${!isEnabled ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
          <label for="net-pause" style="margin:0; font-weight:600; color:var(--danger);">Pausar ajuda à rede (modo somente leitura)</label>
        </div>

        <div class="form-group">
          <label for="net-daily-cap">Teto diário de banda servida (MB/dia):</label>
          <input type="number" id="net-daily-cap" class="form-control" min="5" max="1000" value="${settings?.dailyCapMb || 50}" />
        </div>

        <div class="form-group">
          <label for="net-max-mb">Limite de cache (MB):</label>
          <input type="number" id="net-max-mb" class="form-control" min="5" max="500" value="${settings?.maxMb || 25}" />
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-wifi" ${settings?.wifiOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-wifi" style="margin:0;">Compartilhar apenas em Wi-Fi</label>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-comm-only" ${settings?.commOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-comm-only" style="margin:0;">Espelhar apenas minhas comunidades</label>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
          <input type="checkbox" id="net-webrtc" ${settings?.webrtcEnabled !== false ? "checked" : ""} style="width:1rem; height:1rem;" />
          <label for="net-webrtc" style="margin:0;">Troca direta com outros aparelhos (WebRTC)</label>
        </div>

        <details class="advanced-settings">
          <summary>Avançado (Servidores e Segundo Plano)</summary>
          <div style="margin-top:0.75rem;">
            <div class="form-group">
              <label for="net-signaling-url">Sinalização WebRTC (opcional):</label>
              <input type="text" id="net-signaling-url" class="form-control" placeholder="wss://signal.comunidade.org" value="${customSignalingUrl || ""}" />
            </div>

            ${renderTurnFields(customTurn)}

            <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.75rem;">
              <input type="checkbox" id="net-bg-relay" ${isBg ? "checked" : ""} style="width:1rem; height:1rem;" />
              <div style="flex:1;">
                <label for="net-bg-relay" style="margin:0; font-weight:600;">Segundo plano via Service Worker (Wi-Fi)</label>
                <div style="margin-top:0.2rem;">${notifNotice}</div>
              </div>
            </div>

            <div style="margin-top:0.75rem;">
              <button type="button" id="btn-check-relay" class="btn btn-outline btn-sm">Verificar Relay Desktop (127.0.0.1:3920)</button>
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

export function renderNetworkSettings(main, { settings, metrics, cacheStats, relayStatus, dailyUsage, notifPermission, rtcStatus, customSignalingUrl, customTurn }) {
  const isEnabled = Boolean(settings?.enabled);
  let html = renderNetworkHeader(isEnabled, relayStatus, rtcStatus);
  html += renderNetworkStats(metrics, cacheStats, dailyUsage, settings);
  html += renderNetworkForm(settings, notifPermission, customSignalingUrl, customTurn);
  main.innerHTML = html;
}

export function renderDmList(main, conversations = [], myAddress = "") {
  let listHtml = "";
  if (!conversations.length) {
    listHtml = `<div class="empty"><p>Nenhuma conversa privada ainda.</p></div>`;
  } else {
    const items = conversations
      .map(
        (c) => {
          const initial = (c.peerAddress || "U").slice(0, 1).toUpperCase();
          const timeStr = c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
          return `
          <a class="dm-inbox-item" href="#/dm/${encodeURIComponent(c.peerAddress)}">
            <span class="avatar">${initial}</span>
            <div class="dm-inbox-body">
              <div class="dm-inbox-header">
                <span class="dm-inbox-peer">${escapeHtml(shortId(c.peerAddress))}</span>
                <span class="meta" style="font-size:0.75rem;">${timeStr}</span>
              </div>
              <p class="dm-inbox-preview">${escapeHtml(c.lastText)}</p>
            </div>
          </a>`;
        }
      )
      .join("");
    listHtml = `<div class="dm-inbox-list">${items}</div>`;
  }

  main.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 2px;">Mensagens</h2>
      <p class="desc" style="margin:0 0 8px;">Privadas. Só neste aparelho. Criptografia ponta a ponta sem nuvem.</p>
      
      <form id="form-new-dm" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
        <input type="text" id="dm-peer-input" class="form-control" placeholder="Endereço do destinatário..." required />
        <button type="submit" class="btn btn-primary" style="white-space:nowrap;">Conversar →</button>
      </form>
    </div>

    <div class="actions-bar">
      <span class="section-title">Conversas Recentes</span>
      <button id="btn-pull-inbox" class="btn btn-sm btn-outline">🔄 Atualizar</button>
    </div>
    ${listHtml}
  `;
}

function renderDmMessageBubbles(messages, myAddress, peerAddress) {
  if (!messages.length) {
    return `<div class="empty" style="text-align:center; padding:1.5rem 0;"><p>Início da conversa com ${escapeHtml(shortId(peerAddress))}. Mensagens salvas apenas neste aparelho.</p></div>`;
  }
  return messages
    .map((m) => {
      const isSent = m.from === myAddress || m.status === "sent";
      const cls = isSent ? "sent" : "received";
      const timeStr = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const statusLabel = m.status === "delivered" ? "✓✓ RTC" : m.status === "queued-relay" ? "✓ Relay" : "✓";
      return `
        <div class="dm-bubble ${cls}">
          <div>${escapeHtml(m.text)}</div>
          <div class="dm-bubble-meta">${timeStr} · ${statusLabel}</div>
        </div>`;
    })
    .join("");
}

export function renderDmThread(main, peerAddress, messages = [], myAddress = "", { isRtcOnline = false, hasDmPub = false } = {}) {
  const statusBadge = isRtcOnline
    ? `<span class="badge-pill" style="background:var(--success-soft); color:var(--success);">🟢 WebRTC Online</span>`
    : `<span class="badge-pill">📦 Relay Inbox TTL</span>`;

  const keyWarning = !hasDmPub
    ? `<div class="card error" style="margin-bottom:0.75rem;">
        ⚠️ Chave Dm-Pub de <code>${escapeHtml(shortId(peerAddress))}</code> não encontrada. Cole para ativar E2E:
        <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
          <input type="text" id="input-manual-dmpub" class="form-control" placeholder='{"kty":"EC","crv":"P-256",...}' />
          <button type="button" id="btn-save-manual-dmpub" class="btn btn-sm btn-primary">Salvar</button>
        </div>
      </div>`
    : "";

  main.innerHTML = `
    <a class="back-link" href="#/dm">← Voltar às conversas</a>
    ${keyWarning}

    <div class="dm-thread-container">
      <div class="dm-thread-header">
        <div>
          <strong style="font-size:0.95rem;"><a href="#/u/${encodeURIComponent(peerAddress)}">${escapeHtml(shortId(peerAddress))}</a></strong>
        </div>
        <div>${statusBadge}</div>
      </div>

      <div class="dm-thread-list" id="dm-thread-container">
        ${renderDmMessageBubbles(messages, myAddress, peerAddress)}
      </div>

      <form id="form-send-dm" class="dm-form-sticky">
        <input type="text" id="dm-message-input" class="form-control" placeholder="Mensagem privada..." required autocomplete="off" />
        <button type="submit" id="btn-send-dm" class="btn btn-primary" ${!hasDmPub ? "disabled" : ""}>Enviar 🔒</button>
      </form>
    </div>
  `;
}
