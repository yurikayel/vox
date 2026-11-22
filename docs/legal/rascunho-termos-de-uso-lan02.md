# Rascunho de Termos de Uso — Vox PWA (pré-parecer LAN-02)

> **Status:** rascunho (pré-parecer; **pendente de parecer jurídico humano (`REV-12`) — não é aconselhamento jurídico**) · **Owner:** mantenedor + jurídico · **Revisado:** 2026-11-22  
> **Referências:** [ROADMAP.md](../ROADMAP.md) (`LAN-02`, `REV-12`) · [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) · [GOVERNANCE.md](../../GOVERNANCE.md) · [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)

Este documento consolida o rascunho em linguagem simples dos **Termos de Uso** do Vox para revisão jurídica humana no **`REV-12`** antes de sua publicação em `client/terms.html` e da integração ao aceite conjunto com o Pacto Vox no onboarding (`LAN-02`). **Nenhum texto aqui tem validade jurídica definitiva antes da revisão do `REV-12` e da aprovação em `main` ([GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31)).**

---

## Texto-base sugerido para `client/terms.html` (rascunho)

### 1. O que é o Vox e quem opera o quê

O **Vox** é um projeto de software livre (código aberto sob licença AGPL, publicado em `github.com/yurikayel/vox`). Para entender seus direitos e responsabilidades, é preciso separar três papéis distintos:

1. **O software e o protocolo abertos:** o código-fonte do aplicativo web (PWA) e dos utilitários de rede é livre. Qualquer comunidade ou pessoa pode auditar, modificar ou hospedar sua própria cópia conforme a licença aplicável ([licenca-e-contribuicoes.md](./licenca-e-contribuicoes.md)).
2. **A instância PWA oficial (`yurikayel.github.io/vox` e espelho oficial):** é a cópia pública mantida pelo projeto. Na fase de piloto fechado (G1), é operada diretamente pelo mantenedor pessoa física ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)); antes da abertura ampla, a governança e a representação institucional serão reavaliadas conforme parecer jurídico (`REV-12` / `REV-18`). A operação da instância oficial segue as regras de [GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31).
3. **Instâncias, espelhos e relays independentes:** terceiros e comunidades podem operar seus próprios front-ends, espelhos ou servidores de apoio (*stewards*), sob suas próprias regras, políticas de privacidade e responsabilidade própria.

### 2. Idade mínima e proteção de crianças e adolescentes

- **Fase atual (piloto fechado G1):** o acesso à instância oficial é restrito a **pessoas com 18 anos ou mais**. A confirmação é feita por autodeclaração no próprio aparelho (`age-gate`), sem coleta de data de nascimento, CPF ou documento de identidade.
- **Fases futuras (`REV-23` / ECA Digital — Lei 15.211/2025):** `[DEFINIR APÓS REV-12 ANTES DO G3]` — caso fases posteriores permitam o ingresso de adolescentes entre 13 e 17 anos, serão aplicados padrões de proteção por faixa etária (bloqueio de mensagens diretas de desconhecidos, desativação de Pix Zaps e Feira geolocalizada, modo "só via TURN" por padrão) e, para **menores de 16 anos**, vinculação obrigatória da conta a um responsável legal com ferramentas de supervisão, nos termos definidos pelo parecer `REV-12`.

### 3. Sua conta, suas chaves e ausência de custódia

- **Sem cadastro central:** o Vox não exige nome civil, CPF, telefone ou e-mail para criar uma conta. Sua identidade no aplicativo é um par de chaves criptográficas gerado no próprio navegador (`vx_*`).
- **Autoguarda (*self-custody*):** **o projeto Vox não guarda cópia da sua chave privada, senha nem frase de recuperação.** Se você perder o aparelho, trocar de navegador ou apagar os dados do site sem ter feito backup antes, **não é possível recuperar a sua conta pelo suporte do Vox**.
- **Meios de backup sob sua responsabilidade:** você pode guardar sua conta usando a **frase de recuperação** de 12 palavras (`#/frase`), o mecanismo de **guardiões** (`#/guardioes`), o **cofre cifrado** (`#/sync` / código `VOX1:`, quando habilitado) ou a exportação local no perfil (`#/perfil`). Nunca compartilhe sua frase de recuperação com terceiros.

### 4. Funcionamento *local-first*, rede de seguidores e permanência (Arweave)

- **Armazenamento local e malha P2P:** seus dados ficam guardados principalmente no seu próprio dispositivo (`IndexedDB` e `localStorage`). Ao usar o aplicativo com o **Pacto Vox** ativo, seu aparelho ajuda a replicar publicações públicas das pessoas e comunidades que você segue para outros aparelhos da rede, dentro dos limites de banda e espaço configurados em `#/settings/network` (com prioridade configurável para Wi-Fi e opção de **pausar a ajuda à rede** a qualquer momento).
- **Exposição de endereço IP na malha:** ao estabelecer conexões diretas entre aparelhos (WebRTC), os outros pares conectados podem ver o seu endereço IP de internet (que pode indicar sua cidade e operadora). Quando houver servidor TURN configurado e ativo, você pode marcar a opção **"Esconder meu IP (só via servidor TURN)"** em `#/settings/network` — ciente de que o operador do servidor TURN e os servidores de sinalização passam a ver seu IP na camada de transporte (`LAN-19`).
- **Estado atual do Arweave (`arweaveUpload: false`):** no momento, **nenhuma publicação nova é gravada no Arweave por padrão**. Todo conteúdo novo circula e sobrevive apenas pela **rede de seguidores**, podendo desaparecer da rede quando nenhum aparelho o mantiver em cache ou quando você emitir retração assinada ([ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md)).
- **Aviso explícito sobre permanência futura no Arweave:** caso recursos específicos no Arweave sejam habilitados no futuro (por exemplo, registros consensuais de memória cívica ou publicações em que você opte expressamente por arquivamento on-chain), **tudo o que for gravado no Arweave torna-se público e tecnicamente permanente, sem possibilidade de apagamento definitivo da permaweb**. Antes de qualquer envio ao Arweave, o aplicativo exibirá aviso específico exigindo sua confirmação.
- **Limite realista de exclusão:** mesmo na rede de seguidores, apagar um post ou limpar os dados do seu navegador **não impede** que outras pessoas já tenham copiado o texto/imagem, tirado capturas de tela (*prints*) ou mantido cópias locais em seus aparelhos.

### 5. Mensagens diretas (DMs)

- As mensagens diretas entre usuários são **cifradas ponta a ponta** no dispositivo (ECDH P-256 + AES-GCM-256). Nenhum mantenedor ou operador de relay consegue ler o conteúdo das suas conversas.
- Quando utilizado um relay comunitário para entrega offline, a mensagem trafega em envelope cifrado temporário com expiração automática (TTL típico de 72 horas) e é removida após a coleta pelo destinatário.

### 6. Regras de conduta, conteúdo grave e remoção na instância oficial

Ao usar a instância PWA oficial do Vox, você concorda em não publicar, compartilhar ou incentivar:

1. **Conteúdo grave com tolerância zero:**
   - abuso ou exploração sexual de crianças e adolescentes;
   - terrorismo, incitação à violência ou ameaça grave à vida/integridade física;
   - divulgação de cena de sexo, nudez ou imagem íntima sem consentimento;
   - tráfico de pessoas, exploração ilegal ou outros crimes graves previstos na legislação brasileira.
2. **Demais condutas vedadas:** fraude, falsidade ideológica, assédio sistemático, exposição indevida de dados pessoais sensíveis de terceiros (*doxxing*), violação deliberada de direitos autorais ou marcas registradas, spam automatizado e tentativas de burlar limites técnicos da rede.

**Como funciona a moderação e remoção (`LAN-04`, `LAN-12`, `LAN-13`, `REV-20`):**

- **Camada pessoal:** você pode silenciar ou bloquear qualquer conta localmente no seu aparelho.
- **Camada comunitária:** cada comunidade possui regras próprias e moderadores que emitem ações assinadas (`mod-action`). No piloto, uma denúncia feita por membro da comunidade arquiva o conteúdo preventivamente até revisão pela moderação ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)).
- **Lista global de ocultação da instância oficial (`hide-list`, `LAN-13`):** em casos de conteúdo grave, violação manifesta ou ordem judicial específica, os plantonistas da instância oficial podem incluir o registro na lista assinada de ocultação. A inclusão oculta o conteúdo **na instância PWA oficial** (sem apagar dados de dispositivos de terceiros ou registros históricos já existentes no Arweave).
- **Prazo para conteúdo grave (`LAN-04`):** para denúncias de imagem íntima não consentida e demais categorias graves, a instância oficial adota a meta operacional de ocultação cautelar em **até 2 horas** (sujeita à confirmação por segundo revisor em até 24 horas, preservação mínima de evidência para autoridades e encaminhamento aos canais competentes, como a SaferNet), **conforme viabilidade operacional e prazos a confirmar no parecer `REV-12`**.
- **Canal para não usuários e contestação (`REV-20`):** quem não tem conta no Vox — ou quem quiser contestar uma ocultação da `hide-list` — pode usar o canal externo de notificação e recurso publicado no repositório oficial (ou o canal reservado indicado para envio de dados pessoais sem exposição pública). Pedidos de revisão são analisados por revisores distintos de quem aplicou a ocultação inicial, conforme [GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31).

### 7. Pix Zaps e Feira Comunitária

- **Sem intermediação financeira:** o Vox **não é instituição de pagamento (IP), banco nem prestador de serviços de pagamento (PSP)**, não custodia dinheiro, não realiza *escrow* e não cobra taxas ou comissões. O código Pix Copia e Cola (BR Code) é montado integralmente offline no seu dispositivo e toda transferência acontece fora do Vox, diretamente no aplicativo do seu banco.
- **Exposição do nome civil no Pix (regra DICT do Banco Central):** conforme o Manual de Padrões para Iniciação do Pix do Banco Central do Brasil, ao pagar um Pix o aplicativo bancário do pagador **exibe obrigatoriamente o nome completo do recebedor registrado no DICT** (além de parte do CPF/CNPJ), **independentemente do tipo de chave informado — inclusive chave aleatória (EVP)**. Se você usa pseudônimo e não deseja expor seu nome civil a quem paga, não cadastre chave Pix pessoal (utilize, quando aplicável, chave de coletivo ou associação). O Vox não verifica nem garante a titularidade das chaves declaradas nos perfis.
- **Feira Comunitária (anúncios entre pares):** quando habilitada por deliberação da comunidade, a aba de classificados conecta diretamente anunciantes e interessados. O Vox não participa da negociação, entrega, garantia ou pagamento. **`[PENDENTE DE PARECER REV-12]`:** a aplicabilidade do Código de Defesa do Consumidor (CDC) à instância oficial e eventual desabilitação ou restrição da Feira e de Pix Zaps no piloto/beta estão sujeitas ao parecer jurídico sobre o item 7 da tese do STF (Temas 987/533). *(Proposta atual para o piloto fechado G1: operar sem Feira e sem Pix até conclusão do parecer — ver [briefing-parecer-g1.md](./briefing-parecer-g1.md).)*

### 8. Conteúdo político e período eleitoral

- O feed do Vox é cronológico e sem impulsionamento pago. Durante o período eleitoral brasileiro (de 16 de agosto a 31 de outubro de anos pares, ou quando ativado o modo eleitoral nas configurações do aplicativo), sugestões automáticas de perfis ou conteúdos são desativadas em atenção à vedação de ranqueamento eleitoral da Resolução TSE nº 23.755/2026 (`REV-24`).
- Cada participante responde integralmente pelo cumprimento da legislação eleitoral em suas publicações, incluindo deveres de identificação de conteúdo sintético ou manipulado por inteligência artificial quando exigido por lei.

### 9. Conteúdo do usuário, marca e `@handle`

- Você mantém a titularidade do conteúdo original que cria. Ao publicar na rede, você autoriza tecnicamente que os aparelhos da malha e eventuais espelhos/relays repliquem e exibam esse conteúdo conforme o funcionamento do protocolo e destes Termos.
- O identificador `@handle` é um apelido técnico no protocolo `vox-brasil` e **não equivale** a registro de marca no INPI nem a registro de domínio no Registro.br. Conflitos de uso de marca ou falsidade ideológica são resolvidos pelas vias legais cabíveis; ordens judiciais dirigidas à instância oficial podem resultar na ocultação do `@handle` na renderização dessa instância.

### 10. Alterações nos Termos, isenções e foro

- **Mudanças nos Termos:** alterações materiais aplicáveis à instância oficial dependem de revisão jurídica (`REV-12` / `REV-18`) e de aviso prévio mínimo de **15 dias** no aplicativo ou no registro de alterações oficial, exceto quando exigidas imediatamente por lei ou decisão judicial.
- **Disponibilidade e garantias:** na extensão máxima permitida pela legislação brasileira aplicável, o software aberto é fornecido no estado em que se encontra (*as-is*), sem garantia de disponibilidade contínua de relays de terceiros, gateways públicos ou entrega instantânea quando os pares estiverem offline.
- **Lei aplicável e foro:** estes Termos são regidos pelas leis da República Federativa do Brasil. **Foro competente:** `[definir no REV-12 / REV-18 — ex.: comarca de domicílio do operador pessoa física no G1 ou foro da sede da entidade jurídica no G2/G3, ressalvadas as hipóteses legais de foro privilegiado/consumidor/ECA quando aplicáveis]`.

---

## Pontos em aberto para validação jurídica (`REV-12`)

Antes de transformar este rascunho em `client/terms.html` e vincular seu aceite ao modal do Pacto Vox (`LAN-02`), o parecer do `REV-12` deve responder explicitamente:

1. **Enquadramento do operador pessoa física (G1) e da futura associação (G2/G3):** a separação entre software AGPL, instância PWA oficial cronológica e espelhos de terceiros afasta ou atrai deveres de provedor de aplicação sob os Temas 987/533 do STF (itens 5–11 e embargos)?
2. **Prazo para conteúdo grave (`LAN-04`):** o compromisso de meta de ≤ 2 h para imagem íntima não consentida é adequado e juridicamente defensável para um plantão de 2 pessoas, ou deve ser redigido como "com a maior brevidade possível / no menor prazo técnico viável" sem promessa rígida de SLA antes da estruturação de equipe?
3. **Feira e Pix no G1/G2 (item 7 do STF):** manter Feira e Pix Zaps desligados até `REV-18` (CNPJ/associação) elimina o risco de responsabilidade objetiva sob o CDC na instância oficial?
4. **Aceite e prova de aceite sem backend (`LAN-02`):** registrar o aceite dos Termos apenas no `localStorage` do aparelho (junto do `vox-pact-accepted` e `vox-age-18-v1`) basta para o piloto, ou é recomendável registrar evento assinado/versão dos Termos (`termsVersion`) na própria comunidade/aparelho?
5. **Foro e representante legal (item 11 do STF):** definição exata da cláusula de foro para o piloto (pessoa física) e gatilho de obrigatoriedade de sede/representante PJ antes do beta (G2) ou público (G3).
