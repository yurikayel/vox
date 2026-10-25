/** @file Voxpedia — documentação em camadas (PT-BR). */
import { escapeHtml } from "./util.js";

function layer(summary, bodyHtml, extraClass = "") {
  const cls = extraClass ? `voxpedia-layer ${extraClass}` : "voxpedia-layer";
  return `<details class="${cls}"><summary>${escapeHtml(summary)}</summary><div class="voxpedia-layer-body">${bodyHtml}</div></details>`;
}

function section(id, title, lead, layersHtml) {
  return `
    <section class="voxpedia-section card" id="${id}" aria-labelledby="${id}-title">
      <h2 id="${id}-title">${escapeHtml(title)}</h2>
      <p class="desc voxpedia-lead">${lead}</p>
      ${layersHtml}
    </section>`;
}

function renderComecar() {
  const layers = `
    ${layer(
      "Primeiros passos no app",
      `<ol class="voxpedia-steps">
        <li>Abra o Vox no navegador (funciona como app instalável — PWA).</li>
        <li>Na <strong>Porta da Cantina</strong>, aceite entrar; opcionalmente enriqueça o perfil com Google/Meta ou pule.</li>
        <li>Leia o <strong>Pacto Vox</strong>: por padrão você ajuda levemente a malha; pode pausar em <a href="#/settings/network">Sua rede</a>.</li>
        <li>Use <strong>Início</strong> para ver posts; <strong>Postar</strong> para publicar um tópico.</li>
      </ol>`
    )}
    ${layer(
      "Conta, carteira e identidade",
      `<p>Sem login corporativo: sua conta local usa um identificador <code>vx_…</code> no aparelho. Para publicar na rede Arweave, configure uma carteira em <a href="#/wallet">Carteira</a> (gerar ou importar JWK — fica só no navegador).</p>
      ${layer(
        "Handles @nome",
        `<p>Handles legíveis (ex.: <code>@helena</code>) são atributos locais e links <code>#/h/nome</code> ou <code>?h=nome</code>. A resolução depende do que você e seus contatos já viram ou indexaram — não há um “registro central” tipo DNS de rede social fechada.</p>`
      )}
      ${layer(
        "Perfil e Pix",
        `<p>Em <a href="#/perfil">Perfil</a> você edita nome, bio e pode opcionalmente exibir chave Pix para apoio direto entre pessoas — o Vox não processa pagamentos.</p>`
      )}`
    )}
    ${layer(
      "Feeds Para você e Seguindo",
      `<p>No menu lateral (quando você está no Início), alterne <strong>Para você</strong> e <strong>Seguindo</strong>. Seguindo mostra autores que você marcou; Para você mistura descoberta e conteúdo recente do índice.</p>
      ${layer(
        "Modo demonstração",
        `<p>Se gateways Arweave falharem e não houver cache nem par, o app entra em <strong>tour de demonstração</strong> (<code>mock.js</code>) para você explorar telas sem travar — aviso aparece no topo do feed.</p>`
      )}`
    )}`;

  return section(
    "voxpedia-comecar",
    "Começar",
    "Vox é uma rede comunitária aberta: você lê, posta e conversa sem depender de um único servidor de uma big tech. A longo prazo, queremos um lugar onde conversa pública e grupos façam sentido de novo — sem substituir da noite para o dia Instagram ou X, mas oferecendo outro caminho.",
    layers
  );
}

function renderMensagens() {
  const layers = `
    ${layer(
      "O que são mensagens no Vox",
      `<p><a href="#/dm">Mensagens</a> são conversas privadas entre dois identificadores <code>vx_…</code>. O texto é cifrado para o destinatário; entrega pode usar malha P2P/WebRTC quando ambos estão online.</p>`
    )}
    ${layer(
      "Como iniciar uma conversa",
      `<ol class="voxpedia-steps">
        <li>Abra o perfil da pessoa ou use <a href="#/people">Pessoas</a> / contatos.</li>
        <li>Toque em <strong>Mensagem</strong> ou abra <code>#/dm/&lt;endereço&gt;</code>.</li>
        <li>Compartilhe seu link de DM pelo botão de copiar link na lista de mensagens.</li>
      </ol>
      ${layer(
        "Link de conexão #/connect",
        `<p>Links <code>#/connect/vx_…</code> abrem uma prévia para adicionar alguém à sua lista antes de conversar — útil fora do app (WhatsApp, e-mail).</p>`
      )}`
    )}
    ${layer(
      "O que fica no aparelho",
      `<p>Mensagens abertas e metadados ficam no <strong>IndexedDB</strong> deste navegador. Limpar dados do site apaga o histórico local; envelopes ainda podem existir no relay/inbox conforme configuração de rede.</p>`
    )}`;

  return section(
    "voxpedia-mensagens",
    "Mensagens",
    "Direct messages com honestidade: criptografia ponta a ponta no modelo do app, cache local e entrega cooperativa quando possível.",
    layers
  );
}

function renderComunidades() {
  const layers = `
    ${layer(
      "Entrar e navegar",
      `<p>Em <a href="#/communities">Comunidades</a> você vê espaços públicos indexados com tag <code>App-Name: vox-brasil</code>. Dentro de cada uma: abas <strong>Posts</strong>, <strong>Classificados</strong> e <strong>Governança</strong>.</p>`
    )}
    ${layer(
      "Publicar e responder",
      `<ol class="voxpedia-steps">
        <li>Crie comunidade em <code>#/compose/community</code> (requer carteira).</li>
        <li>Novo tópico: <strong>Postar</strong> ou <code>#/compose/topic?c=…</code>.</li>
        <li>Respostas inline no feed do tópico; compartilhar gera link <code>#/t/&lt;id&gt;</code>.</li>
      </ol>`
    )}
    ${layer(
      "Moderação e hashtags",
      `<p>Moderadores da comunidade assinam ações <code>mod-action</code> (ocultar, silenciar). Seu cliente aplica filtros — a transação pública permanece no permaweb, mas você pode não ver conteúdo suprimido.</p>
      ${layer(
        "Classificados e mini-apps",
        `<p>A aba Classificados lista anúncios assinados; o feed suporta <strong>frames</strong> nativos (enquetes, petições) com allowlist local — não são apps arbitrários de terceiros.</p>`
      )}`
    )}`;

  return section(
    "voxpedia-comunidades",
    "Comunidades",
    "Espaços temáticos estilo fórum/Orkut: posts públicos, feira local, propostas de governança e moderação transparente no cliente.",
    layers
  );
}

function renderRede() {
  const layers = `
    ${layer(
      "Pacto e nó leve",
      `<p>Ao concordar com o Pacto, por padrão você atua como <strong>nó leve</strong>: repassa trechos já em cache para outros aparelhos, com tetos de banda e disco. Pause em <a href="#/settings/network">Sua rede</a> para modo somente leitura.</p>`
    )}
    ${layer(
      "Camadas Passivo → Steward",
      `<p>Passivo: pausado. Ativo: padrão. Apoiador: prioriza suas comunidades (<code>commOnly</code>). Steward: relay desktop ou signaling customizado na LAN/VPS.</p>
      ${layer(
        "Relay desktop e signaling",
        `<p>O relay Python (<code>vox/relay/server.py</code>) faz proxy HTTP para gateways; o signaling WebSocket ajuda WebRTC atrás de NAT. Botões “Verificar Relay Desktop” e URLs customizadas ficam em Sua rede.</p>
        ${layer(
          "Pacotes WANT / BLOB",
          `<p>Pares trocam pedidos <code>WANT</code> e respostas <code>BLOB</code> no canal <code>vox-peer-v0</code> — primeiro cache local/P2P, depois gateways GraphQL.</p>`
        )}`
      )}`
    )}
    ${layer(
      "Chip “Rede ativa” na barra lateral",
      `<p>Mostra quantos aparelhos WebRTC estão conectados ou quantos itens você serviu — atalho para ajustes de rede.</p>`
    )}`;

  return section(
    "voxpedia-rede",
    "Rede cooperativa",
    "Descentralização que você sente no bolso: seus dados são seus, e a malha ajuda quem está perto — com limites que você controla.",
    layers
  );
}

function renderPrivacidade() {
  const layers = `
    ${layer(
      "O que é público",
      `<p>Comunidades, tópicos, respostas e ações de moderação assinadas são indexáveis via gateways GraphQL — natureza do permaweb. Não publique segredos em posts públicos.</p>`
    )}
    ${layer(
      "O que fica local",
      `<p>Chaves privadas (JWK), rascunhos, cache IndexedDB, listas de bloqueio/silêncio, handles locais e preferências de rede (<code>localStorage</code> / settings de peers).</p>`
    )}
    ${layer(
      "Bloquear, silenciar e exportar",
      `<p>Em Sua rede você exporta/importa bundle de moderação, desbloqueia autores e restaura tour demo. OAuth Google/Meta enriquece perfil — opcional; política em <code>privacy.html</code> no site.</p>
      ${layer(
        "Exclusão de dados",
        `<p>Página <code>data-deletion.html</code> descreve o que o operador do site pode remover vs. o que já está on-chain. Apagar cache local não apaga transações já propagadas.</p>`
      )}`
    )}`;

  return section(
    "voxpedia-privacidade",
    "Privacidade & dados",
    "Transparência técnica: separar o imutável on-chain do que só este aparelho guarda ou esconde.",
    layers
  );
}

function renderTecnico() {
  const layers = `
    ${layer(
      "Stack do cliente",
      `<p>PWA vanilla ES modules — sem bundler. Entrada <code>client/js/app.js</code>; roteador hash em <code>route-parse.js</code>; render modular em <code>client/js/render/</code>; service worker <code>client/sw.js</code> para shell offline.</p>`
    )}
    ${layer(
      "Leitura e publicação",
      `<p>Consultas GraphQL em <code>graphql.js</code> contra gateways em <code>config/gateways.json</code>. Upload assinado em <code>upload.js</code> com tags Vox. Cache: <code>cache-node.js</code>; malha: <code>peers.js</code>, <code>webrtc-peer.js</code>.</p>
      ${layer(
        "Gossip e retratação",
        `<p>Ofertas assinadas e retratações (<code>GOSSIP_UPDATE</code> / <code>GOSSIP_DELETE</code>) atualizam status local; UI mostra badge <strong>Editado</strong> ou tombstone quando ativado.</p>`
      )}`
    )}
    ${layer(
      "Testes e release",
      `<p>Na raiz do repo: <code>npm test</code> (JS + relay Python). Após merge em <code>main</code>, GitHub Pages publica; usuários precisam de hard refresh para novo <code>CACHE_NAME</code> do SW.</p>
      ${layer(
        "Docs no repositório",
        `<ul class="voxpedia-steps">
          <li><code>client/DEV.md</code> — fluxos de teste manual</li>
          <li><code>docs/ARCHITECTURE.md</code> — visão geral</li>
          <li><code>POSITIONING.md</code> — comparação honesta com outras redes</li>
        </ul>`
      )}`
    )}`;

  return section(
    "voxpedia-tecnico",
    "Para curiosos (técnico)",
    "Ponteiros para quem quer ler código e protocolo — sem prometer features que ainda não existem no build.",
    layers
  );
}

/** @returns {string} HTML da página Voxpedia */
export function renderVoxpedia() {
  return `
    <article class="voxpedia-page">
      <header class="voxpedia-hero card">
        <p class="voxpedia-kicker">Ajuda · documentação viva</p>
        <h1>Voxpedia</h1>
        <p class="desc voxpedia-hero-lead">
          <strong>Vox</strong> é uma rede social comunitária cooperativa: posts e comunidades no permaweb,
          mensagens privadas cifradas e uma malha que ajuda a carregar conteúdo entre aparelhos.
          <strong>Voxpedia</strong> explica como isso funciona — comece pelo resumo e abra as camadas quando quiser detalhe.
        </p>
      </header>
      <nav class="voxpedia-toc card" aria-label="Índice da Voxpedia">
        <p class="section-title">Nesta página</p>
        <ul class="voxpedia-toc-list">
          <li><a href="#voxpedia-comecar">Começar</a></li>
          <li><a href="#voxpedia-mensagens">Mensagens</a></li>
          <li><a href="#voxpedia-comunidades">Comunidades</a></li>
          <li><a href="#voxpedia-rede">Rede cooperativa</a></li>
          <li><a href="#voxpedia-privacidade">Privacidade & dados</a></li>
          <li><a href="#voxpedia-tecnico">Para curiosos (técnico)</a></li>
        </ul>
      </nav>
      ${renderComecar()}
      ${renderMensagens()}
      ${renderComunidades()}
      ${renderRede()}
      ${renderPrivacidade()}
      ${renderTecnico()}
    </article>`;
}
