/** @file Execução de disparo em rajada (burst) e esteira sequencial (cascade). */

import { showToast } from "./share.js";
import {
  buildCanonicalTopicUrl,
  buildPosseExportPayload,
  firePosseWebhooks,
  loadPosseWebhooks,
} from "./posse-dispatch.js";
import {
  dispatchAutoReplication,
  getConnectedIntentTargets,
  hasDirectReplicationTargets,
} from "./linked-accounts.js";
import { copyStoryCardToClipboard } from "./story-card.js";
import { recordExplosion } from "./social.js";
import { buildExplodeText, resolveBurstTargetUrl } from "./explode-intent.js";
import { updateExplodeButtonsUi, closeExplodeSheet } from "./explode-ui.js";

/** Identificador da barra flutuante da esteira sequencial. @type {string} */
export const CASCADE_BAR_ID = "explode-cascade-bar";

/** Passos padrão para a esteira sequencial de disparo. @type {Array<{id: string, label: string, icon: string}>} */
export const CASCADE_STEPS = [
  { id: "whatsapp", label: "WhatsApp", icon: "📲" },
  { id: "twitter", label: "X (Twitter)", icon: "🐦" },
  { id: "threads", label: "Threads", icon: "🧵" },
  { id: "bluesky", label: "Bluesky", icon: "🦋" },
];

let activeCascade = null;

/** Remove a barra de esteira sequencial do DOM.
 */
export function removeCascadeBar() {
  document.getElementById(CASCADE_BAR_ID)?.remove();
  activeCascade = null;
}

function getActiveCascadeSteps() {
  return activeCascade?.steps?.length ? activeCascade.steps : CASCADE_STEPS;
}

function openCascadeStep(step, post) {
  const canonicalUrl = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildExplodeText({ title: post?.title, body: post?.body, url: canonicalUrl });
  if (step.id === "instagram" || step.id === "tiktok") {
    void copyStoryCardToClipboard(post).catch(() => null);
  }
  const targetUrl = resolveBurstTargetUrl(step.id, text, canonicalUrl, post);
  if (targetUrl && typeof window !== "undefined" && typeof window.open === "function") {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }
}

function updateCascadeBarUi() {
  const root = document.getElementById(CASCADE_BAR_ID);
  if (!root || !activeCascade) return;
  const steps = getActiveCascadeSteps();
  const { stepIndex } = activeCascade;
  const current = steps[stepIndex];
  const next = steps[stepIndex + 1];

  const infoEl = root.querySelector(".explode-cascade-info");
  const nextBtn = root.querySelector(".btn-cascade-next");
  if (infoEl && current) {
    infoEl.innerHTML = `<span class="explode-cascade-badge">Etapa ${stepIndex + 1}/${steps.length}</span> <strong>${current.icon} ${current.label} aberto ✓</strong>`;
  }
  if (nextBtn) {
    nextBtn.textContent = next ? `👉 Próximo: ${next.icon} ${next.label}` : "🏁 Concluir Disparo";
    nextBtn.focus();
  }
}

/** Avança para o próximo passo da esteira sequencial de disparo.
 */
export function advanceCascadeExplode() {
  if (!activeCascade) return;
  const steps = getActiveCascadeSteps();
  activeCascade.stepIndex += 1;
  if (activeCascade.stepIndex >= steps.length) {
    showToast("🎉 Disparo em onda concluído em todas as redes!");
    removeCascadeBar();
    return;
  }
  openCascadeStep(steps[activeCascade.stepIndex], activeCascade.post);
  updateCascadeBarUi();
}

function buildCascadeBarHtml(stepIndex, steps = CASCADE_STEPS) {
  const current = steps[stepIndex] || steps[0];
  const next = steps[stepIndex + 1];
  const nextLabel = next ? `👉 Próximo: ${next.icon} ${next.label}` : "🏁 Concluir Disparo";
  return `
    <div class="explode-cascade-info">
      <span class="explode-cascade-badge">Etapa ${stepIndex + 1}/${steps.length}</span>
      <strong>${current.icon} ${current.label} aberto ✓</strong>
    </div>
    <div class="explode-cascade-actions">
      <button type="button" class="btn btn-sm btn-primary btn-cascade-next">${nextLabel}</button>
      <button type="button" class="btn btn-sm btn-outline btn-cascade-skip">Pular</button>
      <button type="button" class="btn btn-sm btn-text btn-cascade-close" aria-label="Fechar esteira">✕</button>
    </div>`;
}

/** Monta a barra de esteira no DOM se ainda não existir.
 * @param {Array} steps Lista de passos da esteira.
 * @param {object} post Post em disparo.
 * @param {number} [stepIndex=0] Índice do passo inicial.
 */
export function mountCascadeBar(steps, post, stepIndex = 0) {
  if (typeof document === "undefined" || !document.body?.appendChild) return;
  activeCascade = { post: { ...post }, stepIndex, steps };
  let bar = document.getElementById(CASCADE_BAR_ID);
  if (!bar) {
    bar = document.createElement("div");
    bar.id = CASCADE_BAR_ID;
    bar.className = "explode-cascade-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Esteira de Disparo");
    document.body.appendChild(bar);
  }
  bar.innerHTML = buildCascadeBarHtml(stepIndex, steps);
  bar.querySelector(".btn-cascade-next")?.focus();
}

/** Inicia a esteira de disparo em onda sequencial.
 * @param {object} post Post de destino.
 * @param {object} [options={}] Opções de passos e burst.
 */
export function startCascadeExplode(post, { steps = CASCADE_STEPS, skipBurst = false } = {}) {
  if (!post?.id || typeof document === "undefined") return;
  closeExplodeSheet();
  if (!skipBurst) {
    void executeExplodeBurst(post, { triggerIntents: false });
  }
  const validSteps = steps?.length ? steps : CASCADE_STEPS;
  openCascadeStep(validSteps[0], post);
  mountCascadeBar(validSteps, post, 0);
}

async function prepareVisualMediaIfNeeded(intentTargets, post) {
  const needsCard = intentTargets.some((t) => t.id === "instagram" || t.id === "tiktok");
  if (!needsCard) return null;
  return copyStoryCardToClipboard(post).catch(() => null);
}

function launchConnectedIntentsSync(intentTargets, post, text, canonicalUrl) {
  if (!intentTargets.length || typeof window === "undefined" || typeof window.open !== "function") {
    return { opened: 0, blocked: [] };
  }
  let opened = 0;
  const blocked = [];
  for (const step of intentTargets) {
    const targetUrl = resolveBurstTargetUrl(step.id, text, canonicalUrl, post);
    if (!targetUrl) continue;
    const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (win === null) blocked.push(step);
    else opened += 1;
  }
  return { opened, blocked };
}

async function tryCopyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function fireAllBurstChannels(post, canonicalUrl) {
  const payload = buildPosseExportPayload({ ...post, canonicalUrl });
  const webhooks = loadPosseWebhooks();
  const res = webhooks.length ? await firePosseWebhooks(payload, webhooks) : { sent: 0 };
  const autoRep = await dispatchAutoReplication({ ...post, canonicalUrl }, { force: true }).catch(() => ({ count: 0 }));
  return (res.sent || 0) + (autoRep.count || 0);
}

function bumpPostExplodeCounter(post) {
  if (!post?.id) return;
  const exp = recordExplosion(post.id, post.explodesCount || 0);
  updateExplodeButtonsUi(post.id, exp.count);
}

/** Executa disparo simultâneo em rajada para contas conectadas e canais de réplica.
 * @param {object} post Post de origem.
 * @param {object} [options={}] Opções de disparo.
 * @returns {Promise<object>} Resumo do disparo efetuado.
 */
export async function executeExplodeBurst(post, { triggerIntents = true } = {}) {
  const canonicalUrl = buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  const text = buildExplodeText({ title: post?.title, body: post?.body, url: canonicalUrl });
  const intentTargets = triggerIntents ? getConnectedIntentTargets() : [];
  const launched = launchConnectedIntentsSync(intentTargets, post, text, canonicalUrl);

  if (intentTargets.length > 1 || launched.blocked.length > 0) {
    mountCascadeBar(intentTargets, post, 0);
  }

  const copied = await tryCopyToClipboard(text);
  await prepareVisualMediaIfNeeded(intentTargets, post);
  const bgSent = await fireAllBurstChannels(post, canonicalUrl);
  bumpPostExplodeCounter(post);

  return {
    copied,
    webhooksSent: bgSent + launched.opened,
    intentsLaunched: launched.opened,
    connectedCount: intentTargets.length,
    text,
    canonicalUrl,
  };
}

/** Disparo rápido tático com cópia imediata e feedback visual.
 * @param {object} post Post de origem.
 * @returns {Promise<object>} Resumo do disparo rápido.
 */
export async function quickExplodePost(post) {
  const res = await executeExplodeBurst(post);
  showToast(
    res.webhooksSent > 0
      ? `📢 Disparo rápido! ${res.webhooksSent} destino(s) + mensagem copiada!`
      : "📢 Mensagem copiada! Cole nos grupos ou redes.",
  );
  return res;
}

/** Verifica se o usuário configurou ao menos um canal para disparo automático.
 * @returns {boolean} Se existe destino configurado.
 */
export function hasAnyConfiguredBurstChannel() {
  if (getConnectedIntentTargets().length > 0) return true;
  if (hasDirectReplicationTargets()) return true;
  return loadPosseWebhooks().length > 0;
}

/** Trata cliques em botões internos da barra de esteira de disparo.
 * @param {MouseEvent} e Evento de clique do mouse.
 * @returns {boolean} Se o clique foi consumido pela esteira.
 */
export function handleCascadeClick(e) {
  if (e.target.closest?.(".btn-cascade-next") || e.target.closest?.(".btn-cascade-skip")) {
    e.preventDefault();
    advanceCascadeExplode();
    return true;
  }
  if (e.target.closest?.(".btn-cascade-close")) {
    e.preventDefault();
    removeCascadeBar();
    return true;
  }
  return false;
}
