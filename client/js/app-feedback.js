/**
 * @file "Algo errado aqui?" — apontamentos sobre o APP (não sobre posts nem pessoas).
 * Trabalho voluntário 3 do piloto (docs/product/voluntariado-tres-trabalhos.md). Lógica pura, sem DOM.
 *
 * Guarda só a tela (nome da rota, sem IDs nem endereços), o tipo, a versão do app e uma nota opcional.
 * Fica no aparelho; a pessoa decide compartilhar com a equipe do piloto. No G1 não há envio automático.
 */

export const FEEDBACK_STORAGE_KEY = "vox-app-feedback-v1";
export const MAX_FEEDBACK = 100;
export const MAX_NOTE_LEN = 280;

export const FEEDBACK_KINDS = Object.freeze([
  { id: "quebrou", label: "Não funcionou" },
  { id: "confuso", label: "Não entendi" },
  { id: "exagero", label: "Não faz o que diz" },
]);

export function findKind(kindId) {
  return FEEDBACK_KINDS.find((k) => k.id === kindId) || null;
}

/** Só o nome da tela: rotas podem carregar endereços e IDs, que não entram no apontamento. */
export function normalizeScreen(screen) {
  const name = String(screen || "").trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(name) ? name : "desconhecida";
}

/** Quebras de linha e espaços repetidos viram um espaço: cada apontamento ocupa uma linha no texto compartilhado. */
function oneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/** Valida e normaliza; lança Error com mensagem em português. */
export function buildFeedback({ screen, kind, note = "", version = "" } = {}, now = Date.now()) {
  if (!findKind(kind)) throw new Error("Escolha o que aconteceu.");
  return {
    screen: normalizeScreen(screen),
    kind,
    note: oneLine(note).slice(0, MAX_NOTE_LEN),
    version: String(version || "").slice(0, 80),
    ts: now,
  };
}

/** Registro salvo íntegro: tipo conhecido e data válida (o armazenamento pode ter sido mexido). */
function isValidRecord(rec) {
  return Boolean(rec) && Boolean(findKind(rec.kind)) && Number.isFinite(rec.ts) && !Number.isNaN(new Date(rec.ts).getTime());
}

export function listFeedback(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(FEEDBACK_STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(isValidRecord) : [];
  } catch {
    return [];
  }
}

/** Acrescenta e mantém só os MAX_FEEDBACK mais recentes. Devolve o total guardado. */
export function saveFeedback(rec, storage = globalThis.localStorage) {
  const list = [...listFeedback(storage), rec].slice(-MAX_FEEDBACK);
  storage?.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(list));
  return list.length;
}

/** Contagem por tela e tipo, da mais apontada para a menos. */
export function summarizeByScreen(list = []) {
  const counts = new Map();
  for (const rec of list) {
    const key = `${rec.screen}\u0000${rec.kind}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [screen, kind] = key.split("\u0000");
      return { screen, kind, count };
    })
    .sort((a, b) => b.count - a.count || a.screen.localeCompare(b.screen));
}

function formatLine(rec) {
  const label = findKind(rec.kind)?.label || rec.kind;
  const day = new Date(rec.ts).toISOString().slice(0, 10);
  const note = oneLine(rec.note);
  return `- ${day} · tela ${rec.screen} · ${label}${note ? ` · "${note}"` : ""}`;
}

/** Texto para a pessoa colar no grupo do piloto (resumo + lista). */
export function formatFeedbackForShare(list = []) {
  if (!list.length) return "Nenhum apontamento salvo neste aparelho.";
  const versions = [...new Set(list.map((rec) => rec.version).filter(Boolean))];
  const version = versions.length ? versions.join(", ") : "versão desconhecida";
  const summary = summarizeByScreen(list).map((s) => `${s.count}× ${s.screen} (${findKind(s.kind)?.label || s.kind})`);
  return [
    `Apontamentos do Vox (${list.length}) · ${version}`,
    `Resumo: ${summary.join("; ")}`,
    ...list.map(formatLine),
  ].join("\n");
}
