# Segunda pessoa com acesso — convite e acesso em etapas (LAN-30)

> **Status:** rascunho para o mantenedor · **Owner:** mantenedor · **Revisado:** 2026-11-10
> **Não substitui** o [ROADMAP.md](../ROADMAP.md) (LAN-30) nem o [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md). Em 10/11/2026 ainda **não há** pessoa escolhida; nada foi enviado.

## 1. Por que

Hoje uma pessoa só tem acesso a tudo: código, deploy, contas e plantão. O que tira o projeto dessa situação não é mais commit, é **distribuir decisões e acessos**. O G1 pede uma segunda pessoa no GitHub e no Render; o G3, em todas as contas, numa organização.

## 2. Quem procurar

- Quem já revisou um PR ou abriu uma issue útil (depois do [PM-41](./primeiras-tarefas-contribuidor.md)).
- Alguém indicado por organização que trabalha com comunidades ou direitos digitais.
- Perfil: lê código ou documentação com cuidado, tem uma ou duas horas por semana, e topa um compromisso de 3 meses, revisável.

## 3. Acesso em etapas

Cada etapa só começa quando a anterior funcionou por pelo menos duas semanas. Toda conta com **2FA**.

| Etapa | Acesso | O que a pessoa faz | Muda o quê |
|---|---|---|---|
| 0. Leitura | Nenhum (o repositório é público) | Lê a documentação e revisa PRs com comentários | Nada |
| 1. Triagem | GitHub **Triage** | Rotula e organiza issues, fecha duplicadas | Nada no código |
| 2. Revisão | GitHub **Write** e dona no `.github/CODEOWNERS` | Aprova PRs; o ruleset passa a exigir 1 aprovação e revisão de code owner (PM-95) | O mantenedor deixa de fazer merge sozinho |
| 3. Operação | Membro das contas de deploy (Render, Cloudflare, Hugging Face) | Reinicia nó, confere deploy, segue o [runbook](../operations/runbook-incidentes.md) | Bus factor do deploy sai de 1 |
| 4. Plantão | Substituta no procedimento de conteúdo grave (LAN-04) | Cobre o operador em férias ou ausência | O plantão do piloto deixa de depender de uma pessoa |

**Etapa 2 com cuidado:** com a revisão obrigatória ligada, o mantenedor não consegue mais aprovar o próprio PR. Combinar antes o prazo de resposta da revisão (ex.: 3 dias) e o que fazer em emergência (o mantenedor contorna o ruleset como admin e registra o motivo no PR).

## 4. Quem decide o quê

Rascunho para virar seção de [GOVERNANCE.md](../../GOVERNANCE.md) quando a etapa 2 começar.

| Decisão | Hoje | Depois da etapa 2 |
|---|---|---|
| Merge no `main` | Mantenedor | Quem não escreveu o PR aprova |
| ADR e mudança de protocolo | Mantenedor | Mantenedor, com revisão da segunda pessoa |
| Segredos e contas de deploy | Mantenedor | Os dois, com 2FA; troca de segredo avisada |
| Resposta a incidente de segurança | Mantenedor | Quem estiver de plantão; o outro é avisado em 24 h |
| Conteúdo grave no piloto | Operador (mantenedor) | Operador ou substituta |
| Moderação dentro de uma comunidade | Moderadores dela | Igual (não muda) |

## 5. Mensagem sugerida (não enviada)

> Oi, [nome]. Sou [nome], mantenedor do Vox, um aplicativo livre para comunidades conversarem e decidirem juntas, sem servidor central de conteúdo.
>
> Hoje só eu tenho acesso ao código, ao deploy e às contas. Isso é um risco para o projeto e para quem for usar. Estou procurando uma segunda pessoa para começar revisando PRs (uma ou duas horas por semana) e, se fizer sentido para os dois, ganhar acesso aos poucos.
>
> O plano em etapas está em [link]. Topa conversar 30 minutos?
