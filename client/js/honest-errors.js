/**
 * LAN-21 — estados de erro honestos: cada falha conhecida vira um texto que diz
 * o que aconteceu e o que a pessoa pode fazer. Nada "carrega para sempre".
 */

const MESSAGES = Object.freeze({
  quota:
    "A cota grátis de publicação permanente desta carteira acabou. Publique só na malha (some em alguns dias) ou peça a um steward da comunidade para compartilhar créditos.",
  payment:
    "O serviço de publicação pediu pagamento (HTTP 402). Seu post não foi enviado ao Arweave; tente de novo mais tarde ou publique só na malha.",
  rateLimit: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
  offline: "Sem conexão com a internet. Seu conteúdo não foi enviado; tente quando a conexão voltar.",
  timeout: "O serviço demorou demais para responder. Nada foi publicado; tente de novo.",
  gatewaysDown:
    "Nenhum gateway do Arweave respondeu agora. Mostrando só o que está guardado neste aparelho ou na malha.",
  signalingDown:
    "O servidor de conexão está fora do ar. Você continua lendo e escrevendo; a troca com outros aparelhos volta quando ele voltar.",
  dmNoRelay:
    "Sem relay de mensagens: a mensagem fica neste aparelho e é entregue quando você e a outra pessoa estiverem online ao mesmo tempo.",
});

export function honestMessage(kind) {
  return MESSAGES[kind] || "";
}

const STATUS_KINDS = Object.freeze({ 402: "payment", 429: "rateLimit", 410: "quota" });

const MESSAGE_RULES = [
  [/insufficient|saldo|balance|quota|cota|free.?tier/i, "quota"],
  [/timed? ?out|timeout/i, "timeout"],
];

function statusOf(err, msg) {
  return Number(err?.status) || Number((msg.match(/HTTP (\d{3})/) || [])[1]) || 0;
}

/** Classifica um erro de envio (fetch, HTTP, Turbo, L1) num dos estados conhecidos. */
export function classifyUploadError(err) {
  const msg = String(err?.message || err || "");
  const byStatus = STATUS_KINDS[statusOf(err, msg)];
  if (byStatus) return byStatus;
  if (err?.name === "TimeoutError") return "timeout";
  const rule = MESSAGE_RULES.find(([re]) => re.test(msg));
  if (rule) return rule[1];
  if (err?.name === "TypeError" && /fetch|network/i.test(msg)) return "offline";
  return "";
}

/** Erro com o texto honesto quando a causa é conhecida; senão, o erro original. */
export function toHonestError(err, fallbackPrefix = "") {
  const kind = classifyUploadError(err);
  if (!kind) return err instanceof Error ? err : new Error(`${fallbackPrefix}${String(err)}`);
  const e = new Error(honestMessage(kind));
  e.kind = kind;
  e.cause = err;
  return e;
}
