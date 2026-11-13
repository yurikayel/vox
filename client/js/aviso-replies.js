/**
 * @file Aviso assinado v0 — lote B: contar as respostas coladas do WhatsApp.
 *
 * A coordenação cola a conversa exportada (ou copiada) do grupo; daqui saem só números. Os nomes servem
 * apenas para ficar com a última resposta de cada pessoa e nunca saem desta função nem são guardados.
 * Reconhece os dois formatos de linha do WhatsApp (`[dd/mm/aa hh:mm] Nome: …` e `dd/mm/aa hh:mm - Nome: …`).
 *
 * @module aviso-replies
 * @see docs/specs/aviso-assinado-v0.md
 */

import { AVISO_CHOICES } from "./aviso.js";

const BRACKET_LINE = /^\[\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?\]\s*([^:]+):\s*(.*)$/;
const DASH_LINE = /^\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}\s*-\s*([^:]+):\s*(.*)$/;
const CODE_TAG = /—\s*([0-9A-Z]{4})\b/;

/** Ordem importa: "não vou" antes de "vou". Texto já sem acento e em minúsculas. */
const RULES = [
  ["nao-vou", /(\bnao vou\b|\bnao posso\b|❌)/],
  ["talvez", /(\btalvez\b|🤔)/],
  ["vou", /(\bvou\b|\bconfirmo\b|\bestarei\b|🙋)/],
  ["ciente", /(\bciente\b|\bok\b|✅|👍)/],
];

const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Separa remetente e mensagem de uma linha colada do WhatsApp.
 *
 * @param {string} line Uma linha, já sem espaços nas pontas.
 * @returns {{sender: string, message: string}} `sender` vazio quando a linha não tem cabeçalho (texto solto).
 */
export function splitReplyLine(line) {
  const m = BRACKET_LINE.exec(line) || DASH_LINE.exec(line);
  return m ? { sender: m[1].trim(), message: m[2] } : { sender: "", message: line };
}

/**
 * Reconhece a resposta numa mensagem (palavra ou emoji), ignorando acento e caixa.
 *
 * A ordem das regras importa: "não vou" é testado antes de "vou".
 *
 * @param {string} message Texto da mensagem.
 * @returns {string} Uma de `AVISO_CHOICES`, ou `""` se nada foi reconhecido.
 */
export function replyChoice(message) {
  const text = plain(String(message || ""));
  const rule = RULES.find(([, re]) => re.test(text));
  return rule ? rule[0] : "";
}

/** A linha traz o código de outro aviso? */
function isForOtherAviso(message, code) {
  const tag = CODE_TAG.exec(message);
  return Boolean(code && tag && tag[1] !== code);
}

function collectReplies(lines, code) {
  const bySender = new Map();
  let ignored = 0;
  lines.forEach((line, index) => {
    const { sender, message } = splitReplyLine(line);
    const choice = replyChoice(message);
    if (!choice || isForOtherAviso(message, code)) {
      ignored += 1;
      return;
    }
    bySender.set(sender || `#${index}`, choice);
  });
  return { choices: [...bySender.values()], ignored };
}

/**
 * Conta as respostas de um texto colado.
 *
 * Vale a última resposta de cada nome; uma linha sem remetente conta sozinha. Linhas que citam o
 * código de outro aviso são ignoradas.
 *
 * @param {string} [text=""] Conversa colada, uma mensagem por linha.
 * @param {string} [code=""] Código curto do aviso contado (4 caracteres); vazio aceita qualquer linha.
 * @returns {{counts: Object<string, number>, counted: number, ignored: number}} Contagem por resposta, quantas pessoas contaram e quantas linhas ficaram de fora.
 * @example
 * countPastedReplies("[10/11/26 09:00] Ana: vou\n[10/11/26 09:05] Ana: não vou");
 * // → { counts: { ciente: 0, vou: 0, talvez: 0, "nao-vou": 1 }, counted: 1, ignored: 0 }
 */
export function countPastedReplies(text = "", code = "") {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const { choices, ignored } = collectReplies(lines, code);
  const counts = Object.fromEntries(AVISO_CHOICES.map((c) => [c, 0]));
  for (const choice of choices) counts[choice] += 1;
  return { counts, counted: choices.length, ignored };
}
