# ADR-016: Design System Sovereign Agora Luminescent Matrix, Arquitetura Planar Stelae e Módulo de Democracia Direta

- **Status:** Ratificado
- **Data:** 2026-11-06
- **Contexto:** Integração do pacote Stitch (`stitch_vox_civic_network_interface`) ao cliente Vox de produção (`vox/client`)
- **Autores:** Yuri Kayel / Antigravity Agentic Hardening Framework

---

## 1. Contexto e Motivação

O ecossistema digital contemporâneo saturou-se no paradigma de cartões fechados ("card UI"), molduras flutuantes elevadas e cinzas burocráticos que fragmentam a leitura e impõem fricção cognitiva desnecessária. Nas redes sociais tradicionais, o modelo puramente orientado a algoritmos de engajamento infinito estimula a polarização e descaracteriza a identidade cívica.

Com a entrega do pacote de design system e protótipos Stitch (**"Sovereign Agora Luminescent Matrix"**), surge a oportunidade de formalizar a identidade visual e funcional definitiva do Vox: uma praça pública digital soberana que funde:
1. A **estética visual-first imersiva** e contínua do Instagram Dark Mode (fotos em sangramento total, fundo preto absoluto `#000000`, ações ergonômicas).
2. A **grelha de conversação rápida e fluida** do microblogging (Twitter/Threads).
3. A **topologia comunitária e de perfil autêntico** do Orkut (mural de recados, comunidades e depoimentos).
4. A **monumentalidade deliberativa da Ágora ateniense**, onde o debate culmina em deliberação vinculante de democracia direta.

---

## 2. Decisões Técnicas e Arquiteturais

### 2.1. Arquitetura "Planar Stelae" (Abolição Definitiva de Cards)
- **Eliminação de Bordas e Caixas:** Extinção de `border-radius` em posts, margens flutuantes isoladas e caixas tracejadas.
- **Substrato Basalto OLED (Z-0):** O canvas do feed é unificado em preto absoluto (`#000000` / `#0d0f12`), otimizando telas OLED e eliminando o contraste cinza externo.
- **Divisores de Entablamento (Hairlines de 1px):** As publicações organizam-se como estelas planares contínuas, delimitadas apenas por divisores horizontais sutis de 1px (`#232830` / `var(--border-subtle)`).

### 2.2. Sistema de Tokens Semânticos
Declarados nativamente em `vox/client/css/style.css`:

```css
:root {
  --obsidian-oled: #0d0f12;
  --slate-deep: #111316;
  --surface-monolith: #171a1f;
  --surface-column: #1f2329;
  --travertine-linen: #f4eedd;
  --travertine-muted: #e2dcce;
  --emerald-consensus: #10b981;
  --emerald-bright: #34d399;
  --cobalt-telemetry: #3b82f6;
  --cobalt-pure: #2563eb;
  --cyan-bridge: #06b6d4;
  --entablature-hairline: #232830;
  --entablature-active: rgba(244, 238, 221, 0.15);
  --aurora-gradient: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
  --font-epigraphic: "Noto Serif", serif;
  --font-telemetry: "Inter", var(--font-sans);
}
```

### 2.3. Cinetismo Luminescente no Botão Primário (`+ Postar`)
O botão `.tab-item.compose-tab` no desktop e mobile adota o **Aurora Gradient** (`#10b981 → #06b6d4 → #3b82f6`), com texto em Obsidian `#0d0f12` em negrito e resplendor luminescente de 16px (`rgba(16, 185, 129, 0.25)`), comunicando prontidão cinética instantânea.

### 2.4. Rota e Módulo de Democracia Direta (`#/vote`)
- **Navegação Primária:** Promovida a rota `#/vote` (e `#/votacao`) para a barra lateral do shell ao lado de Ágora, Comunidades, Pessoas, Mensagens e Perfil.
- **Câmara Distrital Soberana:** Painel deliberativo com telemetria ZK-SNARK distrital (`#SP-011 PINHEIROS`), quórum mínimo vinculante de 70% e contagem de votos favoráveis vs. contrários.
- **Sufrágio Criptográfico:** Ações de *Votar Sim*, *Contestar* e *Endossar Criptograficamente (ed25519)*.

### 2.5. Carrossel de Selos e Insígnias Cívicas no Perfil
Inclusão de carrossel horizontal de destaques estilo *Instagram Highlights* no perfil (`profile.js`), exibindo insígnias cívicas em anéis circulares gradientes (Consensus Emerald, Amber, Cyan Bridge, Attic Cobalt) diretamente integrados ao Passaporte Cívico (ADR-013).

### 2.6. Resiliência Offline e Service Worker
Em conformidade com a arquitetura Local-First, o módulo `client/js/render/vote.js` é registrado em `SHELL_ASSETS` no Service Worker (`client/sw.js`), garantindo funcionamento contínuo mesmo desconectado de qualquer relay.

---

## 3. Conformidade de Métricas e Hardening

| Métrica | Limite Exigido | Resultado no Módulo `vote.js` | Status |
|---|---|---|---|
| LLOC por Método | $\le 30$ | Máximo: 24 linhas (`renderDeliberationCard`) | Aprovado |
| Complexidade Cognitiva | $\le 15$ | Máximo: 2 (`renderDeliberationQuorum`) | Aprovado |
| Nível de Aninhamento | $\le 4$ | Máximo: 1 | Aprovado |
| Falhas ESLint | 0 | 0 erros / 0 avisos | Aprovado |
| Testes Unitários | 100% Verdes | 805 testes aprovados (722 JS + 83 Python) | Aprovado |

---

## 4. Consequências

- **Positivas:**
  - Paridade visual com a especificação Stitch e alinhamento ergonômico estrito com o Instagram Dark Mode.
  - Eliminação completa de caixas cinzas e bordas flutuantes nos posts.
  - Deliberação vicinal e sufrágio soberano nativos na interface.
  - Zero dependência externa de CDNs ou bibliotecas pesadas de terceiros em runtime.
- **Mitigações:**
  - Compatibilidade garantida com o Service Worker e cache PWA.
  - Regras de abstração do shell preservadas (estabilidade de IA e conformidade com testes de contrato).
