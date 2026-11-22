# Pacote de turma de extensão universitária — PM-107

> **Status:** rascunho · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-22  
> **Não substitui** o [ROADMAP.md](../ROADMAP.md) (`PM-107`, janela prevista: semestre letivo `2027.2`).  
> **Relacionados:** [primeiras-tarefas-contribuidor.md](./primeiras-tarefas-contribuidor.md) (`PM-41`), [editais-brasileiros-pm108.md](../strategy/editais-brasileiros-pm108.md), [HARDENING.md](../HARDENING.md), [qualidade-e-evidencia.md](./qualidade-e-evidencia.md), [steward-seed-15min.md](../operations/steward-seed-15min.md), [ADR-039](../adr/039-rust-por-fases.md).

Pacote pronto para envio a docentes e coordenações de extensão no Brasil (disciplinas de Engenharia de Software, Redes de Computadores, Segurança, Sistemas Distribuídos ou Tecnologia Cívica, inclusive na curricularização da extensão).

---

## 1. Definition of Done (`PM-107`)

O ciclo semestral com uma turma parceira é considerado entregue quando cumpre **todos** os critérios abaixo:

| Tipo | Critério de conclusão | Evidência verificável |
|---|---|---|
| `code` | **≥ 3 PRs externos** de estudantes/pares integrados em `main` (via fluxo `develop` → `main`) | Histórico de PRs no GitHub com CI verde |
| `ops-humano` | **1 nó steward da turma** em funcionamento e verificado (isolado em ambiente acadêmico/sandbox) | Saída real de `GET /health` + checklist de [steward-seed-15min.md](../operations/steward-seed-15min.md) |
| `ops-humano` | Registro de encerramento da turma (docente + mantenedor) | Lista de issues fechadas, lições aprendidas e confirmação de desligamento ou continuidade voluntária do nó |

---

## 2. Pitch institucional: por que adotar o Vox em extensão

O Vox é um aplicativo web progressivo (PWA) local-first e ponto-a-ponto para comunidades organizarem conversas, decisões e economia solidária sem servidor central de conteúdo nem vigilância comercial. Para uma turma universitária, ele oferece um laboratório real raro no ensino de graduação:

1. **Zero atrito de ambiente (PWA estático em vanilla JS):** o cliente em `client/` não tem *bundler*, *transpiler* nem dependências de runtime de terceiros — o código que o estudante lê no editor é exatamente o que executa no navegador (`python -m http.server 8080`).
2. **Backend e sinalização auditáveis em Python puro:** `relay/server.py` e `relay/signaling.py` usam apenas a biblioteca padrão do Python (RFC 6455, HTTP e cache local), permitindo estudar redes, WebRTC, *rate limiting* e memória sem caixa-preta de frameworks.
3. **Núcleo de referência em Rust `#![no_std]` sem dependências (`rust/vox-core`):** implementado conforme o [ADR-039](../adr/039-rust-por-fases.md) (Fases 0 e 1), permite trabalhar tipagem forte, serialização canônica, aritmética em tempo constante e vetores de paridade JS ↔ Rust.
4. **Engenharia de software com guardrails reais (Hardening v3.2 + CI):** os estudantes praticam qualidade sob métricas objetivas medidas por AST ([HARDENING.md](../HARDENING.md)) — limite de linhas por função, aninhamento, complexidade ciclomática, auditoria de camadas (`npm run audit:layers`), auditoria documental (`npm run audit:docs`) e suíte automatizada (`npm test`) sem rede externa.
5. **Impacto social, LGPD e interdisciplinaridade:** arquitetura *privacy-by-design* ([COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md)), com oportunidade opcional de articulação com **clínicas jurídicas** (apoio ao parecer `REV-12`) e editais **PROEX / ICT** ([editais-brasileiros-pm108.md](../strategy/editais-brasileiros-pm108.md)) sem exigir CNPJ do projeto.

### 2.1 Mensagem pronta para envio a professor(a) parceiro(a)

> Olá, Prof(a). [Nome],
>
> Sou [Seu nome], mantenedor(a) do **Vox** (`https://github.com/yurikayel/vox`), um projeto livre e sem fins lucrativos (AGPL) de comunicação comunitária *local-first* e P2P, desenhado para funcionar mesmo em celulares modestos e redes instáveis no Brasil.
>
> Estamos estruturando parcerias com turmas de graduação ou extensão (Engenharia de Software, Redes ou Tecnologia Cívica) para um ciclo de **12 semanas** com custo zero de infraestrutura. O repositório é especialmente didático porque combina três camadas limpas:
> - **Frontend PWA em JavaScript puro** (sem build step nem dependências de runtime);
> - **Relay e sinalização WebRTC/WebSocket em Python stdlib puro** (`relay/`);
> - **Núcleo criptográfico/protocolo de referência em Rust `#![no_std]`** (`rust/vox-core`, com testes de paridade contra o JS).
>
> Tudo conta com CI automatizado (`npm run validate`), limites rigorosos de complexidade por AST e uma lista curada de tarefas iniciais. A meta conjunta para o semestre é modesta e concreta: **ao menos 3 PRs da turma aceitos na branch principal** e **1 nó steward de laboratório/extensão operando para testes da própria turma**.
>
> Caso faça sentido para a sua disciplina ou projeto de extensão no próximo semestre, posso enviar o plano de 12 semanas e abrir um bloco de issues reservadas para a turma. Podemos conversar 20 minutos esta semana?

---

## 3. Plano semestral de 12 semanas (3 trilhas)

Turmas podem escolher **uma trilha única** (disciplina específica) ou dividir os grupos entre as **três trilhas** em paralelo.

### 3.1 Visão das trilhas

| Trilha | Perfil / Disciplina | Foco técnico e referências no repo | Meta típica por equipe |
|---|---|---|---|
| **Trilha A — Frontend, A11y e Higiene de Testes** | Engenharia de Software, IHC, Frontend | Auditoria e correção **WCAG 2.2 AA** (`LAN-22`, [`tests/a11y-wcag-aa.test.js`](../../tests/a11y-wcag-aa.test.js)), testes *smoke* de rotas e higiene/determinismo em `tests/` (`PM-115`), seguindo [primeiras-tarefas-contribuidor.md](./primeiras-tarefas-contribuidor.md) | 1 rota auditada e corrigida + testes determinísticos verdes |
| **Trilha B — Relay, Benchmark e Nó Steward** | Redes, Sistemas Distribuídos, Infra | Sinalização e relay Python ([`relay/signaling.py`](../../relay/signaling.py), [`relay/server.py`](../../relay/server.py)), carga e gargalos com [`tools/signaling-load-bench.py`](../../tools/signaling-load-bench.py) e [`relay/test_signaling_load_smoke.py`](../../relay/test_signaling_load_smoke.py) (`LAN-09`, [bench-sinalizacao-lan09.md](../operations/bench-sinalizacao-lan09.md)) e operação do nó da turma ([steward-seed-15min.md](../operations/steward-seed-15min.md)) | Relatório reprodutível de carga local + 1 nó steward da turma saudável |
| **Trilha C — Núcleo de Referência em Rust** | Compiladores, Segurança, Programação Sistêmica | Crate `#![no_std]` zero-dependências `rust/vox-core` ([ADR-039](../adr/039-rust-por-fases.md)), paridade bit-a-bit JS ↔ Rust, tipos fechados, `#![deny(missing_docs)]`, `clippy` limpo e preparação de vetores/fuzzing (cofre v2, envelope DM v1, manifesto v1) | Novos vetores de paridade ou módulo de formato validado no `cargo test` |

### 3.2 Cronograma semana a semana

| Semanas | Fase | Atividades comuns | Entregáveis por trilha |
|---|---|---|---|
| **1–2** | **Setup e leitura de arquitetura** | Fork/clone, leitura de [CONTRIBUTING.md](../../CONTRIBUTING.md), [HARDENING.md](../HARDENING.md) e [qualidade-e-evidencia.md](./qualidade-e-evidencia.md); executar `npm install`, `npm run validate` e subir cliente local (`http://127.0.0.1:8080/`) | **A:** rodar suíte JS e `a11y-wcag-aa.test.js` · **B:** subir `signaling.py` + `server.py` em loopback · **C:** rodar `cargo test --manifest-path rust/Cargo.toml` |
| **3–4** | **Escolha da issue e contrato** | Reserva de 1 issue por dupla/trio (regra mutex: comentário "vou fazer" na issue); leitura dos testes existentes e desenho do escopo ≤ 350 LLOC | **A:** mapa de contraste/foco/ARIA da rota · **B:** baseline local do `signaling-load-bench.py` · **C:** especificação dos vetores compartilhados JS ↔ Rust |
| **5–7** | **Implementação incremental** | Desenvolvimento em branch `feat/…`, `fix/…` ou `test/…` a partir de `develop`; commits atômicos com testes unitários determinísticos | **A:** correções de teclado/semântica + testes sem rede · **B:** script/ajuste de benchmark ou automação de saúde do nó · **C:** implementação em `rust/vox-core` + `tests/rust-*-parity.test.js` |
| **8–9** | **Revisão cruzada entre pares** | Revisão interna na turma usando a rubrica da §4.3 antes de abrir PR no repositório oficial; correção de apontamentos de AST/JSDoc | Todas as duplas rodam `npm run validate` e `npm run audit:layers` sem erros nem *waivers* improvisados |
| **10–11** | **Abertura de PRs e nó da turma** | Abertura dos PRs contra `develop`; atendimento a comentários do mantenedor; subida e validação do nó steward da turma | **B:** executar [steward-seed-15min.md](../operations/steward-seed-15min.md) (kit local ou VPS da disciplina) e coletar `GET /health` · **A/C:** ajuste fino pós-review até merge em `develop` → `main` |
| **12** | **Demonstração e encerramento** | Seminário de fechamento (10 min por equipe), conferência do DoD (`≥ 3` PRs em `main` + `1` nó validado) e decisão sobre desligamento ou guarda voluntária do nó | Ata curta de lições aprendidas + feedback de ergonomia para o repositório |

---

## 4. Diretrizes de issues iniciais e revisão docente

### 4.1 Como recortar um pacote de issues para a turma

Ao criar o lote de issues rotulado com `boa primeira tarefa` e `extensao`:

1. **Escopo fechado (≤ 350 LLOC por módulo tocado):** cada issue deve caber em **1 PR pequeno** (idealmente 50–250 linhas alteradas) com critério de aceite binário ("Pronto quando…").
2. **Limites rígidos por função ([HARDENING.md](../HARDENING.md)):**
   - Função de produção: ideal `≤ 20`, máximo **`30`** linhas lógicas (`ERROR` no CI em `client/`).
   - Caso de teste: ideal `≤ 25`, máximo **`45`** linhas.
   - Aninhamento máximo **`4`**, complexidade ciclomática máxima **`15`**, parâmetros por função máximo **`5`**.
   - **Proibido fatiar artificialmente** (`_part1`/`_part2`) ou usar *one-liners* obscuros apenas para passar no linter (princípio SLAP / Anti-Ravioli).
3. **Sem alteração em áreas críticas de segurança sem supervisão:** tarefas iniciais da turma não mexem em geração de chaves privadas, fluxos de recuperação nem em `CACHE_NAME` do `client/sw.js` (se uma tarefa da Trilha A exigir mudança no shell do PWA, o mantenedor orienta o bump no fechamento).
4. **Branch alvo:** todo PR estudantil aponta para **`develop`** (nunca direto para `main`, que recebe lotes consolidados de `develop` pelo mantenedor).

### 4.2 Gate local obrigatório antes de abrir PR

Todo estudante deve rodar na raiz do clone e colar o resumo real na descrição do PR (seguindo a taxonomia `PASS` / `FAIL` / `NOT RUN` / `BLOCKED` de [qualidade-e-evidencia.md](./qualidade-e-evidencia.md)):

```bash
npm run validate      # lint + lint:relay + audit:complexity + audit:docs + npm test
npm run audit:layers  # arquitetura em camadas e ausência de novos ciclos (ADR-035)
```

Para entregas da **Trilha C (Rust)**, incluir também:

```bash
cargo test --manifest-path rust/Cargo.toml
cargo clippy --manifest-path rust/Cargo.toml --all-targets -- -D warnings
```

### 4.3 Rubrica de avaliação e revisão para docentes

| Critério | Peso sugerido | O que verificar na entrega do estudante |
|---|---|---|
| **1. Correção e testes reais** | 30% | Testes cobrem casos de borda e regressão sem rede externa; zero `skip`/`todo` ocultos; saída real (`PASS` com comando, total e tempo) colada no PR |
| **2. Qualidade estrutural (Hardening v3.2)** | 25% | `npm run validate` e `npm run audit:layers` verdes; funções coesas (`≤ 30` LLOC, `CC ≤ 15`, `depth ≤ 4`); ausência de fragmentação artificial (`_part1`) |
| **3. Documentação e contratos** | 20% | Exports públicos em JS com JSDoc (`@param`, `@returns`) e crates Rust com `#![deny(missing_docs)]`; sem links quebrados nem banners inválidos em `docs/` |
| **4. Evidência operacional (Trilha B / nó)** | 15% | Para a equipe do nó steward: `GET /health` válido, testes de carga em loopback reproduzíveis e registro honesto de gargalos sem PII |
| **5. Higiene de processo e mutex** | 10% | Um autor/dupla por issue, escopo restrito aos arquivos da tarefa, commits limpos em português e resposta objetiva ao *code review* |

---

## 5. Regras de custo zero e Cold Readiness (Prontidão Fria)

O programa de extensão respeita integralmente a doutrina operacional do repositório:

1. **Custo recorrente R$ 0,00:** todas as atividades funcionam em máquinas locais dos laboratórios/estudantes (`127.0.0.1`), contêineres locais e executores gratuitos de CI do GitHub Actions. Nenhuma disciplina precisa contratar nuvem paga; caso o departamento já possua VM acadêmica para o nó steward da Trilha B, o custo adicional continua nulo.
2. **Cold Readiness (sem exposição prematura ao público):**
   - Nenhum deploy público em domínio de produção, federação externa ou divulgação aberta a usuários finais durante a disciplina sem autorização expressa do mantenedor.
   - O nó steward da turma opera com slug e conjunto de testes da própria disciplina (ou em LAN/loopback), sem anunciar ou espelhar comunidades externas não autorizadas.
   - Testes de carga (`LAN-09`) rodam **exclusivamente em loopback local** (`127.0.0.1`) ou contra a instância isolada da turma — é **proibido** disparar benchmarks contra relays de terceiros, gateways públicos Arweave/Turbo ou servidores de sinalização externos.
3. **Sem coleta de dados nem automação proibida:**
   - Proibido usar *scraping* de redes de terceiros ou investigar/modificar áreas protegidas do repositório (`tools/wa_extension/`, `tools/wa_live.py`, `live/`).
   - Nenhuma chave real, token, e-mail pessoal ou dado civil de estudante pode entrar em fixtures de teste, logs de benchmark ou relatórios.
4. **Conduta e segurança:** aplicar [SECURITY.md](../../SECURITY.md) para qualquer vulnerabilidade encontrada durante a disciplina (reporte privado, nunca em issue pública).
