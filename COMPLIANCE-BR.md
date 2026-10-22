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
* Para detalhes sobre os procedimentos comunitários de resposta a abusos e remoção em listas de espelhos, consulte [GOVERNANCE.md](./GOVERNANCE.md) (§ Abuso e moderação).

## Conteúdo Político e TSE

A **[Resolução TSE 23.610/2019](http://www.tse.jus.br/)** (e normas correlatas) impõe deveres a **plataformas digitais** no contexto eleitoral brasileiro (transparência, procedimentos, etc.).

- O Vox **não** é, na Fase 1, uma plataforma operada por pessoa jurídica brasileira com moderação centralizada.
- Usuários que divulgarem conteúdo eleitoral pagável ou propaganda política devem cumprir **legislação eleitoral** por conta própria.
- Espelhos, apps derivados ou integrações comerciais podem ser enquadrados como “plataforma” — avaliar caso a caso.

## Moderação vs Lei

Transações de `mod-action` e filtros locais ajudam na auto-organização de comunidades; **não substituem** denúncias a autoridades competentes ou o cumprimento de ordens judiciais específicas aplicáveis a intermediários que você opera.
