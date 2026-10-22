# 🇧🇷 Vox — A Voz Soberana da Rede

> **Poste uma vez. Pertença a comunidades reais. Ecoe em todas as redes.**  
> O Vox é uma iniciativa de rede social aberta, leve e descentralizada, desenhada para devolver a soberania digital e o controle do conteúdo às mãos dos brasileiros — sem dependência de Big Techs, sem servidores centrais para pagar e com foco em comunidades no estilo Orkut.

---

## 🎯 Por que o Vox existe?

No modelo atual da internet, a comunicação de mais de 200 milhões de brasileiros está refém de um punhado de corporações estrangeiras:
1. **Risco de Apagão e Censura:** Contas bloqueadas arbitrariamente, algoritmos opacos que sufocam o alcance e a vulnerabilidade constante de ficar sem seus laços sociais caso uma plataforma estrangeira seja suspensa ou mude de dono.
2. **Dependência de Falsas Alternativas:** Redes alternativas comerciais mantêm infraestruturas centralizadas fora do país e respondem a interesses de investidores estrangeiros.
3. **Morte das Comunidades Reais:** O modelo de feed infinito individualizado sufocou a convivência comunitária orgânica que o Brasil dominava na era do Orkut.

O **Vox** adota o espírito do **Pix**: uma infraestrutura pública, descentralizada e aberta, onde você é dono da sua identidade e do seu conteúdo.

### Por que não Bluesky / Mastodon / P2P puro?
* **Sem dependência da Bluesky PBC:** O Bluesky centraliza seus serviços de busca e indexação (*AppViews*) em uma empresa privada sediada nos EUA. O Vox utiliza múltiplos gateways neutros distribuídos.
* **Sem o custo de VPS do Mastodon:** O Fediverso sobrecarrega administradores voluntários com contas mensais de servidor e confunde o usuário final com a "escolha de instâncias". O Vox é 100% serverless para os mantenedores.
* **Sem a fragilidade P2P do Varanda:** Dispensamos a necessidade de celulares atuarem como servidores de rede (*seeders*) e os bloqueios crônicos de NAT/CGNAT em redes móveis brasileiras.

*(Diagnóstico comparativo completo, matriz 5×5 e lições aprendidas em [LESSONS.md](./LESSONS.md))*

---

## 🏛️ Os Três Pilares do Vox (O Sweet Spot)

### 1. Comunidades Primeiro (Estilo Orkut)
* **Fóruns por Tópicos:** Discussões organizadas por assunto com tópicos e respostas encadeadas, resgatando a profundidade das conversas.
* **A Rua (Descoberta Pública):** A visualização global que permite descobrir o que está sendo debatido em todas as comunidades abertas, sem algoritmos de recomendação manipulativos.
* **Membros no Perfil:** As comunidades às quais você pertence definem a sua identidade e seus interesses no seu perfil.
* **Moderação Distribuída:** Os criadores e moderadores filtram abusos localmente via transações assinadas (`mod-action`), sem depender de comitês centrais.

### 2. Soberania Serverless (Permaweb / GraphQL)
* **Zero Servidores Centrais:** O Vox não possui backend Node, Python ou banco de dados que voluntários precisam bancar.
* **Linhagem Channel-01:** Aproveita a arquitetura comprovada de leitura via GraphQL aberto em gateways da rede Arweave/AR.IO (`turbo-gateway.com`, `arweave.net`), expandindo o canal estático para um ecossistema social bidirecional.
* **Sua Chave é Você:** Identidade criptográfica local no dispositivo (Ed25519; detalhes em [IDENTITY.md](./IDENTITY.md)).

### 3. Ponte, não Ilha (Crossposting)
* O Vox não exige que seus contatos abandonem outras plataformas para você ter voz.
* O post original assinado fica salvo perenemente no controle do usuário.
* Com **1 toque**, o app despacha o conteúdo para **WhatsApp, Instagram, TikTok e X** através da Web Share API nativa e web intents.

*(Mensagens Diretas E2E permanecem planejadas para a **Fase 3** após consolidação do protocolo de comunidades)*

---

## ⚙️ Arquitetura Técnica do MVP

```
┌─────────────────────────────────────────────────────────────┐
│                 Vox Web Client (PWA Ultraleve)              │
│       HTML5 + CSS Minimalista + Vanilla JS (< 50 KB)        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
        [Leitura Pública]               [Escrita & DMs]
               │                               │
               ▼                               ▼
      Gateways Descentralizados       Assinatura Local
        (AR.IO / Turbo GraphQL)        (WebCrypto no Aparelho)
               │                               │
               ▼                               ▼
    Consultas de Comunidades/Posts     Turbo Bundler (L2 Arweave)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                       Permaweb (Arweave)
```

### Esquema de Tags (Sem Banco de Dados)
Todo dado no Vox é identificado por tags semânticas universais:

| Ação | Tag `Type` | Tags Adicionais |
|---|---|---|
| **Criar Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` |
| **Entrar em Comunidade** | `membership` | `Community-Id` |
| **Criar Tópico** | `topic` | `Community-Id`, `Topic-Title` |
| **Responder Tópico** | `reply` | `Community-Id`, `Reply-To` (TX ID) |
| **Moderação** | `mod-action` | `Community-Id`, `Action` (hide/ban), `Target` |
| **Mensagem Direta (Fase 3)** | `dm` | `Recipient` (Chave pública) |

---

## 🗺️ Roadmap de Execução

- [x] **Fase 0: Concepção & Arquitetura**
  - Definição da estratégia de soberania digital sem servidor central.
  - Adoção do modelo Permaweb + Turbo Gateway.
- [x] **Fase 1: MVP do Fórum & Leitura (A Rua + Comunidades)**
  - Cliente PWA em [`client/`](./client/) — comunidades, tópicos e respostas via GraphQL (`App-Name: vox-brasil`).
  - Interface nostálgica e limpa (estilo Orkut moderno); demo offline se gateway falhar.
- [x] **Fase 2: Autoria, Chaves & Ponte de Crossposting**
  - Carteira Arweave JWK local (`wallet.js`) com geração e importação.
  - Upload de transações (`upload.js`) para comunidades, tópicos e respostas.
  - Leitura de corpo de transações com cache de dados (`graphql.js: fetchTransactionData`).
  - Botão de compartilhamento Web Share API + fallback de área de transferência (`share.js`).
  - Perfil de membro com listagem de comunidades seguidas (`membership`).
  - Governança distribuída via transações `mod-action` com supressão client-side (`moderation.js`).
  - Guia de testes e faucet em [`client/DEV.md`](./client/DEV.md).
  - *Critério de Sucesso (DoD atingido):* Criação de tópicos assinados, leitura via GraphQL e compartilhamento em < 30s sem backend próprio.
- [x] **Fase 3: Nós Participativos & Espelhos Locais**
  - Cache persistente IndexedDB com política LRU (`cache-node.js`).
  - Protocolo peer `vox-peer` v0 com mensagens `WANT`/`BLOB` via BroadcastChannel (`peers.js`).
  - Interface de configuração de rede distribuída e métricas em `#/settings/network`.
  - Servidor desktop local de cache e espelho em Python sem dependências (`vox/relay/`).
  - *Critério de Sucesso (DoD atingido):* Resolução em cascata (Cache -> Relay -> Peer -> Gateway) acelerando leitura e suportando navegação offline.
- [x] **Fase 3.1: Rede Distribuída por Padrão (Pacto Vox)**
  - Participação distribuída ativa por padrão com contrato transparente na 1ª abertura (Modal Pacto Vox).
  - Inversão de valor: soberania de chaves e dados ↔ cache local cooperativo sem servidores centrais.
  - Salvaguardas rigorosas: teto diário de banda (padrão 50 MB/dia), limite de cache (25 MB) e priorização Wi-Fi.
  - Suporte a Service Worker (`sw.js`) para relay em background com notificação visível no sistema operacional.
  - Direito incondicional de opt-out preservado em `#/settings/network` ("Pausar contribuição").
- [ ] **Fase 4: Mensagens Diretas Criptografadas**
  - DMs com chave pública do destinatário via WebCrypto.
- [ ] **Fase 5: Domínio & Identidade .vox.br**
  - Nomes amigáveis e resolução descentralizada.

---

## 📚 Documentação

| Arquivo | Conteúdo |
|---------|----------|
| [LESSONS.md](./LESSONS.md) | **Diagnóstico comparativo (Varanda, Bluesky, Mastodon, Channel-01, Pix) e matriz 5×5** |
| [POSITIONING.md](./POSITIONING.md) | Posicionamento, honestidade permaweb e metáfora Pix |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Linhagem Channel-01, GraphQL, tags e fluxos técnicos |
| [GOVERNANCE.md](./GOVERNANCE.md) | Moderação `mod-action` client-side e espelhos comunitários |
| [IDENTITY.md](./IDENTITY.md) | Ed25519, Passkeys e fases de identidade |
| [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) | LGPD, Marco Civil Art. 19 e notas regulatórias |
| [client/DEV.md](./client/DEV.md) | Guia do desenvolvedor: carteira Arweave local, faucets e testes |
| [relay/README.md](./relay/README.md) | Guia do Vox Relay Desktop: cache proxy local em Python |

### Rodar o PWA localmente

```bash
cd client
python -m http.server 8080
```

Abra `http://127.0.0.1:8080/` (módulos ES exigem servidor HTTP local, não `file://`).

---

## 🤝 Como Contribuir

O Vox é mantido pela boa vontade de desenvolvedores, designers e entusiastas brasileiros da soberania digital.

* Código aberto sob licença MIT.
* Princípio de projeto: **Menor esforço, maior impacto**. Zero inchaço algorítmico, sem dependência de Big Techs.
