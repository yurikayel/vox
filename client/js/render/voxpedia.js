/** @file Voxpedia — documentação em camadas (PT-BR). */
import { escapeHtml } from "./util.js";

/** URLs públicas — specs e runbooks vivem no GitHub (fonte, não helpdesk). */
export const VOX_GITHUB_DOCS = {
  repo: "https://github.com/yurikayel/vox",
  docsIndex: "https://github.com/yurikayel/vox/tree/main/docs",
  docsReadme: "https://github.com/yurikayel/vox/blob/main/docs/README.md",
  features: "https://github.com/yurikayel/vox/blob/main/docs/FEATURES.md",
  devGuide: "https://github.com/yurikayel/vox/blob/main/client/DEV.md",
  garantiaDaPraca: "https://github.com/yurikayel/vox/blob/main/docs/product/garantia-da-praca-pm104.md",
};

/**
 * Lateral com links para a documentação no GitHub.
 *
 * @returns {string}
 */
function renderGithubDocsAside() {
  const { docsReadme, devGuide, docsIndex } = VOX_GITHUB_DOCS;
  return `
    <aside class="voxpedia-docs-github card" id="voxpedia-docs-github" aria-labelledby="voxpedia-docs-github-title">
      <p class="section-title" id="voxpedia-docs-github-title">Docs técnicas</p>
      <p class="desc voxpedia-docs-github-lead">
        Código, specs e runbooks ficam no repositório público — auditável e mantido pela comunidade de contribuidores.
        A Voxpedia explica o app; o GitHub é a fonte para quem desenvolve ou revisa.
      </p>
      <p class="voxpedia-docs-github-links">
        <a class="voxpedia-gh-link" href="${docsReadme}" target="_blank" rel="noopener noreferrer">Documentação técnica (GitHub)</a>
        · <a class="voxpedia-gh-link" href="${devGuide}" target="_blank" rel="noopener noreferrer">Guia DEV</a>
        · <a class="voxpedia-gh-link" href="${docsIndex}" target="_blank" rel="noopener noreferrer">Índice docs/</a>
      </p>
    </aside>`;
}

/**
 * Camada expansível da Voxpédia.
 *
 * @param {string} summary
 * @param {string} bodyHtml
 * @param {string} [extraClass=""]
 * @returns {string}
 */
function layer(summary, bodyHtml, extraClass = "") {
  const cls = extraClass ? `voxpedia-layer ${extraClass}` : "voxpedia-layer";
  return `<details class="${cls}"><summary>${escapeHtml(summary)}</summary><div class="voxpedia-layer-body">${bodyHtml}</div></details>`;
}

const SECTION_ORDER = [
  "voxpedia-comecar",
  "voxpedia-mensagens",
  "voxpedia-comunidades",
  "voxpedia-rede",
  "voxpedia-privacidade",
  "voxpedia-garantia",
  "voxpedia-tecnico",
];

/**
 * Seção numerada da Voxpédia com suas camadas.
 *
 * @param {string} id
 * @param {string} title
 * @param {string} lead
 * @param {string} layersHtml
 * @returns {string}
 */
function section(id, title, lead, layersHtml) {
  const n = String(SECTION_ORDER.indexOf(id) + 1).padStart(2, "0");
  return `
    <section class="voxpedia-section card agora-entry" id="${id}" aria-labelledby="${id}-title">
      <header class="agora-entry-head">
        <span class="agora-entry-num">${n}</span>
        <h2 id="${id}-title" class="agora-entry-title">${escapeHtml(title)}</h2>
      </header>
      <p class="desc voxpedia-lead">${lead}</p>
      ${layersHtml}
    </section>`;
}

const TRES_LOGICAS_BODY = [
  "<p><strong>Big Tech = fazenda.</strong> A terra é de outro. Você planta audiência; o dono leiloa atenção, muda a cerca e pode despejar a conta. Alcance vira aluguel.</p>",
  "<p><strong>Fediverso clássico = pensão.</strong> Instância Mastodon ou Lemmy tem síndico: alguém paga o VPS, modera e não falir. A soberania do coletivo cabe no humor — e no boleto — de quem opera o servidor.</p>",
  "<p><strong>Vox = movimento.</strong> O bem comum é o cliente no aparelho mais o protocolo. O que é inalienável é a <strong>chave no bolso</strong>, não um slogan de rede indestrutível. Gateways e relays são leitura reserva e vizinhos voluntários.</p>",
  "<p>Não prometemos malha só entre celulares no 4G, nem imunidade na Justiça, nem que derrubar um endereço da web equivale a tomar cada aparelho (o inverso também é falso: backup, índice e o próprio aparelho ainda importam). POSSE ecoa o que você escolhe compartilhar — <strong>não</strong> publica sozinho no Facebook ou Instagram.</p>",
].join("");

const PR_CIVICO_BODY = [
  "<p>Na aba <strong>Governança</strong> você abre uma proposta (<code>governance-proposal</code>) com texto e, se quiser, um <strong>diff</strong> unificado — o mesmo espírito de um pull request: o que muda nas regras fica visível antes de valer.</p>",
  "<p>Membros votam <strong>sim</strong>, <strong>não</strong> ou <strong>abstenção</strong> (1 membro = 1 voto). Só entra na apuração quem já era membro quando a proposta nasceu: <code>Eligibility-Cutoff</code> = <code>Proposal-Created-At</code> (já no cliente; não é um segundo sistema de corte).</p>",
  "<p>O alvo é a <strong>regra daquela comunidade</strong> — não um programa municipal, não uma carta de federação, não quórum territorial de bairro até o país.</p>",
].join("");

/**
 * Camada sobre as três lógicas.
 *
 * @returns {string}
 */
function layerTresLogicas() {
  return layer("Três lógicas: fazenda, pensão, movimento", TRES_LOGICAS_BODY);
}

/**
 * Camada sobre o pull request cívico.
 *
 * @returns {string}
 */
function layerPrCivico() {
  return layer("Pull request cívico (regras da comunidade)", PR_CIVICO_BODY);
}

/**
 * Camada sobre conta e carteira.
 *
 * @returns {string}
 */
function layerContaCarteira() {
  return layer(
    "Conta, carteira e identidade",
    `<p>Sem login corporativo: sua conta local usa um identificador <code>vx_…</code> nascido de uma semente no aparelho. A <a href="#/wallet">Carteira</a> guarda chaves e habilita <strong>leitura</strong> de registros públicos; <strong>gravação no Arweave está pausada</strong> por padrão (<code>arweaveUpload: false</code> — ver <a href="${VOX_GITHUB_DOCS.features}" target="_blank" rel="noopener noreferrer">FEATURES</a>), com circulação pela rede de seguidores.</p>
    ${layer("Handles @nome", `<p>Handles legíveis (ex.: <code>@helena</code>) são atributos locais e links <code>#/h/nome</code> ou <code>?h=nome</code>. A resolução depende do que você e seus contatos já viram ou indexaram — sem registro central.</p>`)}
    ${layer("Perfil e Pix", `<p>Em <a href="#/perfil">Perfil</a> você edita nome, bio e pode opcionalmente exibir chave Pix para apoio direto entre pessoas — o Vox não processa pagamentos.</p>`)}`
  );
}

/**
 * Camada sobre saída soberana e frase de recuperação.
 *
 * @returns {string}
 */
function layerSaidaSoberana() {
  const frase = layer("Frase de recuperação 12/24 palavras", `<p>Em <a href="#/frase">#/frase</a> você acessa a semente BIP-39 em português (12 palavras para contas novas, 24 para legadas). Permite imprimir cartão sem QR, conferir 3 palavras e restaurar a conta sem rede ou servidor.</p>`);
  const guardioes = layer("Guardiões 3-de-5 e devolução", `<p>Em <a href="#/guardioes">#/guardioes</a> você divide a semente com Shamir GF(256) entre 5 contatos mútuos. Para recuperar em <a href="#/voltar">#/voltar</a>, bastam 3 partes com código de 4 palavras conferido por voz ou pessoalmente; permite trocar ou remover guardiões.</p>`);
  const cofre = layer("Cofre v2 por senha e cofre na malha", `<p>Cofre cifrado em <a href="#/backup">#/backup</a> e <a href="#/sync">#/sync</a> com kit enviado por <code>mailto:</code> ao próprio e-mail (que não sai em claro) e proteção anti-rollback. Com o cofre na malha (ADR-037), cópias cifradas ficam em laços mútuos com pedido cego no relay e espera de 24h ou aprovação 'Fui eu' / veto 'Não fui eu'.</p>`);
  return layer("Entrada e saída soberana (frase, guardiões, cofre)", `<p>Sua identidade é sua: sem servidores corporativos, você escolhe como proteger e restaurar sua conta.</p>${frase}${guardioes}${cofre}`);
}

/**
 * Camada sobre os feeds.
 *
 * @returns {string}
 */
function layerFeeds() {
  return layer(
    "Feeds Para você e Seguindo",
    `<p>No menu lateral, alterne <strong>Para você</strong> e <strong>Seguindo</strong>. Seguindo mostra autores marcados; Para você traz descoberta recente sem leilão de ads.</p>
    ${layer("Transparência do feed (sem ranking, sem boost)", `<p>O feed é transparente: sem ranking algorítmico de retenção e sem boost pago. A listagem segue o horário de assinatura.</p>`)}
    ${layer("POSSE: O Zap continua existindo", `<p>Publique no Vox como fonte soberana e compartilhe o resumo no WhatsApp ou redes (POSSE). O Vox guarda o original; o Zap continua seu canal de conversa. POSSE <strong>não</strong> publica sozinho no Facebook ou Instagram — você escolhe onde ecoar.</p>`)}
    ${layer("Modo demonstração", `<p>O Vox <strong>nunca</strong> inventa conteúdo quando a rede falha: sem conexão, exibe aviso honesto. Para conhecer o app sem rede, ligue o <strong>modo demonstração</strong> em <em>Sua rede</em> (27 perfis fictícios por UF, com faixa no topo).</p>`)}`
  );
}

/**
 * Seção Começar.
 *
 * @returns {string}
 */
function renderComecar() {
  const stepsLayer = layer(
    "Primeiros passos no app",
    `<ol class="voxpedia-steps">
      <li>Abra o Vox no navegador (funciona como app instalável — PWA).</li>
      <li>Na entrada, informe nome, e-mail e senha para gerar seu kit de volta ao próprio e-mail, ou entre só com nome.</li>
      <li>Leia o <strong>Pacto Vox</strong>: por padrão você atua como nó leve; pode pausar em <a href="#/settings/network">Sua rede</a>.</li>
      <li>Use <strong>Início</strong> para ver posts; <strong>Postar</strong> para publicar.</li>
    </ol>`
  );
  const layers = `${stepsLayer}\n${layerTresLogicas()}\n${layerContaCarteira()}\n${layerSaidaSoberana()}\n${layerFeeds()}`;
  return section(
    "voxpedia-comecar",
    "Começar",
    "Vox é uma rede comunitária aberta: você lê, posta e conversa sem depender de servidores de big techs, com soberania de chaves no aparelho e preservação colaborativa.",
    layers
  );
}

/**
 * Seção Mensagens.
 *
 * @returns {string}
 */
function renderMensagens() {
  const layers = `
    ${layer("O que são mensagens no Vox", `<p><a href="#/dm">Mensagens</a> são conversas privadas entre identificadores <code>vx_…</code> com criptografia ponta a ponta e entrega cooperativa P2P/WebRTC quando ambos estão online.</p>`)}
    ${layer("Como iniciar uma conversa", `<ol class="voxpedia-steps">
        <li>Abra o perfil da pessoa ou use <a href="#/people">Pessoas</a>.</li>
        <li>Toque em <strong>Mensagem</strong> ou acesse <code>#/dm/&lt;endereço&gt;</code>.</li>
        <li>Links <code>#/connect/vx_…</code> permitem prévia antes de adicionar aos contatos.</li>
      </ol>`)}
    ${layer("O que fica no aparelho", `<p>Mensagens e chaves ficam no <strong>IndexedDB</strong> deste navegador. A caixa de saída reenvia mensagens pendentes enquanto o app está aberto; limpar dados apaga o histórico local.</p>`)}`;
  return section(
    "voxpedia-mensagens",
    "Mensagens",
    "Direct messages honestas: criptografia ponta a ponta, armazenamento local e entrega direta cooperativa.",
    layers
  );
}

/**
 * Camada sobre modo canal e quadros.
 *
 * @returns {string}
 */
function layerModoCanalEFrames() {
  const canal = layer("Modo canal (postingMode: \"mods\")", `<p>Comunidades podem ativar o modo canal (<code>postingMode: "mods"</code>): somente moderadores publicam tópicos no feed principal, enquanto todos os membros comentam nas respostas. A regra é checada pelo cliente de cada participante.</p>`);
  const frames = layer("Open Frames locais assinados", `<p>Em <code>#/labs/frames</code> e no feed, suporta mini-apps assinados (enquetes, petições e formulários) executados em sandbox com allowlist local estrita, sem executar código remoto arbitrário.</p>`);
  return `${canal}${frames}`;
}

/**
 * Camada sobre moderação e proteções.
 *
 * @returns {string}
 */
function layerModeracaoProtecoes() {
  const mod = layer("Moderação comunitária e denúncias", `<p>Moderadores assinam ações <code>mod-action</code> (fixar, trancar, ocultar). Denúncias vão por DM cifrada à moderação com quarentena preventiva de 48h sem tribunal central; mediação disponível no menu do post.</p>`);
  const quarentena = layer("Quarentena de chave nova (PoW 14 bits)", `<p>Comunidades podem exigir quarentena para novas identidades: publicações de chaves vistas há menos de 24h ficam recolhidas no feed até resolver um Proof-of-Work leve de 14 bits (~1s no aparelho) ou liberação pela moderação.</p>`);
  return `${mod}${quarentena}`;
}

/**
 * Seção Comunidades.
 *
 * @returns {string}
 */
function renderComunidades() {
  const layers = `
    ${layer("Entrar e navegar", `<p>Em <a href="#/communities">Comunidades</a> você vê espaços públicos temáticos com abas <strong>Posts</strong>, <strong>Feira</strong> e <strong>Governança</strong>.</p>`)}
    ${layerPrCivico()}
    ${layer("Publicar e responder", `<ol class="voxpedia-steps">
        <li>Crie comunidade em <code>#/compose/community</code> (índice local e malha).</li>
        <li>Publique tópicos em <strong>Postar</strong> ou <code>#/compose/topic?c=…</code>.</li>
        <li>Respostas inline no feed; compartilhar gera link <code>#/t/&lt;id&gt;</code>.</li>
      </ol>`)}
    ${layerModoCanalEFrames()}
    ${layerModeracaoProtecoes()}`;
  return section(
    "voxpedia-comunidades",
    "Comunidades",
    "Espaços temáticos descentralizados: tópicos públicos, propostas de governança com diff, modo canal e moderação comunitária segura.",
    layers
  );
}

/**
 * Camada sobre a sinalização híbrida.
 *
 * @returns {string}
 */
function layerSinalizacaoHibrida() {
  return layer(
    "Sinalização híbrida WebSocket + Nostr efêmero (REV-09)",
    `<p>Para estabelecer conexões WebRTC sem servidor central único, o Vox usa sinalização híbrida combinando WebSocket (servidor de apoio ou steward) com relays Nostr efêmeros (eventos tipo 25050, cifrados e sem persistência). O app usa reconexão automática com espera progressiva e alterna relays do pool em falhas.</p>`
  );
}

/**
 * Seção Rede.
 *
 * @returns {string}
 */
function renderRede() {
  const layers = `
    ${layer("Pacto e nó leve", `<p>Ao concordar com o Pacto, você atua como <strong>nó leve</strong>: repassa trechos em cache para vizinhos com tetos de banda e disco. Pause em <a href="#/settings/network">Sua rede</a> quando quiser.</p>`)}
    ${layer("Camadas Passivo → Steward", `<p>Passivo: pausado. Ativo: padrão. Apoiador: nó com 512 MB a 1 GB de cache no Wi-Fi. Steward: relay desktop (<code>vox/relay/server.py</code>) ou sinalização customizada.</p>
      ${layer("Pacotes WANT / BLOB", `<p>Pares trocam pedidos <code>WANT</code> e respostas <code>BLOB</code> no canal <code>vox-peer-v0</code>, priorizando cache local e malha P2P antes de gateways.</p>`)}`)}
    ${layerSinalizacaoHibrida()}
    ${layer("Chip “Rede ativa” na barra lateral", `<p>Indica nós WebRTC conectados e itens servidos, com atalho direto para os ajustes de rede.</p>`)}`;
  return section(
    "voxpedia-rede",
    "Rede cooperativa",
    "Descentralização real: dados guardados no aparelho, malha colaborativa entre pares e sinalização resiliente.",
    layers
  );
}

/**
 * Seção Privacidade.
 *
 * @returns {string}
 */
function renderPrivacidade() {
  const layers = `
    ${layer("O que é público", `<p>Posts públicos assinados circulam na malha e podem ser lidos via gateways. A gravação no Arweave está pausada por padrão (<code>arweaveUpload: false</code>); não publique segredos em posts abertos.</p>`)}
    ${layer("O que fica local", `<p>Chaves privadas (JWK), rascunhos, cache IndexedDB, listas de bloqueio, handles locais e preferências de rede ficam exclusivamente neste aparelho.</p>`)}
    ${layer("Assinaturas e integridade sigv: 2", `<p>Publicações, moderações e envelopes usam assinatura ECDSA P-256 com especificação estrita <code>sigv: 2</code>, impedindo manipulações e garantindo auditoria descentralizada.</p>`)}
    ${layer("Bloquear, silenciar e exportar", `<p>Em Sua rede você exporta/importa listas de moderação e baixa seus posts em JSON. Exclusão de dados no site (<code>data-deletion.html</code>) limpa registros locais, mas não apaga mensagens já propagadas a terceiros.</p>`)}`;
  return section(
    "voxpedia-privacidade",
    "Privacidade & dados",
    "Transparência técnica: soberania sobre dados locais, assinaturas criptográficas estritas e controle de exposição.",
    layers
  );
}

const GARANTIA_DRAFT_BANNER =
  "Rascunho pré-REV-12 — texto informativo, não substitui revisão jurídica";

const GARANTIA_NINGUEM_PODE = [
  ["Apagar dados em aparelhos alheios", "publicações já replicadas em seguidores ou espelhos não são destruídas remotamente por um único servidor."],
  ["Falsificar posts ou votos em seu nome", "toda publicação e ação comunitária leva assinatura local ECDSA P-256 (sigv: 2)."],
  ["Ler DMs cifradas ponta a ponta", "mensagens diretas usam ECDH P-256 + AES-GCM-256; relay comunitário só guarda caixa postal cega temporária (TTL máx. 72 h)."],
  ["Trancar você fora do protocolo", "o código é livre sob GNU AGPLv3; qualquer pessoa ou comunidade pode subir seu próprio espelho, relay ou nó."],
];

const GARANTIA_NIVEIS = [
  ["Você (no aparelho)", "oculta posts, silencia/bloqueia localmente, pausa o cache P2P em #/settings/network, exporta backup assinado e HTML offline (EXP-04) e configura frase (12/24 palavras), cofre por senha e cofre na malha (ADR-037). Encerramento por lápide assinada (PM-101) e cartão de recuperação (PM-13) são planejados."],
  ["Moderadores da comunidade", "assinam ações públicas (mod-action) só naquela comunidade, podem ativar modo Canal (PM-81) e recebem denúncias por DM cifrada com revisão em 48 h (PM-69). Não apagam sua chave nem leem DMs com terceiros."],
  ["Instância PWA oficial (vox-app)", "prevê futura lista assinada de ocultação (hide-list, LAN-13, portão G2) apenas para conteúdo grave ou ordem judicial específica, com recurso público. Vale só na exibição da instância oficial e não apaga cópias de terceiros."],
];

const GARANTIA_LIMITES = [
  ["Sem recuperação central de senha", "se perder o aparelho sem frase, cofre v2, cofre na malha ou guardiões, ninguém recupera sua conta."],
  ["Visibilidade de IP no WebRTC", "conexões P2P diretas trocam IPs entre pares; o ajuste \"Esconder meu IP\" (só-TURN, LAN-19) ainda não tem efeito prático sem servidor TURN público configurado (REV-10 pendente)."],
  ["Cópias já baixadas não somem à força", "ocultar na instância oficial ou excluir localmente não remove cópias já baixadas por outros aparelhos."],
  ["Arweave pausado (arweaveUpload: false)", "nada é gravado automaticamente em blockchain ou Arweave hoje; a circulação ocorre pela rede de seguidores e nós opcionais (Vox Populi / Vox Memoria)."],
  ["Prontidão Fria", "o Vox ainda não abriu ao público geral nem iniciou o piloto humano (V-P09); a abertura (G3) depende de parecer jurídico (REV-12), plantão de conteúdo grave (LAN-04) e descentralização operacional (LAN-30)."],
];

/**
 * Lista de itens termo-descrição com escape seguro.
 *
 * @param {Array<[string, string]>} items
 * @returns {string}
 */
function renderTermList(items) {
  const lis = items.map(([term, desc]) =>
    `<li><strong>${escapeHtml(term)}:</strong> ${escapeHtml(desc)}</li>`
  ).join("");
  return `<ul class="voxpedia-steps">${lis}</ul>`;
}

/**
 * Seção Garantia da Praça (espelho curto PM-104, pré-REV-12).
 *
 * @returns {string}
 */
function renderGarantiaDaPraca() {
  const banner = `<p class="desc voxpedia-draft-banner" role="note"><strong>${escapeHtml(GARANTIA_DRAFT_BANNER)}</strong></p>`;
  const docLink = `<p class="desc">Leia o documento completo no repositório: <a class="voxpedia-gh-link" href="${escapeHtml(VOX_GITHUB_DOCS.garantiaDaPraca)}" target="_blank" rel="noopener noreferrer">Garantia da Praça — PM-104 (GitHub)</a>.</p>`;
  const layers = [
    banner,
    layer("O que ninguém pode fazer com sua conta", renderTermList(GARANTIA_NINGUEM_PODE)),
    layer("O que cada nível pode fazer", renderTermList(GARANTIA_NIVEIS)),
    layer("Limites reais (o que o Vox não promete)", renderTermList(GARANTIA_LIMITES)),
    docLink,
  ].join("\n");
  return section(
    "voxpedia-garantia",
    "Garantia da Praça (PM-104)",
    "Espelho curto dos compromissos técnicos e limites reais do Vox hoje — sem promessas mágicas e sujeito à revisão jurídica do REV-12.",
    layers
  );
}

/**
 * Camada sobre leitura e publicação.
 *
 * @returns {string}
 */
function layerLeituraPublicacao() {
  return layer(
    "Leitura e publicação",
    `<p>Consultas GraphQL em <code>graphql.js</code> contra múltiplos gateways. Tags assinadas com <code>sigv: 2</code>; gravação Arweave pausada por padrão (<code>arweaveUpload: false</code>). Cache em <code>cache-node.js</code>; malha em <code>peers.js</code> e <code>webrtc-peer.js</code>.</p>
    ${layer("Gossip e retratação", `<p>Ofertas e retratações assinadas (<code>GOSSIP_UPDATE</code> / <code>GOSSIP_DELETE</code>) atualizam status local com selo <strong>Editado</strong> ou tombstone.</p>`)}`
  );
}

/**
 * Camada sobre testes e lançamento.
 *
 * @returns {string}
 */
function layerTestesRelease() {
  return layer(
    "Testes e release",
    `<p>Na raiz do repo: <code>npm test</code> (testes unitários e de integração). Após merge em <code>main</code>, deploy estático; novo <code>CACHE_NAME</code> atualiza o Service Worker.</p>
    ${layer("Docs no repositório", `<ul class="voxpedia-steps">
        <li><a href="${VOX_GITHUB_DOCS.devGuide}" target="_blank" rel="noopener noreferrer">client/DEV.md</a> — guia de desenvolvimento e fluxos</li>
        <li><a href="#/labs/frames">Open Frames (lab)</a> · <a href="#/dungeon">Mesa TTRPG (lab)</a> · <a href="#/status">Status da malha</a></li>
        <li><a href="${VOX_GITHUB_DOCS.docsReadme}" target="_blank" rel="noopener noreferrer">docs/README.md</a> — índice das trilhas de arquitetura</li>
        <li><a href="${VOX_GITHUB_DOCS.repo}" target="_blank" rel="noopener noreferrer">Repositório yurikayel/vox</a></li>
      </ul>
      <p class="desc">Ver também o bloco <a href="#voxpedia-docs-github">Docs técnicas</a> no topo desta página.</p>`)}`
  );
}

/**
 * Seção Técnico.
 *
 * @returns {string}
 */
function renderTecnico() {
  const stackLayer = layer(
    "Stack do cliente",
    `<p>PWA vanilla em módulos ES sem bundler. Entrada em <code>client/js/app.js</code>; roteamento hash em <code>route-parse.js</code>; render modular em <code>client/js/render/</code>; service worker em <code>client/sw.js</code> para shell offline.</p>`
  );
  const layers = `${stackLayer}\n${layerLeituraPublicacao()}\n${layerTestesRelease()}`;
  return section(
    "voxpedia-tecnico",
    "Para curiosos (técnico)",
    "Ponteiros para ler código, protocolos e specs — sem promessas que não existam no código real.",
    layers
  );
}

/**
 * Cabeçalho da Voxpédia.
 *
 * @returns {string}
 */
function renderVoxpediaHero() {
  return `<header class="voxpedia-hero agora-codex-hero">
    <h1>Voxpedia</h1>
    <p class="agora-codex-subtitle">Glossário cívico &amp; técnico</p>
    <p class="desc voxpedia-hero-lead">
      <strong>Vox</strong> é uma rede social comunitária cooperativa: posts e comunidades preservados pela rede de seguidores e leitura de registros públicos,
      mensagens privadas cifradas e uma malha que ajuda a carregar conteúdo entre aparelhos.
      <strong>Voxpedia</strong> explica como isso funciona — comece pelo resumo e abra as camadas quando quiser detalhe.
      Testando o app? Siga o <a href="#/ajuda/teste">roteiro de teste (~15 min)</a>.
    </p>
  </header>`;
}

const TOC_ITEMS = [
  ["#voxpedia-comecar", "Começar"],
  ["#voxpedia-mensagens", "Mensagens"],
  ["#voxpedia-comunidades", "Comunidades"],
  ["#voxpedia-rede", "Rede cooperativa"],
  ["#voxpedia-privacidade", "Privacidade & dados"],
  ["#voxpedia-garantia", "Garantia da Praça"],
  ["#voxpedia-tecnico", "Para curiosos (técnico)"],
  ["#/ajuda/teste", "Roteiro de teste"],
];

/**
 * Índice da Voxpédia.
 *
 * @returns {string}
 */
function renderVoxpediaToc() {
  const items = TOC_ITEMS.map(([href, label]) => `
      <li><a href="${href}">${escapeHtml(label)}</a></li>`).join("");
  return `<nav class="voxpedia-toc card agora-codex-toc" aria-label="Índice da Voxpedia">
    <p class="agora-codex-toc-title">Tópicos do cânone</p>
    <p class="section-title">Nesta página</p>
    <ul class="voxpedia-toc-list">${items}
    </ul>
  </nav>`;
}

/**
 * HTML da página Voxpedia (Stitch tela 13: códex com índice lateral). O título vem antes do índice:
 * no celular a coluna lateral fica em cima, e a página abria pelo índice, sem dizer onde a pessoa estava.
 * @returns {string} HTML da página.
 */
export function renderVoxpedia() {
  return `
    <article class="voxpedia-page agora-codex">
      ${renderVoxpediaHero()}
      <aside class="agora-codex-aside">
        ${renderVoxpediaToc()}
        ${renderGithubDocsAside()}
      </aside>
      <div class="agora-codex-main">
        ${renderComecar()}
        ${renderMensagens()}
        ${renderComunidades()}
        ${renderRede()}
        ${renderPrivacidade()}
        ${renderGarantiaDaPraca()}
        ${renderTecnico()}
        <footer class="voxpedia-footer card">
          <p class="desc">
            <a class="voxpedia-gh-link" href="${VOX_GITHUB_DOCS.docsReadme}" target="_blank" rel="noopener noreferrer">Documentação técnica (GitHub)</a>
            · <a href="download.html">Baixar Aplicativos (Desktop & Android)</a>
            · <a href="revolucao.html">Revolução & Soberania Popular</a>
            — código, specs e runbooks; o repositório é a fonte, não um helpdesk.
          </p>
        </footer>
      </div>
    </article>`;
}
