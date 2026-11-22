/** @file Verificação e teste de conexão de contas vinculadas e webhooks. */

import { SUPPORTED_NETWORKS, resolveNetworkProfileUrl } from "./linked-accounts-format.js";
import { loadLinkedAccounts, saveLinkedAccount, getGeneralWebhookUrl } from "./linked-accounts-store.js";
import { postToBlueskyAtProto } from "./linked-accounts-bsky.js";
import { sendWebhookPost } from "./linked-accounts-dispatch.js";

async function testBskyConnection(data) {
  if (data?.appPassword) {
    const res = await postToBlueskyAtProto(data.handle, data.appPassword, {
      title: "Teste de Conexão Vox",
      body: "Testando autenticação AT Protocol.",
    });
    if (res.ok) return { ok: true, message: `✅ Sessão AT Protocol ativa para @${data.handle}! Pronto para postar direto.` };
    return { ok: false, message: `⚠️ Falha na autenticação AT Protocol: verifique o App Password de @${data.handle}.` };
  }
  try {
    const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(data.handle)}`);
    if (r.ok) return { ok: true, message: `✅ Perfil @${data.handle} confirmado no Bluesky! (Leitura e citação ativas)` };
    return { ok: false, message: `⚠️ Perfil @${data.handle} não encontrado no Bluesky público.` };
  } catch {
    return { ok: false, message: "Erro de conexão ao consultar Bluesky." };
  }
}

async function testGithubConnection(data) {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(data.handle)}`);
    if (res.ok) return { ok: true, message: `✅ Perfil @${data.handle} confirmado na API do GitHub!` };
    return { ok: false, message: `⚠️ Perfil @${data.handle} não encontrado no GitHub.` };
  } catch {
    return { ok: false, message: "Erro ao consultar API do GitHub." };
  }
}

function oauthTestResult(netId, data) {
  const who = data.handle ? `@${data.handle}` : data.displayName || "sua conta";
  return { ok: true, state: "verified", profileUrl: resolveNetworkProfileUrl(netId, data.handle), message: `✅ ${who} conectada por login na própria rede.` };
}

async function testWebhookConnection(netId, data, webhookUrl) {
  const payload = { event: "vox.connection.test", network: netId, handle: data.handle, testedAt: new Date().toISOString() };
  const res = await sendWebhookPost(webhookUrl, payload);
  return res.ok
    ? { ok: true, message: `✅ Webhook testado com sucesso para @${data.handle}!`, profileUrl: resolveNetworkProfileUrl(netId, data.handle) }
    : { ok: false, message: `⚠️ Falha ao contactar webhook: ${res.error || "erro de rede"}` };
}

async function testPublicApiConnection(netId, data) {
  const res = netId === "bsky" ? await testBskyConnection(data) : await testGithubConnection(data);
  if (res.ok) saveLinkedAccount(netId, { ...data, verified: true });
  return { ...res, state: res.ok ? "verified" : "error", profileUrl: resolveNetworkProfileUrl(netId, data.handle) };
}

/**
 * Testa o vínculo pelo melhor caminho disponível: conta ligada por login vale como verificada; com webhook, manda um
 * evento de teste; Bluesky e GitHub são conferidos na API pública (e marcados verificados se der certo). Nas outras
 * redes não há como verificar sem login: a pessoa confere o perfil e confirma.
 * @param {string} netId Rede.
 * @returns {Promise<{ok: boolean, message: string, state?: "verified"|"unverified"|"error", profileUrl?: string}>}
 *   Resultado e o texto para a tela.
 */
export async function testLinkedAccount(netId) {
  const accounts = loadLinkedAccounts();
  const data = accounts[netId];
  if (!data?.handle && data?.via !== "oauth") return { ok: false, message: "Nenhuma conta vinculada." };
  if (data.via === "oauth") return oauthTestResult(netId, data);
  const webhookUrl = data.webhook || getGeneralWebhookUrl();
  if (webhookUrl) return testWebhookConnection(netId, data, webhookUrl);
  if (netId === "bsky" || netId === "github") return testPublicApiConnection(netId, data);

  const profileUrl = resolveNetworkProfileUrl(netId, data.handle);
  const name = SUPPORTED_NETWORKS.find((n) => n.id === netId)?.name || netId;
  return {
    ok: false,
    state: "unverified",
    profileUrl,
    message: `O ${name} não permite verificar a conta sem login. Abra o perfil @${data.handle}, confira se é você e confirme. Sem webhook, o Vox replica abrindo o app da rede com o texto copiado — não posta sozinho.`,
  };
}
