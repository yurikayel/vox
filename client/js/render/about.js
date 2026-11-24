/**
 * @file Página `#/sobre` — licença AGPL-3.0-or-later, código-fonte, privacidade e canal DPO/não-usuário (`LAN-03`).
 *
 * Módulo puro e carregado sob demanda via `import()` em `app/route.js` (0 byte no precache inicial).
 *
 * @module render/about
 */
import { escapeHtml } from "./util.js";

/** Identificador SPDX da licença do Vox. @type {string} */
export const VOX_LICENSE_ID = "AGPL-3.0-or-later";

/** URL canônica do código-fonte do Vox. @type {string} */
export const VOX_SOURCE_REPO_URL = "https://github.com/yurikayel/vox";

/** Caminho relativo da página estática da proposta do Vox. @type {string} */
export const VOX_PROPOSAL_URL = "./proposta-vox.html";

/** Caminho relativo da Política de Privacidade. @type {string} */
export const VOX_PRIVACY_URL = "./privacy.html";

/** URL do canal de pedidos do encarregado (DPO) e de não-usuários (LGPD). @type {string} */
export const VOX_DPO_ISSUE_URL = "https://github.com/yurikayel/vox/issues/new?template=denuncia-nao-usuario.yml";

/**
 * Cabeçalho da página Sobre & DPO.
 *
 * @returns {string}
 */
function renderAboutHero() {
  return `
      <header class="voxpedia-hero card">
        <p class="voxpedia-kicker">Sobre &amp; DPO</p>
        <h1>Sobre o Vox &amp; Encarregado (DPO)</h1>
        <p class="desc voxpedia-hero-lead">
          O <strong>Vox</strong> é um cliente web local-first e de código aberto para comunidades.
          Não há cadastro centralizado nem venda de dados: a identidade e o histórico ficam no seu aparelho.
        </p>
      </header>`;
}

/**
 * Seção de licença livre, código-fonte e proposta do projeto.
 *
 * @returns {string}
 */
function renderLicenseSection() {
  return `
      <section class="voxpedia-section card" id="sobre-licenca" aria-labelledby="sobre-licenca-title">
        <h2 id="sobre-licenca-title">Licença livre e código-fonte</h2>
        <p class="desc">
          Distribuído sob a licença <strong><code>${escapeHtml(VOX_LICENSE_ID)}</code></strong>
          (GNU Affero General Public License v3.0 ou posterior). Qualquer pessoa pode auditar, copiar,
          modificar e operar uma instância própria sob os mesmos termos.
        </p>
        <p class="desc">
          <a href="${escapeHtml(VOX_SOURCE_REPO_URL)}" target="_blank" rel="noopener noreferrer">Código-fonte no GitHub</a>
          ·
          <a href="${escapeHtml(VOX_PROPOSAL_URL)}" target="_blank" rel="noopener noreferrer">Proposta do Vox</a>
        </p>
      </section>`;
}

/**
 * Seção de privacidade e canal honesto do encarregado (DPO) / não-usuário.
 *
 * @returns {string}
 */
function renderPrivacyDpoSection() {
  return `
      <section class="voxpedia-section card" id="sobre-dpo" aria-labelledby="sobre-dpo-title">
        <h2 id="sobre-dpo-title">Privacidade e canal do encarregado (DPO)</h2>
        <p class="desc">
          Consulte a <a href="${escapeHtml(VOX_PRIVACY_URL)}" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>
          para ver o que fica no aparelho, o que vai à malha e como remover dados locais.
        </p>
        <p class="desc">
          Pedidos de titulares, encarregado (DPO) ou denúncias de não-usuários (LGPD) podem ser abertos em:
          <a href="${escapeHtml(VOX_DPO_ISSUE_URL)}" target="_blank" rel="noopener noreferrer">Canal DPO / não-usuário no GitHub</a>.
        </p>
        <p class="desc" role="note">
          <strong>Atenção: não envie dados pessoais sensíveis em issue pública</strong>
          (como CPF, RG, telefone, endereço residencial, dados de saúde ou documentos privados).
          Informe apenas o link ou identificador público necessário para localizar o registro.
        </p>
        <p class="meta">
          Transparência de estágio: este canal público cobre a fase atual; um endereço de e-mail dedicado do
          encarregado (DPO) será publicado antes dos marcos G2/G3.
        </p>
      </section>`;
}

/**
 * Renderiza o HTML completo da página `#/sobre` (licença AGPL-3.0-or-later, privacidade e canal DPO).
 *
 * @returns {string} HTML pronto para injeção em `#app-main`.
 */
export function renderAboutPage() {
  return `
    <div class="voxpedia-page about-page">
      ${renderAboutHero()}
      ${renderLicenseSection()}
      ${renderPrivacyDpoSection()}
      <p class="meta"><a class="btn btn-outline" href="#/">Voltar para a Ágora</a></p>
    </div>`;
}
