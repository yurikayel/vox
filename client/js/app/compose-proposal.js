/**
 * @file Fluxo de composição e publicação de proposta de governança na comunidade.
 *
 * @module app/compose-proposal
 */

import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as gov from "../governance.js";
import { randomBase36 } from "../shared/html.js";
import { bindComposeStepper } from "./compose-stepper.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { leaveComposeAfterPublish } from "./compose-shared.js";

/**
 * Formulário de nova proposta.
 *
 * @param {string} communityId ID da comunidade alvo.
 * @returns {Promise<void>}
 */
export async function showComposeProposal(communityId) {
  const targetComm = communityId || mock.MOCK_DEMO_COMMUNITY.id;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Proposta"));

  let commMeta = { id: targetComm, title: targetComm };
  try {
    const localC = await cacheNode.getLocalPost(targetComm);
    if (localC) commMeta = localC;
    else if (targetComm === mock.MOCK_DEMO_COMMUNITY.id) commMeta = mock.MOCK_DEMO_COMMUNITY;
  } catch {}

  render.renderComposeProposal(main, targetComm, commMeta.title);
  attachComposeProposalHandlers(targetComm, user);
}

/**
 * Liga envio de proposta no compor.
 *
 * @param {string} communityId ID da comunidade alvo.
 * @param {string} user Identificador do autor ativo.
 * @returns {void}
 */
export function attachComposeProposalHandlers(communityId, user) {
  const form = document.getElementById("form-compose-proposal");
  bindComposeStepper(form);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("prop-title")?.value || "";
    const body = document.getElementById("prop-body")?.value || "";
    const diffText = document.getElementById("prop-diff")?.value || "";

    const val = gov.validateProposalInput({ title, body, diffText, communityId });
    if (!val.valid) return share.showToast(val.error, "error");

    const btn = document.getElementById("btn-submit-proposal");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Publicando…";
    }
    await publishProposal({ communityId, title: val.title, body: val.body, diffText: val.diffText, user, btn });
  });
}

/**
 * Publica proposta assinada na governança local e no gossip P2P.
 *
 * @param {object} arg0 Dados da proposta e botão de envio.
 * @returns {Promise<void>}
 */
export async function publishProposal({ communityId, title, body, diffText, user, btn }) {
  try {
    const now = Date.now();
    const signedProposal = await localAccount.signPayload({
      id: `prop_${Date.now()}_${randomBase36(5)}`,
      type: "governance-proposal",
      communityId,
      title,
      body,
      diffText,
      author: user,
      owner: user,
      createdAt: now,
      closesAt: now + 7 * 24 * 3600 * 1000,
      minQuorum: 2,
      state: "open",
      ts: now,
    });
    await cacheNode.saveLocalPost(signedProposal);
    peers.broadcastGossip(signedProposal);
    leaveComposeAfterPublish("Proposta publicada na governança!", `#/c/${encodeURIComponent(communityId)}/proposal/${encodeURIComponent(signedProposal.id)}`);
  } catch (err) {
    share.showToast(`Erro ao publicar proposta: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publicar Proposta Assinada";
    }
  }
}
