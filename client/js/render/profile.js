/** @file Profiles, wallet, Pix, compose screens. */
import * as mock from "../mock.js";
import * as social from "../social.js";
import * as listing from "../listing.js";
import * as profileDirectory from "../profile-directory.js";
import {
  escapeHtml,
  shortId,
  renderAvatarHtml,
  renderMarkdownLight,
} from "./util.js";
import { renderPostItem } from "./feed.js";
import { isWelcomeRouteId } from "../vox-welcome-profile.js";

function renderProfileGithubBadge(githubHandle) {
  if (!githubHandle) return "";
  const clean = escapeHtml(String(githubHandle).replace(/^@+/, ""));
  return `
    <div class="profile-github-badge">
      <span class="github-badge-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      </span>
      <span>GitHub: <a href="https://github.com/${clean}" target="_blank" rel="noopener"><strong>@${clean}</strong></a></span>
      <span class="badge-pill gh-pill">Informado</span>
    </div>`;
}

function renderProfileReadme(address, displayName, readme, isCurrentWallet) {
  if (!readme && !isCurrentWallet) return "";
  const contentHtml = readme
    ? renderMarkdownLight(readme)
    : `<p class="desc" style="font-style:italic;">Nenhum README.md adicionado ainda. Conte sobre seus projetos e ideias!</p>`;
  return `
    <div class="card profile-readme" style="margin-top:0.75rem;">
      <div class="readme-header">
        <span class="readme-title"><span class="readme-icon">📖</span> <strong>README.md</strong></span>
        ${isCurrentWallet ? `<button type="button" id="btn-toggle-edit-readme" class="btn btn-xs btn-outline">Editar README</button>` : ""}
      </div>
      <div class="readme-body" id="readme-view">
        ${contentHtml}
      </div>
      ${isCurrentWallet ? `
        <form id="form-edit-readme" style="display:none; margin-top:0.6rem;">
          <textarea id="input-profile-readme" class="form-control" rows="5" placeholder="Escreva seu README em Markdown...">${escapeHtml(readme || "")}</textarea>
          <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <button type="submit" class="btn btn-sm btn-primary">Salvar README</button>
            <button type="button" id="btn-cancel-readme" class="btn btn-sm btn-outline">Cancelar</button>
          </div>
        </form>
      ` : ""}
    </div>`;
}

function renderProfileStats(statsData, address = "") {
  if (!statsData) return "";
  const postsCount = statsData.posts || 1;
  const postsLabel = postsCount === 1 ? "post" : "posts";
  const baseFollowers = statsData.followers || 0;
  const followersCount = social.getFollowersCount(address, baseFollowers);
  const starsCount = statsData.stars || 0;

  return `
    <div class="profile-stats">
      <span><strong>${postsCount}</strong> <span class="meta">${postsLabel}</span></span>
      <span><strong>${followersCount}</strong> <span class="meta">acompanhando</span></span>
      ${starsCount ? `<span><strong>${starsCount}</strong> <span class="meta">estrelas</span></span>` : ""}
      ${statsData.peersConnected !== undefined
        ? `<span><strong>${statsData.peersConnected}</strong> <span class="meta">aparelhos próximos</span></span>`
        : ""}
      ${statsData.communities !== undefined
        ? `<span><strong>${statsData.communities}</strong> <span class="meta">comunidade</span></span>`
        : ""}
      ${statsData.isStereotypeDemo || statsData.isTourDemo
        ? `<span class="badge-pill demo-badge">Perfil estereótipo (demo)</span>`
        : ""}
    </div>`;
}

function renderStereotypeDemoBanner(address) {
  const prof = mock.getMockProfile(address);
  if (!prof?.isStereotypeDemo && !prof?.stereotypeTitle) return "";
  const title = prof.stereotypeTitle || "Perfil estereótipo 🇧🇷";
  const greeting =
    prof.stereotypeGreeting || "Oi, sou só um estereótipo respeitoso — não me leve a mal!";
  const disclaimerNote =
    prof.stereotypeDisclaimerNote ||
    "Perfil fictício para demo e educação no Vox — clichês regionais leves, nunca para ridicularizar pessoas reais.";
  const ufLine = prof.uf && prof.stateName
    ? `<p class="meta" style="margin:0.35rem 0 0;">${escapeHtml(prof.stateName)} (${escapeHtml(prof.uf)}) — humor educativo, não pessoa real.</p>`
    : "";
  return `
    <div class="card profile-stereotype-banner" style="margin-top:0.65rem; border:1px dashed var(--border);">
      <p style="margin:0; font-size:1.02rem;"><strong>👋 ${escapeHtml(greeting)}</strong></p>
      <p style="margin:0.45rem 0 0;"><strong>🧪 ${escapeHtml(title)}</strong></p>
      <p class="desc" style="margin:0.4rem 0 0; font-size:0.88rem;">
        ${escapeHtml(disclaimerNote)}
        Este é um <strong>perfil estereótipo</strong> para <strong>testes da plataforma</strong> e explicação lúdica de demografia regional. O clichê está no texto — nunca na zombaria de aparência.
      </p>
      ${ufLine}
    </div>`;
}

function renderOfficialPlatformBanner(address) {
  if (!isWelcomeRouteId(address)) return "";
  return `
    <div class="card profile-official-banner" style="margin-top:0.65rem; border:1px solid var(--border);">
      <p style="margin:0;"><strong>✓ Conta oficial da plataforma</strong></p>
      <p class="desc" style="margin:0.4rem 0 0; font-size:0.88rem;">
        Voz institucional do Vox — não é pessoa física nem perfil estereótipo de demo.
        <a href="#/voxpedia">Voxpedia</a> · DM de boas-vindas
      </p>
    </div>`;
}

function renderProfilePixBadge(pixKeyMasked, pixKeyRaw) {
  if (!pixKeyMasked) return "";
  const query = encodeURIComponent(pixKeyRaw || pixKeyMasked);
  return `
    <div class="profile-pix-badge">
      <span class="pix-badge-icon">❖</span>
      <span>Chave Pix: <strong>${escapeHtml(pixKeyMasked)}</strong></span>
      <a class="pix-badge-link" href="#/pix/${query}">Consultar</a>
    </div>`;
}

function renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio = "", stats = null, pixKeyMasked = "", pixKeyRaw = "", githubHandle = "") {
  const displayTitle = displayName ? `${displayName} (@${handle || shortId(address)})` : (handle ? `@${handle}` : "Perfil");
  const initial = (displayName || handle || address || "U").slice(0, 1).toUpperCase();
  const avatarUrl = profileDirectory.getAuthorAvatarSync(address) || mock.getAuthorAvatar(address);
  const squircle = isWelcomeRouteId(address) ? " avatar-squircle" : "";
  const avatarHtml = avatarUrl
    ? `<img class="profile-avatar-img${squircle}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName || address)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="avatar${squircle}" style="display:none; width:72px; height:72px; font-size:1.8rem;">${initial}</span>`
    : `<span class="avatar${squircle}" style="width:72px; height:72px; font-size:1.8rem;">${initial}</span>`;

  const bioHtml = profileBio ? `<p class="profile-bio desc">${escapeHtml(profileBio)}</p>` : "";
  const statsData = stats || mock.getMockProfile(address)?.stats;
  const statsHtml = renderProfileStats(statsData, address);
  const pixBadge = renderProfilePixBadge(pixKeyMasked, pixKeyRaw);
  const githubBadge = renderProfileGithubBadge(githubHandle);

  const isWatchingAuthor = social.isWatching(address);
  const watchBtnHtml = !isCurrentWallet
    ? `<button class="btn btn-sm ${isWatchingAuthor ? "btn-outline" : "btn-primary"} btn-watch-profile" data-route="${escapeHtml(address)}" style="margin-left:auto;">
        ${isWatchingAuthor ? "✓ Acompanhando" : "👁️ Acompanhar (Watch)"}
      </button>`
    : "";

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
      <div class="profile-cover"></div>
      <div class="profile-header-body">
        <div class="profile-avatar-row">
          <div class="profile-avatar-wrap">${avatarHtml}</div>
          ${isCurrentWallet ? `<span class="badge-pill">Sua Conta Neste Aparelho</span>` : ""}
          ${watchBtnHtml}
        </div>
        <div class="profile-info">
          <h2 class="profile-title">${escapeHtml(displayTitle)}</h2>
          <p class="meta profile-route-id">ID de Rede: <code>${escapeHtml(address)}</code></p>
        </div>
        ${bioHtml}
        ${renderOfficialPlatformBanner(address)}
        ${renderStereotypeDemoBanner(address)}
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
          ${pixBadge}
          ${githubBadge}
        </div>
        ${statsHtml}
        ${conflictBanner}
      </div>
    </div>`;
}

function renderPixForm(currentPixKey) {
  return `
    <div class="pix-section">
      <label for="input-pix-key" class="pix-label">Chave Pix (opcional no perfil):</label>
      <p class="desc pix-desc">Chave para apoios diretos. Não é login nem valida titularidade bancária. Seu ID de conta continua sendo sua chave criptográfica local.</p>
      <form id="form-pix-key" class="pix-form">
        <input type="text" id="input-pix-key" class="form-control" placeholder="CPF, e-mail, telefone ou chave aleatória" value="${escapeHtml(currentPixKey || "")}" />
        <button type="submit" class="btn btn-sm btn-primary">Salvar Pix</button>
        ${currentPixKey ? `<button type="button" id="btn-clear-pix" class="btn btn-sm btn-outline">Remover</button>` : ""}
      </form>
      <div id="pix-feedback" class="pix-feedback"></div>
    </div>`;
}

function renderGithubForm(currentGithub) {
  return `
    <div class="github-section" style="margin-top:0.75rem; border-top:1px solid var(--border-subtle); padding-top:0.75rem;">
      <label for="input-github-handle" class="pix-label">Perfil GitHub (opcional):</label>
      <p class="desc pix-desc">Vincule seu @handle público do GitHub ao seu perfil.</p>
      <form id="form-github-handle" class="pix-form">
        <input type="text" id="input-github-handle" class="form-control" placeholder="Usuário do GitHub (ex: dev-brasil)" value="${escapeHtml(currentGithub || "")}" />
        <button type="submit" class="btn btn-sm btn-primary">Salvar GitHub</button>
        ${currentGithub ? `<button type="button" id="btn-clear-github" class="btn btn-sm btn-outline">Remover</button>` : ""}
      </form>
      <div id="github-feedback" class="pix-feedback"></div>
    </div>`;
}

function renderOAuthEnrichmentBlock(oauthProvider = "") {
  if (!oauthProvider) return "";
  const label = oauthProvider === "google" ? "Google" : oauthProvider === "facebook" ? "Meta" : oauthProvider;
  return `
    <div class="oauth-enrich-notice" style="margin-top:0.65rem; padding:0.55rem 0.65rem; background:var(--surface-soft); border-radius:var(--radius-sm); font-size:0.82rem;">
      <p class="desc" style="margin:0 0 0.45rem;">Nome e foto importados via <strong>${escapeHtml(label)}</strong> (opcional). Tokens OAuth não são guardados neste aparelho.</p>
      <button type="button" id="btn-clear-oauth-enrich" class="btn btn-sm btn-outline">Remover nome/foto importados</button>
    </div>`;
}

function renderProfileActions(
  address,
  isCurrentWallet,
  handle,
  displayName,
  hasWallet,
  balance,
  currentPixKey = "",
  currentGithub = "",
  oauthProvider = "",
  isBlocked = false,
  isMuted = false,
  meshDiscoverable = false,
) {
  if (isCurrentWallet) {
    return `
      <div class="card" style="margin-top:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>Mensagens Diretas</strong>
            <p class="meta" style="margin:2px 0 0;">Compartilhe seu link para receber DMs privadas:</p>
          </div>
          <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
            <button id="btn-copy-my-dm-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(address)}">📋 Copiar Meu Link</button>
            <button id="btn-copy-connect-link" class="btn btn-sm btn-outline" data-route="${escapeHtml(address)}">↗ Link #/connect</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Identidade Local</h3>
        <form id="form-display-name" style="margin-top:0.5rem; display:flex; gap:0.5rem;">
          <input type="text" id="input-display-name" class="form-control" placeholder="Seu apelido ou nome..." value="${escapeHtml(displayName || "")}" maxlength="30" />
          <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar Nome</button>
        </form>
        ${renderOAuthEnrichmentBlock(oauthProvider)}
        ${renderPixForm(currentPixKey)}
        ${renderGithubForm(currentGithub)}
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Descoberta na malha</h3>
        <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem; margin-top:0.5rem;">
          <input type="checkbox" id="profile-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
          <div>
            <label for="profile-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
            <p class="desc" style="font-size:0.82rem; margin:0.25rem 0 0;">Cartão assinado opt-in para pares conectados; sem ranking nem servidor central.</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:0.75rem;">
        <h3>Backup & Restauração de Conta</h3>
        <p class="desc" style="font-size:0.85rem; margin-bottom:0.5rem;">Exporte sua identidade completa (chaves de assinatura e DMs) para controle total da sua conta.</p>
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
          <button type="button" id="btn-export-account" class="btn btn-sm btn-outline">💾 Exportar Identidade (.json)</button>
          <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
            📥 Restaurar Backup
            <input type="file" id="file-import-account" accept="application/json,.json" style="display:none;" />
          </label>
        </div>
      </div>

      <details class="advanced-settings card" style="margin-top:0.75rem;">
        <summary>Avançado — Arquivamento Permanente & Carteira</summary>
        <div style="margin-top:0.75rem;">
          <p class="desc">Por padrão, o Vox opera na rede distribuída com custo zero entre aparelhos. Se quiser arquivar publicações e seu @handle permanentemente no permaweb, configure sua carteira Arweave abaixo:</p>

          <form id="form-claim-handle" style="margin-top:0.75rem;">
            <label style="font-size:0.85rem; font-weight:600;">Reivindicar @handle on-chain:</label>
            <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
              <input type="text" id="input-handle-slug" class="form-control" placeholder="ex: maria" value="${handle || ""}" />
              <button type="submit" id="btn-submit-handle" class="btn btn-sm btn-primary" style="white-space:nowrap;">Salvar @handle</button>
            </div>
          </form>

          <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
            <button id="btn-copy-dmpub" class="btn btn-sm btn-outline">📋 Copiar Chave Pública</button>
            <button id="btn-publish-dmpub" class="btn btn-sm btn-primary">🌐 Publicar Chave on-chain</button>
          </div>

          <div style="margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.6rem;">
            <h4>Carteira Arweave</h4>
            ${hasWallet ? `
              <p class="meta">Status: Conectada · Saldo: <strong>${escapeHtml(balance || "0.000")} AR</strong></p>
              <button id="btn-disconnect-wallet" class="btn btn-danger btn-sm">Desconectar Carteira</button>
            ` : `
              <p class="meta">Nenhuma carteira Arweave conectada.</p>
              <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
                <button id="btn-generate-wallet" class="btn btn-primary btn-sm">⚡ Gerar Carteira Arweave</button>
                <a href="#/wallet" class="btn btn-outline btn-sm">Importar JWK</a>
              </div>
            `}
          </div>
        </div>
      </details>`;
  }
  return `
    <div class="card" style="margin-top:0.75rem; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
      <a class="btn btn-primary btn-sm" href="#/dm/${encodeURIComponent(address)}">💬 Mensagem Privada</a>
      <button class="btn btn-outline btn-sm" id="btn-copy-author-route" data-route="${escapeHtml(address)}">📋 Copiar ID</button>
      <button class="btn btn-sm ${isBlocked ? "btn-outline" : "btn-danger"}" id="btn-toggle-block" data-route="${escapeHtml(address)}">
        ${isBlocked ? "Desbloquear Autor" : "🚫 Bloquear"}
      </button>
      <button class="btn btn-sm btn-outline" id="btn-toggle-mute" data-route="${escapeHtml(address)}">
        ${isMuted ? "Desilenciar no Feed" : "🔇 Silenciar"}
      </button>
    </div>`;
}

export function renderProfile(main, address, memberships = [], isCurrentWallet = false, dmPubStr = "", {
  handle = "",
  isConflict = false,
  claimants = [],
  displayName = "",
  profileBio = "",
  stats = null,
  posts = [],
  starredPosts = [],
  hasWallet = false,
  balance = "0.000",
  pixKey = "",
  pixKeyMasked = "",
  githubHandle = "",
  readme = "",
  activeTab = "posts",
  pinnedPostId = "",
  oauthProvider = "",
  isBlocked = false,
  isMuted = false,
  meshDiscoverable = false,
} = {}) {
  const finalGithub = githubHandle || (isCurrentWallet ? social.getLocalGithubHandle() : mock.getAuthorGithub(address));
  const finalReadme = readme || (isCurrentWallet ? social.getLocalReadme() : mock.getAuthorReadme(address));
  const finalPinned = pinnedPostId || (isCurrentWallet ? social.getPinnedPostId(address) : mock.getAuthorPinnedPostId(address));

  let html = renderProfileHeader(address, isCurrentWallet, handle, isConflict, claimants, displayName, profileBio, stats, pixKeyMasked, pixKey, finalGithub);
  html += renderProfileActions(
    address,
    isCurrentWallet,
    handle,
    displayName,
    hasWallet,
    balance,
    pixKey,
    finalGithub,
    oauthProvider,
    isBlocked,
    isMuted,
    meshDiscoverable,
  );
  html += renderProfileReadme(address, displayName, finalReadme, isCurrentWallet);

  // Reordena posts para colocar fixado no topo
  const authorPostList = [...(posts || [])];
  if (finalPinned) {
    const pinIdx = authorPostList.findIndex((p) => p.id === finalPinned);
    if (pinIdx > 0) {
      const [pinnedItem] = authorPostList.splice(pinIdx, 1);
      authorPostList.unshift(pinnedItem);
    }
  }

  const starredList = starredPosts || [];
  const currentTab = activeTab || "posts";

  html += `
    <div class="community-tabs profile-tabs" style="margin-top:1rem;">
      <a href="#/u/${encodeURIComponent(address)}?tab=posts" class="tab-btn ${currentTab === "posts" ? "active" : ""}">Posts do autor (${authorPostList.length})</a>
      <a href="#/u/${encodeURIComponent(address)}?tab=starred" class="tab-btn ${currentTab === "starred" ? "active" : ""}">Estrelados (${starredList.length})</a>
      <a href="#/u/${encodeURIComponent(address)}?tab=communities" class="tab-btn ${currentTab === "communities" ? "active" : ""}">Comunidades (${memberships.length})</a>
    </div>`;

  if (currentTab === "posts") {
    if (!authorPostList.length) {
      html += `<div class="empty"><p>Nenhum post publicado por este autor.</p></div>`;
    } else {
      const postCards = authorPostList.map((p) => renderPostItem(p, { isPinned: p.id === finalPinned })).join("");
      html += `<div class="feed-container" style="margin-top:0.75rem;">${postCards}</div>`;
    }
  } else if (currentTab === "starred") {
    if (!starredList.length) {
      html += `<div class="empty"><p>Nenhum post favoritado com estrela ⭐ ainda.</p></div>`;
    } else {
      const starredCards = starredList.map((p) => renderPostItem(p)).join("");
      html += `<div class="feed-container" style="margin-top:0.75rem;">${starredCards}</div>`;
    }
  } else if (currentTab === "communities") {
    if (!memberships.length) {
      html += `<div class="empty"><p>Nenhuma comunidade registrada neste perfil.</p></div>`;
    } else {
      const list = memberships
        .map(
          (m) => `
        <div class="card" style="padding:10px 14px; margin-top:0.5rem;">
          <a href="#/c/${encodeURIComponent(m.communityId)}">
            <h3 style="margin:0 0 2px;">${escapeHtml(m.communityId)}</h3>
          </a>
          <span class="meta">Membro confirmado</span>
        </div>`
        )
        .join("");
      html += `<div class="card-list">${list}</div>`;
    }
  }

  main.innerHTML = html;
}

export function renderPixLookup(main, query = "", profile = null) {
  const queryStr = escapeHtml(query);
  let content = "";
  if (profile) {
    const profName = profile.name || shortId(profile.routeId);
    const profHandle = profile.handle ? `@${profile.handle}` : "";
    const pixMasked = profile.pixKeyMasked || profile.pixKey || "";
    content = `
      <div class="card pix-lookup-card">
        <div class="pix-lookup-header">
          <span class="badge-pill p2p-pill">❖ Conta Localizada</span>
        </div>
        <h2 style="margin:0.5rem 0 0.2rem;">${escapeHtml(profName)} ${profHandle ? `<span class="meta">${escapeHtml(profHandle)}</span>` : ""}</h2>
        <p class="meta">ID de Rede: <code>${escapeHtml(profile.routeId)}</code></p>
        <div class="card" style="margin:0.75rem 0; background:var(--surface-soft);">
          <span class="meta" style="font-size:0.8rem;">Chave Pix informada:</span>
          <div style="font-size:1.1rem; font-weight:700; margin-top:0.2rem;"><code>${escapeHtml(pixMasked)}</code></div>
        </div>
        <div class="card" style="font-size:0.82rem; color:var(--muted); margin-bottom:1rem;">
          <p style="margin:0;"><strong>Aviso de Conformidade:</strong> O Vox é um aplicativo peer-to-peer sem servidores centrais e não é uma instituição financeira nem processa pagamentos. Abra seu aplicativo de banco para concluir transações com segurança.</p>
        </div>
        <div class="actions-row">
          <a class="btn btn-primary" href="#/u/${encodeURIComponent(profile.routeId)}">Ver Perfil Completo</a>
          <a class="btn btn-outline" href="#/dm/${encodeURIComponent(profile.routeId)}">💬 Mensagem Privada</a>
        </div>
      </div>`;
  } else {
    content = `
      <div class="card pix-lookup-card empty">
        <h2>Chave Pix não vinculada</h2>
        <p class="desc">A chave <code>${queryStr}</code> não foi declarada em nenhum perfil ativo ou tour neste aparelho.</p>
        <p class="meta" style="margin-top:0.5rem;">Lembre-se: chaves Pix no Vox são atributos declarativos opcionais armazenados no aparelho de cada usuário.</p>
        <div class="actions-row" style="margin-top:1rem;">
          <a class="btn btn-outline" href="#/">← Voltar ao Início</a>
        </div>
      </div>`;
  }

  main.innerHTML = `
    <div class="actions-bar">
      <span class="section-title">Consulta de Chave Pix</span>
    </div>
    ${content}
  `;
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
          <a class="btn btn-outline" href="#/perfil">Meu Perfil</a>
          <button id="btn-disconnect-wallet" class="btn btn-danger">Desconectar</button>
        </div>
      </div>`;
  } else {
    statusBox = `
      <div class="card wallet-warning">
        <p>Conecte ou gere uma carteira Arweave se desejar publicar dados no permaweb permanente.</p>
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

export function renderComposeCommunity(main) {
  main.innerHTML = `
    <div class="card compose-card">
      <a class="back-link" href="#/communities">← Voltar</a>
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

export function renderComposeTopic(main, communityId) {
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

export function renderComposeReply(main, topicId, communityId) {
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

export function renderComposeListing(main, communityId, commTitle = "", prefill = {}) {
  const titleDisplay = commTitle || communityId || "Feira";
  const backLink = `<a class="back-link" href="#/c/${encodeURIComponent(communityId)}?tab=listings">← Voltar à feira</a>`;
  const defaultPix = prefill.defaultPix || "";

  main.innerHTML = `
    <div class="card compose-card compose-listing-card">
      ${backLink}
      <h2>Nova Oferta — ${escapeHtml(titleDisplay)}</h2>
      <p class="listing-form-disclaimer" style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
        ⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}
      </p>
      <form id="form-compose-listing">
        <input type="hidden" id="listing-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group">
          <label for="listing-title">O que você está ofertando?</label>
          <input type="text" id="listing-title" class="form-control" placeholder="Ex: Pão artesanal de fermentação natural" required maxlength="120" />
        </div>
        <div class="form-row" style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          <div class="form-group" style="flex:1 1 140px;">
            <label for="listing-price">Preço sugerido:</label>
            <input type="text" id="listing-price" class="form-control" placeholder="Ex: R$ 35" />
          </div>
          <div class="form-group" style="flex:1 1 180px;">
            <label for="listing-location">Bairro / Região:</label>
            <input type="text" id="listing-location" class="form-control" placeholder="Ex: Vila Madalena, SP" maxlength="60" />
          </div>
        </div>
        <div class="form-group">
          <label for="listing-pix">Chave Pix para recebimento direto (opcional):</label>
          <input type="text" id="listing-pix" class="form-control" placeholder="E-mail, celular, CPF ou chave aleatória" value="${escapeHtml(defaultPix)}" />
        </div>
        <div class="form-group">
          <label for="listing-image">Foto do item (URL opcional):</label>
          <input type="text" id="listing-image" class="form-control" placeholder="images/posts/tour-helena.jpg ou https://..." />
        </div>
        <div class="form-group">
          <label for="listing-body">Descrição da oferta:</label>
          <textarea id="listing-body" class="form-control" rows="4" placeholder="Descreva os detalhes do produto ou serviço, prazos e forma de entrega..." required></textarea>
        </div>
        <div class="form-actions" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary" id="btn-submit-listing">Publicar na Feira</button>
        </div>
      </form>
    </div>`;
}
