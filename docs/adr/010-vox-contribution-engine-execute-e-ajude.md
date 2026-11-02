# ADR-010: Vox Contribution Engine — Arquitetura "Execute e Ajude"

**Status:** Proposed · **Estratégia de Sustentação Perene** · **Cold Readiness**

> **Limite de estado:** este ADR descreve uma arquitetura proposta, não capacidades já entregues. Em 1º de novembro de 2026, Windows e Linux oferecem relay/cache HTTP local; WebTorrent seeding e descoberta de nós via LAN não estão implementados. O APK Android é um wrapper com WebView e serviço em primeiro plano; esse serviço não implementa seeding nem descoberta LAN.

---

## 1. Contexto e Motivação

O projeto Vox tem relay/cache local em Windows e Linux ([ADR-008](008-vox-populi-community-node-architecture.md)) e resiliência multi-gateway descrita em [ADR-009](009-multi-gateway-graphql-corroboration.md). Ainda não há WebTorrent seeding nem descoberta de peers. A proposta abaixo explora como contribuições distribuídas poderiam reduzir a dependência de infraestrutura dedicada, sem representar o estado atual do produto.

A maior reserva computacional existente reside nos próprios aparelhos dos usuários:
- **Computadores Desktop (Windows/Mac/Linux):** Conexões banda larga estáveis, armazenamento abundante em disco (HD/SSD) e alimentação contínua na tomada.
- **Smartphones (Android):** Alta densidade física, proximidade geográfica entre pares cívicos e conectividade Wi-Fi residencial frequente.

O objetivo do modelo **"Execute e Ajude"** é converter qualquer instalação do Vox em um nó colaborador voluntário da infraestrutura, através de **uma única decisão simples do usuário** ("Participar ou Não"), administrando automaticamente recursos conforme os limites físicos do dispositivo.

---

## 2. Decisão Arquitetural

Adota-se a iniciativa **Vox Contribution Engine (Motor de Contribuição Vox)**, estruturada em torno de quatro papéis complementares e um protocolo de capacidades compartilhadas:

```
                      ┌─────────────────────────────────────────┐
                      │        VOX CONTRIBUTION ENGINE          │
                      │       Protocolo Comum de Nós P2P        │
                      └────────────────────┬────────────────────┘
                                           │
         ┌──────────────────┬──────────────┴─────┬──────────────────┐
         ▼                  ▼                    ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌────────────────┐
│   Windows EXE   │ │  Android APK  │ │   Linux Vox Populi     │ │    PWA Web     │
│   Full Worker   │ │ Light Worker  │ │  Persistent Node  │ │  Browser Peer  │
│(Bandeja/Desktop)│ │ (Oportunista) │ │(Raspberry/Mini-PC)│ │(Sessão Efêmera)│
└─────────────────┘ └───────────────┘ └───────────────────┘ └────────────────┘
```

### 2.1. Matriz de Capacidades por Plataforma

| Capacidade | Windows EXE | Android APK | Linux Vox Populi | PWA Web |
| :--- | :---: | :---: | :---: | :---: |
| **WebTorrent Seeding** | Não implementado | Não implementado | Não implementado | Não implementado |
| **Cache HTTP Local** | Relay/cache local | Sem cache local comprovado | Relay/cache local | IndexedDB do cliente |
| **Descoberta de nós na LAN (mDNS)** | Não implementada | Não implementada | Não implementada | Não disponível |
| **Execução em Repouso** | Tray inicia relay; autostart é opt-in | Serviço Android em primeiro plano; sem contribuição P2P comprovada | Serviço systemd | Não |
| **Relay / Encaminhamento**| Relay local | Não implementado | Relay local | Não |

---

## 3. Especificação dos Módulos Principais

### 3.1. Windows atual: VoxPopuli Node Zero (`VoxPopuli.exe`)
O executável oferece gerenciamento pela bandeja para um relay/cache HTTP local. Ele não semeia via WebTorrent e não descobre peers. A inicialização com Windows é opcional e vem desligada; não há modo de seeding ocioso implementado. Os perfis de recursos e o cache local são controláveis pelo menu.

### 3.2. Android: wrapper atual e proposta futura
O APK atual abre o PWA e inicia um foreground service que carrega uma WebView. Esse serviço não implementa seeding WebTorrent, descoberta de nós na LAN ou cache compartilhado. Os níveis abaixo são proposta de evolução, considerando restrições de bateria do Android:
- **Nível 1 — Ajuda Imediata (Foreground):** Ativo exclusivamente enquanto o usuário navega no app. Compartilha cache via WebRTC DataChannels com pares próximos.
- **Nível 2 — Guardião Noturno (`WorkManager`):** Tarefas em lote disparadas pelo sistema operacional somente quando satisfeitas **quatro restrições simultâneas**:
  1. Conexão Wi-Fi não tarifada (`NetworkType.UNMETERED`).
  2. Aparelho conectado ao carregador (`setRequiresCharging(true)`).
  3. Bateria não-baixa (`setRequiresBatteryNotLow(true)`).
  4. Armazenamento disponível adequado.
  *Ações:* Atualização de manifestos, verificação de integridade de hashes e sincronização de filas.
- **Nível 3 — Guardião Ativo (Sessão Voluntária):** Modo explicitamente iniciado pelo usuário com Notificação Persistente de Primeiro Plano (`ForegroundService`), com botão direto "Parar de Ajudar".

### 3.3. Descoberta de nós na LAN (mDNS / DNS-SD) — proposta
Esta capacidade não está implementada. Como trabalho futuro, um nó poderia anunciar `_vox-relay._tcp.local` e clientes na mesma rede poderiam descobrir seu endereço privado. A descoberta e o atendimento de tráfego precisariam de testes próprios antes de qualquer anúncio de disponibilidade ou desempenho.

---

## 4. Avaliação de Tecnologias Futuras

| Tecnologia | Avaliação Vox Operator | Papel Estratégico |
| :--- | :--- | :--- |
| **WebTorrent** | **Candidato futuro, não implementado** | Exige política explícita de descoberta, limites e validação antes de ativação. |
| **mDNS / DNS-SD** | **Candidato futuro, não implementado** | Pode apoiar descoberta local, após definir política de rede e validar em cada plataforma. |
| **Iroh (Rust/QUIC)** | **Laboratório de Pesquisa (Fase 4)** | Candidato ideal para Content-Addressed Chunks e hole-punching direto; manter em PoC isolada. |
| **libp2p** | **Apenas Consulta Arquitetural** | Sobrecarga de protocolos concorrentes; não integrar no MVP para evitar complexidade excessiva. |
| **Helia (JS IPFS)** | **Laboratório de Pesquisa** | Útil para protótipos de chunking em memória no navegador; Kubo descartado por consumo de RAM (>6GB). |

---

## 5. Princípios de Confiança e Transparência

1. **Compartilhamento Estritamente Público:**
   - O relay/cache atual pode reter dados públicos; semeadura WebTorrent ainda não existe e não deve ser anunciada como ativa.
   - Nenhuma mensagem privada (DMs criptografadas), chave de carteira ou histórico confidencial é transferido a terceiros.
2. **Telemetria 100% Local e Honesta:**
   - O painel exibe dados físicos reais medidos no aparelho: espaço cedido, megabytes compartilhados no mês, conexões atendidas e tempo ativo.
   - Rejeição estrita de contadores fictícios, moedas inflacionárias ou rankings competitivos artificiais.
3. **Pausabilidade Imediata:**
   - O usuário pode interromper a contribuição a qualquer momento com um único clique no botão de interrupção ou fechando o aplicativo.

---

## 6. Roteiro de Implementação do MVP (Fase 1)

1. **Passo 1:** Transformação do `VoxPopuli.exe` em Seeder WebTorrent real para Windows (distribuição de pacotes públicos em background).
2. **Passo 2:** Anúncio e Descoberta LAN via mDNS em Python (`zeroconf` leve ou socket nativo) e Android (`NsdManager`).
3. **Passo 3:** Botão "Ajude o Vox" com 3 perfis (Ajudante, Guardião e Nó Comunitário) na interface de configurações.
4. **Passo 4:** Integração do Guardião Noturno com restrições de bateria no Android.
