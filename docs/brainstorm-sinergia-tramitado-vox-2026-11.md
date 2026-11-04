# Sinergias Estratégicas: Tramitado × Vox
## Da Informação à Organização — Infraestrutura Cívica Aberta, Descentralizada e Independente

> **Documento Estratégico & Arquitetural**  
> **Data:** Novembro / 2026  
> **Status:** Proposta de Ecossistema & Brainstorm de Integração (Ivan / Tramitado × Yuri / Vox)  
> **Classificação:** Visão de Produto, Protocolo Aberto, Salvaguardas e Roadmap em 5 Fases (H0→H4)  

---

## 1. Visão do Ecossistema: A Transição da Pergunta

A maioria das iniciativas de tecnologia cívica falha por **tentar ser tudo ao mesmo tempo**: agregador de dados governamentais, rede social de debate, sistema de votação e canal de mobilização. O resultado quase invariável é inchaço funcional, custo proibitivo de infraestrutura e abandono.

A integração entre **Tramitado** e **Vox** baseia-se na **especialização complementar**:

```
+--------------------------------------------------------------------------+
|                               TRAMITADO                                  |
|   Sensor & Tradutor Legislativo (Inteligência & Reflexão Individual)     |
|                                                                          |
|   "O que está acontecendo?" -> "O que isso significa?" -> "O que eu penso?"|
+--------------------------------------------------------------------------+
                                    |
                                    v [Ponte Canônica & Protocolo Aberto LCP]
+--------------------------------------------------------------------------+
|                                  VOX                                     |
|   Ágora & Ação Coletiva (Comunicação Soberana & Mobilização Local)       |
|                                                                          |
|   "O que outros pensam?" -> "Como debater?" -> "O que faremos juntos?"   |
+--------------------------------------------------------------------------+
```

* **Tramitado não precisa virar rede social:** preserva seu rigor analítico, clareza editorial, modelos de IA explicativos e privacidade de reflexão do cidadão.
* **Vox não precisa recriar raspadores legislativos:** utiliza sua identidade criptográfica no bolso, arquitetura local-first, feeds comunitários e espelhamento soberano para abrigar a deliberação pública.
* **Princípio Inegociável:** O Tramitado não precisa do Vox para existir. O Vox não precisa do Tramitado para existir. Mas ambos oferecem muito mais valor quando conteúdos públicos circulam livremente entre ferramentas independentes.

---

## 2. As Quatro Blindagens Críticas de Hardening

### 2.1. A Barreira de Fogo da Privacidade (*The "Decidir" Firebreak*)
* **Propriedade Arquitetural:** O módulo privado "Decidir" do Tramitado armazena afinidades do cidadão. Essa informação jamais pode transbordar para a rede pública.
* **Requisitos Verificáveis:**
  1. Links de compartilhamento sempre usam `rel="noopener noreferrer"`.
  2. Nenhuma resposta ou intenção de voto é trafegada em query parameters (`?vote=...`) ou fragmentos de hash (`#agree`).
  3. Nenhum identificador de sessão, cookie ou token de rastreamento é compartilhado entre as aplicações.
  4. Nenhum evento analítico de terceiros é disparado associando a rota criptográfica do Vox ao perfil do Tramitado.
  5. Nenhuma pré-seleção de opinião no compositor do Vox (o campo de texto abre limpo para manifestação espontânea).
* **Critério de Aceite Formal:** Uma auditoria de tráfego de rede (DevTools / proxy de inspeção) comprova que a posição privada do usuário não aparece em nenhuma requisição externa durante ou após o compartilhamento.

### 2.2. Proteção Contra Deriva do Relator (*Version Drift Protection*)
Projetos de lei sofrem substitutivos que invertem seu teor. Uma discussão vinculada a um projeto não pode ser silenciosamente associada a uma versão diferente do texto legislativo.

A referência estruturada distingue formalmente documentos oficiais de resumos analíticos:

| Campo no Protocolo | O que representa |
| :--- | :--- |
| `proposition_id` | Identidade permanente da proposição (ex: `br-camara-pl-5239-2025`) |
| `source_document_id` | Identificador do documento oficial consultado (ex: `avulso-inicial`, `parecer-relator-substitutivo-1`) |
| `source_document_hash` | Hash criptográfico do texto integral oficial |
| `summary_version` | Versão do resumo analítico gerado pela IA/editorial do Tramitado |
| `summary_hash` | Hash de integridade do resumo textual |
| `vote_event_id` | Votação nominal específica associada (opcional) |
| `observed_at` | Timestamp exato em que a fonte oficial foi consultada |

* **Continuidade do Debate:** Não se cria uma discussão isolada a cada substitutivo. A proposição mantém seu espaço de discussão único no Vox, preservando o histórico de versões e exibindo um badge contextual de alerta: *"Texto oficial atualizado na Câmara após esta intervenção — ver novo parecer no Tramitado"*.

### 2.3. Rede Comunitária de Espelhamento Verificável (Faróis)
* **Precisão de Escopo:** O Vox Farol atual opera sob bind estrito `127.0.0.1` e sem WebTorrent seeder ativo. Portanto, a distribuição pública deve ser tratada como **Rede Comunitária de Espelhamento Verificável**, e não como CDN pública pronta.
* **Mecanismo de Consulta Não Agressivo:**
  1. O Tramitado gera snapshots estáticos de dados públicos e publica um manifesto assinado.
  2. Faróis voluntários consultam periodicamente o manifesto em horários aleatórios (anti-thundering herd).
  3. Faróis validam **assinatura criptográfica** de chave pública conhecida (Ed25519) + hash SHA-256 dos dados.
  4. **Proteção contra Rollback:** O nó rejeita manifestos com timestamp ou número sequencial inferior ao último estado verificado.
  5. O nó armazena localmente e serve o conteúdo em conformidade com sua política de loopback/LAN.

### 2.4. Classificação Honesta dos Motores do Vox

Para evitar confundir capacidade comprovada com possibilidade arquitetural, os recursos do Vox são classificados rigorosamente:

| Mecanismo | Classificação | Estado Atual |
| :--- | :--- | :--- |
| **Open Frames (Mini-apps de feed)** | **Existente e testado** | Frames v6.2 funcionam nativamente no feed com cards interativos. Adaptar para `kind: "legislative-card"`. |
| **Ponte POSSE Webhook** | **Adaptável** | `chat-bridge.js` formata Discord Embeds e Slack Block Kit via Webhook. Exportação para WhatsApp/Telegram via Web Share depende da renderização nativa de cada app. |
| **Deliberação `1 membro = 1 voto`** | **Existente e testado** | Propostas comunitárias com diff colorido de texto já homologadas no motor de governança. |
| **Espelhamento P2P de Terceiros** | **Proposto** | Farol valida cache local próprio; ingestão de manifestos externos assinados do Tramitado requer implementação de contrato H3. |

---

## 3. Legislative Context Protocol (LCP): Proposta de Padrão Aberto

O principal dividendo técnico desta colaboração é a definição de um **protocolo neutro de interoperabilidade legislativa**, independente de Tramitado e de Vox:

```json
{
  "$schema": "https://standards.civictech.br/lcp/v1.json",
  "protocol": "LCP/1.0",
  "proposition": {
    "identifier": "br-camara-pl-5239-2025",
    "house": "camara",
    "type": "PL",
    "number": 5239,
    "year": 2025,
    "canonicalUrl": "https://tramitado.com.br/proposicao/camara-pl-5239-2025"
  },
  "document": {
    "id": "doc-parecer-substitutivo-relator-v1",
    "hash": "sha256:4a8b...",
    "officialSourceUrl": "https://www.camara.leg.br/proposicoesWeb/..."
  },
  "provenance": {
    "source": "tramitado",
    "summaryVersion": "1.2",
    "summaryHash": "sha256:7c1e...",
    "observedAt": "2026-11-04T12:00:00Z",
    "signature": "ed25519:3f1a..."
  },
  "externalDiscussion": {
    "recommendedTopicId": "vox:topic:br-camara-pl-5239-2025"
  }
}
```

Qualquer observatório, veículo de imprensa independente, universidade ou bot cívico poderá produzir ou consumir referências nesse padrão sem depender de APIs proprietárias.

---

## 4. Governança da Parceria & Independência Institucional

A relação entre os projetos é orientada por salvaguardas institucionais explícitas:

| Dimensão | Princípio Inegociável |
| :--- | :--- |
| **Propriedade Intelectual** | Cada projeto mantém 100% de titularidade sobre seu próprio código e arquitetura. |
| **Operação & Custos** | Operação 100% independente. Nenhuma hospedagem ou infraestrutura compartilhada mandatória. |
| **Dados Privados** | Zero compartilhamento de dados pessoais, métricas de engajamento ou afinidades privadas. |
| **Conteúdo Público** | Reutilização aberta conforme licença, preservando links canônicos e citações de autoria. |
| **Neutralidade & Não-Endosso** | Integração técnica não significa endosso editorial mútuo. Vox e Tramitado permanecem autônomos. |
| **Resiliência do Vínculo** | A descontinuidade ou pausa da parceria não interrompe o funcionamento de nenhuma das aplicações. |

---

## 5. Roteiro de Implementação em 5 Fases

```
H0: Especificação  ──▶  H1: Primeiro Intercâmbio  ──▶  H2: Discussão Persistente  ──▶  H3: Distribuição  ──▶  H4: Ecossistema
(Contrato LCP &         (Botão neutro, Preview         (Tópicos por PL, badges de       (Feeds assinados e     (Protocolo aberto
 salvaguardas)           Open Frame e POSSE)            versão e dossiês)                espelhos Farol)        reutilizado por 3ºs)
```

1. **H0 — Especificação & Contrato (Prioridade Imediata):** Fechamento do contrato LCP v1, validação da Barreira de Fogo de Privacidade e schema JSON de integridade.
2. **H1 — Primeiro Intercâmbio:** Botão "Discutir no Vox" no Tramitado + preview rico em Open Frame no Vox + links canônicos com `rel="noopener noreferrer"`.
3. **H2 — Discussão Persistente & Memória Social:** Tópicos legislativos por PL, detecção de substitutivos com alertas de versão e compilação de dossiês populares.
4. **H3 — Distribuição Cooperativa:** Manifestos estáticos assinados do Tramitado espelhados pela Rede Comunitária de Faróis do Vox com proteção contra rollback.
5. **H4 — Ecossistema Aberto:** Adoção do LCP por terceiros (iniciativas municipais, jornalismo independente e observatórios cívicos).
