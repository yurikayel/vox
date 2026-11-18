/**
 * @file Erros honestos (LAN-21): textos claros por tipo de falha de envio ou sinalização.
 *
 * Classifica erros de upload e sinalização e expõe mensagens que dizem o que falhou e o que fazer.
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
  signalingBack: "A conexão com outros aparelhos voltou.",
  dmNoRelay:
    "Sem relay de mensagens agora: a mensagem fica na caixa de saída deste aparelho. Com o Vox aberto, ele tenta de novo sozinho por até 7 dias; ela chega quando você e a outra pessoa estiverem online ao mesmo tempo.",
});

/**
 * Mensagem em português para um estado de erro conhecido.
 * @param {string} kind Chave do estado (`quota`, `offline`, `signalingDown`, etc.).
 * @returns {string}
 */
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

/**
 * Classifica um erro de envio (fetch, HTTP, Turbo, L1) num estado conhecido.
 * @param {unknown} err Erro original ou mensagem.
 * @returns {string} Chave do estado ou string vazia se desconhecido.
 */
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

/**
 * Substitui o erro por um `Error` com texto honesto quando a causa é conhecida.
 * @param {unknown} err Erro original.
 * @param {string} [fallbackPrefix=""] Prefixo se o erro não for classificável.
 * @returns {Error}
 */
export function toHonestError(err, fallbackPrefix = "") {
  const kind = classifyUploadError(err);
  if (!kind) return err instanceof Error ? err : new Error(`${fallbackPrefix}${String(err)}`);
  const e = new Error(honestMessage(kind));
  e.kind = kind;
  e.cause = err;
  return e;
}

/**
 * LAN-21 — a sinalização só está "caída" quando o WebSocket já desistiu dos nós da lista
 * e nenhum relay Nostr está aberto nem abrindo. Enquanto um dos dois caminhos funciona, não há aviso.
 */
/**
 * Indica sinalização caída: WebSocket desistiu e não há relay Nostr ativo nem pendente.
 * @param {object} [options={}] Estado atual dos canais.
 * @param {boolean} [options.wsOpen=false] WebSocket aberto.
 * @param {boolean} [options.wsGaveUp=false] WebSocket esgotou tentativas de reconexão.
 * @param {number} [options.nostrOpen=0] Relays Nostr conectados.
 * @param {number} [options.nostrPending=0] Relays Nostr em abertura.
 * @returns {boolean}
 */
export function isSignalingDown({ wsOpen = false, wsGaveUp = false, nostrOpen = 0, nostrPending = 0 } = {}) {
  return !wsOpen && wsGaveUp && nostrOpen <= 0 && nostrPending <= 0;
}

/** Atraso em ms antes de declarar sinalização caída (evita aviso piscando). @type {number} */
export const SIGNALING_DOWN_GRACE_MS = 5000;

const SIGNALING_IDLE = Object.freeze({ wsOpen: false, wsGaveUp: false, nostrOpen: 0, nostrPending: 0 });

/** Bandeira que só sobe depois de `graceMs` (se `check()` ainda valer) e desce na hora. */
function createGraceFlag(graceMs, onChange) {
  let value = false;
  let timer = null;
  function cancel() {
    clearTimeout(timer);
    timer = null;
  }
  function settle(next) {
    if (next === value) return;
    value = next;
    onChange(next);
  }
  function raiseLater(check) {
    if (value || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (check()) settle(true);
    }, graceMs);
    timer?.unref?.();
  }
  return {
    get: () => value,
    raiseLater,
    lower: () => (cancel(), settle(false)),
    reset: () => (cancel(), (value = false)),
  };
}

/**
 * Estado da sinalização com carência: só avisa "caída" se a queda durar `graceMs`
 * (o reconecta do WebSocket e a abertura dos relays Nostr não fazem o aviso piscar).
 * `onChange(down)` dispara só nas viradas; `reset()` volta ao início sem disparar.
 */
/**
 * Monitora sinalização com carência: só avisa após `graceMs` de queda contínua.
 * @param {object} [options={}]
 * @param {number} [options.graceMs=SIGNALING_DOWN_GRACE_MS] Carência em ms.
 * @param {(down: boolean) => void} [options.onChange] Chamado nas viradas de estado.
 * @returns {{ update: (patch?: object) => void, reset: () => void, isDown: () => boolean }}
 */
export function createSignalingHealth({ graceMs = SIGNALING_DOWN_GRACE_MS, onChange = () => {} } = {}) {
  const state = { ...SIGNALING_IDLE };
  const flag = createGraceFlag(graceMs, onChange);
  function update(patch = {}) {
    Object.assign(state, patch);
    if (isSignalingDown(state)) flag.raiseLater(() => isSignalingDown(state));
    else flag.lower();
  }
  function reset() {
    Object.assign(state, SIGNALING_IDLE);
    flag.reset();
  }
  return { update, reset, isDown: flag.get };
}
