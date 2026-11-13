/** @file LAN-12 — fluxo de denúncia (modal em 2 etapas: motivo → resultado e próximos passos). */

import * as report from "../report.js";
import * as mod from "../moderation.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import { escapeHtml } from "../render/util.js";
import { getActiveUser } from "./context.js";
import { modalHost, clearModalHost } from "../render/modal-host.js";
import { sendReportToModerator } from "./report-dm.js";
import { attachReviewHandlers } from "./report-review-flow.js";

const MODAL_ID = "report-modal-container";

export function renderReportFormHtml() {
  const options = report.REPORT_REASONS.map(
    (r) => `
      <label class="report-reason" style="display:flex; gap:0.5rem; align-items:flex-start; margin:0.3rem 0;">
        <input type="radio" name="report-reason" value="${r.id}" /> <span>${escapeHtml(r.label)}</span>
      </label>`
  ).join("");
  return `
    <div class="modal-overlay modal-sheet" id="report-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div class="modal-dialog modal-card report-modal">
        <h2 id="report-title" style="margin-top:0;">Denunciar publicação</h2>
        <form id="form-report">
          <fieldset style="border:0; padding:0; margin:0 0 0.5rem;"><legend class="desc">Qual é o problema?</legend>${options}</fieldset>
          <label for="report-detail" class="desc">Detalhes (opcional, até ${report.MAX_DETAIL_LEN} caracteres)</label>
          <textarea id="report-detail" class="form-control" rows="3" maxlength="${report.MAX_DETAIL_LEN}"></textarea>
          <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
            <button type="submit" class="btn btn-primary">Denunciar</button>
            <button type="button" class="btn btn-outline" id="btn-report-cancel">Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
}

function renderOfficialChannelsHtml() {
  const items = report.OFFICIAL_CHANNELS_PT.map(
    (c) => `<li><a href="${escapeHtml(c.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.label)}</a></li>`
  ).join("");
  return `
    <div class="report-grave banner-info" role="alert" style="margin:0.5rem 0;">
      <strong>Caso grave: denuncie também às autoridades.</strong> Não baixe, não guarde e não compartilhe o conteúdo, nem para "provar".
      A equipe do Vox ainda não recebe denúncias diretamente.
      <ul style="margin:0.4rem 0 0; padding-left:1.1rem;">${items}</ul>
    </div>`;
}

const SENT_OK = new Set(["delivered", "queued-relay"]);

/** PM-69: o que aconteceu com o envio automático à moderação. */
function renderSentStatusHtml(sent) {
  if (SENT_OK.has(sent)) {
    return `<p class="desc report-sent-ok"><strong>A denúncia foi enviada à moderação</strong>, assinada e cifrada. Quando o aparelho de quem modera a receber, a publicação é <strong>arquivada para todos</strong> até a revisão (prazo de 48 h).</p>`;
  }
  if (!sent) return "";
  if (sent === "pending-retry") {
    return `<p class="desc report-sent-wait">A denúncia ficou na <strong>caixa de saída</strong> do seu aparelho: com o Vox aberto, ele tenta entregar sozinho por até 7 dias. Ela chega quando você e quem modera estiverem online ao mesmo tempo.</p>`;
  }
  return `<p class="desc report-sent-fail">Não deu para entregar a denúncia à moderação agora. Use o botão abaixo para mandar pela conversa.</p>`;
}

export function renderReportDoneHtml({ grave = false, moderatorHash = "", sent = "" } = {}) {
  const modLabel = SENT_OK.has(sent) ? "Acrescentar detalhes na conversa" : "Enviar aos moderadores (mensagem cifrada)";
  const modBtn = moderatorHash
    ? `<a class="btn ${SENT_OK.has(sent) ? "btn-outline" : "btn-primary"}" href="${escapeHtml(moderatorHash)}" id="btn-report-to-mod">${modLabel}</a>`
    : `<p class="desc">Esta publicação não tem moderador conhecido no seu aparelho. Ela continua oculta para você.</p>`;
  return `
    <div class="modal-overlay modal-sheet" id="report-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="report-done-title">
      <div class="modal-dialog modal-card report-modal">
        <h2 id="report-done-title" style="margin-top:0;">Denúncia registrada</h2>
        <p class="desc">Ficou salva no seu aparelho e a publicação foi <strong>ocultada para você</strong> (e o seu app não a repassa na malha).</p>
        ${renderSentStatusHtml(sent)}
        ${grave ? renderOfficialChannelsHtml() : ""}
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
          ${modBtn}
          <button type="button" class="btn btn-outline" id="btn-report-close">Fechar</button>
        </div>
      </div>
    </div>`;
}

const container = () => modalHost(MODAL_ID);
const closeReportModal = () => clearModalHost(MODAL_ID);

/** Dono da comunidade (moderador conhecido) do post, se houver. */
export async function resolveModeratorRoute(postId, communityIdHint = "", { getPost = cacheNode.getLocalPost, getCommunity } = {}) {
  const post = await getPost(postId).catch(() => null);
  const communityId = post?.communityId || communityIdHint;
  if (!communityId) return { communityId: "", moderator: "" };
  const resolver = getCommunity || (async (id) => (await import("./screens-community.js")).resolveCommunityMetadata(id));
  const meta = await resolver(communityId).catch(() => null);
  return { communityId, moderator: meta?.owner || "" };
}

/**
 * PM-83 lote B: com a flag, quem denunciou avisa só N2 (o próprio padrinho ou próximo). N1 é avisado pelo
 * aparelho da moderação, para não saber quem denunciou. Motivo grave não vai a moderador natural.
 */
async function notifyNaturalModerators(self, rec, target) {
  try {
    const { naturalModLabOn } = await import("./natural-mod-flow.js");
    if (!target || !naturalModLabOn()) return;
    const { sendCaseNotice } = await import("./natural-case-flow.js");
    await sendCaseNotice(self, rec, { side: "reporter", target, reporter: self });
  } catch {}
}

async function submitReport(ctx, form) {
  const reason = form.querySelector('input[name="report-reason"]:checked')?.value || "";
  const detail = form.querySelector("#report-detail")?.value || "";
  const { communityId, moderator } = await resolveModeratorRoute(ctx.postId, ctx.communityId);
  const rec = report.buildReport({ postId: ctx.postId, authorRoute: ctx.authorRoute, communityId, reason, detail });
  report.saveReport(rec);
  mod.quarantinePost(ctx.postId);
  const self = await getActiveUser().catch(() => "");
  const entered = (await import("./onboarding.js")).hasFullEntry();
  const toModerator = entered && Boolean(moderator) && moderator !== self;
  const sent = toModerator ? await sendReportToModerator(self, moderator, rec).catch(() => "pending-retry") : "";
  if (entered && self) void notifyNaturalModerators(self, rec, ctx.authorRoute);
  container().innerHTML = renderReportDoneHtml({
    grave: report.isGraveReason(reason),
    moderatorHash: toModerator ? report.buildModeratorDmHash(moderator, rec) : "",
    sent,
  });
  document.getElementById("btn-report-close")?.addEventListener("click", closeReportModal);
  document.getElementById("btn-report-to-mod")?.addEventListener("click", closeReportModal);
}

export function openReportFlow(ctx = {}) {
  if (!ctx.postId) return;
  const el = container();
  el.innerHTML = renderReportFormHtml();
  document.getElementById("btn-report-cancel")?.addEventListener("click", closeReportModal);
  document.getElementById("form-report")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await submitReport(ctx, e.target);
    } catch (err) {
      share.showToast(err.message || "Não foi possível registrar a denúncia.", "error");
    }
  });
}

let reportHandlersWired = false;

/** Liga os itens "Denunciar" dos menus ⋯ de texto/tópico (.btn-report-post) ao fluxo. */
export function attachReportHandlers(doc = globalThis.document) {
  if (reportHandlersWired || !doc?.addEventListener) return;
  reportHandlersWired = true;
  attachReviewHandlers(doc);
  doc.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".btn-report-post");
    if (!btn) return;
    e.preventDefault();
    btn.closest("details")?.removeAttribute("open");
    openReportFlow({ postId: btn.dataset.id || "", authorRoute: btn.dataset.author || "", communityId: btn.dataset.comm || "" });
  });
}
