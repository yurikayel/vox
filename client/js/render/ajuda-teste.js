/** @file #/ajuda/teste — roteiro honesto para testadores (teste aberto). */
import { escapeHtml } from "./util.js";
import { VOX_GITHUB_DOCS } from "./voxpedia.js";

export const VOX_GITHUB_ISSUES = "https://github.com/yurikayel/vox/issues";

const DEMO_COMMUNITY = "demo-aprenda-vox";
const DEMO_FEIRA = "demo-feira-local";

function renderTresLogicasTeste() {
  return `
      <section class="voxpedia-section card" id="teste-tres-logicas" aria-labelledby="teste-tres-logicas-title">
        <h2 id="teste-tres-logicas-title">Fazenda, pensão, movimento</h2>
        <p class="desc">
          Big Tech é <strong>fazenda</strong> (terra de outro). Fediverso clássico é <strong>pensão</strong> (alguém paga o VPS).
          Vox é <strong>movimento</strong>: a chave fica no bolso; gateways são leitura reserva.
          Na aba Governança, mudar regra da comunidade é proposta + diff + voto sim/não/abstenção — não programa municipal nem carta de federação.
          Camadas na <a href="#/voxpedia">Voxpedia</a>.
        </p>
      </section>`;
}

/** @returns {string} HTML da página Teste aberto */
export function renderAjudaTeste() {
  const { docsReadme, devGuide, docsIndex, repo } = VOX_GITHUB_DOCS;
  return `
    <article class="voxpedia-page ajuda-teste-page">
      <header class="voxpedia-hero card">
        <p class="voxpedia-kicker">Ajuda · teste aberto</p>
        <h1>Teste aberto (~15 min)</h1>
        <p class="desc voxpedia-hero-lead">
          Você está ajudando a validar o <strong>Vox</strong> antes de convidar mais gente.
          Não prometemos rede perfeita no celular: gateways públicos, cache local e vizinhos na malha
          se complementam — com transparência.
        </p>
      </header>

      <section class="voxpedia-section card" id="teste-roteiro" aria-labelledby="teste-roteiro-title">
        <h2 id="teste-roteiro-title">O que fazer agora</h2>
        <p class="desc voxpedia-lead">Siga na ordem; anote o que confundir ou quebrar.</p>
        <ol class="voxpedia-steps">
          <li>Entre pelo site (PWA). Na <strong>Porta da Cantina</strong>, aceite entrar — cria sua identidade local <code>vx_…</code> no aparelho.</li>
          <li>Leia e aceite o <strong>Pacto Vox</strong> (ajuda leve à malha). Para pausar depois: <a href="#/settings/network">Sua rede</a> → marque <strong>Pausar ajuda à rede</strong>.</li>
          <li>Entre na comunidade demo <a href="#/c/${escapeHtml(DEMO_COMMUNITY)}">Aprenda Vox</a> ou na praça de teste <a href="#/c/${escapeHtml(DEMO_FEIRA)}?tab=listings">Feira demo</a>.</li>
          <li>Publique <strong>um post</strong> (menu <strong>Postar</strong> ou compositor no Início). Texto curto basta.</li>
          <li>Abra <a href="#/status">Status da malha</a> neste aparelho e veja gateways, relay e versão do cache (Service Worker).</li>
          <li>Encontrou bug ou texto confuso? Abra um issue no <a href="${VOX_GITHUB_ISSUES}" target="_blank" rel="noopener noreferrer">GitHub</a> (screenshot + navegador ajudam).</li>
        </ol>
      </section>

      <section class="voxpedia-section card" id="teste-transparencia-feed" aria-labelledby="teste-transparencia-feed-title">
        <h2 id="teste-transparencia-feed-title">Feed transparente: sem ranking, sem boost</h2>
        <p class="desc">
          O feed do Vox é <strong>sem ranking, sem boost</strong>: não há leilão de anúncios nem algoritmo secreto de retenção.
          A listagem segue o horário de assinatura; a aba Para você pode misturar descoberta recente, sem ads.
        </p>
      </section>

      <section class="voxpedia-section card" id="teste-posse-zap" aria-labelledby="teste-posse-zap-title">
        <h2 id="teste-posse-zap-title">Cidade fantasma? O Zap continua existindo (POSSE)</h2>
        <p class="desc">
          Você não precisa abandonar seus grupos de WhatsApp nem convencer todo mundo a migrar de uma vez.
          O modelo do Vox é <strong>POSSE</strong> (<em>Publish on Own Site, Syndicate Elsewhere</em>):
          você publica primeiro no Vox (onde o texto fica assinado no seu controle e no permaweb) e ecoa o link
          ou resumo diretamente para o WhatsApp, Instagram ou X pelo botão de compartilhar.
          O Vox é a fonte soberana; os grupos de mensagem continuam sendo o canal onde a conversa acontece.
        </p>
      </section>
      ${renderTresLogicasTeste()}
      <section class="voxpedia-section card" id="teste-pacto" aria-labelledby="teste-pacto-title">
        <h2 id="teste-pacto-title">Pacto e opt-out</h2>
        <p class="desc">
          Por padrão você repassa trechos <em>já baixados</em> para outros aparelhos, com tetos de dados e disco.
          Isso não é “virar servidor”: é cooperar quando faz sentido.
          <a href="#/settings/network">Sua rede</a> concentra pausar contribuição, limites e camadas (Passivo → Steward).
        </p>
      </section>

      <section class="voxpedia-section card" id="teste-atualizar" aria-labelledby="teste-atualizar-title">
        <h2 id="teste-atualizar-title">Atualizar o app no navegador</h2>
        <p class="desc">
          Depois de um deploy novo, faça <strong>hard refresh</strong>: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>
          (Windows/Linux) ou equivalente no Mac.
          A “versão” visível é o nome do cache <code>CACHE_NAME</code> do Service Worker — confira em
          <a href="#/status">#/status</a> (deve bater com o release publicado).
        </p>
      </section>

      <section class="voxpedia-section card" id="teste-leitura-reserva" aria-labelledby="teste-leitura-reserva-title">
        <h2 id="teste-leitura-reserva-title">“Leitura reserva” não é culpa sua</h2>
        <p class="desc">
          Se aparecer <strong>Leitura reserva</strong>, os gateways Arweave falharam ou demoraram neste aparelho.
          O app tenta cache local, malha ou relay comunitário — leitura de backup, não sinal de que você “estragou” a rede.
        </p>
      </section>

      <section class="voxpedia-section card" id="teste-relay" aria-labelledby="teste-relay-title">
        <h2 id="teste-relay-title">Relay: você não precisa</h2>
        <p class="desc">
          Testadores <strong>não</strong> precisam instalar relay Python, Docker nem VPS.
          Stewards voluntários fazem isso depois, se a comunidade quiser — veja
          <a href="${docsReadme}" target="_blank" rel="noopener noreferrer">docs no GitHub</a>, não é requisito deste roteiro.
        </p>
      </section>

      <section class="voxpedia-section card" id="teste-privacidade" aria-labelledby="teste-privacidade-title">
        <h2 id="teste-privacidade-title">Privacidade (honesta)</h2>
        <ul class="voxpedia-steps">
          <li>Chaves e histórico ficam no <strong>IndexedDB</strong> deste navegador — sem conta central Vox.</li>
          <li>Posts públicos e comunidades podem ser lidos via gateways (natureza do permaweb).</li>
          <li>Mensagens privadas usam cifra para o destinatário; metadados locais somem se você limpar dados do site.</li>
        </ul>
        <p class="desc">Detalhes: <a href="#/voxpedia">Voxpedia</a> · <a href="./privacy.html" target="_blank" rel="noopener noreferrer">Política de privacidade</a></p>
      </section>

      <section class="voxpedia-section card" id="teste-sair" aria-labelledby="teste-sair-title">
        <h2 id="teste-sair-title">Como sair ou pausar</h2>
        <ol class="voxpedia-steps">
          <li><a href="#/settings/network">Sua rede</a> → <strong>Pausar ajuda à rede</strong> (para de repassar cache).</li>
          <li>No navegador, limpe <strong>dados do site</strong> / cache do Vox (configuração do SO ou do browser) — apaga chaves e histórico local; transações já publicadas no permaweb permanecem indexáveis.</li>
        </ol>
      </section>

      <section class="voxpedia-section card" id="teste-carteira" aria-labelledby="teste-carteira-title">
        <h2 id="teste-carteira-title">Carteira Arweave (opcional no teste)</h2>
        <p class="desc">
          Postar na malha local e no tour demo funciona com a conta <code>vx_…</code>.
          Para arquivar no permaweb permanente, gere ou importe uma carteira em
          <a href="#/wallet">Carteira</a> (JWK só neste aparelho).
        </p>
      </section>

      <section class="voxpedia-section card" id="teste-feira" aria-labelledby="teste-feira-title">
        <h2 id="teste-feira-title">Feira e Pix (piloto)</h2>
        <p class="desc">
          Classificados na <a href="#/c/${escapeHtml(DEMO_FEIRA)}?tab=listings">Feira demo</a>:
          <strong>piloto</strong> — BR Code Pix gerado offline no navegador; o Vox não custodia pagamento nem cobra taxa.
        </p>
      </section>

      <footer class="voxpedia-footer card">
        <p class="desc voxpedia-docs-github-links">
          <a class="voxpedia-gh-link" href="${docsReadme}" target="_blank" rel="noopener noreferrer">Documentação técnica (GitHub)</a>
          · <a class="voxpedia-gh-link" href="${devGuide}" target="_blank" rel="noopener noreferrer">Guia DEV</a>
          · <a class="voxpedia-gh-link" href="${docsIndex}" target="_blank" rel="noopener noreferrer">Índice docs/</a>
          · <a class="voxpedia-gh-link" href="${repo}" target="_blank" rel="noopener noreferrer">Repositório</a>
          · <a class="voxpedia-gh-link" href="${VOX_GITHUB_ISSUES}" target="_blank" rel="noopener noreferrer">Issues / feedback</a>
        </p>
        <p class="desc"><a href="#/voxpedia">← Voxpedia</a> · <a href="#/status">Status</a></p>
      </footer>
    </article>`;
}
