const root = () => document.getElementById("app-root");

export function renderShell({ title, subtitle, breadcrumb }) {
  root().innerHTML = `
    <header class="app-header">
      <a class="home-link" href="#/">Vox</a>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </header>
    <main id="app-main"></main>
    <footer class="app-footer">Fase 1 — leitura · permaweb</footer>
  `;
  const main = document.getElementById("app-main");
  if (breadcrumb) main.insertAdjacentHTML("afterbegin", breadcrumb);
  return main;
}

export function renderLoading(main) {
  main.innerHTML = `<p class="loading">Carregando…</p>`;
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
  if (!communities.length) {
    main.innerHTML += `
      <div class="empty">
        <p>Nenhuma comunidade <code>vox-brasil</code> encontrada ainda.</p>
        <p>Publique uma transação <code>Type: community</code> na Fase 2.</p>
      </div>`;
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
      <p class="meta">ID: ${escapeHtml(shortId(c.id))}</p>
    </li>`
    )
    .join("");
  main.innerHTML += `<ul class="card-list">${items}</ul>`;
}

export function renderCommunity(main, communityId, topics, meta) {
  main.innerHTML += `
    <p class="meta">Comunidade: ${escapeHtml(shortId(communityId))}</p>
    <p class="section-title">Tópicos</p>`;
  if (!topics.length) {
    main.innerHTML += `<div class="empty"><p>Nenhum tópico nesta comunidade.</p></div>`;
    return;
  }
  const items = topics
    .map(
      (t) => `
    <li class="card">
      <a href="#/t/${encodeURIComponent(t.id)}">
        <h3>${escapeHtml(t.title)}</h3>
      </a>
      <p class="meta">por ${escapeHtml(shortId(t.owner))}</p>
    </li>`
    )
    .join("");
  main.innerHTML += `<ul class="card-list">${items}</ul>`;
  if (meta?.title) {
    const h = main.previousElementSibling?.querySelector("h1");
    if (h) h.textContent = meta.title;
  }
}

export function renderTopic(main, topicId, topic, replies) {
  main.innerHTML += `
    <p class="meta">Tópico ${escapeHtml(shortId(topicId))}</p>
    <div class="card">
      <h2>${escapeHtml(topic?.title || "Tópico")}</h2>
      <p class="meta">Autor: ${escapeHtml(shortId(topic?.owner || ""))}</p>
    </div>
    <p class="section-title">Respostas (${replies.length})</p>`;
  if (!replies.length) {
    main.innerHTML += `<div class="empty"><p>Sem respostas ainda.</p></div>`;
    return;
  }
  const items = replies
    .map(
      (r) => `
    <li class="card reply">
      <p>${escapeHtml(r.body || "(conteúdo nas tags ou TX)")}</p>
      <p class="meta">${escapeHtml(shortId(r.owner))}</p>
    </li>`
    )
    .join("");
  main.innerHTML += `<ul class="card-list">${items}</ul>`;
}

function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
