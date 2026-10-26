# Governança e moderação

> **Status:** canônico (protocolo mod/deliberação) · **Owner:** mantenedor protocolo · **Revisado:** 2026-11

O Vox não possui um “time de trust & safety” central. Comunidades são espaços com regras locais; a permaweb guarda o registro; **clientes decidem o que mostrar**.

**Repositório vs comunidade:** [github.com/yurikayel/vox](https://github.com/yurikayel/vox) publica e revisa **código** e documentação técnica ([docs/README.md](./docs/README.md), [CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md)); não opera relay central nem moderação das suas comunidades. Stewards e moderadores locais respondem pela infra e pelas regras do espaço — a [Voxpedia](https://yurikayel.github.io/vox/#/voxpedia) explica o app; specs e runbooks ficam no GitHub para auditores e novos voluntários (~30 min: índice + status + um owner por doc).

## Princípios

1. **Transparência:** Ações de moderação são transações públicas (`Type: mod-action`), assinadas por chaves reconhecidas como moderadoras daquela comunidade.
2. **Não-deleção:** Esconder ≠ apagar. Usuários avançados ou outros clientes podem ignorar filtros.
3. **Autonomia pessoal:** Todo usuário pode bloquear autores ou ocultar conteúdo só para si (preferências locais, Fase 2+).

## Tag `mod-action`

| Tag | Valor |
|-----|--------|
| `App-Name` | `vox-brasil` |
| `Type` | `mod-action` |
| `Community-Id` | ID da comunidade (geralmente TX ID da transação `community`) |
| `Action` | `hide` \| `ban` \| `unhide` \| `unban` (extensível) |
| `Target` | TX ID do tópico/resposta, ou endereço Arweave do autor (para `ban`) |

### Validação no cliente (Fase 1: leitura preparada)

1. Carregar lista de moderadores autorizados (publicada pela comunidade — tag ou documento referenciado; convenção a detalhar na Fase 2).
2. Para cada `mod-action`, verificar assinatura do `owner` contra essa lista.
3. Aplicar regras:
   - **hide:** não renderizar `Target` na listagem da comunidade/tópico.
   - **ban:** ocultar todo conteúdo cujo `owner.address` coincida com `Target`.

Ordem: ações mais recentes prevalecem (`HEIGHT_DESC` por moderador ou merge por timestamp de bloco).

## Índice espelho opcional

Gateways GraphQL indexam tudo; um **espelho Vox** (JSON estático ou query curada) pode:

- Pré-aplicar `mod-action` conhecidos para listagens “family-friendly”.
- Destacar comunidades verificadas manualmente.

Espelhos são **opcionais** e **substituíveis**; o client Fase 1 fala direto com gateways públicos em [client/config/gateways.json](./client/config/gateways.json).

## Abuso e conteúdo ilegal

- Clientes podem integrar listas de hash/TX reportadas (espelho).
- Obrigações legais brasileiras (LGPD, conteúdo eleitoral) estão resumidas em [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) — **não substituem assessoria jurídica**.

## Nós Participativos, Relays e Responsabilidade sobre Cache (Fases 3 e 3.1)

- Na **Fase 3.1 (Pacto Vox)**, a participação distribuída do nó leve é **ativa por padrão (default-on)** mediante contrato transparente apresentado na primeira abertura do app.
- O app armazena cópias de cache local no IndexedDB exclusivamente para aceleração de navegação e compartilhamento peer-to-peer de dados que já são 100% públicos e imutáveis no permaweb Arweave.
- O modelo garante reciprocidade: soberania dos dados do usuário (chaves locais) em troca de infraestrutura compartilhada sem servidores corporativos centrais.
- Usuários mantêm autonomia absoluta para pausar ou desligar a contribuição a qualquer momento através de `#/settings/network` ("Pausar contribuição").
- Limites de proteção diários (teto de banda de 50 MB/dia, cache de 25 MB e salvaguardas de Wi-Fi) asseguram que a rede não gere ônus imprevisto de dados ou bateria.
- Operadores de relay desktop (`vox/relay/`) e nós leves mantêm total prerrogativa para limpar o cache a qualquer momento.
- Espelhos públicos que recebam notificações judiciais devem suprimir a renderização dos conteúdos ilícitos em seus índices locais, em estrita observância ao Marco Civil da Internet (Art. 19).

## Papéis de operador de infra voluntária

A malha Vox não tem operador central de infra. Quem usa ou **adquire espaços digitais** (comunidade, handle, feira) pode optar por camadas de participação definidas em [docs/espacos-digitais-infra.md](./docs/espacos-digitais-infra.md). Obrigações legais (LGPD, Marco Civil, espelho) estão em [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) (§ Infraestrutura voluntária).

| Camada | Operador | Deveres mínimos (comunidade / protocolo) | Relação com moderação e espelho |
|--------|----------|------------------------------------------|----------------------------------|
| **Passivo** | Leitor | Nenhum para a malha; pode pausar Pacto | Consome feeds; filtros pessoais locais |
| **Ativo** | Usuário com Pacto Vox | Respeitar tetos (banda, disco, Wi-Fi); servir só payload **público**; opt-out soberano | Não aplica `mod-action` alheio automaticamente |
| **Apoiador** | Ativo + `commOnly` | Priorizar WANT/BLOB das **comunidades em que participa**; não usar escopo para spam externo | Acelera cache da feira/comunidade “do bairro” |
| **Steward** | Relay/espelho (LAN/VPS) | Quotas, saúde do relay, TTL de cache; **documentar** URL e política; canal para ordens judiciais | Pode pré-aplicar `mod-action` no índice espelhado; suprimir TX na **lista local** (não on-chain) |

### Steward e índice espelho

1. **Opcional e substituível:** clientes podem ignorar um espelho e falar direto com gateways Arweave ([gateways.json](./client/config/gateways.json)).
2. **Mirror comunitário:** `POST /vox/mirror` e `GET /vox/index/<Community-Id>.json` consolidam leitura rápida; stewards **não** ganham poder de moderador só por hospedar disco.
3. **Alinhamento com a comunidade:** moderadores continuam emitindo `mod-action` on-chain; o steward **escolhe** se o espelho honra essas ações na listagem servida.
4. **Feira habilitada (`V-I07`, sugestão não vinculante):** comunidade pode **recomendar** pin/espelho leve a apoiadores/stewards — nunca exigir contribuição de infra para postar ou vender na feira.
5. **Conflito de política:** se membros discordarem do filtro de um espelho, podem forkar cliente, apontar outro relay ou publicar índice alternativo — mesma lógica do § Escalonamento (item 4).

### Princípios de governança da infra

- **Opt-in / opt-out:** downgrade para Passivo a qualquer momento em `#/settings/network`.
- **Sem score público de reputação de nó** — evita pressão social ou trabalho não remunerado disfarçado de ranking.
- **Sem alcance pago:** contribuir banda ou disco **não** compra visibilidade no feed (ver § Feira Comunitária).

## Escalonamento comunitário

1. Criador define moderadores (transação de configuração).
2. Moderadores emitem `mod-action`.
3. Membros reportam via link externo ou futuro fluxo off-chain (Fase 2+).
4. Fork de cliente ou espelho se a comunidade discordar da política global de um espelho.

## Deliberação, Propostas e Voto Comunitário (Fase G)

O Vox adota o princípio de **rede como repositório público**: regras comunitárias não mudam por decisão unilateral de moderador ou algoritmo corporativo, mas por deliberação pública auditável, análoga a um fluxo de proposta e revisão de código aberto.

### Tags de Governança

| Tag | Tipo | Descrição |
|-----|------|-----------|
| `Type` | `governance-proposal` | Abertura formal de proposta de mudança de regra, inclusão de moderador ou habilitação de recursos. |
| `Community-Id` | ID da comunidade | Escopo da comunidade deliberativa. |
| `Title` | Texto curto | Título descritivo da proposta. |
| `Body` | Texto/Markdown | Motivação e especificação de regras ou diff proposto (`Diff-Format: unified\|markdown`). |
| `Eligibility-Cutoff` | Timestamp ISO | Marco temporal de corte para votantes elegíveis (**igual ao timestamp de criação da proposta**). |
| `Closes-At` | Timestamp ISO | Prazo final para computação de votos. |
| `State` | `open` \| `merged` \| `rejected` \| `expired` | Estado da deliberação. |

| Tag | Tipo | Descrição |
|-----|------|-----------|
| `Type` | `governance-vote` | Registro de voto de um membro. |
| `Proposal-Id` | TX ID da proposta | Identificador da proposta votada. |
| `Choice` | `yes` \| `no` \| `abstain` | Opção do votante. |

### Regra Canônica de Elegibilidade Anti-Brigading

Para impedir invasões orquestradas, compras de contas e brigading de última hora (comuns em enquetes de redes centralizadas):

1. **Marco de Corte Temporal (`Eligibility-Cutoff = Proposal-Created-At`):** Apenas contas cuja transação de adesão à comunidade (`Type: membership` ou registro local equivalente) possua timestamp comprovadamente **anterior** ao momento de criação da proposta têm seus votos contabilizados no *tally* (apuração).
2. **1 Membro = 1 Voto ($1\times$):** Não há peso diferenciado por karma, curtidas, seguidores ou antiguidade.
3. **Badges sem Poder Político Extra:** Selos de identidade (como GitHub verificado, gov.br ou Chave Pix informada) funcionam exclusivamente como atestados visuais de confiança pública; eles **nunca** multiplicam o peso do voto, que permanece rigorosamente $1\times$.
4. **Apuração Transparente no Cliente:** Votos emitidos por contas posteriores ao cutoff podem ser visualizados na chain (não há censura de transação), mas o cliente os marca explicitamente como *"voto não computado (entrada na comunidade posterior à abertura da proposta)"*.

---

## Feira Comunitária e Classificados (Fase M)

Milhões de pessoas utilizam redes sociais para sustento familiar e comércio popular (venda de marmitas, brechó, artesanato, serviços locais). O Vox acolhe essa realidade sem transformar a rede em um shopping corporativo ou poluir o feed principal:

1. **Opt-in por Governança (Default-Off):** Toda comunidade inicia com o modo comercial **desativado**. A criação da aba de classificados exige proposta formal aprovada pelos membros (`Commercial-Posts: enabled`).
2. **Separação Rígida de Feeds:** Publicações de ofertas (`Type: listing`) vivem exclusivamente na aba **Classificados** da comunidade respectiva. Elas **nunca** são injetadas no feed principal "Para você", preservando a integridade das conversas e do debate.
3. **Sem Intermediação Financeira (Pix + DM Direto):** O Vox **não é instituição de pagamento (PSP)**, não processa pagamentos, não faz escrow e não cobra comissões nem taxas sobre vendas. O contato ocorre via DM e o pagamento via Pix direto para a chave informada pelo vendedor no card ou perfil.
4. **Sem Impulsionamento Pago:** Não existem ferramentas de *boost*, alcance pago ou leilão de visibilidade. A feira comunitária é estritamente cronológica e baseada no território e nas regras decididas pela própria comunidade.

