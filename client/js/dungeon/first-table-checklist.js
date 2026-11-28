/**
 * @file Roteiro "Primeira mesa" do Escudo do Mestre: seis passos que se marcam sozinhos pelo estado real da mesa
 * (campanha, mapa, token, névoa, rolagem e convite). Funções puras, sem DOM nem rede: o painel some quando os seis estão
 * feitos ou quando o Mestre dispensou (`dungeonPrefs.firstTableDismissed`).
 */
import { escapeHtml } from "../shared/html.js";
import { createDefaultScene } from "./vtt-scene-schema.js";

/** Tokens que a cena padrão já traz (Lyra e a Sentinela): nascem na sessão sem o Mestre fazer nada, então não contam. */
const DEFAULT_TOKEN_IDS = new Set(createDefaultScene().tokens.map((t) => t.tokenId));

/** Passos na ordem fixa; `action` é o que o Mestre faz no próximo passo ainda aberto. */
const STEPS = Object.freeze([
  { id: "campaign", label: "Criar a campanha", action: "Crie uma campanha no acampamento.", done: (s) => Boolean(s?.campaignId) },
  { id: "map", label: "Pôr um mapa", action: "Envie uma imagem de mapa na Mesa.", done: (s) => floorsOf(s).some((f) => Boolean(f?.mapBlobHash)) },
  { id: "token", label: "Colocar um token", action: "Adicione uma ficha ou um token simples ao mapa.", done: (s) => (sceneOf(s)?.tokens ?? []).some((t) => !DEFAULT_TOKEN_IDS.has(t?.tokenId)) },
  { id: "fog", label: "Ligar a névoa", action: "Ligue a névoa de guerra num piso.", done: (s) => floorsOf(s).some((f) => f?.fog?.enabled === true) },
  { id: "roll", label: "Fazer uma rolagem", action: "Role um dado na Mesa.", done: (s) => (s?.rolls?.length ?? 0) > 0 },
  { id: "invite", label: "Gerar o convite", action: "Gere o convite da mesa e mande aos jogadores.", done: (s) => Boolean(s?.inviteHref) },
]);

/** Cena ativa sem criar nada no estado (a leitura não pode ter efeito). */
function sceneOf(state) {
  if (state?.scene?.floors?.length) return state.scene;
  return state?.campaignDoc?.scenesById?.[state?.campaignDoc?.activeSceneId] ?? null;
}

function floorsOf(state) {
  return sceneOf(state)?.floors ?? [];
}

/**
 * Os seis passos do roteiro, marcados pelo estado da mesa.
 * @param {object} state Estado da sessão (aceita `{}`).
 * @returns {Array<{id: string, label: string, action: string, done: boolean}>} Passos na ordem fixa.
 */
export function firstTableSteps(state) {
  return STEPS.map(({ id, label, action, done }) => ({ id, label, action, done: Boolean(done(state)) }));
}

/**
 * Painel "Primeira mesa" do Escudo; vazio quando os seis passos estão feitos ou o Mestre dispensou o roteiro.
 * @param {object} state Estado da sessão.
 * @returns {string} HTML do painel, ou string vazia.
 */
export function renderFirstTablePanel(state) {
  if (state?.dungeonPrefs?.firstTableDismissed === true) return "";
  const steps = firstTableSteps(state);
  const next = steps.find((s) => !s.done);
  if (!next) return "";
  const items = steps
    .map((s) => `<li class="dungeon-first-table-step${s.done ? " is-done" : ""}">${s.done ? "✓" : "○"} ${escapeHtml(s.label)}</li>`)
    .join("");
  const doneCount = steps.filter((s) => s.done).length;
  return `
    <section class="dungeon-panel dungeon-first-table" aria-label="Primeira mesa" data-first-table>
      <span class="dungeon-eyebrow">Roteiro de 5 minutos · ${doneCount} de ${steps.length}</span>
      <h2>Primeira mesa</h2>
      <ol class="dungeon-first-table-list">${items}</ol>
      <p class="dungeon-muted"><strong>Próximo:</strong> ${escapeHtml(next.action)}</p>
    </section>`;
}
