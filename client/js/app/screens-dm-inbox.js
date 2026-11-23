/**
 * @file Caixa de entrada de DM: puxa os envelopes selados do relay, abre, grava e apaga a cópia remota.
 *
 * @module app/screens-dm-inbox
 */
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import { ingestDecryptedEnvelope } from "./dm-wire.js";

/**
 * Conta mensagens novas na caixa de entrada.
 *
 * @param {string} user
 * @returns {Promise<unknown>}
 */
export async function pollInboxMessages(user) {
  if (!user) return 0;
  try {
    const sealedList = await inbox.pullMine(user);
    let count = 0;
    for (const env of sealedList) {
      if (env?.to && env.to !== user) continue; // selada para outra conta: não é minha
      try {
        const rawText = await cryptoDm.open(env);
        await ingestDecryptedEnvelope(env, rawText);
        await inbox.deleteSealed(user, env.id, await cryptoDm.openDeleteToken(env).catch(() => null));
        count++;
      } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}
