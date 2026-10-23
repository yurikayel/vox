/**
 * Módulo Open Frames para Vox (v6.2).
 * Cooptagem FOSS da especificação Open Frames (of:* + of:accepts:vox).
 * Permite mini-apps declarativos no feed (enquetes, abaixo-assinados, simuladores CLT),
 * com ações assinadas via chave local P-256, sem iframes e sem scripts remotos arbitrários.
 */

export const ALLOWED_FRAME_KINDS = ["poll", "petition", "clt"];
export const FRAME_STORAGE_KEY = "vox-frame-actions";

function validateFrameBasics(raw) {
  if (!raw || typeof raw !== "object") return "Definição de frame ausente ou inválida.";
  if (!raw["of:accepts:vox"] && !raw.acceptsVox) return "Frame não suporta Vox (requer 'of:accepts:vox').";
  const kind = String(raw.kind || "").trim().toLowerCase();
  if (!ALLOWED_FRAME_KINDS.includes(kind)) return `Kind "${kind}" não está na allowlist segura (poll, petition, clt).`;
  if (!raw["of:image"] && !raw.image) return "Frame requer imagem declarada em 'of:image'.";
  return null;
}

/**
 * Valida e normaliza a definição de um Open Frame declarativo.
 */
export function parseFrame(raw) {
  const err = validateFrameBasics(raw);
  if (err) return { valid: false, error: err };

  const buttons = extractButtons(raw);
  if (buttons.length === 0) {
    return { valid: false, error: "Frame deve declarar ao menos um botão ('of:button:1')." };
  }

  return {
    valid: true,
    frame: {
      kind: String(raw.kind).trim().toLowerCase(),
      title: String(raw.title || "").trim(),
      "of:accepts:vox": raw["of:accepts:vox"] || raw.acceptsVox,
      "of:image": String(raw["of:image"] || raw.image).trim(),
      "of:image:aspect_ratio": raw["of:image:aspect_ratio"] || "1.91:1",
      "of:input:text": raw["of:input:text"] || null,
      buttons,
      initialVotes: raw.initialVotes || {},
      initialSignatures: Number(raw.initialSignatures) || 0,
      goal: Number(raw.goal) || 100,
    },
  };
}

/**
 * Extrai até 4 botões declarados conforme spec Open Frames.
 */
function extractButtons(raw) {
  const list = [];
  for (let i = 1; i <= 4; i++) {
    const label = raw[`of:button:${i}`] || (Array.isArray(raw.buttons) && raw.buttons[i - 1]?.label);
    if (!label || typeof label !== "string" || !label.trim()) continue;
    list.push({
      index: i,
      label: label.trim(),
      action: raw[`of:button:${i}:action`] || "post",
      target: raw[`of:button:${i}:target`] || null,
    });
  }
  return list;
}

/**
 * Persistência rápida de ações locais para evitar flicker na renderização inicial.
 */
export function getUserFrameAction(postId) {
  if (typeof window === "undefined" || !window.localStorage || !postId) return null;
  try {
    const raw = window.localStorage.getItem(FRAME_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[postId] || null;
  } catch {
    return null;
  }
}

export function saveUserFrameAction(postId, action) {
  if (typeof window === "undefined" || !window.localStorage || !postId) return;
  try {
    const raw = window.localStorage.getItem(FRAME_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[postId] = { ...action, ts: Date.now() };
    window.localStorage.setItem(FRAME_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function clearUserFrameActions() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(FRAME_STORAGE_KEY);
  } catch {}
}

/**
 * Constrói payload canônico para assinatura ECDSA P-256 de uma ação de frame.
 */
export function buildFrameActionPayload({ postId, frameKind, buttonIndex, buttonLabel, inputText = "", userAddress }) {
  const addr = userAddress || "anon";
  return {
    id: `fa_${postId}_${addr}_${Date.now()}`,
    type: "frame-action",
    postId,
    frameKind,
    buttonIndex: Number(buttonIndex),
    buttonLabel: String(buttonLabel || "").trim(),
    inputText: String(inputText || "").trim(),
    author: addr,
    owner: addr,
    ts: Date.now(),
  };
}

function tallyVotes(frame, actions = [], localAction = null) {
  const counts = {};
  for (const b of frame.buttons) {
    counts[b.index] = Number(frame.initialVotes?.[b.index]) || 0;
  }
  const latest = new Map();
  for (const a of actions) {
    if (a.author && a.buttonIndex) latest.set(a.author, a.buttonIndex);
  }
  for (const idx of latest.values()) {
    if (counts[idx] !== undefined) counts[idx]++;
  }
  const userChoice = localAction?.buttonIndex || null;
  if (userChoice && !latest.has(localAction.author) && counts[userChoice] !== undefined) {
    counts[userChoice]++;
  }
  return { counts, userChoice };
}

/**
 * Apuração de Enquete (poll): 1 membro = 1 voto, com opção de votos iniciais.
 */
export function computePollState(frame, actions = [], localAction = null) {
  const { counts, userChoice } = tallyVotes(frame, actions, localAction);
  let totalVotes = 0;
  for (const val of Object.values(counts)) totalVotes += val;

  const options = frame.buttons.map((b) => {
    const count = counts[b.index] || 0;
    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    return { index: b.index, label: b.label, count, percent };
  });

  return { kind: "poll", options, totalVotes, userVotedIndex: userChoice };
}

/**
 * Apuração de Abaixo-assinado (petition): soma assinaturas únicas e calcula meta.
 */
export function computePetitionState(frame, actions = [], localAction = null) {
  const uniqueAuthors = new Set();
  for (const a of actions) {
    if (a.author) uniqueAuthors.add(a.author);
  }

  const hasSigned = Boolean(localAction || (localAction?.author && uniqueAuthors.has(localAction.author)));
  const base = Number(frame.initialSignatures) || 0;
  const userBonus = (localAction && !uniqueAuthors.has(localAction.author)) ? 1 : 0;
  const total = base + uniqueAuthors.size + userBonus;
  const goal = Number(frame.goal) || 100;
  const percent = Math.min(100, Math.round((total / goal) * 100));

  return { kind: "petition", signaturesCount: total, goal, percent, hasSigned };
}

/**
 * Calculadora rápida CLT: simulação local determinística baseada no salário mínimo (R$ 1.518,00).
 */
export function computeCltState(frame, actions = [], localAction = null) {
  const choice = localAction?.buttonIndex || 0;
  const minWage = 1518.0;

  if (choice === 1) {
    return {
      kind: "clt",
      activeIndex: 1,
      title: "Férias Constitucionais (+1/3)",
      result: "R$ 2.024,00",
      detail: `Base: Salário integral (R$ ${minWage.toFixed(2)}) + 1/3 de abono constitucional (R$ ${(minWage / 3).toFixed(2)}).`,
    };
  }

  if (choice === 2) {
    return {
      kind: "clt",
      activeIndex: 2,
      title: "13º Salário Integral",
      result: "R$ 1.518,00",
      detail: `Pago em 2 parcelas: R$ ${(minWage / 2).toFixed(2)} até 30/nov e R$ ${(minWage / 2).toFixed(2)} até 20/dez.`,
    };
  }

  if (choice === 3) {
    return {
      kind: "clt",
      activeIndex: 3,
      title: "Rescisão Básica (1 ano de vínculo)",
      result: "R$ 2.732,40*",
      detail: "Estimativa com aviso prévio indenizado, saldo de salário e 40% da multa sobre o FGTS.",
    };
  }

  return {
    kind: "clt",
    activeIndex: 0,
    title: frame.title || "Calculadora Rápida CLT",
    result: "",
    detail: "Toque em uma das opções abaixo para simular estimativas de direitos pelo salário mínimo vigente (R$ 1.518,00).",
  };
}

/**
 * Despachante de apuração de estado para qualquer kind suportado.
 */
export function getFrameState(frame, actions = [], localAction = null) {
  if (!frame || !frame.kind) return null;
  if (frame.kind === "poll") return computePollState(frame, actions, localAction);
  if (frame.kind === "petition") return computePetitionState(frame, actions, localAction);
  if (frame.kind === "clt") return computeCltState(frame, actions, localAction);
  return null;
}
