/**
 * @file Aviso assinado v0 — lote B: contar as respostas coladas do WhatsApp. Spec: docs/specs/aviso-assinado-v0.md.
 * Puro e só em memória: os nomes servem para ficar com a última resposta de cada pessoa e não saem daqui.
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

/** Separa remetente e mensagem; linha solta não tem remetente. */
export function splitReplyLine(line) {
  const m = BRACKET_LINE.exec(line) || DASH_LINE.exec(line);
  return m ? { sender: m[1].trim(), message: m[2] } : { sender: "", message: line };
}

/** Escolha reconhecida na mensagem, ou "". */
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
 * Conta o texto colado. Devolve só números: `{ counts, counted, ignored }`.
 * Vale a última resposta de cada nome; linha solta conta sozinha.
 */
export function countPastedReplies(text = "", code = "") {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const { choices, ignored } = collectReplies(lines, code);
  const counts = Object.fromEntries(AVISO_CHOICES.map((c) => [c, 0]));
  for (const choice of choices) counts[choice] += 1;
  return { counts, counted: choices.length, ignored };
}
