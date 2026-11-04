# Vox — Rede Cívica de Participação Popular

[![Client](https://img.shields.io/badge/PWA-Vanilla%20ES%20Modules-orange.svg)](./client)
[![Identity](https://img.shields.io/badge/Identity-WebCrypto%20P--256-blueviolet.svg)](./client/js/local-account.js)
[![Storage](https://img.shields.io/badge/Storage-Arweave%20Permaweb-black.svg)](https://arweave.org)
[![Service Worker](https://img.shields.io/badge/SW-v7.16--real--network--audio--video--upload-informational.svg)](./client/sw.js)

O Vox é um projeto cívico em construção para ampliar a participação popular e a autonomia das comunidades na vida digital. Sua ambição é ser um bem comum aberto: o projeto deve permanecer transparente, copiável, modificável e maior que qualquer fundador, mantenedor, empresa ou plataforma.

Essa é uma direção e um compromisso, não uma descrição de governança já concluída. O desenvolvimento começou com uma pessoa; hoje o controle administrativo do repositório ainda está concentrado. O próprio Vox precisa construir formas públicas de contribuição, revisão, sucessão e custódia compartilhada para que ninguém tenha poder permanente e unilateral sobre o projeto.

O cliente é um PWA local-first. Identidade e chaves são criadas no aparelho; publicações públicas podem ser ancoradas no Arweave e lidas por gateways. Há recursos de relay, cache e comunicação local, mas descoberta automática de nós, acesso LAN entre dispositivos e seeding WebTorrent não estão implementados. O projeto documenta capacidades reais e limitações conhecidas; propostas não são anunciadas como funcionalidades prontas.

> 🌐 **Demo Pública:** [https://yurikayel.github.io/vox/](https://yurikayel.github.io/vox/)  
> 🧪 **Guia para Testadores:** [#/ajuda/teste](https://yurikayel.github.io/vox/#/ajuda/teste)  
> 📚 **Índice Mestre de Documentação:** [docs/README.md](./docs/README.md)  
> 📋 **Plano Mestre & Checklist Vivo:** [dossiê N=25 §3.6](./docs/dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25)

---

## 🏛️ Visão: VOX POPULI

VOX POPULI — a voz do povo — é o propósito político do projeto: pessoas e comunidades devem poder participar, propor, contestar, construir e manter os espaços digitais que usam. O Vox não fala em nome do povo e não substitui organização, deliberação ou decisão humana.

Redes centralizadas, instâncias federadas e protocolos locais têm custos, vantagens e formas diferentes de organização. O Vox busca contribuir com uma alternativa local-first, aberta e comunitária; não trata outros projetos ou seus participantes como inferiores ou superados.

### As Três Lógicas de Rede

| Modelo | Como costuma funcionar | Trade-offs | O que o Vox busca oferecer |
|:---|:---|:---|:---|
| **Plataformas centralizadas** | Uma empresa opera serviço, identidade e distribuição. | Pode oferecer conveniência e alcance; também concentra dados, regras e continuidade no operador. | O Vox busca limitar dependência de um serviço central e manter código, formatos e dados públicos auditáveis. |
| **Serviços federados** | Servidores independentes se comunicam por protocolos compartilhados. | Distribuem operação, mas cada instância precisa de administração, recursos e regras próprias. | O Vox pode aprender e interoperar; não afirma substituir ou superar o Fediverso. |
| **Protocolos e clientes locais** | Dados, chaves e operação podem ser distribuídos entre aparelhos, gateways e operadores comunitários. | A autonomia depende da implementação, da disponibilidade dos pares e da capacidade de manter o software. | O Vox prioriza uso local, exportação de dados, participação comunitária e infraestrutura substituível. |

*(Diagnóstico comparativo aprofundado em [LESSONS.md](./LESSONS.md) e [POSITIONING.md](./POSITIONING.md).)*

---

## ⚡ Compromissos fundamentais

1. **Participação popular:** pessoas podem usar, propor, contestar e contribuir. Uma chave criptográfica identifica uma conta; não comprova que cada conta corresponde a uma pessoa única e não deve ser apresentada como prova de “uma pessoa, um voto”.
2. **Regras e decisões legíveis:** código, protocolos e mudanças devem ter histórico público e justificativas acessíveis. Votos em uma comunidade dizem respeito às regras daquela comunidade; não equivalem, por si só, à governança do repositório Vox.
3. **Sem alcance comprado:** o projeto não deve vender visibilidade nem ocultar critérios de ordenação. O feed e seus filtros devem ser explicáveis e controláveis por quem usa o cliente.
4. **Autonomia e portabilidade:** o PWA guarda dados locais e permite exportar credenciais e dados compatíveis. Gateway, relay ou hospedagem são dependências substituíveis quando a implementação permitir; não prometemos disponibilidade permanente nem operação sem infraestrutura.
5. **Código aberto e transparência:** nenhuma funcionalidade planejada deve ser descrita como pronta. Mudanças, limitações, falhas conhecidas e decisões precisam poder ser examinadas publicamente.

---

## 📊 Releases e validação

O histórico Git, a configuração de CI e [docs/release-metadata.json](./docs/release-metadata.json) são as referências para releases. Os metadados descrevem uma release registrada; não representam automaticamente o branch de trabalho, alterações locais ou o estado do deploy neste instante. Consulte os resultados da CI associados ao commit antes de tratar um build como validado.

O Service Worker pode manter uma versão anterior do cliente em cache. Depois de uma atualização, recarregue a página; se a versão não mudar, faça uma atualização forçada (`Ctrl+Shift+R`).

---

## 📦 Os Três Produtos do Ecossistema Vox

Para garantir clareza entre o uso cotidiano pelas pessoas e a sustentação técnica por operadores comunitários, o ecossistema organiza-se em três frentes canônicas ([ADR-011](docs/adr/011-taxonomia-tripartite-produtos-vox.md)):

1. **Vox Populi Android:** Aplicativo móvel nativo ultraleve (~16.5 KiB, sem frameworks externos) que executa o PWA em tela cheia com Foreground Service para mobilidade (`org.vox.populi`).
2. **Vox Populi Desktop:** Aplicação 1-clique para Windows em janela nativa WebView2, com inicialização local transparente e fallback de leitura loopback (`VoxPopuliDesktop.exe`).
3. **Vox Farol (Nó Comunitário):** Serviço de infraestrutura cívica de baixo consumo para retenção de cache verificável SHA-256 e relay HTTP em loopback (`VoxPopuli.exe` / daemon Linux).

---

## ⚙️ Arquitetura do Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Vox Web Client (PWA Ultraleve < 50 KB)               │
│             Vanilla HTML5 + CSS Moderno + ES Modules Nativos           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
           [Leitura]                         [Autoria]
                    │                                │
                    ▼                                ▼
       Cascata de Leitura Híbrida:              Assinatura Criptográfica:
     1. Memória RAM / IndexedDB              • Identidade: ECDSA P-256 (vx_…)
     2. Cache local / peers quando disponíveis • Permaweb: Carteira Arweave JWK
     3. Relay HTTP local opcional              • Mensagens Privadas: ECDH P-256
     4. Gateways públicos Arweave                      │
                    │                                ▼
                    ▼                    Bundler Arweave / Turbo
            Gateways públicos e independentes         │
          (AR.IO / Turbo GraphQL)                    │
                    │                                │
                    └────────────────┬───────────────┘
                                     ▼
                  Arweave (dados públicos permanentes)
```

Este diagrama resume caminhos existentes do cliente, não garante descoberta global ou conexão entre quaisquer dois usuários. O Nó Zero atual escuta apenas em loopback; acesso LAN, descoberta automática e WebTorrent seeding não estão disponíveis.

### Esquema de tags e dados públicos

Os objetos públicos usam transações com tags semânticas. O cliente também mantém estado local em IndexedDB e outros armazenamentos do navegador; portanto, nem todo estado é uma transação pública. Não há um banco SQL global que opere o Vox.

| Ação | Tag `Type` | Tags Complementares Chave | Finalidade |
|:---|:---|:---|:---|
| **Criar Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` | Funda um espaço público de debate |
| **Adesão a Membro** | `membership` | `Community-Id` | Registra vínculo comunitário no perfil |
| **Publicar Tópico** | `topic` | `Community-Id`, `Topic-Title` | Abre uma nova discussão no fórum |
| **Responder Tópico** | `reply` | `Community-Id`, `Reply-To` (TX ID) | Adiciona resposta em árvore encadeada |
| **Ação de moderação comunitária** | `mod-action` | `Community-Id`, `Action` (hide/ban), `Target` | Filtro interpretado pelo cliente conforme as regras da comunidade |
| **Chave de DM** | `profile-key` | `Dm-Pub` (JWK pública P-256) | Habilita recebimento de mensagens diretas |
| **Handle Cívico** | `handle` | `Handle` (`[a-z0-9-]{3,24}`), `Owner-Addr` | Mnemônico `@slug` sem cartório central |
| **Proposta comunitária** | `governance-proposal` | `Community-Id`, `Proposal-Id`, `Diff` | Proposta de alteração das regras daquela comunidade |

---

## 🛠️ Capacidades implementadas e laboratório

O estado varia entre cliente, navegador e versão. A lista abaixo não é uma certificação de segurança, disponibilidade contínua ou funcionamento entre quaisquer dois hosts. Consulte a documentação vinculada e os testes do commit antes de depender de um recurso.

* **Fóruns & Comunidades (Espírito Orkut):** Espaços temáticos, membros visíveis no perfil, feeds cronológicos por comunidade e busca pública aberta.
* **Chrome Compacto de Foto & Interações Sociais:** Header enxuto sobre mídia, **Notas de Perfil 24h** (`profile-note.js`), **Republicar** com citação honesta sem impulsionamento (`repost-draft.js` / `repost-cite.js`), aba **Salvos** (bookmarks locais) e **Marcação Manual em Fotos** por coordenada (`x%/y%` em `photo-tag-pins.js`, estritamente sem reconhecimento facial).
* **Classificados / Feira Comunitária:** Ofertas locais assinadas com gossip de manifesto de cache (`CACHE_MANIFEST`), prioridade `WANT` e suporte a retratação na malha.
* **Mensagens Diretas E2E (WebRTC + Inbox TTL):** Criptografia ponta-a-ponta no navegador (`ECDH P-256` + `AES-GCM-256`). Mensagens privadas trafegam fora do permaweb; quando o par está offline, podem passar pelo relay transitório, que usa TTL padrão de 72 horas.
* **Soberania & Exportação de Chaves (`.voxid`):** Export e import de credenciais com suporte a envelope criptografado com senha mestra (`.voxid` via PBKDF2 + AES-GCM-256).
* **Wipe Local de Emergência (T05):** Purga imediata de chaves locais, `localStorage`, caches e bases IndexedDB no aparelho (`local-wipe.js`), com aviso transparente sobre dados já ancorados no permaweb ou replicados em outros pares.
* **Quarentena pessoal de conteúdo:** Marcador local para ocultar publicações e evitar seu compartilhamento neste dispositivo; não remove conteúdo da rede nem impõe uma decisão a outras pessoas.
* **QR Code Canônico Vanilla (`qr-url.js`):** Gerador nativo de QR codes para links de tópicos, comunidades e convites, sem dependências externas de npm.
* **Laboratório M-de-N (`#/labs/mofn`):** Especificação ([ADR-005](./docs/adr/005-collective-profile-m-of-n.md)) e simulador experimental de multi-assinatura; não é o controle de governança do repositório nem uma carteira de produção.

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
Executa as suítes atuais de JavaScript e Python. Use o resultado associado ao commit que está sendo revisado; contagens antigas publicadas neste README não são critério de aprovação.

### 3. Rodar o Relay / Servidor de Cache Doméstico (Opcional)

Para operadores que desejam apoiar a malha como *stewards*:

```bash
cd relay
python server.py
```
Servidor leve em Python (stdlib, sem dependências externas), provendo proxy de cache Arweave, índice espelho comunitário e inbox efêmero de DMs na porta `3920` (e sinalização WebRTC opcional via `python signaling.py` na porta `3921`).

---

## 🏛️ Ecossistema Cívico

O Vox explora interoperabilidade com iniciativas independentes de tecnologia cívica, incluindo plataformas de transparência legislativa.

**Proposta em estudo:** integração experimental com o Tramitado, preservando:
* Independência operacional.
* Privacidade das decisões individuais.
* Referências legislativas verificáveis.
* Interoperabilidade por padrões abertos.

Esta é uma proposta exploratória, não uma integração ou parceria formalizada.

Detalhes: [Brainstorm Tramitado × Vox](docs/brainstorm-sinergia-tramitado-vox-2026-11.md).

---

## 🔍 Compromisso de Transparência Técnica

Em conformidade com a auditoria de honestidade cívica ([docs/honest-copy-audit-2026-10-23.md](./docs/honest-copy-audit-2026-10-23.md)):

* **O Vox ainda não oferece P2P universal entre dispositivos:** gateways públicos Arweave são usados para localizar e ler dados; o comportamento depende dos gateways, da rede e da implementação disponível.
* **O Vox NÃO promete imunidade judicial:** Toda postagem pública no permaweb é permanente e auditável. As normas da legislação brasileira ([COMPLIANCE-BR.md](./COMPLIANCE-BR.md) — Marco Civil da Internet e LGPD) aplicam-se integralmente.
* **O Vox NÃO publica sozinho nas redes sociais:** O protocolo POSSE gera rascunhos, links e compartilhamentos assistidos via intents oficiais; o envio final é sempre um ato consciente e deliberado do usuário.
* **O repositório e as comunidades são coisas distintas:** o código não opera nem governa automaticamente as comunidades. Relays e espelhos são opcionais e substituíveis; o Node Zero para Windows/Linux é atualmente local e loopback-only.

---

## 📖 Mapa Canônico de Documentação

| Documento | Foco & Finalidade |
|:---|:---|
| **[docs/README.md](./docs/README.md)** | **Índice Mestre:** Ponto de partida único para desenvolvedores e revisores. |
| **[docs/dossie-geral-inventario-master-breakdown-2026-11.md](./docs/dossie-geral-inventario-master-breakdown-2026-11.md)** | **Plano Mestre N=25:** Único checklist vivo `[ ]` e Definition of Done global. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Topologia técnica, tags GraphQL, linhagem e protocolos de dados. |
| **[GOVERNANCE.md](./GOVERNANCE.md)** | Moderação e deliberação dentro das comunidades Vox; não define a governança do repositório. |
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

## 🤝 Código aberto, participação e governança do projeto

O compromisso do Vox é permanecer aberto: código, protocolos, documentação e decisões devem poder ser examinados, reutilizados, modificados e mantidos pela comunidade. Nenhuma pessoa, empresa ou plataforma deve ter autoridade perpétua e unilateral sobre o projeto. O desenvolvimento inicial por uma pessoa explica a origem do Vox; não concede a essa pessoa um mandato permanente sobre sua direção.

**Estado atual, sem eufemismos:** o repositório ainda tem controle administrativo concentrado em uma pessoa. A governança descrita em [GOVERNANCE.md](./GOVERNANCE.md) trata principalmente das regras de moderação e deliberação de cada comunidade Vox; ela não distribui controle sobre o repositório, releases ou infraestrutura do projeto. Votos dentro de uma comunidade não elegem automaticamente mantenedores nem alteram o código canônico.

**Licença é uma lacuna que precisa ser resolvida:** este repositório não contém um arquivo `LICENSE`. O badge MIT removido anteriormente apontava para um arquivo inexistente, portanto não era evidência de licenciamento. A intenção de manter o Vox aberto está declarada, mas este README não substitui uma licença válida nem esclarece os direitos sobre todas as contribuições existentes. Antes de chamar o checkout atual de software formalmente licenciado como open source, é preciso escolher e publicar uma licença com os direitos necessários confirmados.

### Como a participação funciona hoje

* Qualquer pessoa pode ler o código e a documentação, testar, relatar problemas e propor mudanças por issues e pull requests públicos no [GitHub](https://github.com/yurikayel/vox).
* O histórico de revisão deve registrar motivação, evidências, testes e limitações. Mudanças que alterem protocolos ou regras precisam de explicação pública e tempo para contestação.
* A revisão do mantenedor é hoje o caminho de integração; uma proposta pública não garante merge. Enquanto a administração permanecer concentrada, isso deve ser reconhecido como limite real da participação, não descrito como governança popular já alcançada.
* O guia [CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md) cobre documentação e mutex de edição; ainda não existe neste repositório uma carta completa de governança, sucessão e seleção de múltiplos mantenedores.

### Trabalho necessário para que o projeto seja maior que qualquer indivíduo

1. Publicar uma licença livre após confirmar os direitos das contribuições existentes e estabelecer como novas contribuições serão licenciadas.
2. Definir critérios públicos e revisáveis para adicionar, remover e substituir mantenedores; incluir sucessão e recuperação de acesso.
3. Distribuir a custódia do repositório, releases, domínios e credenciais entre mais de uma pessoa confiável, com procedimentos auditáveis.
4. Manter builds, protocolos e dados portáveis o bastante para que a comunidade possa continuar por forks se o mantenedor ou a plataforma original sair do ar.
5. Separar decisões de código do projeto de decisões locais das comunidades, publicar conflitos de interesse e registrar como propostas foram aceitas ou recusadas.

Essas são condições de trabalho, não capacidades concluídas. Forks públicos ajudam a preservar código, mas não substituem licença, direitos claros, sucessão nem uma governança compartilhada do projeto.

---

*Vox — Soberania de dados, bem comum digital e comunicação comunitária livre.*
