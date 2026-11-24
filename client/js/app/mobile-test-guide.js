/**
 * @file PM-73 — Roteiro de teste de campo no celular (5 min) e gerador de relatório local (JSON/Markdown).
 * 100% local, zero telemetria central; saída compatível com `scripts/mobile-field-report.mjs`.
 */

/** Passos oficiais do roteiro de 5 minutos (ids alinhados a `scripts/mobile-field-report.mjs`). */
export const MOBILE_GUIDE_STEPS = Object.freeze([
  { id: "open_pwa", title: "Abrir o Vox no navegador", hint: "Abra o Vox no celular e confirme que a tela inicial carrega." },
  { id: "install_a2hs", title: "Instalar na tela inicial (PWA)", hint: "Use 'Adicionar à tela inicial' no navegador e abra pelo ícone." },
  { id: "create_identity", title: "Criar ou abrir identidade", hint: "Confirme que sua conta local foi criada ou aberta no aparelho." },
  { id: "backup_check", title: "Conferir backup soberano", hint: "Verifique a Senha Soberana ou o arquivo cifrado (.voxid)." },
  { id: "publish_post", title: "Publicar um teste local", hint: "Crie uma publicação ou rascunho e confirme na lista." },
  { id: "offline_reload", title: "Recarregar em modo offline", hint: "Ative o modo avião, recarregue e confirme que o app abre." },
  { id: "reconnect_status", title: "Reconectar e checar status", hint: "Desative o modo avião e veja o status da rede atualizar." },
  { id: "export_diag", title: "Exportar relatório local", hint: "Copie ou baixe o relatório em JSON ou Markdown nesta tela." },
]);

const ALLOWED_NETWORKS = new Set(["wifi", "5g", "4g", "3g", "2g", "offline", "unknown"]);
const STEP_IDS = new Set(MOBILE_GUIDE_STEPS.map((s) => s.id));

/**
 * Limpa texto curto removendo quebras de linha e limitando comprimento.
 * @param {unknown} value Texto bruto.
 * @param {string} [fallback="desconhecido"] Valor de reserva.
 * @param {number} [maxLen=48] Tamanho máximo.
 * @returns {string}
 */
function cleanText(value, fallback = "desconhecido", maxLen = 48) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLen);
  return trimmed || fallback;
}

/**
 * Extrai versão principal de uma regex sobre o User-Agent.
 * @param {string} ua User-Agent.
 * @param {RegExp} re Expressão com grupo de captura numérico.
 * @param {string} label Nome da família.
 * @returns {string}
 */
function matchVersion(ua, re, label) {
  const m = re.exec(ua);
  return m && m[1] ? `${label} ${m[1]}` : label;
}

/**
 * Detecta sistema operacional e versão principal a partir do User-Agent.
 * @param {string} ua User-Agent.
 * @param {number} [maxTouchPoints=0] Pontos de toque (diferencia iPadOS de macOS).
 * @returns {string}
 */
export function detectOs(ua, maxTouchPoints = 0) {
  const s = String(ua || "");
  if (/iPad/i.test(s) || (/Macintosh/i.test(s) && maxTouchPoints > 1)) return matchVersion(s, /OS (\d+)/i, "iPadOS");
  if (/iPhone|iPod/i.test(s)) return matchVersion(s, /OS (\d+)/i, "iOS");
  if (/Android/i.test(s)) return matchVersion(s, /Android (\d+)/i, "Android");
  if (/CrOS/i.test(s)) return "ChromeOS";
  if (/Windows NT/i.test(s)) return matchVersion(s, /Windows NT (\d+)/i, "Windows");
  if (/Mac OS X/i.test(s)) return matchVersion(s, /Mac OS X (\d+)/i, "macOS");
  if (/Linux/i.test(s)) return "Linux";
  return "desconhecido";
}

/**
 * Detecta família do navegador e versão principal a partir do User-Agent.
 * @param {string} ua User-Agent.
 * @returns {string}
 */
export function detectBrowser(ua) {
  const s = String(ua || "");
  if (/SamsungBrowser\//i.test(s)) return matchVersion(s, /SamsungBrowser\/(\d+)/i, "Samsung Internet");
  if (/Edg(?:A|iOS)?\//i.test(s)) return matchVersion(s, /Edg(?:A|iOS)?\/(\d+)/i, "Edge");
  if (/(?:OPR|Opera)\//i.test(s)) return matchVersion(s, /(?:OPR|Opera)\/(\d+)/i, "Opera");
  if (/(?:Firefox|FxiOS)\//i.test(s)) return matchVersion(s, /(?:Firefox|FxiOS)\/(\d+)/i, "Firefox");
  if (/(?:Chrome|CriOS)\//i.test(s)) return matchVersion(s, /(?:Chrome|CriOS)\/(\d+)/i, "Chrome");
  if (/Safari\//i.test(s)) return matchVersion(s, /Version\/(\d+)/i, "Safari");
  return "desconhecido";
}

/**
 * Detecta classe/modelo resumido do aparelho compatível com `normalizeDeviceClass`.
 * @param {string} ua User-Agent.
 * @param {number} [maxTouchPoints=0] Pontos de toque.
 * @returns {string}
 */
export function detectDeviceModel(ua, maxTouchPoints = 0) {
  const s = String(ua || "");
  if (/iPad/i.test(s) || (/Macintosh/i.test(s) && maxTouchPoints > 1)) return "tablet (iPad)";
  if (/Tablet/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return "tablet (Android)";
  if (/iPhone|iPod/i.test(s)) return "celular (iPhone)";
  if (/Android/i.test(s) || /Mobile/i.test(s)) return "celular (Android)";
  if (/Windows|Mac OS X|Linux|CrOS/i.test(s)) return "desktop";
  return "desconhecido";
}

/**
 * Normaliza o tipo de rede reportado pelo navegador.
 * @param {object} nav Objeto compatível com `navigator`.
 * @returns {string}
 */
export function detectNetworkType(nav = {}) {
  if (nav.onLine === false) return "offline";
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return "unknown";
  if (String(conn.type || "").toLowerCase() === "wifi") return "wifi";
  const eff = String(conn.effectiveType || "").toLowerCase();
  return ALLOWED_NETWORKS.has(eff) ? eff : "unknown";
}

/**
 * Coleta metadados locais do aparelho e navegador (sem rede e sem PII).
 * @param {object} [nav=globalThis.navigator] Fonte de dados do navegador.
 * @returns {{ deviceModel: string, os: string, browser: string, ramGb: number|null, networkType: string }}
 */
export function collectMobileEnvironment(nav = globalThis.navigator || {}) {
  const ua = String(nav?.userAgent || "");
  const touch = Number(nav?.maxTouchPoints) || 0;
  const mem = Number(nav?.deviceMemory);
  return {
    deviceModel: detectDeviceModel(ua, touch),
    os: detectOs(ua, touch),
    browser: detectBrowser(ua),
    ramGb: Number.isFinite(mem) && mem > 0 ? Math.round(mem * 10) / 10 : null,
    networkType: detectNetworkType(nav),
  };
}

/**
 * Cria o estado inicial do roteiro de teste de campo.
 * @param {object} [env] Ambiente coletado (se omitido, coleta do navegador).
 * @param {number} [now=Date.now()] Timestamp inicial em ms.
 * @returns {object}
 */
export function createGuideState(env = collectMobileEnvironment(), now = Date.now()) {
  const steps = {};
  for (const step of MOBILE_GUIDE_STEPS) {
    steps[step.id] = { ok: false, durationMs: null };
  }
  return { startedAt: now, env: { ...env }, steps };
}

/**
 * Atualiza o status de um passo conhecido do roteiro (imutável).
 * @param {object} state Estado atual do roteiro.
 * @param {string} stepId Identificador do passo.
 * @param {boolean} ok Se o passo foi aprovado.
 * @param {number|null} [durationMs=null] Duração opcional em ms.
 * @returns {object}
 */
export function markGuideStep(state, stepId, ok, durationMs = null) {
  if (!STEP_IDS.has(stepId)) return state;
  const dur = durationMs === null || durationMs === undefined ? null : Math.max(0, Math.round(Number(durationMs) || 0));
  return {
    ...state,
    steps: { ...state.steps, [stepId]: { ok: Boolean(ok), durationMs: dur } },
  };
}

/**
 * Atualiza tipo de rede ou modelo de aparelho no estado do roteiro (imutável).
 * @param {object} state Estado atual.
 * @param {{ deviceModel?: string, networkType?: string }} patch Campos atualizados.
 * @returns {object}
 */
export function updateGuideEnv(state, patch = {}) {
  const env = { ...state.env };
  if (patch.deviceModel !== undefined) env.deviceModel = cleanText(patch.deviceModel, env.deviceModel, 48);
  if (patch.networkType !== undefined) {
    const net = cleanText(patch.networkType, "unknown", 16).toLowerCase();
    env.networkType = ALLOWED_NETWORKS.has(net) ? net : "unknown";
  }
  return { ...state, env };
}

/**
 * Constrói o objeto de relatório local compatível com `scripts/mobile-field-report.mjs`.
 * @param {object} state Estado do roteiro.
 * @param {object} [extras={}] Dados opcionais de `signaling`, `readOrigins` e `generatedAt`.
 * @returns {object}
 */
export function buildLocalFieldReport(state, extras = {}) {
  const env = state?.env || {};
  const net = cleanText(env.networkType, "unknown", 16).toLowerCase();
  return {
    schema: "vox.mobile-field-report.v1",
    generatedAt: extras.generatedAt || new Date().toISOString(),
    deviceModel: cleanText(env.deviceModel, "desconhecido", 48),
    os: cleanText(env.os, "desconhecido", 48),
    browser: cleanText(env.browser, "desconhecido", 48),
    ramGb: Number.isFinite(Number(env.ramGb)) && Number(env.ramGb) > 0 ? Math.round(Number(env.ramGb) * 10) / 10 : null,
    networkType: ALLOWED_NETWORKS.has(net) ? net : "unknown",
    steps: MOBILE_GUIDE_STEPS.map((s) => ({
      id: s.id,
      ok: Boolean(state?.steps?.[s.id]?.ok),
      durationMs: state?.steps?.[s.id]?.durationMs ?? null,
    })),
    signaling: { wsAttempts: 0, wsSuccess: 0, nostrAttempts: 0, nostrSuccess: 0, connectMs: null, ...extras.signaling },
    readOrigins: { cache: 0, p2p: 0, relay: 0, gateway: 0, unknown: 0, ...extras.readOrigins },
  };
}

/**
 * Serializa o relatório local em JSON legível (pronto para copiar ou baixar).
 * @param {object} report Objeto gerado por `buildLocalFieldReport`.
 * @returns {string}
 */
export function formatLocalFieldReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Renderiza o relatório local em Markdown enxuto (100% local, zero telemetria).
 * @param {object} report Objeto gerado por `buildLocalFieldReport`.
 * @returns {string}
 */
export function formatLocalFieldReportMarkdown(report) {
  const steps = Array.isArray(report?.steps) ? report.steps : [];
  const passed = steps.filter((s) => s.ok).length;
  const ram = report?.ramGb ? `${report.ramGb} GB` : "n/d";
  const lines = [
    "# Relatório Local — Teste de Campo no Celular (PM-73)",
    "",
    `- **Aparelho:** ${cleanText(report?.deviceModel)}`,
    `- **Sistema:** ${cleanText(report?.os)}`,
    `- **Navegador:** ${cleanText(report?.browser)}`,
    `- **RAM / Rede:** ${ram} · ${cleanText(report?.networkType, "unknown")}`,
    `- **Passos aprovados:** ${passed}/${steps.length}`,
    "- **Privacidade:** gerado 100% no aparelho, sem telemetria central.",
    "",
    "| Passo | Status | Duração (ms) |",
    "| :--- | :---: | :---: |",
  ];
  for (const s of steps) {
    lines.push(`| \`${cleanText(s.id, "?", 32)}\` | ${s.ok ? "OK" : "Pendente"} | ${s.durationMs ?? "n/d"} |`);
  }
  return `${lines.join("\n")}\n`;
}
