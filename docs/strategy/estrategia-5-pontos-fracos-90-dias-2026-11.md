# Estratégia por ponto fraco — plano de 90 dias

> **Status:** estratégia (proposta) · **Owner:** mantenedor · **Revisado:** 2026-11-10
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). Prazos são sugestões, não compromissos. Parte do [brainstorm dos 5 pontos fracos](../brainstorms/brainstorm-5-pontos-fracos-2026-11-10.md).

## Decisões do mantenedor (10/11/2026)

- **Cunha do piloto:** modo assembleia para grupos que já decidem pelo WhatsApp.
- **Segunda pessoa com acesso:** ainda não escolhida.
- **Rascunhos preparados** (nada enviado, nenhuma issue criada):
  - [briefing do parecer do G1](../legal/briefing-parecer-g1.md);
  - [roteiro da conversa](../pilot/piloto-g1-roteiro-conversa.md) e [convite do piloto](../pilot/piloto-g1-convite.md);
  - [10 primeiras tarefas e guia de contribuição](../process/primeiras-tarefas-contribuidor.md);
  - [segunda pessoa: convite e acesso em etapas](../process/segunda-pessoa-acesso-gradual.md).

## Estado em 10/11/2026 (o que mudou desde a escrita)

- **PM-12 (chave não exportável) está feito** pelo PM-93 ([ADR-026](../adr/026-chaves-em-repouso-trava-depois-do-backup.md)). Continua aberto o LAN-18 (revisão externa de cripto), que agora revisa código já no ar.
- **PM-04 e PM-02 estão em vigor:** órfãos fora do cache e teto de 2.068.300 bytes que quebra o CI. A folga é de ~0,5 KB, então o **PM-01** (cachear só o núcleo na instalação) sobe de prioridade.
- **`GOVERNANCE.md` já existe:** "quem decide o quê" entra como seção dele (rascunho no doc da segunda pessoa).
- **Pipeline e relay endurecidos** (PM-94, PM-95): CODEOWNERS pronto para a revisão obrigatória quando houver segunda pessoa.
- **O modo assembleia (PM-23) não existe:** a conversa com as comunidades é de descoberta, não demonstração.

## Desdobramentos (10/11/2026, brainstorms)

**Comece pela [síntese — a praça de colunas](../brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md)**, que consolida os brainstorms abaixo e resolve as divergências entre eles.

- [O Vox como "terceiro lugar"](../brainstorms/brainstorm-terceiro-lugar-2026-11-10.md): os cinco pontos têm a mesma raiz (o Vox quer ser *o lugar* da comunidade). Proposta: ferramentas de quem organiza, usadas a partir do WhatsApp, com membros sem conta. Se aceita, medir a rede (ponto 2) e emagrecer o app (ponto 4) deixam de bloquear o G1, e o ponto 3 vira recuperação pela comunidade.
- [Para quem e com que gestos](../brainstorms/brainstorm-publico-e-gestos-conhecidos-2026-11-10.md): alvo do piloto (quem organiza com 50+, membros da periferia só-celular, associações rurais como segundo nicho) e gestos conhecidos de outros apps mapeados para o Vox.
- [Dez estratégias de captação](../brainstorms/brainstorm-captacao-por-perfil-2026-11-10.md): um papel e um primeiro passo sem código para cada perfil; agora só os perfis 5 e 3 (o piloto), 6 (quem constrói) e 4 (o parecer).
- [Refino: rede de ação e onda de soberania](../brainstorms/brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md): o hábito vem da missão, não da ata; a onda é de Estado e militância organizada; nenhum dinheiro de partido ou governo e nenhum envio automático.
- [Nichos como colunas](../brainstorms/brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md): fidelidade vem de compromisso que volta; colunas 1 e 2 (associações e agricultura familiar) primeiro, com a escola logo atrás; integrar com o governo só por interfaces públicas.

Ordem de ataque: **5 → 1 → 2 → 3 → 4**.

## 5. Exposição jurídica: comprar certeza barata

**Objetivo:** ter um parecer e uma estrutura legal mínima antes de abrir além do piloto fechado.

**Jogadas**
1. **Briefing de uma página** com as perguntas fechadas do REV-12, no escopo do G1 ([rascunho](../legal/briefing-parecer-g1.md)).
2. **Três portas em paralelo:** clínicas jurídicas; organizações de direitos digitais; advogado voluntário da rede de contribuidores.
3. **Escopo mínimo primeiro:** só o G1. O parecer do beta vem depois.
4. **Associação (REV-18):** perguntar a quem já se organizou como associação. O custo de abrir e manter PJ muda a decisão.
5. **Procedimento de conteúdo grave (LAN-04)** escrito antes do piloto, com plantão de duas pessoas (depende do ponto 1).

**Sinal:** 1 parecer escrito ou 1 advogado nomeado em 30 dias. Sem isso, o piloto roda fechado e sem Feira nem Pix.
**Mudar de plano se:** ninguém responder em 30 dias. Aí contratar pontualmente.

## 1. Uma pessoa só e nenhum usuário: transformar em convite

**Objetivo:** 1 comunidade real, 1 facilitador, 1 segunda pessoa com acesso.

**Jogadas**
1. **Cunha:** modo assembleia para grupos de WhatsApp.
2. **Três candidatas** onde a dor já existe (associação, coletivo, sindicato, centro acadêmico). Pedir 20 minutos, não adesão ([roteiro](../pilot/piloto-g1-roteiro-conversa.md)).
3. **Consentimento coletivo e honesto:** dizer o que ainda não funciona ([convite](../pilot/piloto-g1-convite.md)).
4. **Segunda pessoa (LAN-30):** primeiro leitura e revisão, depois operação ([plano](../process/segunda-pessoa-acesso-gradual.md)).
5. **Porta de entrada para contribuidor (PM-41):** 10 issues e guia de uma página ([rascunho](../process/primeiras-tarefas-contribuidor.md)).
6. **Indicação de quem já trabalha com comunidades** vale mais que divulgação.

**Sinal:** 1 comunidade nomeada e 1 pessoa nova com permissão em 60 dias; a comunidade faz 2 decisões seguidas sem o mantenedor pedir.
**Mudar de plano se:** as três candidatas disserem não. Ouvir o motivo e trocar a cunha.

## 2. Rede que não funciona sem o mantenedor: medir antes de construir

**Objetivo:** saber, com número, se duas pessoas conseguem se achar e trocar mensagem sem ajuda.

**Jogadas**
1. **Teste de dois navegadores no CI** (Playwright): pareia por WebSocket e por Nostr, troca uma DM, falha se não conseguir.
2. **Contadores locais em `#/status` (PM-18)**, exportáveis por opção, sem telemetria central.
3. **Segundo nó de sinalização (REV-01)** na Cloudflare.
4. **Apoiadores na tomada** (1 ou 2 da própria comunidade) como cache; documentar o que cada um vê e guarda.
5. **Push com app fechado (PM-22) só se o piloto pedir.**
6. **TURN (REV-10)** só quando o número mostrar falha de conexão.

**Sinal:** taxa de pareamento medida no CI em 30 dias; no piloto, ≥80% das tentativas conectam sem ajuda.
**Mudar de plano se:** a taxa ficar abaixo de 50% em rede móvel. Aí TURN passa para antes.

## 3. Chave e identidade frágeis: dar saída antes de dar peso

**Objetivo:** perder o celular não pode custar a identidade.

**Jogadas**
1. **Recuperação por cartão QR (PM-13):** chave de recuperação impressa que assina a troca de chave.
2. **Backup como passo do onboarding**, com simulado de perda numa aba limpa.
3. **iOS (REV-14):** `storage-persistence`, guia de "Adicionar à Tela de Início" e backup em QR.
4. ~~Chave não exportável (PM-12)~~ feita no PM-93.
5. **Revisão externa (LAN-18)** de `local-account.js`, `key-lock.js`, `crypto-dm.js`, `sig-format.js` e do cofre.

**Sinal:** 100% do piloto com backup restaurável testado; 1 simulado de troca de chave.
**Mudar de plano se:** a revisão achar falha crítica. Parar feature e tratar como incidente ([ADR-024](../adr/024-divulgacao-responsavel-e-honestidade-de-seguranca.md)).

## 4. Produto pesado e não testado com leigos: ouvir e emagrecer

**Objetivo:** primeira visita abaixo de um orçamento de bytes; 5 leigos completando as tarefas centrais.

**Jogadas**
1. **Teste com 5 leigos (LAN-25):** identidade, backup, postar, entrar numa comunidade, recuperar.
2. **Dieta do shell:** PM-04 e PM-02 feitos; falta o **PM-01**.
3. **Economia de dados (PM-26).**
4. **Smoke de telas (PM-05).**
5. **Auditoria de `innerHTML` (PM-16).**
6. **Acessibilidade básica (LAN-22)** nas 10 telas principais.

**Sinal:** 4 de 5 leigos completam 4 de 5 tarefas sem ajuda.
**Mudar de plano se:** os leigos travarem no onboarding. Parar de acrescentar telas e reescrever esse fluxo.

## Plano de 90 dias

| Janela | Foco | Entregas |
|---|---|---|
| Semanas 1–2 | Destravar o que é humano | Briefing jurídico enviado; 3 candidatas contatadas; 10 issues abertas; segunda pessoa convidada |
| Semanas 2–6 | Medir a rede e fechar a saída da chave | Teste de dois navegadores no CI; contadores em `#/status`; PM-13; PM-01 |
| Semanas 6–10 | Piloto fechado | 1 comunidade no modo assembleia; Apoiador na tomada; segundo nó de sinalização |
| Semanas 10–13 | Retrospectiva e decisão | PIL-03; parecer em mãos; teste com 5 leigos; decidir o beta ou trocar a cunha |

## Riscos que atravessam tudo

- **Dispersão:** se for preciso cortar, cortar o ponto 4, não o 5 nem o 1.
- **Otimismo de medição:** o Nostr nunca foi testado entre dois navegadores em campo. Só acreditar depois do ponto 2.
- **Regra "nada grande antes do PIL-01":** modo assembleia e recuperação de chave só entram porque são a cunha e a saída do piloto.
