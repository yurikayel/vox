# ADR-034: Raiz e subchaves por aparelho — perder o celular é revogar uma subchave, não perder a conta

**Status:** accepted (2026-11-17, aceito como direção pelo mantenedor; nada implementado; RFC 0002 e revisão externa de cripto, LAN-18, antes de qualquer código; identidade congelada desde 17/11) · **Revisado:** 2026-11-17 (portões explícitos) · **Relacionados:** [ADR-032 §3.6](./032-login-perene-a-conta-nasce-com-saida.md#36-fora-desta-decisão-próximo-adr) (de onde este ADR vem), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md) (conta travada), [spec PM-13 (rotação e revogação)](../specs/rotacao-revogacao-chave-pm13.md), [spec dos guardiões](../specs/guardioes-v0.md) §10, [THREAT-MODEL](../THREAT-MODEL.md) (T24, T25), [ROADMAP](../ROADMAP.md) (PM-13, PM-101, REV-14, LAN-18), [brainstorm 2027 §3 F](../brainstorms/brainstorm-roadmap-2027.md#f-identidade-e-chaves)

## 1. Contexto

Hoje a conta **é** uma chave: o `routeId` (`vx_…`) é o SHA-256 da chave pública de assinatura (`computeRouteId`), e tudo o que a pessoa publica é assinado por essa mesma chave, que fica em cada aparelho onde a conta está aberta. Daí saem três problemas:

1. **Celular perdido ou roubado = chave exposta para sempre.** Não há como dizer "esta chave não vale mais" sem perder o `vx_…`, os seguidores e o histórico.
2. **A frase, os guardiões e o cofre devolvem a mesma chave** que estava no aparelho perdido. Recuperar a conta não tira o ladrão dela.
3. **A lápide de conta (PM-101) e a troca de chave (PM-13)** não têm quem assine com autoridade acima do aparelho.

O ADR-032 §3.6 deixou isso para um ADR próprio e já apontou o caminho: a semente de 12 palavras é a raiz.

## 2. Opções

1. **Ficar como está** (uma chave por conta). Simples; não resolve nenhum dos três problemas.
2. **Raiz nova, com `routeId` novo derivado dela.** Desenho limpo, mas muda o `vx_…` de todas as contas: perde seguidores, links, guardiões e assinaturas antigas. Recusada.
3. **A chave de assinatura de hoje vira a raiz; cada aparelho assina com uma subchave delegada por ela.** O `vx_…` não muda. **Escolhida.**

## 3. Decisão

### 3.1 A raiz é a chave de hoje
- **Conta com semente (12 palavras):** a raiz é a chave que já sai da semente por HKDF (`vox-assinatura-p256`). O `routeId` continua o mesmo.
- **Conta antiga (24 palavras):** a raiz é a própria chave de assinatura que a frase codifica. Também não muda.
- Itens assinados direto pela raiz (v1 e v2, tudo o que existe hoje) **continuam válidos**. A raiz pode sempre assinar sozinha.

### 3.2 Cada aparelho tem a sua subchave
- Ao abrir a conta num aparelho, ele gera um par P-256 próprio (**subchave**) e a raiz assina uma **delegação**: `{ t: "vox-delegacao", v: 0, root: <routeId>, sub: <JWK pública da subchave>, device: <rótulo curto>, seq, createdAt }`.
- Posts, votos, perfil e mensagens do dia a dia passam a ser assinados pela subchave e levam a delegação junto. Quem verifica confere:
  1. a delegação foi assinada por uma chave cujo `computeRouteId` é o `author`;
  2. o item foi assinado pela `sub` da delegação;
  3. a subchave não está revogada (§3.3).
- A chave de DM fica como está no v0 (derivada da semente, igual em todos os aparelhos). Trocar a chave de DM é uma declaração assinada pela raiz com a pública nova, e entra no mesmo registro de chaves (§3.3).

### 3.3 Registro de chaves e revogação
- A raiz assina um **registro de chaves** com `seq` crescente: as subchaves válidas, as revogadas (com data) e a chave de DM atual. **O de maior `seq` vence.** Ele viaja como o perfil (malha, memória central, relay).
- **Perder o celular:** a pessoa abre a raiz (frase, guardiões ou cofre) num aparelho, e a raiz publica um registro novo sem a subchave perdida. Itens novos assinados por ela passam a ser recusados.
- **Itens antigos da subchave revogada:** quem tem a subchave pode antedatar. Por isso, a pessoa escolhe na revogação uma data de corte; os itens dessa subchave depois do corte são escondidos, e os anteriores aparecem com a marca "assinado por um aparelho que foi revogado". Cópias que os aparelhos de quem segue receberam antes da revogação guardam a hora em que chegaram; essa hora de chegada, não a data que o item diz, decide de que lado do corte ele fica nesses aparelhos.

### 3.4 A raiz sai do dia a dia
- Com a subchave delegada e uma saída soberana confirmada (frase conferida, M recibos dos guardiões ou cofre gravado), o aparelho **pode esquecer a raiz e a semente**. A partir daí, a raiz só existe no papel, nos guardiões ou no cofre.
- Esquecer a raiz é **escolha da pessoa** no v0, com texto claro: sem a raiz, trocar de aparelho ou revogar pede a frase, os guardiões ou o cofre. Virar o padrão depende do piloto.
- Abrir a conta num aparelho novo (frase, guardiões, cofre, QR de outro aparelho) entrega a raiz por um momento: ela delega uma subchave nova e, se a pessoa quiser, é esquecida de novo.

### 3.5 O que fica para depois
- **Raiz comprometida** (alguém pegou a frase, T24): este desenho não salva o `vx_…`. A saída futura é uma declaração "esta conta mudou para `vx_novo`" assinada pela raiz antiga, com espera e veto (brainstorm 2027 §3 F.4). Fica para outro ADR.
- **Recuperação pela comunidade que troca a raiz** (k de n assinam, 72 h de espera): depende da revisão externa de cripto (LAN-18).
- **Subchave de DM por aparelho** e envelope cego: com a mochila de DMs (PM-79).

## 4. Consequências

- **RFC 0002 antes do código:** formato exato da delegação, do registro de chaves e da assinatura v3 (o item leva `deleg`), regras de convivência com v1/v2 e vetores de teste. Revisada no LAN-18.
- **Verificação em três lugares:** cliente (`signed-verify.js`), relay e memória central. Os três precisam aceitar v3 antes de qualquer aparelho assinar com subchave; até lá, a raiz continua assinando como hoje.
- **PM-13 muda de forma:** o "cartão de recuperação que assina a troca" passa a ser a raiz (frase ou cartão impresso do REV-14). **PM-101** (lápide de conta) é um registro de chaves final, assinado pela raiz, sem subchaves válidas.
- **Guardiões continuam iguais:** o pedaço já carrega `kind` (`semente` ou `chave`) e devolve a raiz.
- **Custo:** cada item assinado fica maior (a delegação vai junto, uns 300 bytes). Dá para mandar só o hash da delegação depois que ela foi vista, decisão da RFC.
- **Risco que fica:** quem pega um aparelho destravado usa a subchave até a revogação chegar aos outros. A revogação viaja pela malha, sem servidor que a imponha a todos ao mesmo tempo.
