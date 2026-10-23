# Conformidade — Visão Geral Brasil

Documento informativo de alto nível. **Não é parecer jurídico.** Produtores de conteúdo e operadores de espelhos devem consultar advogados locais.

## LGPD (Lei 13.709/2018)

**Como o Vox Fase 1 funciona:**

- Cliente estático: sem cadastro, sem cookies obrigatórios, sem backend Vox coletando dados.
- Consultas GraphQL vão a **terceiros** (gateways Arweave/Turbo); IPs e logs ficam sob política desses operadores.
- Conteúdo publicado on-chain é **público e persistente** — titular que publica dados pessoais de terceiros pode incorrer em responsabilidade civil/regulatória.

**Orientações práticas:**

- Minimize dados pessoais em tags e corpo de transações.
- Direitos do titular (acesso, eliminação): na permaweb, **eliminação técnica plena** pode ser impossível; mitigação = não publicar + filtros client-side + não replicar em espelhos.
- Encarregado/DPO: inexistente no projeto open-source sem operador comercial central — quem rodar espelho comercial assume papéis conforme seu modelo de negócio.

## O Pacto Vox: Recursos Compartilhados e LGPD (Fase 3.1)

Na **Fase 3.1**, o Vox adota o modelo contratual transparente **Pacto Vox**:
* **Inversão da lógica extrativista:** Em redes sociais corporativas tradicionais, a infraestrutura é centralizada mas o "preço" é a extração e venda de dados pessoais, metadados comportamentais e direcionamento algorítmico opaco. No Vox, a identidade e os conteúdos pertencem 100% ao usuário (assinados com JWK local na chain Arweave).
* **Infraestrutura cooperativa ativa por padrão:** Como contrapartida da soberania, o app opera por padrão como um nó leve de leitura e cache local enquanto aberto, servindo fragmentos públicos a outros clientes na rede sem depender de datacenters corporativos custosos.
* **Bases Legais e Transparência:**
  1. **Ciência Prévia no Onboarding:** Na primeira abertura do app, um modal claro apresenta os termos do pacto antes da navegação continuada.
  2. **Salvaguarda Técnica de Dados:** O nó leve trafega e armazena **estritamente dados públicos e imutáveis** já gravados no permaweb (tópicos e respostas comunitárias). Chaves privadas, dados sensíveis ou históricos pessoais de navegação nunca são compartilhados.
  3. **Direito de Opt-Out Preservado:** O usuário mantém a prerrogativa soberana de pausar a contribuição a qualquer momento através de `#/settings/network` ("Pausar contribuição"), convertendo o cliente para modo passivo.
  4. **Proteção Patrimonial (Banda e Bateria):** Padrão configurado com teto diário de banda (50 MB/dia), limite de armazenamento local (25 MB) e prioridade em conexões Wi-Fi para impedir consumo de dados tarifados 4G/5G.
  5. **Operação em Segundo Plano:** Se habilitada, a atuação via Service Worker exige permissão de notificação explícita do sistema operacional e desativa-se automaticamente fora de redes Wi-Fi ou caso o teto diário seja atingido.

## Mensagens Diretas Efêmeras e Privacidade (Fase 4)

A arquitetura de DMs do Vox é orientada aos princípios de **minimização de dados (Art. 6º, III da LGPD)** e **privacidade desde a concepção (*privacy by design*)**:
1. **Inexistência de DMs no Permaweb:** O projeto proíbe expressamente transações de mensagens privadas on-chain no Arweave. Conversas íntimas nunca são imutabilizadas ou expostas a análises forenses perpétuas.
2. **Criptografia Forte Ponta-a-Ponta:** As mensagens são cifradas nos próprios dispositivos remetente/destinatário via ECDH P-256 e AES-GCM-256. Nenhum intermediário tem acesso à chave de decifração.
3. **Relay Comunitário como Repositório Transitório:** O endpoint `/inbox/:toAddress` opera unicamente como caixa postal cega e temporária para entregas offline. O operador do relay não tem acesso ao conteúdo em texto claro, não mantém backups de conversas e impõe **expiração compulsória em 72 horas (TTL)**, além de expurgo imediato quando o destinatário coleta a mensagem.
4. **Sem Perfilamento Comercial:** Não há mineração de grafo social, leitura de palavras-chave para publicidade direcionada ou retenção compulsória de histórico em nuvens proprietárias. O histórico reside unicamente no armazenamento local do dispositivo do usuário.

## Marco Civil da Internet (Lei 12.965/2014) e Art. 19

O regime de responsabilidade civil de intermediários no Brasil estabelece distinções fundamentais:

* **Código aberto sem operador central (Fases 1 e 2):** O repositório Vox disponibiliza código de cliente estático sem custodiar bancos de dados ou operar servidores centrais de aplicação.
* **Servidores de Sinalização WebRTC (`signaling.py` — Fase 3.2):** O servidor de sinalização atua como canal transitório e estritamente técnico para o handshake P2P (ofertas SDP e candidatos ICE). Ele não armazena registros de aplicação, não inspeciona payloads e não custodia dados das comunidades, operando sob o princípio da neutralidade de rede (Art. 9º do Marco Civil).
* **Operadores de espelhos e front-ends curados:** Entidades ou indivíduos que hospedarem e disponibilizarem publicamente instâncias ou espelhos com filtros próprios, domínios comerciais ou seleção de conteúdo podem vir a ser enquadrados juridicamente como **provedores de aplicação de internet**.
* **Responsabilidade por conteúdo de terceiros (Art. 19 / Jurisprudência STF):** Caso um operador de espelho receba ordem judicial específica (ou notificação qualificada conforme modulações do STF) para indisponibilizar conteúdo ilícito, a conformidade deve ser realizada na camada de renderização do front-end (suprimindo a exibição das transações em seus índices locais).
* **Nós leves e apoiadores (camadas Passivo / Ativo / Apoiador):** Usuários que apenas leem (Passivo) ou servem cache P2P de **payload já público** no permaweb, dentro dos tetos do Pacto Vox, **não** editam feed alheio nem vendem alcance. Em geral **não** se equiparam a provedor de aplicação centralizado; continuam sujeitos à lei civil se publicarem conteúdo ilícito **como autores**. Ver [docs/espacos-digitais-infra.md](./docs/espacos-digitais-infra.md).
* **Stewards de espelho e relay (`vox/relay/`):** Quem opera **publicamente** índice curado (`GET /vox/index/*.json`), espelho multi-comunidade ou front-end com seleção editorial pode ser enquadrado como **provedor de aplicação**. O relay de inbox (`/inbox/:toAddress`) permanece **transitório e cego** (§ DMs acima) — distinto do espelho de conteúdo público.
* **Espelho ≠ apagar on-chain:** Suprimir TX em índice local ou UI **não** remove dados do Arweave; cumpre ordem na **camada que o operador controla** (lista espelhada, HTML servido, filtros `mod-action`).
* Para papéis comunitários, escalonamento e deveres mínimos de stewards, consulte [GOVERNANCE.md](./GOVERNANCE.md) (§ Papéis de operador de infra voluntária).

## Infraestrutura voluntária (camadas Passivo → Steward)

Norma de produto e implementação: [docs/espacos-digitais-infra.md](./docs/espacos-digitais-infra.md). Resumo **jurídico-informativo** para quem escolhe participar da malha:

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

A **[Resolução TSE 23.610/2019](http://www.tse.jus.br/)** (e normas correlatas) impõe deveres a **plataformas digitais** no contexto eleitoral brasileiro (transparência, procedimentos, etc.).

- O Vox **não** é, na Fase 1, uma plataforma operada por pessoa jurídica brasileira com moderação centralizada.
- Usuários que divulgarem conteúdo eleitoral pagável ou propaganda política devem cumprir **legislação eleitoral** por conta própria.
- Espelhos, apps derivados ou integrações comerciais podem ser enquadrados como “plataforma” — avaliar caso a caso.

## Moderação vs Lei

Transações de `mod-action` e filtros locais ajudam na auto-organização de comunidades; **não substituem** denúncias a autoridades competentes ou o cumprimento de ordens judiciais específicas aplicáveis a intermediários que você opera.
