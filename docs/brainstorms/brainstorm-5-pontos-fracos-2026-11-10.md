# Brainstorm — os 5 pontos fracos do Vox hoje

> **Status:** brainstorm · **Owner:** mantenedor · **Revisado:** 2026-11-10 · **Não substitui o [ROADMAP](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md))
> **Consolidado em:** [síntese — a praça de colunas](./brainstorm-sintese-praca-de-colunas-2026-11-10.md). Quando este texto divergir da síntese, vale a síntese.
> Este texto trata do **produto e do projeto**. A crítica ao **método** de implementação está em [brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md](./brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md). As ações abaixo são **candidatas**: só viram caixa no ROADMAP quando o mantenedor aceitar.
> Base: [revisão DevSecOps de 10/11](../audits/revisao-devsecops-2026-11-10.md), [THREAT-MODEL](../THREAT-MODEL.md), [FEATURES §7](../FEATURES.md), o histórico de PRs de #49 a #58 e o `git log`. Falhas ainda abertas aparecem só pelo número e pela área ([ADR-024](../adr/024-divulgacao-responsavel-e-honestidade-de-seguranca.md)).

## Resumo

| # | Ponto fraco | Em uma frase | Ação candidata principal |
|---|---|---|---|
| 1 | **A identidade não protege nem sobrevive** | A conta é a chave. Hoje ela é fácil de perder e, em casos que já conhecemos, fácil de tomar. | Fechar PM-90 e PM-93, depois um teste de recuperação com 5 pessoas leigas |
| 2 | **Testes verdes, rede quebrada** | Os defeitos mais graves de novembro passaram com o CI verde, porque nenhum teste põe dois aparelhos para conversar. | Testes com dois aparelhos simulados no CI e uma só porta de entrada (`acceptIncoming`) |
| 3 | **Rede sem densidade** | P2P só funciona com gente online ao mesmo tempo, e o piloto ainda não mede se isso acontece. | Nó âncora por comunidade e uma métrica de entrega em 24 h |
| 4 | **Exposição de quem participa** | O público é militante, mas o grafo de convites, o IP, os metadados de DM e a permanência no Arweave expõem as pessoas. | Revisão "o que vaza sobre você" por tipo de adversário, antes do G2 |
| 5 | **Concentração e escopo maior que a capacidade** | Uma pessoa opera, decide e faz o merge de tudo, e o plano tem 74 itens abertos e 22 módulos parados. | Corte de escopo para o G1 e uma segunda pessoa com acesso e revisão |

---

## 1. A identidade não protege nem sobrevive

**O problema.** No Vox não existe conta no servidor: a pessoa *é* a sua chave P-256. Por isso a custódia dessa chave é o produto inteiro.

**Evidência:**
- **Roubo:** a revisão de 10/11 achou dois problemas na guarda da chave. Um na recuperação e na sincronização (T20, **crítico, PM-90**). Outro na guarda em repouso: chaves de identidade, de DM e de carteira ficam em claro no navegador (T21, **PM-93**). O ADR-014 está **em revisão**.
- **Perda:** o iOS apaga o armazenamento de PWA que não está na tela de início (REV-14, T12). O backup por cofre ou QR nunca foi testado com pessoas leigas (LAN-25). No G1 o cofre remoto e o login social estão desligados (PM-76), então o arquivo de backup é a única saída.
- Não há recuperação social. Quem perde o aparelho e não fez backup perde a identidade, os vínculos e as conquistas.

**Por que importa.** Para militantes, conta tomada é pior que conta perdida: alguém fala em nome da pessoa, assinado. Conta perdida derruba a confiança no piloto logo na primeira troca de celular.

**Ações candidatas:**
1. Fechar **PM-90** (formato novo do cofre, com migração) e **PM-93** (chaves cifradas em repouso), antes de reativar o cofre remoto.
2. **Teste de recuperação com 5 pessoas leigas:** trocar de celular só com o que o app ensinou.
3. **Lembrete de backup** depois do primeiro post e a cada 30 dias, mostrando o que se perde sem ele.
4. Avaliar a **recuperação pelo padrinho**: o vínculo assinado do [ADR-023](../adr/023-moderacao-em-camadas-e-moderador-natural.md) como uma das partes de um esquema M-de-N. Precisa de ADR próprio.

**Métricas:**
- percentual de participantes do G1 com backup conferido (meta ≥ 90%);
- taxa de sucesso no teste de recuperação (meta 5 de 5);
- zero achados críticos abertos em T20 e T21 antes do G2.

**Ligados:** PM-90, PM-93, REV-14, LAN-25, PM-76, T12, T20, T21, [ADR-014](../adr/014-zero-knowledge-vault-recuperacao-soberana.md).

---

## 2. Testes verdes, rede quebrada

**O problema.** São 170 arquivos de teste, e todos testam um aparelho por vez. O que quebra o Vox acontece **entre** aparelhos: o que um grava, o outro recebe, confere e repassa.

**Evidência:**
- **Sincronização entre aparelhos (#49):** nunca funcionou desde o primeiro commit P2P. O aparelho guardava uma forma que não batia com a assinatura, e o CI estava verde o tempo todo.
- **Fotos do compositor (PM-89):** nunca chegaram ao Arweave.
- **Mídia e post assinado (PM-87, PM-88):** a mídia deixava o post sem verificar.
- **Memória central (PM-86):** gravava sem conferir.
- **Cartão de perfil (PM-84):** ficava em eco na malha.
- Todos foram achados lendo código, não por um teste que falhou.
- Não há Playwright nem nenhum teste com dois navegadores.
- A regra "tudo que entra é conferido" ([ADR-021](../adr/021-integridade-na-entrada-forma-assinada.md)) está repetida em sete caminhos de entrada, cada um com a sua cópia.
- O formato de assinatura cobre só os campos de topo (PM-85), e cada contorno novo cria mais um caso especial.

**Por que importa.** Cada um desses defeitos teria aparecido no primeiro dia do piloto, na frente de quem foi convidado. Testes que não pegam esse tipo de falha dão uma confiança falsa ([qualidade-e-evidencia](../process/qualidade-e-evidencia.md), "falso verde").

**Ações candidatas:**
1. **Dois aparelhos no mesmo teste, sem dependência nova.** Um arnês em `node:test` com dois "aparelhos" (IndexedDB falso separado, chaves reais, handlers reais de gossip, sync e memória) ligados por um canal em memória. Os cenários são as jornadas que já quebraram:
   - postar no A e ver no B;
   - editar e confirmar que o B atualiza;
   - foto vai junto;
   - B desliga, volta e sincroniza;
   - memória central devolve;
   - cartão não ecoa.
2. **Uma porta de entrada só:** `acceptIncoming(item, origem)`, com uma tabela de testes que roda cada regra em cada caminho.
3. **`sigv: 2` (PM-85)** com período de convivência, para parar de contornar.
4. Depois, um teste com dois navegadores de verdade (Playwright) para WebRTC e Service Worker. Exige registro em [DEPENDENCIAS](../DEPENDENCIAS.md).

**Métricas:**
- cada jornada da lista acima tem um teste com dois aparelhos;
- os defeitos #49, PM-84, PM-86 e PM-89, reintroduzidos de propósito, fazem o CI falhar (teste de mutação manual);
- número de caminhos de entrada com regra própria: de 7 para 1.

**Ligados:** PM-85, [ADR-021](../adr/021-integridade-na-entrada-forma-assinada.md), [TESTES](../TESTES.md), [qualidade-e-evidencia](../process/qualidade-e-evidencia.md).

---

## 3. Rede sem densidade (o problema do começo frio)

**O problema.** Num servidor central, o post fica lá esperando. No Vox, um post só chega se outro aparelho estiver online ao mesmo tempo, ou se alguém mantiver uma memória.

**Evidência:**
- **Esquecer por padrão** ([ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md)) é a decisão certa para a privacidade, mas tira a rede de segurança do conteúdo.
- **Sinalização:** um só nó no Render, que dorme e depende de keepalive. O caminho Nostr está em paralelo, mas **não foi medido em campo**.
- **Sem TURN:** quem está atrás de CGNAT pode não conectar (REV-10).
- **Sem relay completo público:**
  - a DM no G1 só chega se as duas pessoas estiverem online (PM-76);
  - a memória central depende de stewards;
  - a entrega offline da DM (repasse cego da mochila) não está implementada.
- **Nada medido:** não há nenhuma medição de quanto conteúdo chega a quem deveria.

**Por que importa.** A primeira impressão de "postei e ninguém viu", ou "mandei DM e não chegou", mata uma rede social de comunidade. O efeito de rede joga contra: poucos usuários significam pior entrega, e pior entrega afasta mais gente.

**Ações candidatas:**
1. **Nó âncora por comunidade** como requisito do G1: o steward roda o Vox Populi ([ADR-008](../adr/008-vox-populi-community-node-architecture.md)) ligado, com memória escolhida pelas pessoas ([ADR-022](../adr/022-memoria-central-por-consentimento.md)).
2. **Métrica local de entrega:**
   - quantos pares confirmaram ter o post em 1 h e em 24 h;
   - medida no aparelho de quem postou, sem telemetria central ([DECISOES I-04](../DECISOES.md)).
3. **Medir o Nostr e o CGNAT** no G1: percentual de pareamentos que funcionam sem TURN, por operadora.
4. **Ritual de presença:** horário combinado da comunidade, como uma assembleia, para concentrar quem está online. É uma resposta social a um limite técnico.

**Métricas:**
- percentual de posts vistos por pelo menos 3 pares em 24 h (meta do G1 a definir com dados);
- percentual de pareamentos bem-sucedidos sem TURN;
- percentual de DMs entregues em menos de 24 h.

**Ligados:** PM-76, REV-01, REV-09, REV-10, NET-02, [FEATURES §7](../FEATURES.md), [INFRA-CUSTOS](../INFRA-CUSTOS.md).

---

## 4. Exposição de quem participa

**O problema.** O público-alvo é militância pró-democracia, e o adversário dela é real (doxxing, assédio coordenado, perseguição). A arquitetura sem servidor tira o ponto único de vigilância, mas espalha metadados por muitos aparelhos.

**Evidência:**
- **Grafo de convites (T19):** o vínculo assinado (PM-82) mostra quem trouxe quem para a malha e para a memória central.
- **IP (T5):** o IP fica visível para os pares. O "Esconder meu IP" depende de TURN, que não existe (REV-10).
- **DMs (T4):** o conteúdo vai cifrado, mas quem fala com quem e quando fica visível para o relay. Não há forward secrecy.
- **Arweave (T13):** o que vai para lá não sai mais. Existe aviso e a opção "só na malha".
- **Contas falsas (T6):** não há proteção no ar, e o selo por aval é só um plano.
- **Logs (T14):** stewards de relay podem ter logs de IP, e ainda não existe política de logs.

**Por que importa.** Um único vazamento do grafo de uma comunidade militante pode expor dezenas de pessoas, e a perda de confiança é irreversível. Também é aqui que o risco jurídico do operador cresce (REV-12).

**Ações candidatas:**
1. **Revisão "o que vaza sobre você"** com três tipos de adversário:
   - um par curioso na malha;
   - um steward malicioso;
   - quem tem ordem judicial.
   O resultado é uma tabela de cada dado, quem vê e por quanto tempo, publicada em linguagem simples.
2. **Grafo de convites visível só dentro da comunidade**, não para a malha inteira (exige ajuste no PM-82 e um ADR).
3. **Política de logs para stewards**, com padrão "sem IP" no relay da comunidade.
4. **TURN comunitário** antes do G2, para o "Esconder meu IP" funcionar.

**Métricas:**
- número de dados pessoais que um par passivo consegue ver (contado e com teste);
- política de logs publicada e assinada pelos stewards;
- percentual de conexões que conseguem esconder o IP.

**Ligados:** T4, T5, T6, T13, T14, T19, REV-10, REV-12, LAN-11, LAN-13, [ADR-023](../adr/023-moderacao-em-camadas-e-moderador-natural.md), [COMPLIANCE-BR](../legal/COMPLIANCE-BR.md).

---

## 5. Concentração e escopo maior que a capacidade

**O problema.** Uma pessoa opera, decide, escreve com ajuda de IA e faz o merge de tudo. O plano cresce mais rápido do que fecha.

**Evidência:**
- **Uma pessoa só:**
  - o `git log` tem um autor humano: 851 commits, como "yuri" e "Yuri Kayel";
  - desde outubro, cerca de 100 commits têm coautoria de IA e nenhuma revisão humana de outra pessoa;
  - o `main` exige 0 aprovações;
  - as contas de deploy têm bus factor 1, e o 2FA não está documentado (T3, LAN-30);
  - o ADR-020 faz do mantenedor o operador responsável no G1.
- **Escopo:**
  - 74 itens abertos no ROADMAP, contra 45 fechados;
  - 22 módulos escritos e não carregados por nenhuma tela (`UNPLUGGED_MODULES`);
  - FEATURES §7 lista o que "bloqueia funcionar sem o mantenedor".
- **Defeitos de fundação:** #49 e PM-89 mostram que funções foram declaradas prontas sem que o caminho de ponta a ponta funcionasse. Velocidade sem um segundo olhar.

**Por que importa.** Se o mantenedor adoecer, perder o acesso ou se cansar, o piloto para: sinalização, deploy, moderação grave e decisão dependem dele. Código escrito com IA e sem revisão de uma segunda pessoa repete erros de premissa, como os de #49. Um escopo grande dilui o que o G1 precisa.

**Ações candidatas:**
1. **Corte de escopo para o G1:**
   - marcar no ROADMAP o que está no caminho do G1;
   - mover o resto para "Depois";
   - para cada módulo parado, decidir: plugar no G1, arquivar em branch ou apagar.
2. **Segunda pessoa com acesso:**
   - relay buddy (V-P08);
   - segundo dono nas contas de deploy, com 2FA (LAN-30).
3. **Revisão obrigatória** (1 aprovação e CODEOWNERS, PM-95) assim que houver uma segunda pessoa revisora. Até lá, um **revisor de IA independente**, num modo só de leitura e diferente de quem escreveu, em todo PR de segurança, com o achado registrado no PR.
4. **Limite de trabalho em andamento:** no máximo 3 itens `code` abertos ao mesmo tempo.

**Métricas:**
- itens abertos no caminho do G1;
- bus factor maior ou igual a 2 em cada conta de deploy;
- percentual de PRs com revisão de uma segunda pessoa;
- módulos em `UNPLUGGED_MODULES` (meta: 0 sem decisão).

**Ligados:** T3, LAN-30, V-P08, PM-95, [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md), [ADR-017](../adr/017-consolidacao-roadmap-unico.md), [FEATURES §7](../FEATURES.md), [steward-relay-buddy](../operations/steward-relay-buddy.md).

---

## Ordem sugerida

1. **Ponto 1 (identidade):** PM-90 e PM-93 são pré-requisito de qualquer convite novo.
2. **Ponto 2 (arnês com dois aparelhos):** é barato, e protege tudo o que vem depois.
3. **Ponto 5 (corte de escopo e segunda pessoa):** sem isso, o resto não fecha.
4. **Ponto 3 (densidade):** só se mede com o G1 rodando, mas o nó âncora tem que estar pronto antes.
5. **Ponto 4 (exposição):** a revisão por adversário tem que vir antes do G2, quando a rede abrir para quem ninguém conhece.

## O que ficou de fora (e por quê)

- **Parecer jurídico (REV-12):** é sério, mas é dependência externa e já está no ROADMAP. Aparece dentro do ponto 4.
- **Peso da página e desempenho em celular fraco:** o orçamento de precache (PM-02) já é vigiado pelo CI.
- **Copy e design:** houve auditorias recentes ([honest-copy](../audits/honest-copy-audit-2026-10-23.md), [branding](../audits/branding-audit-2026-11-01.md)).
