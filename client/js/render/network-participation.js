/** @file Participation layers, supporter mode, quotas and limit preferences. */
import { escapeHtml } from "./util.js";

const PARTICIPATION_LAYERS = [
  {
    id: "passive",
    title: "Passivo",
    desc: "Você navega e publica, mas não repassa cache nem ajuda outros aparelhos. Ideal para economizar dados ou pausar a contribuição.",
    control: '<a class="participation-link" href="#net-pause">Pausar ajuda à rede (modo somente leitura)</a>',
  },
  {
    id: "active",
    title: "Ativo",
    desc: "Padrão do Pacto Vox: entrega leve de conteúdo público já em cache, com tetos de banda, limite de disco e preferência por Wi-Fi.",
    control: '<span class="meta">Desmarque “Pausar ajuda” e ajuste os limites abaixo.</span>',
  },
  {
    id: "supporter",
    title: "Apoiador",
    desc: "Nó pesado: guarda e repassa mais conteúdo (de 512 MB a 1 GB de disco e até o dobro disso em dados por dia), só no Wi-Fi. Ajuda comunidades com poucos aparelhos online.",
    control: '<a class="participation-link" href="#net-supporter">Seja um apoiador da rede</a>',
  },
  {
    id: "steward",
    title: "Steward",
    desc: "Apoia a malha com relay desktop ou servidor de conexão (LAN/VPS), espelhando índices e sinalização para quem está por perto.",
    control: '<a class="participation-link" href="#net-relay-steward">Relay e servidor de conexão</a>',
  },
];

/**
 * Camada de participação inferida para destaque na UI (não persiste sozinha).
 * @param {object} [settings={}] Preferências de rede do aparelho.
 * @param {object} [options={}] Opções adicionais.
 * @param {string} [options.customSignalingUrl=""] URL WSS configurada.
 * @returns {"passive"|"active"|"supporter"|"steward"}
 */
export function inferParticipationLayer(settings = {}, { customSignalingUrl = "" } = {}) {
  if (settings.enabled === false) return "passive";
  const signaling = String(customSignalingUrl || "").trim();
  if (settings.backgroundRelay || signaling) return "steward";
  if (settings.supporter) return "supporter";
  return "active";
}

function renderParticipationLayers(settings, customSignalingUrl) {
  const current = inferParticipationLayer(settings, { customSignalingUrl });
  const cards = PARTICIPATION_LAYERS.map((layer) => {
    const isCurrent = layer.id === current;
    const border = isCurrent ? "border:2px solid var(--accent);" : "border:1px solid var(--border);";
    const badge = isCurrent
      ? `<span class="pill" style="font-size:0.7rem; margin-left:0.35rem;">Você está aqui</span>`
      : "";
    return `
      <div class="participation-layer" data-layer="${layer.id}" style="${border} border-radius:var(--radius-sm); padding:0.65rem 0.75rem; margin-bottom:0.5rem;">
        <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(layer.title)}${badge}</div>
        <p class="desc" style="font-size:0.8rem; margin:0.35rem 0;">${escapeHtml(layer.desc)}</p>
        <div style="font-size:0.8rem;">${layer.control}</div>
      </div>`;
  }).join("");

  return `
    <details class="advanced-settings participation-layers">
      <summary>Camadas de participação (Passivo → Steward)</summary>
      <div style="margin-top:0.75rem;">
        <p class="desc" style="font-size:0.8rem; margin:0 0 0.75rem;">
          Opt-in em etapas: ninguém precisa virar steward para usar o Vox. Escolha o nível que combina com seu aparelho e com os espaços digitais que você habita.
        </p>
        ${cards}
      </div>
    </details>`;
}

function renderPauseAndDiscoverableHtml(isEnabled, meshDiscoverable) {
  return `
    <div class="form-group" style="display:flex; align-items:center; gap:0.6rem; margin-top:0.5rem;">
      <input type="checkbox" id="net-pause" ${!isEnabled ? "checked" : ""} style="width:1.1rem; height:1.1rem;" />
      <label for="net-pause" style="margin:0; font-weight:600; color:var(--danger);">Pausar ajuda à rede (modo somente leitura)</label>
    </div>
    <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem;">
      <input type="checkbox" id="net-mesh-discoverable" ${meshDiscoverable ? "checked" : ""} style="width:1.1rem; height:1.1rem; margin-top:0.2rem;" />
      <div>
        <label for="net-mesh-discoverable" style="margin:0; font-weight:600;">Aparecer na busca da malha</label>
        <p class="desc" style="font-size:0.78rem; margin:0.25rem 0 0;">Cartão de perfil assinado (opt-in) propagado via gossip — ver COMPLIANCE-BR.md.</p>
      </div>
    </div>`;
}

/** Disco: fixo em 100 MB no nó leve; de 512 a 1024 MB no apoiador. */
function renderDiskFieldHtml(settings) {
  if (!settings?.supporter) {
    return `
      <label for="net-max-mb">Espaço em disco: 100 MB (fixo no nó leve)</label>
      <input type="number" id="net-max-mb" class="form-control" value="100" disabled />`;
  }
  return `
      <label for="net-max-mb">Espaço em disco (MB, de 512 a 1024):</label>
      <input type="number" id="net-max-mb" class="form-control" min="512" max="1024" value="${settings.maxMb || 1024}" />`;
}

function renderQuotaAndLimitFieldsHtml(settings) {
  const diskMb = settings?.supporter ? settings.maxMb || 1024 : 100;
  return `
    <div class="form-group">
      <label for="net-daily-cap">Teto diário de dados compartilhados (MB, até o dobro do disco):</label>
      <input type="number" id="net-daily-cap" class="form-control" min="5" max="${diskMb * 2}" value="${settings?.dailyCapMb || diskMb * 2}" />
    </div>
    <div class="form-group">${renderDiskFieldHtml(settings)}
    </div>
    <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
      <input type="checkbox" id="net-wifi" ${settings?.wifiOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
      <label for="net-wifi" style="margin:0;">Ajudar apenas quando estiver no Wi-Fi (recomendado)</label>
    </div>
    <div class="form-group">
      <label for="net-cellular-cap">Se ajudar também no 4G, até quantos MB por dia:</label>
      <input type="number" id="net-cellular-cap" class="form-control" min="1" max="50" value="${settings?.cellularCapMb || 5}" />
      <p class="desc" style="font-size:0.8rem; margin:0.25rem 0 0;">Só vale com o "apenas no Wi-Fi" desligado. No pré-pago, cada MB que você repassa sai da sua franquia.</p>
    </div>
    <div id="net-comm-only-wrap" class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
      <input type="checkbox" id="net-comm-only" ${settings?.commOnly ? "checked" : ""} style="width:1rem; height:1rem;" />
      <label for="net-comm-only" style="margin:0;">Compartilhar apenas minhas comunidades </label>
    </div>`;
}

/**
 * Card de opt-in do modo Apoiador (nó pesado no Wi-Fi).
 * @param {object} [settings={}] Deve incluir `supporter`.
 * @returns {string}
 */
export function renderSupporterCardHtml(settings = {}) {
  const on = Boolean(settings.supporter);
  const text = on
    ? "Você é apoiador: este aparelho guarda e repassa mais conteúdo da rede, só no Wi-Fi."
    : "Seu aparelho já ajuda como nó leve (100 MB de disco, até 200 MB/dia). Com Wi-Fi e espaço sobrando, vire apoiador: de 512 MB a 1 GB de disco e até o dobro disso por dia para manter as comunidades no ar.";
  const btn = on
    ? '<button type="button" id="btn-supporter-toggle" class="btn btn-sm btn-outline" data-on="1">Voltar ao nó leve</button>'
    : '<button type="button" id="btn-supporter-toggle" class="btn btn-sm btn-primary" data-on="0">Seja um apoiador da rede</button>';
  return `
    <div id="net-supporter" class="card supporter-card" style="margin:0.5rem 0 1rem; padding:0.85rem 1rem;">
      <strong style="font-size:0.92rem; display:block;">${on ? "💪 Apoiador da rede" : "🤝 Apoie a rede"}</strong>
      <p class="desc" style="font-size:0.8rem; margin:0.35rem 0 0.6rem;">${text}</p>
      ${btn}
    </div>`;
}

/**
 * Aviso de IP visível e checkbox "só via TURN" (LAN-19).
 * @param {object} [settings={}] Preferências de rede do aparelho.
 * @returns {string}
 */
export function renderTurnOnlyHtml(settings = {}) {
  return `
    <p class="desc" id="net-ip-notice" style="font-size:0.78rem; margin:0.25rem 0 0.5rem;">
      Ao conectar direto, os outros aparelhos veem o endereço IP da sua internet (que pode indicar sua cidade e operadora).
    </p>
    <div class="form-group" style="display:flex; align-items:flex-start; gap:0.6rem;">
      <input type="checkbox" id="net-turn-only" ${settings.turnOnly ? "checked" : ""} style="width:1rem; height:1rem; margin-top:0.2rem;" />
      <div>
        <label for="net-turn-only" style="margin:0; font-weight:600;">Esconder meu IP (só via servidor TURN)</label>
        <p class="desc" style="font-size:0.75rem; margin:0.2rem 0 0;">Tudo passa por um servidor auxiliar. Mais lento, e sem servidor TURN configurado abaixo as conexões diretas ficam desligadas.</p>
      </div>
    </div>`;
}

/**
 * Renderiza bloco com preferências gerais de ajuda, camadas e limites.
 * @param {object} settings Preferências salvas.
 * @param {boolean} meshDiscoverable Opt-in na busca da malha.
 * @param {string} customSignalingUrl URL WSS configurada.
 * @returns {string}
 */
export function renderGeneralPreferencesHtml(settings, meshDiscoverable, customSignalingUrl) {
  const isEnabled = Boolean(settings?.enabled);
  return `
    ${renderSupporterCardHtml(settings)}
    ${renderPauseAndDiscoverableHtml(isEnabled, meshDiscoverable)}
    ${renderQuotaAndLimitFieldsHtml(settings)}
    ${renderParticipationLayers(settings, customSignalingUrl)}
    <div class="form-group" style="display:flex; align-items:center; gap:0.6rem;">
      <input type="checkbox" id="net-webrtc" ${settings?.webrtcEnabled !== false ? "checked" : ""} style="width:1rem; height:1rem;" />
      <label for="net-webrtc" style="margin:0;">Conectar diretamente a outros aparelhos</label>
    </div>
    ${renderTurnOnlyHtml(settings)}`;
}
