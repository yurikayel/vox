# Piloto comunidade — go / no-go (V-P09)

> **Status:** canônico (gate humano V-P09) · **Owner:** mantenedor · **Revisado:** 2026-11-13

Gate humano antes de abrir as 4 semanas do piloto. Preencher **todos** os papéis nomeados; até lá, status **`blocked-human`**.

> **Critério de elegibilidade do círculo:** Candidato a círculo piloto deve ser um coletivo que **já se reúne e possui laços reais** (ex.: NDP, Debate Aberto, sindicato, associação comunitária) — **não** uma chamada genérica para "usuários da internet". Os campos de nomes abaixo continuam vazios até confirmação humana formal.

## Papéis (nomear — não inventar no repo)

| Papel | Nome / contato |
|-------|----------------|
| Facilitador local | |
| Fundador (comunidade) | |
| Community-doc (retrospectiva + docs piloto) | |
| Relay Buddy (sucessão steward, V-P08) | | ver [steward-relay-buddy.md](../operations/steward-relay-buddy.md) |
| Canal paralelo Zap/Telegram (URL ou descrição) | |

## Alpha testers (teste aberto — T-18)

Gate **humano** antes de anunciar convite público além do círculo fechado. Preencher **somente** com nomes reais acordados offline — **não** inventar no repositório.

| Campo | Valor |
|-------|--------|
| **Host do teste** | |
| **Canal** (Zap/Telegram — URL ou descrição) | |
| **Data de abertura** | |
| **Status** | **`blocked-human`** *(trocar quando host + canal + data estiverem definidos)* |

**Pacotes doc (mutex):** [teste-aberto-convite.md](./teste-aberto-convite.md) · [teste-aberto-canal-apoio.md](./teste-aberto-canal-apoio.md) · [teste-aberto-carta-moderacao-e2.md](./teste-aberto-carta-moderacao-e2.md)

> **Nota:** isto **não** fecha V-P09 — o gate [checklist pré go-live](#checklist-pré-go-live) abaixo permanece obrigatório para o piloto de 4 semanas.

## Checklist pré go-live

| Item | OK | Notas / link |
|------|:--:|--------------|
| Ritual seed V-P05 executável no grupo ([checklist pós-criação](../../client/js/community-seed-checklist.js) · [direcionamento §2.1](../strategy/direcionamento-crescimento-rede-2026-11.md)) | [ ] | |
| Carta de moderação **E2** — rascunho 1 página acordado com mods (antes do dia 7) | [ ] | [playbook E1–E5](../archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) · [direcionamento §4.3](../strategy/direcionamento-crescimento-rede-2026-11.md) |
| **T2** — URL do espelho shell **B** no convite **ou** waiver documentado (motivo + data + quem aceitou o risco) | [ ] | [ops-shell-mirrors.md](../operations/ops-shell-mirrors.md) |
| Decisão **feature freeze** piloto (CODE-01): só doc/fix/hotfix em `main` durante as 4 semanas | [ ] | [brainstorm pós-v82 § freeze](../archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |

## Critério de go para o beta por convite (LAN-28)

Escrito **antes** do piloto, para o resultado não ser interpretado de forma conveniente depois. Medido com métricas locais e honestas (CODE-02), sem telemetria central: cada facilitador coleta e anota na retrospectiva. Rascunho para o grupo revisar e aceitar no dia 0.

| Critério | Meta para "go" | Como medir |
|---|---|---|
| Retenção | ≥ 50% das pessoas do círculo postam ou respondem na **semana 4** | contagem manual na comunidade do piloto |
| Steward externo | ≥ 1 pessoa que **não** é o mantenedor opera relay ou espelho por ≥ 7 dias | URL + print do `#/status` (NET-04) |
| Incidentes graves | 0 denúncia grave sem resposta em **24 h** | registro de denúncias (LAN-12) + ata do plantão (LAN-04) |
| Conexão P2P | ≥ 70% das sessões conectam a pelo menos 1 par | `#/settings/network`: aparelhos conectados, anotado pelo facilitador |
| Disponibilidade sem Arweave | nenhuma gravação acidental no Arweave (pausado por diretriz; tudo pela rede de seguidores) e replicação verificada | conferência de configuração (`arweaveUpload: false`) + relato na retrospectiva |
| Perda de conta | 0 pessoa que perdeu a identidade sem conseguir recuperar | relato na retrospectiva |
| Satisfação | ≥ 70% "recomendaria para outro grupo" | pergunta única na retrospectiva |

**No-go automático:** vazamento de chave ou DM; conteúdo de abuso infantil sem resposta; mantenedor como única pessoa operando tudo na semana 4.

## Decisão

| Campo | Valor |
|-------|--------|
| **Status** | `blocked-human` *(trocar para `go` ou `no-go` quando papéis + checklist estiverem completos)* |
| Data da decisão | |
| Quem registrou | |

## Pós-piloto

Retrospectiva 7–14 dias após go-live: [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md).

**Versão:** 1.0
