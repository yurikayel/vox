/**
 * @file settings-guardian.js
 * Renderizador de UI para o Modo Guardião / Seeder Mobile (Fase 3.3).
 */
import { escapeHtml } from "./util.js";

function renderGuardianStatusBadge(status) {
  if (!status || !status.enabled) {
    return `<span class="pill" style="font-size:0.75rem; background:var(--surface-soft); color:var(--muted);">Inativo</span>`;
  }
  if (status.permitted) {
    return `<span class="pill" style="font-size:0.75rem; background:rgba(31,168,85,0.15); color:var(--brand-green);">Pronto para Semear 🟢</span>`;
  }
  const labels = {
    not_charging: "Aguardando Carregador ⚡",
    cellular_connection: "Aguardando Wi-Fi 📶",
    low_battery: "Bateria Baixa 🪫",
    disabled: "Pausado",
  };
  const label = labels[status.reason] || "Aguardando Condições";
  return `<span class="pill" style="font-size:0.75rem; background:rgba(245,196,0,0.15); color:var(--warning);">${escapeHtml(label)}</span>`;
}

function renderGuardianOptions(config) {
  return `
    <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem; font-size:0.85rem;">
      <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
        <input type="checkbox" id="chk-guardian-enabled" ${config.enabled ? "checked" : ""}>
        <strong>Ativar Modo Guardião</strong> (compartilha cache P2P)
      </label>
      <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
        <input type="checkbox" id="chk-guardian-wifi" ${config.onlyWifi ? "checked" : ""}>
        Semear apenas quando conectado ao Wi-Fi (poupa dados 4G/5G)
      </label>
      <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
        <input type="checkbox" id="chk-guardian-charging" ${config.onlyCharging ? "checked" : ""}>
        Semear apenas enquanto a bateria estiver carregando na tomada
      </label>
      <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.25rem;">
        <span id="guardian-quota">Cota de cache: <strong>2 GB</strong> (fixa), até 4 GB/dia repassados, só no Wi-Fi e carregando.</span>
      </div>
    </div>`;
}

export function renderGuardianSettingsCard(config, status) {
  const badge = renderGuardianStatusBadge(status);
  const options = renderGuardianOptions(config);

  return `
    <div class="guardian-settings-card card" style="border:1px solid var(--border); border-radius:var(--radius); padding:1rem; margin-top:1rem; background:var(--surface-1);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <div style="font-weight:700; font-size:1rem; display:flex; align-items:center; gap:0.4rem;">
          <span>🛡️ Modo Guardião da Praça</span>
        </div>
        ${badge}
      </div>
      <p style="font-size:0.82rem; color:var(--muted); margin:0.4rem 0 0;">
        Transforme este aparelho em um nó sentinela cívico. Você ajuda a manter posts, fotos e áudios da sua comunidade acessíveis a outros cidadãos sem depender de servidores proprietários.
      </p>
      ${options}
    </div>`;
}
