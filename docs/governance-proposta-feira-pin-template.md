# Modelo de proposta — Feira comunitária + recomendação de espelho leve (V-I07)

**Uso:** copiar/adaptar no composer `#/compose/proposal?c=<Community-Id>`.  
**Norma:** [GOVERNANCE.md](../GOVERNANCE.md) (Feira M, Deliberação G).  
**Contexto infra:** backlog `V-I01`–`V-I05` (espelho relay, manifesto de pin — rascunho).  
**Branch doc:** `docs/governance-feira-pin` · **Dono:** Community-doc

---

## O que esta proposta faz (e o que não faz)

| Parte | Efeito após merge | Vinculante? |
|-------|-------------------|-------------|
| **Feira (classificados)** | Cliente aplica `commercialEnabled: true` (aba Classificados) | **Sim** — só com voto aprovado |
| **Recomendação de pin/espelho leve** | Texto orienta membros Apoiador/Steward a espelhar índice local | **Não** — opt-in individual; sem punição por não participar |

A feira continua **fora** do feed “Para você”, **sem taxas** e **sem boost pago**. Espelhar acelera leitura de ofertas; **não** compra alcance algorítmico.

---

## Proposta 1 — Habilitar feira (obrigatória para abrir classificados)

### Título (exemplo)

`Ativar feira comunitária e classificados populares`

### Motivação (corpo — colar no campo *Motivação*)

```markdown
Propomos habilitar a aba **Classificados** nesta comunidade para troca solidária e comércio popular entre membros (artesanato, marmitas, brechó, serviços locais), com contato via DM e Pix **direto** — o Vox não intermedia pagamento.

**Regras que aceitamos ao aprovar:**
- Ofertas só na aba Classificados; nunca no feed principal de debates.
- Preços honestos; proibido spam e anúncios enganosos.
- Moderação segue `mod-action` público; fechar a feira exige nova proposta.

**Recomendação não vinculante (pin leve):** após aprovação, **sugerimos** (sem obrigar) que quem opera relay local ou camada Apoiador/Steward considere espelhar um índice leve da comunidade (`POST /vox/mirror` no relay desktop — ver `relay/README.md`). Quem preferir permanecer Passivo/Ativo sem espelho continua plenamente membro e vendedor.
```

### Diff unificado (campo *Diff*)

```diff
@@ regras-comunidade.yaml @@
 category: "<sua-categoria>"
- commercialEnabled: false
+ commercialEnabled: true
+ commercialRules: "Produtos artesanais, alimentos frescos e serviços locais; Pix+DM direto; sem taxas Vox."
+ mirrorRecommendation: "optional-light-pin"
+ mirrorRecommendationNote: "Sugestão comunitária — não condiciona postagem na feira."
```

> **Nota técnica:** hoje o cliente ativa a feira ao detectar `commercialEnabled: true` em proposta `merged`. Campos `mirrorRecommendation*` são **documentação comunitária** até `V-I05` (manifesto assinado); não alteram permissões no app.

### Quorum e prazo (orientação)

- Definir `Closes-At` com antecedência mínima de **72h** em comunidades pequenas; **7 dias** se > ~50 membros ativos.
- `minQuorum`: número realista (ex.: 3 votos elegíveis **sim** para comunidades de bairro).

---

## Proposta 2 (opcional) — Steward: espelho leve da feira

Use **somente** se a comunidade quiser registrar intenção coletiva de infra (ainda **sem** obrigar ninguém).

### Título (exemplo)

`Recomendar espelho leve do índice da feira (voluntário)`

### Motivação (resumo)

```markdown
Com a feira ativa, **recomendamos** que até N stewards voluntários mantenham espelho local (`GET /vox/index/<Community-Id>.json`) com TTL curto e quota de disco documentada. Não exigimos relay remoto nem doação. Meta: ofertas recentes carregarem rápido em link fraco ou LAN do coletivo.
```

### Diff (opcional — metadados)

```diff
@@ infra-comunitaria.yaml @@
- mirrorPolicy: "none"
+ mirrorPolicy: "recommended-voluntary"
+ mirrorScope: "listings-recent-7d"
+ mirrorMaxStewards: 3
```

---

## Checklist antes de publicar

- [ ] Comunidade `Community-Id` correto no composer.
- [ ] Diff inclui `commercialEnabled: true` se o objetivo é abrir classificados.
- [ ] Texto deixa claro: **recomendação de pin ≠ requisito** para vender ou votar.
- [ ] Regras de moderação e Pix+DM alinhadas a [GOVERNANCE.md](../GOVERNANCE.md) e [COMPLIANCE-BR.md](../COMPLIANCE-BR.md).

## Referências

- Demo: proposta `demo-prop-feira` em `client/js/mock.js`
- Relay: [relay/README.md](../relay/README.md) — `/vox/mirror`, `/vox/index/<commId>.json`
- Spec espaços digitais: `docs/espacos-digitais-infra.md` (`V-I01`, branch `docs/espacos-digitais-infra`)

**Versão:** 1.0 · **Item backlog:** V-I07
