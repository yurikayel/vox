/**
 * @file Mensagens diretas (DM v2): fachada que liga os ouvintes globais e reexporta a API das telas.
 *
 * As partes moram em `screens-dm-inbox.js` (caixa de entrada), `screens-dm-list.js` (lista de conversas),
 * `screens-dm-thread.js` (conversa e envio) e `screens-dm-draft.js` (rascunho da conversa).
 *
 * @module app/screens-dm
 */
import * as share from "../share.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser } from "./context.js";
import { ingestDecryptedEnvelope } from "./dm-wire.js";
import { showDmThread } from "./screens-dm-thread.js";

export { pollInboxMessages } from "./screens-dm-inbox.js";
export { showDmList } from "./screens-dm-list.js";
export { handleSendDmSubmit, showDmThread } from "./screens-dm-thread.js";

/**
 * Liga listeners globais de DM.
 *
 * @returns {void}
 */
export function initDmListeners() {
  peers.onDirectMessage(async (envelope) => {
    const user = await getActiveUser();
    if (!user || envelope.to !== user) return;
    try {
      const rawText = await cryptoDm.open(envelope);
      const handled = await ingestDecryptedEnvelope(envelope, rawText);
      if (handled === "contact_added") return;
      const cur = parseRoute();
      if (cur.name === "dm-thread" && cur.address === envelope.from) {
        showDmThread(envelope.from);
      } else {
        share.showToast(`Nova mensagem de ${envelope.from.slice(0, 8)}…`);
      }
    } catch {
      // Chegou direto (sem cópia no relay): se não abrir ou não gravar, ninguém mais tem esta mensagem.
      share.showToast(`Chegou uma mensagem de ${envelope.from.slice(0, 8)}… que não deu para abrir. Peça para a pessoa mandar de novo.`, "error");
    }
  });
}
