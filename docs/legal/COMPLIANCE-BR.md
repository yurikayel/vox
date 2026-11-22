# Conformidade — Visão Geral Brasil

> **Status:** canônico (informativo; não é parecer jurídico) · **Owner:** mantenedor · **Revisado:** 2026-11-22  
> **Pré-revisão jurídica (`REV-12` / `LAN-02` / `LAN-03`):** [rascunho de Termos de Uso](./rascunho-termos-de-uso-lan02.md) · [guia de revisão de `privacy.html` e `data-deletion.html`](./revisao-privacy-data-deletion-lan03.md) · [briefing G1](./briefing-parecer-g1.md)

Documento informativo de alto nível. **Não é parecer jurídico.** Produtores de conteúdo, operadores da instância oficial e operadores de espelhos devem aguardar o parecer humano (`REV-12`) e consultar advogados locais.

## LGPD (Lei 13.709/2018)

**Como o Vox funciona (diretriz de nov/2026):**

- Cliente estático: sem cadastro, sem cookies obrigatórios, sem backend Vox coletando dados.
- **Nada é salvo no Arweave por enquanto:** publicações, mídias e ações circulam exclusivamente pela **rede de seguidores** (aparelhos replicando quem seguem). O Arweave fica reservado para leitura pública de registros existentes e eventuais recursos específicos futuros.
- Consultas GraphQL de leitura vão a **terceiros** (gateways Arweave/Turbo); IPs e logs ficam sob política desses operadores.
- Conteúdo eventualmente gravado on-chain no passado ou em recursos futuros específicos é **público e persistente** — titular que publica dados pessoais de terceiros pode incorrer em responsabilidade civil/regulatória.

**Orientações práticas:**

- Minimize dados pessoais mesmo na rede de seguidores; quando o Arweave voltar a ser usado em recursos específicos no futuro, **eliminação técnica plena** na permaweb continuará impossível (mitigação = consentimento expresso + filtros client-side + retração/não replicação nos aparelhos e espelhos).
- Encarregado/DPO: inexistente no projeto open-source sem operador comercial central — quem rodar espelho comercial assume papéis conforme seu modelo de negócio.

## O Pacto Vox: Recursos Compartilhados e LGPD (Fase 3.1)

Na **Fase 3.1**, o Vox adota o modelo contratual transparente **Pacto Vox**:
* **Inversão da lógica extrativista:** Em redes sociais corporativas tradicionais, a infraestrutura é centralizada mas o "preço" é a extração e venda de dados pessoais, metadados comportamentais e direcionamento algorítmico opaco. No Vox, a identidade e os conteúdos pertencem 100% ao usuário (assinados localmente com chave do aparelho P-256 na malha/rede de seguidores; Arweave reservado para recursos específicos futuros).
* **Infraestrutura cooperativa ativa por padrão:** Como contrapartida da soberania, o app opera por padrão como um nó leve de leitura e cache local enquanto aberto, servindo fragmentos públicos a outros clientes na rede sem depender de datacenters corporativos custosos.
* **Bases Legais e Transparência:**
  1. **Ciência Prévia no Onboarding:** Na primeira abertura do app, um modal claro apresenta os termos do pacto antes da navegação continuada.
  2. **Salvaguarda Técnica de Dados:** O nó leve trafega e armazena **estritamente dados públicos** assinados da malha/rede de seguidores (tópicos e respostas comunitárias, ou eventuais registros legados do permaweb). Chaves privadas, dados sensíveis ou históricos pessoais de navegação nunca são compartilhados.
  3. **Direito de Opt-Out Preservado:** O usuário mantém a prerrogativa soberana de pausar a contribuição a qualquer momento através de `#/settings/network` ("Pausar contribuição"), convertendo o cliente para modo passivo.
  4. **Proteção Patrimonial (Banda e Bateria):** Padrão configurado com teto diário de banda (50 MB/dia no Wi-Fi; **no 4G só por opção da pessoa, com teto próprio de 5 MB/dia** — PM-52), limite de armazenamento local (25 MB) e prioridade em conexões Wi-Fi para impedir consumo de dados tarifados 4G/5G.
  5. **Operação em Segundo Plano:** Se habilitada, a atuação via Service Worker exige permissão de notificação explícita do sistema operacional e desativa-se automaticamente fora de redes Wi-Fi ou caso o teto diário seja atingido.

## Mensagens Diretas Efêmeras e Privacidade (Fase 4)

A arquitetura de DMs do Vox é orientada aos princípios de **minimização de dados (Art. 6º, III da LGPD)** e **privacidade desde a concepção (*privacy by design*)**:
1. **Inexistência de DMs no Permaweb:** O projeto proíbe expressamente transações de mensagens privadas on-chain no Arweave. Conversas íntimas nunca são imutabilizadas ou expostas a análises forenses perpétuas.
2. **Criptografia Forte Ponta-a-Ponta:** As mensagens são cifradas nos próprios dispositivos remetente/destinatário via ECDH P-256 e AES-GCM-256. Nenhum intermediário tem acesso à chave de decifração.
3. **Relay Comunitário como Repositório Transitório:** O endpoint `/inbox/:toAddress` opera unicamente como caixa postal cega e temporária para entregas offline. O operador do relay não tem acesso ao conteúdo em texto claro, não mantém backups de conversas e impõe **expiração compulsória em 72 horas (TTL)**, além de expurgo imediato quando o destinatário coleta a mensagem.
4. **Sem Perfilamento Comercial:** Não há mineração de grafo social, leitura de palavras-chave para publicidade direcionada ou retenção compulsória de histórico em nuvens proprietárias. O histórico reside unicamente no armazenamento local do dispositivo do usuário.

## Marco Civil da Internet (Lei 12.965/2014) e Art. 19

O regime de responsabilidade civil de intermediários no Brasil estabelece distinções fundamentais, hoje moduladas pelos **Temas 987 e 533 do STF** (ver quadro na seção seguinte) e pendentes de parecer jurídico (`REV-12`) quanto ao alcance sobre software livre P2P e instância oficial:

* **Repositório aberto vs. instância PWA oficial (`LAN-31`):** o repositório Vox publica código de cliente estático sem banco central de contas ou conteúdo; já a instância PWA oficial (`yurikayel.github.io/vox` e espelho oficial) possui operador identificado no piloto ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)) e governança própria em [GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31), cujo enquadramento como provedor de aplicação está submetido ao `REV-12`.
* **Servidores de Sinalização WebRTC (`signaling.py` — Fase 3.2):** O servidor de sinalização atua como canal transitório e estritamente técnico para o handshake P2P (ofertas SDP e candidatos ICE). Ele não armazena registros de aplicação, não inspeciona payloads e não custodia dados das comunidades, operando sob o princípio da neutralidade de rede (Art. 9º do Marco Civil).
* **Operadores de espelhos e front-ends curados:** Entidades ou indivíduos que hospedarem e disponibilizarem publicamente instâncias ou espelhos com filtros próprios, domínios comerciais ou seleção de conteúdo podem vir a ser enquadrados juridicamente como **provedores de aplicação de internet**.
* **Responsabilidade por conteúdo de terceiros (Art. 19 / Jurisprudência STF):** Caso um operador de espelho receba ordem judicial específica (ou notificação qualificada conforme modulações do STF) para indisponibilizar conteúdo ilícito, a conformidade deve ser realizada na camada de renderização do front-end (suprimindo a exibição das transações em seus índices locais).
* **Nós leves e apoiadores (camadas Passivo / Ativo / Apoiador):** Usuários que apenas leem (Passivo) ou servem cache P2P de **payload já público** no permaweb, dentro dos tetos do Pacto Vox, **não** editam feed alheio nem vendem alcance. Em geral **não** se equiparam a provedor de aplicação centralizado; continuam sujeitos à lei civil se publicarem conteúdo ilícito **como autores**. Ver [docs/strategy/espacos-digitais-infra.md](../strategy/espacos-digitais-infra.md).
* **Stewards de espelho e relay (`vox/relay/`):** Quem opera **publicamente** índice curado (`GET /vox/index/*.json`), espelho multi-comunidade ou front-end com seleção editorial pode ser enquadrado como **provedor de aplicação**. O relay de inbox (`/inbox/:toAddress`) permanece **transitório e cego** (§ DMs acima) — distinto do espelho de conteúdo público.
* **Espelho ≠ apagar on-chain:** Suprimir TX em índice local ou UI **não** remove dados do Arweave; cumpre ordem na **camada que o operador controla** (lista espelhada, HTML servido, filtros `mod-action`).
* Para papéis comunitários, escalonamento e deveres mínimos de stewards, consulte [GOVERNANCE.md](../../GOVERNANCE.md) (§ Papéis de operador de infra voluntária).

## Infraestrutura voluntária (camadas Passivo → Steward)

Norma de produto e implementação: [docs/strategy/espacos-digitais-infra.md](../strategy/espacos-digitais-infra.md). Resumo **jurídico-informativo** para quem escolhe participar da malha:

| Camada | Papel | LGPD / dados | Marco Civil (visão geral) |
|--------|--------|--------------|---------------------------|
| **Passivo** | Só consome; pausa ajuda à rede | Cache mínimo local; sem servir terceiros | Não atua como intermediário de terceiros |
| **Ativo** | Nó leve (Pacto Vox, default-on) | Só replica **dados públicos** já obtidos; opt-out em `#/settings/network` | Canal técnico cooperativo; sem curadoria |
| **Apoiador** | Ativo + escopo `commOnly` às comunidades do usuário | Mesmas salvaguardas do Ativo; não usar escopo para amplificar spam externo | Reforço de vizinhança digital, não plataforma editorial |
| **Steward** | Relay desktop/VPS, espelho, pin documentado | Logs de acesso do **seu** servidor sob **sua** política; DMs permanecem cifradas/TTL | Possível **provedor de aplicação** se índice público curado; Art. 19 na renderização local |

**Orientações práticas para stewards voluntários (PF, coletivo ou PJ):**

1. **Transparência:** publicar URL do relay/espelho, quotas de disco e se aplicam filtros de `mod-action` ou listas locais de TX ocultas.
2. **Ordem judicial / notificação qualificada:** canal de contato (e-mail ou página) para receber pedidos; responder na **camada espelhada** (remover TX do índice JSON, deixar de servir BLOB cacheado) — sem prometer remoção on-chain.
3. **Feira comunitária:** sugerir pin leve a apoiadores/stewards da comunidade é **opcional** (governança suave); **não** condicionar postagem ou visibilidade a contribuição de infra (sem pay-to-win).
4. **Sem ranking público de “bom nó”:** prioridade gossip suave no protocolo **não** cria obrigação legal extra; evita tratar participação como serviço profissional monitorado pelo projeto Vox.
5. **Encarregado/DPO:** o repositório open-source **não** nomeia encarregado central; steward comercial ou que trate dados além do cache público deve avaliar LGPD conforme seu modelo.

Participar como **Ativo/Apoiador** no app **não** transfere ao projeto Vox responsabilidade por cache servido — quem opera o dispositivo ou servidor responde pelos atos que pratica na malha.

## Handles, Propriedade Intelectual e Nomes (@handle — Fase 5)

1. **Natureza Jurídica do Handle:** O identificador `@handle` registrado no protocolo `vox-brasil` é um alias técnico descentralizado para um endereço Arweave. Ele **não** constitui registro de marca no INPI nem nome de domínio no Registro.br.
2. **Inexistência de Tribunal Central:** O software de código aberto Vox não dispõe de autoridade central para cancelar, arbitrar ou transferir slugs entre usuários.
3. **Tratamento de Conflitos e Ambiguidade:** Quando mais de uma conta publica transação para o mesmo slug, o cliente PWA expõe a multiplicidade abertamente aos usuários (sinalização de conflito/ambiguidade), cabendo aos membros avaliarem o histórico de transações e chaves públicas associadas.
4. **Violações Legais Flagrantes:** Casos de estelionato, falsidade ideológica (Art. 299 do Código Penal) ou uso indevido de marcas registradas devem ser tratados no âmbito do Poder Judiciário. Operadores de espelhos que recebam ordens judiciais específicas têm a faculdade técnica de ocultar resoluções de handles em seus front-ends.

## Identidade, Chave Pix (Fase A) e Política Anti-CPF (Fase 5.7)

1. **Chave Pix Declarativa no Perfil (Fase A):**
   * O campo de chave Pix no perfil do Vox é **opcional e puramente declarativo**, destinado a viabilizar apoios comunitários diretos entre pessoas (ex: jornalismo independente, coletivos locais).
   * O Vox **não é instituição de pagamento (IP)** nem instituição financeira regulada pelo Banco Central do Brasil (BCB), não integra o Sistema de Pagamentos Brasileiro (SPB), não processa compensações, não cobra taxas e não custodia valores. Toda e qualquer transferência ocorre estritamente fora do aplicativo, no app bancário ou carteira do próprio usuário.
   * O aplicativo **não valida nem atesta a titularidade civil ou bancária** da chave informada. Os usuários são expressamente alertados a conferir os dados no momento da liquidação bancária em sua instituição de preferência.

2. **Minimização de Dados e Mascaramento de Privacidade (LGPD Art. 6º, III):**
   * Em conformidade com o princípio da segurança e da minimização de riscos, chaves informadas de tipos sensíveis (como CPF ou telefone) são **mascaradas na interface** para terceiros (`***.456.789-**` ou `+55 (11) *****-8901`).
   * A chave declarada reside unicamente no armazenamento local do navegador (`localStorage`) e não é enviada para nenhum servidor central do projeto Vox.

3. **Política Estrita Anti-CPF-Login (Soberania Criptográfica):**
   * O Vox **rejeita e veda expressamente o uso de CPF, e-mail governamental ou dados civis como requisito de autenticação ou login**.
   * A identidade primária do usuário no Vox é soberana, efêmera e criptográfica: ela reside na chave de rota local (`routeId` no formato `vx_...`), gerada em par de chaves assimétricas no próprio navegador do usuário sem intermediários.

4. **Roadmap e Relação com gov.br (Fase D — Documentação Conceitual):**
   * Eventuais integrações futuras de atestação de reputação ou verificação de cidadania (ex: via credenciais verificáveis OpenID Connect gov.br) serão **estritamente opcionais, desacopladas do login e mantidas na Fase D**.
   * Proposta concreta: [ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md). O selo é emitido por parceiro público com domínio oficial, o CPF nunca chega ao Vox (pseudônimo HMAC no parceiro), e cada comunidade decide por governança se exige o selo. Pendente de parecer jurídico.
   * O Vox não condiciona a livre expressão, o compartilhamento comunitário e a participação na rede cooperativa a cadastros governamentais ou vigilância de dados civis.

## Pix Zaps Nativos e BR Code EMV (Fase 6.0)

A implementação do gerador de Pix Copia e Cola offline (`brcode.js`) observa estritamente o marco regulatório do Banco Central do Brasil (BCB):

1. **Ausência de Intermediação e Não-Enquadramento como PSP:**
   * O Vox **não é Prestador de Serviços de Pagamento (PSP)**, nem Instituição de Pagamento (IP) sujeita a autorização nos termos da Lei nº 12.865/2013 e da Resolução BCB nº 1/2020.
   * O aplicativo **não intermedeia**, não processa, não liquida e não custodia moeda fiduciária ou eletrônica em nenhuma hipótese.
   * Não há cobrança de tarifas, comissões percentuais ou retenção temporária de valores (*taxa zero de ponta a ponta*).

2. **Operação 100% Offline no Dispositivo (Client-Side):**
   * Os códigos no padrão BR Code / EMV são montados puramente via script estático no navegador do usuário, com base na chave declarada publicamente pelo autor e no valor escolhido pelo apoiador.
   * Nenhuma requisição de rede ou chamada de API bancária é executada para gerar o código Copia e Cola. O dispositivo do usuário gera a sequência TLV e o checksum CRC16-CCITT de forma totalmente offline.

3. **Liquidação Exclusiva no Sistema Financeiro Oficial:**
   * A transferência efetiva de valores ocorre exclusivamente entre a instituição financeira do pagador e a do recebedor, no âmbito do Sistema de Pagamentos Instantâneos (SPI) do Banco Central do Brasil.
   * O pagador utiliza seu próprio aplicativo bancário homologado para colar o código, autenticar a operação e confirmar o nome do titular recebedor antes de qualquer envio de recursos.

## Conteúdo Político e TSE

A **[Resolução TSE 23.610/2019](http://www.tse.jus.br/)**, alterada pela **Resolução TSE 23.755/2026**, impõe deveres a **plataformas digitais** e participantes no contexto eleitoral brasileiro (rotulagem de conteúdo sintético/IA, vedação de ranqueamento/recomendação ou priorização de candidatos, campanhas ou partidos, e procedimentos de remoção).

- **Postura honesta pendente de parecer (`REV-12`):** embora o projeto seja software livre sem servidor central de conteúdo nem moderação editorial centralizada, **não assumimos imunidade automática**; o eventual enquadramento da instância PWA oficial, de espelhos/relays ou do operador pessoa física ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)) como "plataforma" ou "provedor de aplicação" aguarda parecer jurídico humano (`REV-12`).
- **Mitigação técnica já ativa no cliente (`REV-24`):** o feed principal é estritamente cronológico e sem impulsionamento pago; além disso, `client/js/electoral-period.js` desativa sugestões automáticas de perfis/conteúdos na janela eleitoral brasileira (16/08 a 31/10 de anos pares) ou quando `electoralMode` estiver ativo.
- Usuários que divulgarem conteúdo eleitoral pagável, propaganda política ou mídia sintética devem cumprir a **legislação eleitoral** por conta própria.
- Espelhos, apps derivados ou integrações comerciais podem ser enquadrados como “plataforma” — avaliar caso a caso.

## Quadro regulatório atualizado (pré-parecer `REV-12` / `LAN-03`)

Síntese dos pontos que exigem adequação documental/técnica e validação jurídica humana no `REV-12` (detalhamento de fontes em [pesquisa-complementar-2026-11.md](../research/pesquisa-complementar-2026-11.md)):

| Frente regulatória / técnica | Exigência ou fato relevante | Postura atual no Vox e pendência (`REV-12`) |
|---|---|---|
| **STF Temas 987 e 533 (itens 5–11 + embargos 17/06/2026)** | Item 5 e cláusula residual dos embargos mantêm Art. 19 apenas para serviços neutros "sem interferência no fluxo"; item 7 submete marketplaces ao **CDC**; itens 8–10 exigem autorregulação, canal para **não usuários**, devido processo e **relatório anual de transparência**; item 11 exige **sede e representante pessoa jurídica** no país. | Piloto G1 opera com escopo reduzido pelo [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md) (operador PF, feed cronológico, sem Feira/Pix propostos). Abertura ao beta/público depende do `REV-12`, da decisão de associação/PJ (`REV-18`), do kit de autorregulação (`REV-20`) e da `hide-list` assinada (`LAN-13`). |
| **Decretos 12.975/2026 e 12.976/2026** | Regulamentam o dever de cuidado para prevenção sistêmica de crimes graves, com fiscalização sistêmica pela **ANPD**. | Procedimento de conteúdo grave (`LAN-04`, meta ≤ 2 h para imagem íntima não consentida e categorias graves no PWA oficial) e denúncia no app (`LAN-12`) em preparação; alcance e prazos exatos submetidos ao `REV-12`. |
| **ECA Digital (Lei 15.211/2025, Decreto 12.880/2026)** | Em vigor desde 17/03/2026; alcança serviços de "provável acesso" por crianças/adolescentes e exige **vínculo obrigatório de contas de menores de 16 anos a responsável legal**, além de fiscalização pela ANPD. | No piloto G1 vigora bloqueio autodeclarado **18+** (`client/js/age-gate.js`, sem coleta de data de nascimento/documento). Padrões seguros <18 e vínculo por chave de responsável (<16) previstos no `REV-23` após `REV-12`, antes de eventual abertura G3. |
| **Resolução TSE 23.755/2026** | Proíbe plataformas de ranquear, recomendar ou priorizar candidatos, campanhas ou partidos no período eleitoral e reforça rotulagem de conteúdo gerado/alterado por IA. | Feed cronológico sem boost pago e modo eleitoral automático implementado (`REV-24` em `client/js/electoral-period.js`). Revisão jurídica de aplicabilidade incluída no `REV-12`. |
| **Pix / DICT (Manual de Iniciação do Pix — BCB)** | O aplicativo bancário do pagador exibe obrigatoriamente o **nome civil do recebedor registrado no DICT** (e parte do CPF/CNPJ) com **qualquer tipo de chave, inclusive chave aleatória (EVP)**. | Aviso explícito na UI (`PIX_RECEIVER_NAME_NOTICE_PT` em `client/js/pix-key.js`). Recebimento sem exposição do nome civil pessoal exige conta de pessoa jurídica (`REV-18`). |
| **Exposição de IP em WebRTC P2P e TURN (`LAN-19`)** | Conexões WebRTC diretas expõem o IP do dispositivo aos pares conectados (revelando cidade/operadora). Quando houver TURN ativo, o servidor TURN e os servidores de sinalização/relays também enxergam o IP na camada de transporte. | Aviso e toggle `"Esconder meu IP (só via servidor TURN)"` (`iceTransportPolicy: "relay"`) presentes em `#/settings/network` (`client/js/webrtc-signaling-config.js`); servidor TURN em produção (`workers/turn`) congelado até >50 ativos (`INF-01` / `REV-10`). |

- **Pacote de revisão pré-parecer:** [rascunho de Termos de Uso (`LAN-02`)](./rascunho-termos-de-uso-lan02.md) e [guia de revisão de `privacy.html` e `data-deletion.html` (`LAN-03`)](./revisao-privacy-data-deletion-lan03.md). Os arquivos HTML em `client/` não são alterados até conclusão do `REV-12`.

## Moderação vs Lei

Transações de `mod-action` e filtros locais ajudam na auto-organização de comunidades; **não substituem** denúncias a autoridades competentes ou o cumprimento de ordens judiciais específicas aplicáveis a intermediários que você opera.

## Login social opcional (Google / Meta) — enriquecimento client-only (V-DIS)

Após a Porta da Cantina, o usuário **pode** importar nome e foto pública via Google Identity Services ou Meta SDK, ou **pular** e usar apenas o identificador local `vx_*`.

- **Sem backend Vox:** fluxo 100% no navegador; não há cadastro centralizado nem troca do `routeId` criptográfico.
- **Sem armazenamento de tokens OAuth:** apenas claims de perfil público (nome, URL de avatar) são copiadas para `localStorage` no aparelho. Tokens de acesso/refresh **não** são persistidos (ver ADR `docs/adr/002-oauth-profile-enrich-client.md`).
- **Revogação local:** em `#/perfil`, o botão *Remover nome/foto importados* apaga o enriquecimento; o `vx_*` permanece.
- **Operador:** Client IDs Web em `client/config/oauth.json` (gitignored); origens autorizadas devem incluir o host de deploy e `http://localhost:*` para desenvolvimento.
- **LGPD:** base legal típica = **consentimento** para dados opcionais de apresentação; minimização — não importamos listas de amigos nem e-mail como identificador de rede.

## Aparecer na busca da malha (PROFILE_CARD opt-in — V-MESH)

Em `#/perfil` e `#/settings/network`, o usuário pode ativar **Aparecer na busca da malha** para publicar um cartão **assinado** (nome, foto, bio) aos pares conectados via gossip P2P/BroadcastChannel — **sem** backend Vox e **sem** diretório central.

- **Opt-in:** desligado por padrão; ligar exige ação explícita após ciência do Pacto Vox.
- **Dados:** apenas apresentação pública já visível no perfil; tokens OAuth e chaves privadas **não** trafegam no cartão.
- **Revogação:** desligar o toggle envia atualização com `discoverable: false`; aparelhos que receberam o gossip removem o cartão do índice local (`#/people`).
- **P1 complementar:** autores de posts/replies/membership já vistos na malha podem aparecer como *Na malha* sem cartão — minimização; não indexamos DMs.
- **Retenção:** cartões recebidos expiram após 30 dias sem republicação (TTL client-side).
- **LGPD:** consentimento específico para divulgação a pares da malha; direito de retirada via toggle; sem venda de dados nem perfilamento comercial.
- **Referência:** ADR `docs/adr/003-profile-card-gossip.md`, spec `docs/specs/profile-card-gossip-v0.md`.

## Leitura reserva e gateways (telemetria local — V-P02)

Quando gateways públicos Arweave/Turbo falham ou demoram, o cliente pode ler de **cache local** ou **relay comunitário**. A UI mostra a pill **Leitura reserva** — plano B de leitura, não falha do usuário.

- **Terceiros:** requisições GraphQL continuam indo a operadores de gateway escolhidos no cliente; políticas de log/IP são deles (§ LGPD acima).
- **Sem proxy central Vox:** o projeto **não** opera servidor proprietário de leitura que oculte degradação ou substitua gateways públicos.
- **Sem phone-home:** contadores de tentativa ficam em `localStorage` no aparelho (`gateway-telemetry.js`); export diagnóstico é opt-in e não envia telemetria ao repositório.
- **Referência:** ADR `docs/adr/004-gateway-honest-fallback.md`.
