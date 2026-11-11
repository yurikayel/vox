/**
 * @file Página leve de conferência do aviso (`aviso.html`), sem conta e sem o app. Spec: docs/specs/aviso-assinado-v0.md.
 * Confere a assinatura no aparelho e guarda, no próprio celular, as chaves já vistas para cada grupo e para cada nome.
 * Chave nova para um grupo ou nome já conhecido nunca fica verde sozinha.
 */
import { avisoCode, avisoExpiresAt, decodeAvisoFragment, personCode } from "./aviso-link.js";
import { verifyPayload } from "../js/signed-verify.js";

export const TRUST_KEY = "vox.aviso.trust";

const plainName = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Memória de confiança sobre um `Storage`; leitura e escrita nunca derrubam a página. */
export function trustStore(storage) {
  const read = () => {
    try {
      const data = JSON.parse(storage?.getItem(TRUST_KEY) || "{}");
      return { groups: data.groups || {}, names: data.names || {} };
    } catch {
      return { groups: {}, names: {} };
    }
  };
  const write = (data) => {
    try {
      storage?.setItem(TRUST_KEY, JSON.stringify(data));
    } catch {
      /* armazenamento bloqueado: a página segue, sem lembrar */
    }
  };
  return { read, write };
}

const addTo = (map, key, value) => {
  if (!key) return;
  map[key] = [...new Set([...(map[key] || []), value])];
};

/** Guarda a chave para o grupo e para o nome de quem assinou. */
export function rememberKey(store, aviso) {
  const data = store.read();
  addTo(data.groups, aviso.communityId, aviso.author);
  addTo(data.names, plainName(aviso.authorDisplay), aviso.author);
  store.write(data);
}

function trustOf(store, aviso) {
  const { groups, names } = store.read();
  const lists = [groups[aviso.communityId], names[plainName(aviso.authorDisplay)]].filter(Boolean);
  if (!lists.length) return "novo";
  return lists.every((list) => list.includes(aviso.author)) ? "conhecido" : "chave-nova";
}

/**
 * Estado da conferência: `invalido`, `encerrado`, `verde`, `amarelo` ou `chave-nova`.
 * No primeiro contato (amarelo) a chave é guardada.
 */
export async function evaluateAviso(fragment, store, now = Date.now()) {
  const aviso = decodeAvisoFragment(fragment);
  if (!aviso || !(await verifyPayload(aviso))) return { state: "invalido" };
  const codes = { code: await avisoCode(aviso), person: await personCode(aviso.author) };
  if (avisoExpiresAt(aviso) <= now) return { state: "encerrado", aviso, ...codes };
  const trust = trustOf(store, aviso);
  if (trust === "novo") rememberKey(store, aviso);
  const state = { novo: "amarelo", conhecido: "verde", "chave-nova": "chave-nova" }[trust];
  return { state, aviso, ...codes };
}

const MESSAGES = {
  invalido: ["🔴", "Não confie", "Este aviso foi alterado ou não tem assinatura válida."],
  encerrado: ["⚪", "Aviso encerrado", "Este aviso já passou."],
  verde: ["✅", "Veio da coordenação", "Assinado por {nome}. Código {pessoa}."],
  amarelo: ["🟡", "Primeira vez", "Primeira vez que este celular vê este grupo. Confira o código {pessoa} com a coordenação, uma vez."],
  "chave-nova": ["🔴", "Chave nova", "Chave nova para um grupo ou nome que você já conhece. Pode ser outra pessoa da coordenação, pode ser golpe. Só confie se a coordenação confirmar o código {pessoa}."],
};

/** Título e texto do estado, já com nome e código. */
export function describeState(result) {
  const [icon, title, template] = MESSAGES[result.state] || MESSAGES.invalido;
  const text = template.replace("{nome}", result.aviso?.authorDisplay || "a coordenação").replace("{pessoa}", result.person || "");
  return { icon, title, text };
}

/** Link do WhatsApp com a resposta pronta, para colar no grupo. */
export function replyHref(label, code) {
  return `https://wa.me/?text=${encodeURIComponent(`${label} — ${code}`)}`;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderAvisoBody(doc, root, aviso) {
  root.append(el(doc, "h2", "aviso-title", aviso.title));
  if (aviso.body) root.append(el(doc, "p", "aviso-body", aviso.body));
  if (aviso.eventAt) {
    const when = new Date(aviso.eventAt).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
    root.append(el(doc, "p", "aviso-when", `Quando: ${when}${aviso.eventPlace ? ` · ${aviso.eventPlace}` : ""}`));
  }
}

function renderReplies(doc, root, result) {
  const options = result.aviso.eventAt ? ["✅ Ciente", "🙋 Vou", "🤔 Talvez", "❌ Não vou"] : ["✅ Ciente"];
  const box = el(doc, "div", "aviso-replies");
  for (const label of options) {
    const link = el(doc, "a", "aviso-reply", label);
    link.href = replyHref(label, result.code);
    link.rel = "noopener";
    box.append(link);
  }
  root.append(el(doc, "p", "aviso-hint", "Responder no grupo:"), box);
}

function renderConfirm(doc, root, result, store) {
  const button = el(doc, "button", "aviso-confirm", "A coordenação confirmou este código");
  button.type = "button";
  button.addEventListener("click", () => {
    rememberKey(store, result.aviso);
    paint(doc, root, { ...result, state: "verde" }, store);
  });
  root.append(button);
}

/** Desenha o resultado na página. */
export function paint(doc, root, result, store) {
  root.replaceChildren();
  const { icon, title, text } = describeState(result);
  const status = el(doc, "section", `aviso-status aviso-${result.state}`);
  status.append(el(doc, "p", "aviso-icon", icon), el(doc, "h1", "", title), el(doc, "p", "", text));
  root.append(status);
  if (result.aviso && result.state !== "invalido") renderAvisoBody(doc, root, result.aviso);
  if (result.state === "chave-nova") renderConfirm(doc, root, result, store);
  if (["verde", "amarelo"].includes(result.state)) renderReplies(doc, root, result);
  root.append(el(doc, "p", "aviso-note", "O verde só vale no seu celular. Print de tela verde não prova nada."));
}

async function boot() {
  const root = document.getElementById("aviso-root");
  if (!root) return;
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const store = trustStore(storage);
  paint(document, root, await evaluateAviso(location.hash, store), store);
}

if (typeof document !== "undefined" && document.getElementById?.("aviso-root")) boot();
