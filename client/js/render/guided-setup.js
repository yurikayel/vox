/**
 * @file Assistentes em etapas: rede (#/settings/network/guia), Senha Soberana (#/backup) e
 * carteira (#/wallet/guia). Marcação pura; a lógica vive em `app/screens-guided.js`.
 */
import { escapeHtml } from "./util.js";
import { renderSteps, renderReviewList } from "./compose-steps.js";
import { PIX_RECEIVER_NAME_NOTICE_PT } from "../pix-key.js";

function wizardShell({ backHref, kicker, formId, stepsHtml }) {
  return `
    <div class="compose-card agora-composer agora-composer--steps guided-wizard">
      <div class="agora-composer-head">
        <a class="back-link" href="${escapeHtml(backHref)}">← Voltar</a>
        <p class="agora-composer-kicker">${escapeHtml(kicker)}</p>
      </div>
      <form id="${escapeHtml(formId)}" novalidate>${stepsHtml}</form>
    </div>`;
}

/**
 * Escolha de uma etapa em cartões grandes (rádios), como o "O que você vai publicar?" do compositor.
 * Um `<select>` escondia as opções e a explicação de cada uma; aqui tudo fica à vista e cabe no dedo.
 * @param {string} id Id do grupo (o `name` dos rádios é o mesmo); a tela lê o rádio marcado dentro dele.
 * @param {string} legend Pergunta lida pelo leitor de tela (a etapa já mostra o título).
 * @param {Array<{value:string, name:string, desc:string}>} options Opções na ordem de exibição.
 * @param {string} selected Valor marcado ao abrir.
 * @returns {string} HTML do `<fieldset>`.
 */
export function renderChoiceCards(id, legend, options, selected) {
  const cards = options.map((o) => `
        <label class="compose-sphere-card guided-choice-card">
          <input type="radio" name="${escapeHtml(id)}" value="${escapeHtml(o.value)}"${o.value === selected ? " checked" : ""} />
          <span class="compose-sphere-name">${escapeHtml(o.name)}</span>
          <span class="compose-sphere-desc">${escapeHtml(o.desc)}</span>
        </label>`).join("");
  return `<fieldset class="guided-choice" id="${escapeHtml(id)}"><legend class="guided-choice-legend">${escapeHtml(legend)}</legend>${cards}
      </fieldset>`;
}

const CAP_OPTIONS = [50, 100, 150, 200];

function capSelect(current) {
  const opts = CAP_OPTIONS.map((mb) => `<option value="${mb}"${Number(current) === mb ? " selected" : ""}>${mb} MB por dia</option>`).join("");
  return `<select id="net-g-cap" class="form-control">${opts}</select>`;
}

/** Rede: participar → quanto dado → só Wi-Fi → segundo plano → revisar. */
export function renderNetworkWizard(main, settings = {}) {
  const on = settings.enabled !== false;
  const steps = [
    { key: "join", title: "Quer ajudar a rede?", body: `
      <p class="compose-step-lead">Seu aparelho pode guardar e repassar publicações para vizinhos. Sem servidor central, é assim que a rede fica de pé.</p>
      ${renderChoiceCards("net-g-enabled", "Quer ajudar a rede?", [
        { value: "sim", name: "Sim, quero ajudar", desc: "Guarda e repassa publicações para vizinhos, dentro do teto que você escolher." },
        { value: "nao", name: "Agora não", desc: "Só leitura: seu aparelho usa a rede sem repassar nada." },
      ], on ? "sim" : "nao")}` },
    { key: "cap", title: "Quanto de dados por dia?", body: `
      <p class="compose-step-lead">Teto de dados que seu aparelho compartilha por dia. Dá para mudar quando quiser.</p>
      ${capSelect(settings.dailyCapMb || 200)}` },
    { key: "wifi", title: "Só no Wi-Fi?", body: `
      <label class="guided-check"><input type="checkbox" id="net-g-wifi"${settings.wifiOnly !== false ? " checked" : ""} /> Ajudar apenas quando estiver no Wi-Fi</label>
      <p class="compose-step-lead">Recomendado para não gastar seu plano de dados.</p>` },
    { key: "bg", title: "Ajudar em segundo plano?", body: `
      <label class="guided-check"><input type="checkbox" id="net-g-bg"${settings.backgroundRelay ? " checked" : ""} /> Continuar ajudando com o app fechado (respeita Wi-Fi e teto diário)</label>` },
    { key: "review", title: "Revisar", body: renderReviewList([
      { label: "Ajudar a rede", from: "net-g-enabled" },
      { label: "Teto diário", from: "net-g-cap" },
      { label: "Só Wi-Fi", from: "net-g-wifi" },
      { label: "Segundo plano", from: "net-g-bg" },
    ]) },
  ];
  const nav = { backHref: "#/settings/network", submitId: "btn-network-wizard-save", submitLabel: "Salvar configuração" };
  main.innerHTML = wizardShell({ backHref: nav.backHref, kicker: "Configuração guiada da rede", formId: "form-network-wizard", stepsHtml: renderSteps(steps, nav) });
}

/** Senha Soberana: criar → confirmar → testar a memória → salvar o cofre. */
export function renderBackupWizard(main) {
  const steps = [
    { key: "create", title: "Crie sua Senha Soberana", required: ["bk-pass"], requiredMsg: "Use pelo menos 12 caracteres (uma frase de 4 palavras serve).", body: `
      <p class="compose-step-lead">Com ela você recupera sua identidade em outro aparelho. Ninguém consegue recuperá-la por você — guarde num lugar seguro.</p>
      <input type="password" id="bk-pass" class="form-control agora-inscription" minlength="12" required autocomplete="new-password" placeholder="Pelo menos 12 caracteres" aria-label="Senha Soberana" />` },
    { key: "confirm", title: "Digite de novo", required: ["bk-pass2"], requiredMsg: "As senhas não conferem.", body: `
      <input type="password" id="bk-pass2" class="form-control agora-inscription" required autocomplete="new-password" placeholder="Repita a Senha Soberana" aria-label="Confirmar Senha Soberana" />` },
    { key: "test", title: "Teste: você lembra?", required: ["bk-pass3"], requiredMsg: "Não confere — anote a senha antes de continuar.", body: `
      <p class="compose-step-lead">Digite mais uma vez, sem olhar. Se não lembrar agora, não vai lembrar quando precisar.</p>
      <input type="password" id="bk-pass3" class="form-control agora-inscription" required autocomplete="off" placeholder="Senha Soberana" aria-label="Testar Senha Soberana" />` },
    { key: "review", title: "Salvar o cofre", body: `
      <p class="compose-step-lead">Vamos cifrar sua identidade com essa senha e guardar o cofre para que outro aparelho possa restaurá-lo. A senha nunca sai deste aparelho.</p>
      <div class="guided-result" id="bk-result" hidden></div>` },
  ];
  main.innerHTML = wizardShell({
    backHref: "#/perfil",
    kicker: "Backup da identidade",
    formId: "form-backup-wizard",
    stepsHtml: renderSteps(steps, { backHref: "#/perfil", submitId: "btn-backup-wizard-save", submitLabel: "Cifrar e salvar cofre" }),
  });
}

/** Carteira: gerar ou importar → chave → backup → Pix → revisar. */
export function renderWalletWizard(main, { hasWallet = false, pix = "" } = {}) {
  const steps = [
    { key: "mode", title: "Sua carteira", body: `
      <p class="compose-step-lead">A carteira Arweave serve para gravar publicações no permaweb. É opcional.</p>
      ${renderChoiceCards("wg-mode", "Sua carteira", [
        ...(hasWallet ? [{ value: "manter", name: "Manter a atual", desc: "Nada muda: a carteira deste aparelho continua." }] : []),
        { value: "gerar", name: "Gerar uma nova", desc: "Um par de chaves nasce neste aparelho ao concluir." },
        { value: "importar", name: "Importar (JWK)", desc: "Cole o JSON da chave privada de uma carteira que você já tem." },
      ], hasWallet ? "manter" : "gerar")}` },
    { key: "key", title: "A chave", body: `
      <p class="compose-step-lead" data-wg-hint="manter">Nada a fazer: sua carteira atual continua.</p>
      <p class="compose-step-lead" data-wg-hint="gerar">Um par de chaves novo será gerado neste aparelho ao concluir.</p>
      <div data-wg-hint="importar"><label for="wg-jwk" class="agora-field-label">Cole o JSON da chave privada</label>
      <textarea id="wg-jwk" class="form-control agora-inscription agora-diff-input" rows="5" placeholder='{"kty":"RSA","n":"...","e":"AQAB",...}'></textarea></div>` },
    { key: "backup", title: "Faça o backup", body: `
      <p class="compose-step-lead">A chave fica só neste aparelho. Se ele sumir, ela some junto. Crie sua Senha Soberana para poder restaurar.</p>
      <a class="agora-btn agora-btn--secondary" href="#/backup">Criar Senha Soberana</a>` },
    { key: "pix", title: "Chave Pix para apoios (opcional)", body: `
      <input type="text" id="wg-pix" class="form-control agora-inscription" value="${escapeHtml(pix)}" placeholder="E-mail, celular, CPF ou chave aleatória" aria-label="Chave Pix" />
      <p class="desc pix-name-notice" role="note">${escapeHtml(PIX_RECEIVER_NAME_NOTICE_PT)}</p>
      <p class="compose-step-lead">Aparece no seu perfil para apoios diretos. O Vox não processa pagamentos.</p>` },
    { key: "review", title: "Revisar", body: renderReviewList([{ label: "Carteira", from: "wg-mode" }, { label: "Pix", from: "wg-pix", empty: "Sem Pix" }]) },
  ];
  const nav = { backHref: "#/wallet", submitId: "btn-wallet-wizard-save", submitLabel: "Concluir" };
  main.innerHTML = wizardShell({ backHref: nav.backHref, kicker: "Configuração guiada da carteira", formId: "form-wallet-wizard", stepsHtml: renderSteps(steps, nav) });
}
