# Vox — Rede Social Cívica no Permaweb

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Tests Passing](https://img.shields.io/badge/tests-415%20passing-success.svg)](./tests)
[![Client](https://img.shields.io/badge/PWA-Vanilla%20ES%20Modules-orange.svg)](./client)
[![Identity](https://img.shields.io/badge/Identity-WebCrypto%20P--256-blueviolet.svg)](./client/js/local-account.js)
[![Storage](https://img.shields.io/badge/Storage-Arweave%20Permaweb-black.svg)](https://arweave.org)
[![Service Worker](https://img.shields.io/badge/SW-v6.96--photo--card--gaps-informational.svg)](./client/sw.js)

Uma rede social cívica, livre e de código aberto (FOSS), pensada para **comunidades primeiro**. Uma rede descentralizada no espírito útil do Orkut clássico, onde a **identidade e as chaves ficam no aparelho do usuário** (WebCrypto local), as publicações públicas residem no **permaweb** (Arweave) e os dados circulam por **malha local e relays voluntários**.

> 🌐 **Demo Pública:** [https://yurikayel.github.io/vox/](https://yurikayel.github.io/vox/)  
> 🧪 **Guia para Testadores:** [#/ajuda/teste](https://yurikayel.github.io/vox/#/ajuda/teste)  
> 📚 **Índice Mestre de Documentação:** [docs/README.md](./docs/README.md)  
> 📋 **Plano Mestre & Checklist Vivo:** [dossiê N=25 §3.6](./docs/dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25)

---

## 🏛️ Visão e Posicionamento

O Vox nasce para libertar a comunicação comunitária e cívica da lógica extrativa das Big Techs e da sobrecarga operacional do Fediverso tradicional.

### As Três Lógicas de Rede

| Modelo | Dinâmica | Limitações & Vulnerabilidades | Abordagem do Vox |
|:---|:---|:---|:---|
| **Big Tech (A Fazenda)** | A terra pertence ao bilionário. Seguidor é aluguel; o algoritmo sequestra a atenção via *rage-bait* e pode despejar contas a qualquer momento. | Desplataformização sem recurso, vigilância comercial, feeds manipulados por leilão financeiro. | **Recusada:** Sem servidores corporativos, sem caixas-pretas de recomendação, sem venda de dados. |
| **Fediverso (A Pensão)** | Instâncias centralizadas geridas por administradores voluntários que arcam com servidores VPS do próprio bolso. | Custos recorrentes de hospedagem, risco de falência da instância, migração complexa entre servidores. | **Superada:** Zero custo de servidor para o usuário comum; cliente estático servido via PWA. |
| **Vox (O Movimento)** | **Bem comum inalienável:** o espaço cívico é o cliente no próprio aparelho + protocolo público aberto. | Exige maturidade cívica e consciência de que gateways são leitura reserva, não nuvem infinita. | **Adotada:** Chaves no bolso (`vx_…`), IndexedDB local, permaweb imutável e relays domésticos opcionais. |

*(Diagnóstico comparativo aprofundado em [LESSONS.md](./LESSONS.md) e [POSITIONING.md](./POSITIONING.md).)*

---

## ⚡ Os Quatro Princípios Fundamentais

1. **Isonomia Radical (1 Pessoa = 1 Chave Local):**
   A identidade mestre (`vx_…`) é gerada no próprio navegador com **ECDSA P-256** via WebCrypto API. Alcance não se compra em leilão publicitário; fazendas de bots não têm voto; cada usuário é soberano sobre sua presença digital.
2. **Sem Feed de Rage-Bait (Morte das Iscas Emocionais):**
   O feed é **estritamente cronológico** ou filtrado por laços orgânicos de confiança. Sem ranking oculto, sem pontuação de polêmica, sem recomendação orientada a choque moral. Conteúdos forjados de guerra híbrida perdem tração e morrem no vácuo.
3. **Ponte, não Ilha (POSSE Honesto e Aberto):**
   Filosofia *Publish on Own Site, Syndicate Elsewhere* ([RFC 0001](./docs/rfc/0001-posse-export.md)). O conteúdo canônico nasce assinado no Vox e pode ser compartilhado com 1 clique para WhatsApp, Instagram e X via Web Share API e web intents. Não prometemos postagens automáticas e silenciosas em APIs proprietárias fechadas.
4. **Resiliência Local-First & Autonomia de Dados:**
   O PWA opera offline via cache inteligente (Service Worker + IndexedDB com política LRU). Seus tópicos e contatos permanecem no dispositivo. A qualquer momento, o usuário pode exportar seu Arquivo de Soberania (`vox-soberania-*.json` ou `.voxid` protegido com senha via PBKDF2/AES-GCM).

---

## 📊 Linha de Release Canônica

Informações sincronizadas com [docs/release-metadata.json](./docs/release-metadata.json):

| Campo | Valor Atual | Descrição / Observação |
|:---|:---:|:---|
| **Branch** | `main` | Linha de produção contínua (Pages deploy automático) |
| **Commit SHA** | `bf0503e` | HEAD verificado e auditado na esteira de integração |
| **Suíte de Testes** | **415** (`392` JS + `23` Python) | Execução via `npm test` na raiz do repositório |
| **Service Worker** | `vox-pwa-v6.96-photo-card-gaps` | Atualização do cache offline do shell estático |
| **Deploy** | [yurikayel.github.io/vox](https://yurikayel.github.io/vox/) | PWA público para testes e validação de campo |

> [!NOTE]
> Após atualizações de release, recomenda-se executar um **hard refresh** (`Ctrl+Shift+R`) no navegador para substituição ativa do Service Worker.

---

## ⚙️ Arquitetura do Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Vox Web Client (PWA Ultraleve < 50 KB)               │
│             Vanilla HTML5 + CSS Moderno + ES Modules Nativos           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
         [Leitura & Descoberta]             [Autoria & Identidade]
                    │                                │
                    ▼                                ▼
       Cascata de Leitura Híbrida:              Assinatura Criptográfica:
     1. Memória RAM / IndexedDB              • Identidade: ECDSA P-256 (vx_…)
     2. Malha Gossip (WANT/BLOB)             • Permaweb: Carteira Arweave JWK
     3. Relay Doméstico (Opcional)           • Mensagens Privadas: ECDH P-256
     4. Gateways Públicos (Reserva)                  │
                    │                                ▼
                    ▼                    Turbo Bundler (L2 Arweave)
         Gateways Descentralizados                   │
          (AR.IO / Turbo GraphQL)                    │
                    │                                │
                    └────────────────┬───────────────┘
                                     ▼
                        Permaweb Imutável (Arweave)
```

### Esquema de Tags e Transações (Sem Banco Central)

O ecossistema opera sem banco de dados SQL centralizado. Todo estado é composto por transações com tags semânticas padronizadas:

| Ação | Tag `Type` | Tags Complementares Chave | Finalidade |
|:---|:---|:---|:---|
| **Criar Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` | Funda um espaço público de debate |
| **Adesão a Membro** | `membership` | `Community-Id` | Registra vínculo comunitário no perfil |
| **Publicar Tópico** | `topic` | `Community-Id`, `Topic-Title` | Abre uma nova discussão no fórum |
| **Responder Tópico** | `reply` | `Community-Id`, `Reply-To` (TX ID) | Adiciona resposta em árvore encadeada |
| **Moderação Cívica** | `mod-action` | `Community-Id`, `Action` (hide/ban), `Target` | Supressão client-side por quórum |
| **Chave de DM** | `profile-key` | `Dm-Pub` (JWK pública P-256) | Habilita recebimento de mensagens diretas |
| **Handle Cívico** | `handle` | `Handle` (`[a-z0-9-]{3,24}`), `Owner-Addr` | Mnemônico `@slug` sem cartório central |
| **Pull Request Cívico** | `governance-proposal` | `Community-Id`, `Proposal-Id`, `Diff` | Proposta de alteração de regras locais |

---

## 🛠️ Capacidades em Produção & Laboratório

* **Fóruns & Comunidades (Espírito Orkut):** Espaços temáticos, membros visíveis no perfil, feeds cronológicos por comunidade e busca pública aberta.
* **Chrome Compacto de Foto & Interações Sociais:** Header enxuto sobre mídia, **Notas de Perfil 24h** (`profile-note.js`), **Republicar** com citação honesta sem impulsionamento (`repost-draft.js` / `repost-cite.js`), aba **Salvos** (bookmarks locais) e **Marcação Manual em Fotos** por coordenada (`x%/y%` em `photo-tag-pins.js`, estritamente sem reconhecimento facial).
* **Classificados / Feira Comunitária:** Ofertas locais assinadas com gossip de manifesto de cache (`CACHE_MANIFEST`), prioridade `WANT` e suporte a retratação na malha.
* **Mensagens Diretas E2E (WebRTC + Inbox TTL):** Criptografia ponta-a-ponta no navegador (`ECDH P-256` + `AES-GCM-256`). Mensagens privadas trafegam fora do permaweb; quando o par está offline, transitam por relay transitório com expiração forçada de 72 horas.
* **Soberania & Exportação de Chaves (`.voxid`):** Export e import de credenciais com suporte a envelope criptografado com senha mestra (`.voxid` via PBKDF2 + AES-GCM-256).
* **Wipe Local de Emergência (T05):** Purga imediata de chaves locais, `localStorage`, caches e bases IndexedDB no aparelho (`local-wipe.js`), com aviso transparente sobre dados já ancorados no permaweb ou replicados em outros pares.
* **Quarentena Local de Guerra Híbrida:** Marcador no dispositivo que oculta posts identificados como iscas emocionais e bloqueia compartilhamento acidental, cortando a retroalimentação algorítmica.
* **QR Code Canônico Vanilla (`qr-url.js`):** Gerador nativo de QR codes para links de tópicos, comunidades e convites, sem dependências externas de npm.
* **Laboratório M-de-N (`#/labs/mofn`):** Especificação ([ADR-005](./docs/adr/005-collective-profile-m-of-n.md)) e simulador de multi-assinatura independente para conselhos e sindicatos, mantendo o isolamento estrito da conta de produção.

---

## 🚀 Começando em 30 Segundos

### 1. Rodar o Cliente PWA Localmente

O cliente é 100% estático (no-build). Não requer `webpack`, `vite` ou compilação:

```bash
cd client
python -m http.server 8080
```
Acesse `http://127.0.0.1:8080/` no navegador. *(Módulos ES exigem protocolo HTTP/HTTPS, não abrindo via `file://`)*.

### 2. Executar a Suíte Completa de Testes

Na raiz do repositório:

```bash
npm test
```
Executa **415 testes unitários e de integração** (392 testes Node.js nativos + 23 testes em Python stdlib).

### 3. Rodar o Relay / Servidor de Cache Doméstico (Opcional)

Para operadores que desejam apoiar a malha como *stewards*:

```bash
cd relay
python server.py
```
Servidor leve em Python (stdlib, sem dependências externas), provendo proxy de cache Arweave, índice espelho comunitário e inbox efêmero de DMs na porta `3920` (e sinalização WebRTC opcional via `python signaling.py` na porta `3921`).

---

## 🔍 Compromisso de Transparência Técnica

Em conformidade com a auditoria de honestidade cívica ([docs/honest-copy-audit-2026-10-23.md](./docs/honest-copy-audit-2026-10-23.md)):

* **O Vox NÃO é 100% P2P móvel no 4G brasileiro:** Celulares sob CGNAT e franquia de dados limitada não sustentam conexões permanentes. O uso de gateways públicos Arweave como leitura reserva é transparente e necessário.
* **O Vox NÃO promete imunidade judicial:** Toda postagem pública no permaweb é permanente e auditável. As normas da legislação brasileira ([COMPLIANCE-BR.md](./COMPLIANCE-BR.md) — Marco Civil da Internet e LGPD) aplicam-se integralmente.
* **O Vox NÃO publica sozinho nas redes sociais:** O protocolo POSSE gera rascunhos, links e compartilhamentos assistidos via intents oficiais; o envio final é sempre um ato consciente e deliberado do usuário.
* **O repositório NÃO é uma empresa:** Não hospedamos fóruns em nome de terceiros nem cobramos mensalidades. Somos código, documentação e infraestrutura cívica auditável.

---

## 📖 Mapa Canônico de Documentação

| Documento | Foco & Finalidade |
|:---|:---|
| **[docs/README.md](./docs/README.md)** | **Índice Mestre:** Ponto de partida único para desenvolvedores e revisores. |
| **[docs/dossie-geral-inventario-master-breakdown-2026-11.md](./docs/dossie-geral-inventario-master-breakdown-2026-11.md)** | **Plano Mestre N=25:** Único checklist vivo `[ ]` e Definition of Done global. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Topologia técnica, tags GraphQL, linhagem e protocolos de dados. |
| **[GOVERNANCE.md](./GOVERNANCE.md)** | Governança distribuída, quórum cívico e moderação client-side. |
| **[COMPLIANCE-BR.md](./COMPLIANCE-BR.md)** | Adequação regulatória: Marco Civil da Internet (Art. 19), LGPD e minimização. |
| **[IDENTITY.md](./IDENTITY.md)** | Criptografia P-256 WebCrypto, gestão de chaves e carteiras Arweave. |
| **[docs/tese-praca-civica-militancia-pro-democratica-2026-10.md](./docs/tese-praca-civica-militancia-pro-democratica-2026-10.md)** | Tese de militância pró-democrática (cruzamento estratégico T01–T20). |
| **[docs/steward-seed-15min.md](./docs/steward-seed-15min.md)** | Guia rápido de 15 minutos para operadores e seeds voluntários de relay. |
| **[docs/CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md)** | Regras de governança de documentação, mutex de agentes e políticas de commit. |

### Decisões Arquiteturais Registradas (ADRs)

* **[ADR-001](./docs/adr/001-contribution-attestation-export.md):** Atestação exportável de contribuição P2P.
* **[ADR-002](./docs/adr/002-oauth-profile-enrich-client.md):** Enriquecimento de perfil client-only via OAuth.
* **[ADR-003](./docs/adr/003-profile-card-gossip.md):** Cartão de malha e propagação gossip de perfis.
* **[ADR-004](./docs/adr/004-gateway-honest-fallback.md):** Fallback transparente e honesto de leitura reserva de gateways.
* **[ADR-005](./docs/adr/005-collective-profile-m-of-n.md):** Perfil coletivo M-de-N via multi-assinatura independente (Tese T02).

---

## 🤝 Governança e Contribuição

O projeto opera sob o método **Mantenedor como Revisor de Código** ([docs/antigravity-estrategia-mantenedor-revisor-2026.md](./docs/antigravity-estrategia-mantenedor-revisor-2026.md)):

* A branch **`main`** permanece **sempre verde e publicável** (Pages deploy imediato).
* Todo desenvolvimento ocorre em branches dedicadas (`feat/...`, `fix/...`), integradas via merge explícito (`--no-ff`) após aprovação total da suíte de testes.
* Respeito estrito aos mutexes de agentes: um agente por arquivo canônico, garantindo histórico limpo e zero regressão.

---

*Vox — Soberania de dados, bem comum digital e comunicação comunitária livre.*
