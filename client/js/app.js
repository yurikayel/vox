import * as gql from "./graphql.js";
import * as render from "./render.js";
import * as mock from "./mock.js";
import * as wallet from "./wallet.js";
import * as upload from "./upload.js";
import * as share from "./share.js";
import * as mod from "./moderation.js";
import * as cacheNode from "./cache-node.js";
import * as peers from "./peers.js";
import * as cryptoDm from "./crypto-dm.js";
import * as inbox from "./inbox.js";

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = hash.split("?");
  const parts = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const query = new URLSearchParams(queryPart || "");

  if (!parts.length) return { name: "home" };
  if (parts[0] === "settings" && parts[1] === "network") {
    return { name: "network-settings" };
  }
  if (parts[0] === "dm") {
    if (parts[1]) return { name: "dm-thread", address: decodeURIComponent(parts[1]) };
    return { name: "dm-list" };
  }
  if (parts[0] === "c" && parts[1]) {
    return { name: "community", id: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "t" && parts[1]) {
    return {
      name: "topic",
      id: decodeURIComponent(parts[1]),
      communityId: query.get("c") || "",
    };
  }
  if (parts[0] === "u" && parts[1]) {
    return { name: "profile", address: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "wallet") return { name: "wallet" };
  if (parts[0] === "compose") {
    if (parts[1] === "community") return { name: "compose-community" };
    if (parts[1] === "topic") return { name: "compose-topic", communityId: query.get("c") || "" };
    if (parts[1] === "reply") {
      return {
        name: "compose-reply",
        topicId: query.get("t") || "",
        communityId: query.get("c") || "",
      };
    }
  }
  return { name: "home" };
}

async function getActiveUser() {
  try {
    return await wallet.getAddress();
  } catch {
    return null;
  }
}

async function showHome() {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Comunidades",
    subtitle: "A Rua — fóruns e debates abertos no permaweb",
    walletAddress: user,
  });
  render.renderLoading(main);

  try {
    const { items, gateway, demo } = await gql.fetchCommunities().catch(async () => mock.mockCommunities());
    main.innerHTML = "";
    if (demo) render.renderDemoBanner(main);
    else render.renderGatewayBanner(main, gateway);
    render.renderHome(main, items);
  } catch (e) {
    main.innerHTML = "";
    const fb = mock.mockCommunities();
    render.renderDemoBanner(main);
    render.renderError(main, String(e.message || e));
    render.renderHome(main, fb.items);
  }
}

async function showCommunity(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Comunidade",
    subtitle: `Fórum de ${communityId}`,
    walletAddress: user,
  });
  render.renderLoading(main);

  let topics = [];
  let meta = { id: communityId, title: communityId, owner: "" };
  let demo = false;
  let gateway = "";

  try {
    const res = await gql.fetchTopics(communityId).catch(() => mock.mockTopics(communityId));
    topics = res.items;
    demo = res.demo;
    gateway = res.gateway;
  } catch (e) {
    const fb = mock.mockTopics(communityId);
    topics = fb.items;
    demo = true;
  }

  // Tenta carregar detalhes da comunidade da lista
  try {
    const comms = await gql.fetchCommunities();
    const found = comms.items.find((c) => c.id === communityId);
    if (found) meta = found;
  } catch {
    // Mantém meta básico
  }

  // Moderação
  let modActions = [];
  try {
    modActions = await mod.fetchModActions(communityId);
  } catch {
    // Sem mod actions
  }
  const filteredTopics = mod.applyFilters(topics, modActions, meta.owner, meta.moderators);
  const isUserMod = mod.isModerator(user, meta.owner, meta.moderators);

  // Checagem de Membresia
  let isMember = false;
  if (user) {
    try {
      const mems = await gql.fetchUserMemberships(user);
      isMember = mems.some((m) => m.communityId === communityId);
    } catch {
      // Ignora
    }
  }

  main.innerHTML = "";
  if (demo) render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderCommunity(main, communityId, filteredTopics, meta, {
    isMember,
    isMod: isUserMod,
    walletAddress: user,
  });

  // Eventos na tela da comunidade
  const btnShare = document.getElementById("btn-share-comm");
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      share.shareCommunity({ title: meta.title || communityId, communityId });
    });
  }

  const btnJoin = document.getElementById("btn-join-comm");
  if (btnJoin && !isMember) {
    btnJoin.addEventListener("click", async () => {
      if (!wallet.hasWallet()) {
        share.showToast("Conecte sua carteira em #/wallet para entrar.", "error");
        location.hash = "#/wallet";
        return;
      }
      btnJoin.disabled = true;
      btnJoin.textContent = "Gravando membresia…";
      try {
        const tags = upload.buildTags("membership", { "Community-Id": communityId });
        await upload.postData({ communityId, joinedAt: Date.now() }, tags);
        share.showToast("Membresia gravada com sucesso!");
        btnJoin.textContent = "✓ Membro Confirmado";
      } catch (err) {
        share.showToast(`Erro ao entrar: ${err.message}`, "error");
        btnJoin.disabled = false;
        btnJoin.textContent = "★ Entrar na Comunidade";
      }
    });
  }

  // Evento Ocultar para moderadores
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId} para todos os membros desta comunidade?`)) return;
      e.target.disabled = true;
      try {
        const tags = upload.buildTags("mod-action", {
          "Community-Id": communityId,
          Action: "hide",
          Target: targetId,
        });
        await upload.postData({ action: "hide", target: targetId, communityId }, tags);
        share.showToast("Ação de moderação enviada.");
        e.target.closest(".card")?.remove();
      } catch (err) {
        share.showToast(`Erro na moderação: ${err.message}`, "error");
        e.target.disabled = false;
      }
    });
  });
}

async function showTopic(topicId, commIdParam = "") {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Tópico",
    subtitle: `Discussão ${topicId.slice(0, 8)}…`,
    walletAddress: user,
  });
  render.renderLoading(main);

  let topic = { title: "Tópico", owner: "", communityId: commIdParam };
  let replies = [];
  let topicData = { body: "" };

  // Busca metadados e corpo do tópico
  try {
    const fetchedTopic = await gql.fetchTopicById(topicId);
    if (fetchedTopic) topic = fetchedTopic;
  } catch {
    // fallback
  }

  try {
    topicData = await gql.fetchTransactionData(topicId);
  } catch {
    // fallback
  }

  let gateway = "";
  let demo = false;
  try {
    const res = await gql.fetchReplies(topicId);
    replies = res.items;
    gateway = res.gateway;
  } catch {
    const fb = mock.mockReplies(topicId);
    replies = fb.items;
    demo = true;
    if (!topic.title || topic.title === "Tópico") {
      topic = { title: "Como funciona a Fase 2?", owner: "demo-owner", communityId: commIdParam };
      topicData = { body: "Esta é uma visualização demonstrativa com corpo e replies." };
    }
  }

  // Para cada resposta sem body nas tags, carrega via fetchTransactionData assincronamente
  const finalCommId = topic.communityId || commIdParam;
  let modActions = [];
  if (finalCommId) {
    try {
      modActions = await mod.fetchModActions(finalCommId);
    } catch {}
  }
  const filteredReplies = mod.applyFilters(replies, modActions);
  const isUserMod = mod.isModerator(user, "", "");

  main.innerHTML = "";
  if (demo) render.renderDemoBanner(main);
  else if (gateway) render.renderGatewayBanner(main, gateway);

  render.renderTopic(main, topicId, topic, filteredReplies, {
    topicData,
    isMod: isUserMod,
    communityId: finalCommId,
  });

  // Carrega corpos das respostas que não vieram nas tags
  filteredReplies.forEach(async (r) => {
    if (!r.body || r.body.startsWith("(")) {
      const d = await gql.fetchTransactionData(r.id);
      if (d?.body) {
        const el = document.getElementById(`reply-${r.id}`);
        const p = el?.querySelector(".reply-body");
        if (p) p.textContent = d.body;
      }
    }
  });

  // Evento Compartilhar
  const btnShare = document.getElementById("btn-share-topic");
  if (btnShare) {
    btnShare.addEventListener("click", () => {
      share.shareTopic({
        title: topic.title || "Tópico no Vox",
        topicId,
        communityId: finalCommId,
      });
    });
  }

  // Mod hide em replies
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId}?`)) return;
      e.target.disabled = true;
      try {
        const tags = upload.buildTags("mod-action", {
          "Community-Id": finalCommId,
          Action: "hide",
          Target: targetId,
        });
        await upload.postData({ action: "hide", target: targetId }, tags);
        share.showToast("Item ocultado.");
        e.target.closest(".card")?.remove();
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        e.target.disabled = false;
      }
    });
  });
}

async function showProfile(address) {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Perfil",
    subtitle: address.slice(0, 10) + "…",
    walletAddress: user,
  });
  render.renderLoading(main);

  const memberships = await gql.fetchUserMemberships(address);
  const isSelf = user === address;
  let dmPub = null;
  if (isSelf) {
    dmPub = await cryptoDm.getPublicJwk();
  }

  main.innerHTML = "";
  render.renderProfile(main, address, memberships, isSelf, JSON.stringify(dmPub));

  const btnCopy = document.getElementById("btn-copy-dmpub");
  if (btnCopy && dmPub) {
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(dmPub));
      share.showToast("Chave pública Dm-Pub copiada para a área de transferência!");
    });
  }

  const btnPub = document.getElementById("btn-publish-dmpub");
  if (btnPub && isSelf && dmPub) {
    btnPub.addEventListener("click", async () => {
      btnPub.disabled = true;
      btnPub.textContent = "Anunciando on-chain…";
      try {
        const pubStr = JSON.stringify(dmPub);
        const tags = upload.buildTags("profile-key", { "Dm-Pub": pubStr });
        await upload.postData({ type: "profile-key", dmPub: pubStr }, tags);
        share.showToast("Chave Dm-Pub anunciada no permaweb!");
        btnPub.textContent = "✓ Anunciada";
      } catch (err) {
        share.showToast(`Erro ao anunciar: ${err.message}`, "error");
        btnPub.disabled = false;
        btnPub.textContent = "🌐 Anunciar Dm-Pub on-chain";
      }
    });
  }
}

async function showWallet() {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Carteira Arweave",
    subtitle: "Gestão de chave local para autoria soberana",
    walletAddress: user,
  });

  let balance = "0.000";
  if (user) {
    try {
      balance = await wallet.getBalance(user);
    } catch {
      balance = "Indisponível";
    }
  }

  render.renderWallet(main, {
    address: user,
    balance,
    hasWallet: wallet.hasWallet(),
  });

  // Evento Gerar Carteira
  const btnGen = document.getElementById("btn-generate-wallet");
  if (btnGen) {
    btnGen.addEventListener("click", async () => {
      btnGen.disabled = true;
      btnGen.textContent = "Gerando par de chaves Arweave…";
      try {
        const { address } = await wallet.generateNewWallet();
        await syncIdentity();
        share.showToast(`Carteira criada com sucesso!`);
        showWallet();
      } catch (err) {
        share.showToast(`Erro ao gerar: ${err.message}`, "error");
        btnGen.disabled = false;
        btnGen.textContent = "⚡ Gerar Nova Carteira";
      }
    });
  }

  // Evento Importar Carteira
  const formImport = document.getElementById("form-import-wallet");
  if (formImport) {
    formImport.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("wallet-jwk-input")?.value.trim();
      try {
        const jwk = JSON.parse(input);
        wallet.saveJwk(jwk);
        await syncIdentity();
        share.showToast("Carteira importada e salva localmente!");
        showWallet();
      } catch (err) {
        share.showToast("JSON JWK inválido. Verifique o formato.", "error");
      }
    });
  }

  // Evento Desconectar Carteira
  const btnDisc = document.getElementById("btn-disconnect-wallet");
  if (btnDisc) {
    btnDisc.addEventListener("click", () => {
      if (confirm("Remover a carteira deste navegador? Certifique-se de ter backup.")) {
        wallet.removeWallet();
        share.showToast("Carteira removida do navegador.");
        showWallet();
      }
    });
  }
}

async function showComposeCommunity() {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Nova Comunidade",
    subtitle: "Criar espaço temático permanente",
    walletAddress: user,
  });
  render.renderComposeCommunity(main, { hasWallet: wallet.hasWallet() });

  const form = document.getElementById("form-compose-community");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-comm");
      const id = document.getElementById("comm-id")?.value.trim().toLowerCase();
      const title = document.getElementById("comm-title")?.value.trim();
      const category = document.getElementById("comm-category")?.value.trim();
      const desc = document.getElementById("comm-desc")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Assinando e enviando…";
      try {
        const tags = upload.buildTags("community", {
          "Community-Id": id,
          Title: title,
          Category: category,
          Description: desc,
        });
        await upload.postData({ id, title, category, description: desc }, tags);
        share.showToast("Comunidade criada no permaweb!");
        location.hash = `#/c/${encodeURIComponent(id)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Comunidade";
      }
    });
  }
}

async function showComposeTopic(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Novo Tópico",
    subtitle: `Publicar em ${communityId}`,
    walletAddress: user,
  });
  render.renderComposeTopic(main, communityId, { hasWallet: wallet.hasWallet() });

  const form = document.getElementById("form-compose-topic");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-topic");
      const title = document.getElementById("topic-title")?.value.trim();
      const body = document.getElementById("topic-body")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Assinando e enviando transação…";
      try {
        const tags = upload.buildTags("topic", {
          "Community-Id": communityId,
          "Topic-Title": title,
          Title: title,
        });
        const res = await upload.postData({ title, body, communityId }, tags);
        share.showToast("Tópico publicado no permaweb!");
        location.hash = `#/t/${encodeURIComponent(res.id)}?c=${encodeURIComponent(communityId)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Tópico";
      }
    });
  }
}

async function showComposeReply(topicId, communityId) {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Responder Tópico",
    subtitle: `Resposta a ${topicId.slice(0, 8)}…`,
    walletAddress: user,
  });
  render.renderComposeReply(main, topicId, communityId, { hasWallet: wallet.hasWallet() });

  const form = document.getElementById("form-compose-reply");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-reply");
      const body = document.getElementById("reply-body")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Enviando resposta…";
      try {
        const tags = upload.buildTags("reply", {
          "Reply-To": topicId,
          "Community-Id": communityId,
        });
        await upload.postData({ replyTo: topicId, body, communityId }, tags);
        share.showToast("Resposta gravada no permaweb!");
        location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(communityId)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Enviar Resposta";
      }
    });
  }
}

function bindNetworkSettingsForm() {
  const form = document.getElementById("form-network-settings");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const paused = document.getElementById("net-pause")?.checked || false;
    const enabled = !paused;
    const maxMb = Number(document.getElementById("net-max-mb")?.value) || 25;
    const dailyCapMb = Number(document.getElementById("net-daily-cap")?.value) || 50;
    const wifiOnly = document.getElementById("net-wifi")?.checked || false;
    const commOnly = document.getElementById("net-comm-only")?.checked || false;
    const backgroundRelay = document.getElementById("net-bg-relay")?.checked || false;
    const webrtcEnabled = document.getElementById("net-webrtc")?.checked !== false;
    const customSignalingUrl = document.getElementById("net-signaling-url")?.value.trim() || "";
    const turnUrls = document.getElementById("net-turn-url")?.value.trim() || "";
    const turnUser = document.getElementById("net-turn-user")?.value.trim() || "";
    const turnPass = document.getElementById("net-turn-pass")?.value || "";

    localStorage.setItem("vox-custom-signaling-url", customSignalingUrl);
    peers.saveCustomTurnConfig({ urls: turnUrls, username: turnUser, credential: turnPass });

    peers.savePeerSettings({
      enabled,
      maxMb,
      wifiOnly,
      commOnly,
      backgroundRelay,
      dailyCapMb,
      webrtcEnabled,
    });
    cacheNode.enforceMaxCacheSize(maxMb);
    share.showToast(enabled ? "Preferências salvas: nó leve ativo!" : "Preferências salvas: nó pausado.");
    showNetworkSettings();
  });
}

function bindNetworkSettingsButtons() {
  const btnClear = document.getElementById("btn-clear-cache");
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      if (confirm("Limpar todo o cache local de transações no navegador?")) {
        await cacheNode.clearCache();
        share.showToast("Cache local esvaziado.");
        showNetworkSettings();
      }
    });
  }

  const btnCheckRelay = document.getElementById("btn-check-relay");
  if (btnCheckRelay) {
    btnCheckRelay.addEventListener("click", async () => {
      btnCheckRelay.disabled = true;
      btnCheckRelay.textContent = "Verificando…";
      const status = await peers.checkDesktopRelay();
      btnCheckRelay.disabled = false;
      btnCheckRelay.textContent = "Verificar Relay Desktop";
      if (status.online) {
        share.showToast(`Relay desktop online! ${status.data?.cachedCount || 0} itens em disco.`);
      } else {
        share.showToast("Relay desktop não detectado em 127.0.0.1:3920.", "error");
      }
      showNetworkSettings();
    });
  }

  const btnReqNotif = document.getElementById("btn-request-notif");
  if (btnReqNotif) {
    btnReqNotif.addEventListener("click", async () => {
      const perm = await peers.requestNotificationPermission();
      if (perm === "granted") {
        share.showToast("Notificações de status permitidas!");
      } else {
        share.showToast("Permissão de notificação não concedida.", "error");
      }
      showNetworkSettings();
    });
  }
}

async function showNetworkSettings() {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Nó de Rede & Cache",
    subtitle: "Configurações de rede distribuída e espelho local",
    walletAddress: user,
  });

  const settings = peers.getPeerSettings();
  const metrics = peers.getPeerMetrics();
  const cacheStats = await cacheNode.getCacheStats();
  const relayStatus = await peers.checkDesktopRelay();
  const dailyUsage = peers.getDailyUsage();
  const notifPermission = "Notification" in window ? Notification.permission : "unsupported";
  const rtcStatus = peers.getRtcStatus();
  const customSignalingUrl = localStorage.getItem("vox-custom-signaling-url") || "";
  const customTurn = peers.getCustomTurnConfig();

  render.renderNetworkSettings(main, {
    settings,
    metrics,
    cacheStats,
    relayStatus,
    dailyUsage,
    notifPermission,
    rtcStatus,
    customSignalingUrl,
    customTurn,
  });

  bindNetworkSettingsForm();
  bindNetworkSettingsButtons();
}

async function syncIdentity() {
  const user = await getActiveUser();
  if (user) {
    const dmPub = await cryptoDm.getPublicJwk();
    peers.announceIdentity(user, dmPub);
  }
}

async function pollInboxMessages(user) {
  if (!user) return 0;
  try {
    const sealedList = await inbox.pullMine(user);
    let count = 0;
    for (const env of sealedList) {
      try {
        const text = await cryptoDm.open(env);
        await cacheNode.saveDmMessage({
          id: env.id,
          peerAddress: env.from,
          from: env.from,
          to: env.to,
          text,
          ts: env.ts || Date.now(),
          status: "received",
        });
        await inbox.deleteSealed(user, env.id);
        count++;
      } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

async function showDmList() {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Mensagens Diretas",
    subtitle: "Conversas privadas efêmeras ponta-a-ponta (E2E)",
    walletAddress: user,
  });

  if (!user) {
    main.innerHTML = `<div class="card"><h2>Mensagens Diretas</h2><div class="error">Conecte sua carteira em <a href="#/wallet">#/wallet</a> para acessar DMs.</div></div>`;
    return;
  }

  await pollInboxMessages(user);
  const convs = await cacheNode.getDmConversations();
  render.renderDmList(main, convs, user);

  document.getElementById("form-new-dm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const peer = document.getElementById("dm-peer-input")?.value.trim();
    if (peer) location.hash = `#/dm/${encodeURIComponent(peer)}`;
  });

  document.getElementById("btn-pull-inbox")?.addEventListener("click", async () => {
    const pulled = await pollInboxMessages(user);
    share.showToast(pulled > 0 ? `${pulled} nova(s) mensagem(ns)!` : "Inbox verificado: sem novas mensagens.");
    showDmList();
  });
}

async function handleSendDmSubmit(user, peerAddress, peerDmPub) {
  const input = document.getElementById("dm-message-input");
  const text = input?.value.trim();
  if (!text) return;
  const btn = document.getElementById("btn-send-dm");
  if (btn) btn.disabled = true;

  try {
    const envelope = await cryptoDm.seal(peerDmPub, text, { from: user, to: peerAddress });
    let status = "sent";
    const transport = peers.sendDirectMessageTransport(peerAddress, envelope);
    if (transport === "rtc") {
      status = "delivered";
    } else {
      try {
        await inbox.pushSealed(peerAddress, envelope);
        status = "queued-relay";
      } catch {
        status = "pending-retry";
      }
    }

    await cacheNode.saveDmMessage({
      id: envelope.id,
      peerAddress,
      from: user,
      to: peerAddress,
      text,
      ts: envelope.ts,
      status,
    });
    if (input) input.value = "";
    showDmThread(peerAddress);
  } catch (err) {
    share.showToast(`Erro ao cifrar: ${err.message}`, "error");
    if (btn) btn.disabled = false;
  }
}

async function showDmThread(peerAddress) {
  const user = await getActiveUser();
  const main = render.renderShell({
    title: "Conversa Direta",
    subtitle: `Com ${peerAddress.slice(0, 10)}…`,
    walletAddress: user,
  });

  if (!user) {
    main.innerHTML = `<div class="card"><h2>Conversa Direta</h2><div class="error">Conecte sua carteira em <a href="#/wallet">#/wallet</a> para acessar DMs.</div></div>`;
    return;
  }

  await pollInboxMessages(user);
  const messages = await cacheNode.getDmMessages(peerAddress);
  const isRtcOnline = peers.isAddressConnectedRtc(peerAddress);
  let peerDmPub = gql.getCachedUserDmPub(peerAddress) || peers.getPeerDmPub(peerAddress);
  if (!peerDmPub) peerDmPub = await gql.fetchUserDmPub(peerAddress);

  render.renderDmThread(main, peerAddress, messages, user, {
    isRtcOnline,
    hasDmPub: Boolean(peerDmPub),
  });

  const c = document.getElementById("dm-thread-container");
  if (c) c.scrollTop = c.scrollHeight;

  document.getElementById("btn-save-manual-dmpub")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(document.getElementById("input-manual-dmpub")?.value.trim());
      gql.cacheUserDmPub(peerAddress, parsed);
      share.showToast("Chave Dm-Pub salva localmente!");
      showDmThread(peerAddress);
    } catch {
      share.showToast("JSON inválido.", "error");
    }
  });

  if (peerDmPub) {
    document.getElementById("form-send-dm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendDmSubmit(user, peerAddress, peerDmPub);
    });
  }
}

function initDmListeners() {
  peers.onDirectMessage(async (envelope) => {
    const user = await getActiveUser();
    if (!user || envelope.to !== user) return;
    try {
      const text = await cryptoDm.open(envelope);
      await cacheNode.saveDmMessage({
        id: envelope.id,
        peerAddress: envelope.from,
        from: envelope.from,
        to: envelope.to,
        text,
        ts: envelope.ts || Date.now(),
        status: "received",
      });
      const cur = parseRoute();
      if (cur.name === "dm-thread" && cur.address === envelope.from) {
        showDmThread(envelope.from);
      } else {
        share.showToast(`Nova mensagem de ${envelope.from.slice(0, 8)}…`);
      }
    } catch {}
  });
}

function checkPactModal() {
  const accepted = localStorage.getItem("vox-pact-accepted");
  if (accepted) return;

  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderPactModal(modalContainer);

  const btnAccept = document.getElementById("btn-pact-accept");
  if (btnAccept) {
    btnAccept.addEventListener("click", () => {
      localStorage.setItem("vox-pact-accepted", "true");
      render.closePactModal(modalContainer);
      share.showToast("Pacto aceito: nó leve ativo!");
    });
  }

  const btnSettings = document.getElementById("btn-pact-settings");
  if (btnSettings) {
    btnSettings.addEventListener("click", () => {
      localStorage.setItem("vox-pact-accepted", "true");
      render.closePactModal(modalContainer);
      location.hash = "#/settings/network";
    });
  }
}

async function route() {
  checkPactModal();
  const r = parseRoute();
  if (r.name === "home") return showHome();
  if (r.name === "network-settings") return showNetworkSettings();
  if (r.name === "dm-list") return showDmList();
  if (r.name === "dm-thread") return showDmThread(r.address);
  if (r.name === "community") return showCommunity(r.id);
  if (r.name === "topic") return showTopic(r.id, r.communityId);
  if (r.name === "profile") return showProfile(r.address);
  if (r.name === "wallet") return showWallet();
  if (r.name === "compose-community") return showComposeCommunity();
  if (r.name === "compose-topic") return showComposeTopic(r.communityId);
  if (r.name === "compose-reply") return showComposeReply(r.topicId, r.communityId);
  return showHome();
}

window.addEventListener("hashchange", () => route());
initDmListeners();
syncIdentity();
route();
