# ADR-010: Vox Contribution Engine — Arquitetura "Execute e Ajude"

**Status:** Proposed · **Estratégia de Sustentação Perene** · **Cold Readiness**

---

## 1. Contexto e Motivação

O projeto Vox atingiu a validação funcional de nós autônomos permanentes ([ADR-008](008-vox-farol-community-node-architecture.md) / Farol Linux) e resiliência multi-gateway ([ADR-009](009-multi-gateway-graphql-corroboration.md)). Contudo, a sobrevivência e escalabilidade de uma rede social cívica soberana a custo zero ($0) não pode depender exclusivamente de servidores dedicados ou de infraestrutura mantida pelo criador.

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
│   Windows EXE   │ │  Android APK  │ │   Linux Farol     │ │    PWA Web     │
│   Full Worker   │ │ Light Worker  │ │  Persistent Node  │ │  Browser Peer  │
│(Bandeja/Desktop)│ │ (Oportunista) │ │(Raspberry/Mini-PC)│ │(Sessão Efêmera)│
└─────────────────┘ └───────────────┘ └───────────────────┘ └────────────────┘
```

### 2.1. Matriz de Capacidades por Plataforma

| Capacidade | Windows EXE | Android APK | Linux Farol | PWA Web |
| :--- | :---: | :---: | :---: | :---: |
| **WebTorrent Seeding** | **Sim (Nativo/WebRTC)** | Não (Restrição bateria) | Sim (Fase posterior) | Efêmero (Aba aberta) |
| **Cache HTTP Local** | **Sim (1–5 GB)** | Oportunista (100–300 MB) | Sim (2–10 GB) | IndexedDB (~50 MB) |
| **Descoberta LAN (mDNS)** | **Sim (Serviço & Cliente)**| Sim (NsdManager cliente)| Sim (Avahi/mDNS) | Não (Sandbox browser) |
| **Execução em Repouso** | **Sim (Task Scheduler/Tray)**| Condicional (WorkManager)| Sim (systemd 24/7) | Não |
| **Relay / Encaminhamento**| Opcional | Não | Sim | Não |

---

## 3. Especificação dos Módulos Principais

### 3.1. Windows: `VoxSeeder.exe` (Full Worker)
O executável Windows é o pilar de maior capacidade da rede:
1. **Operação em Bandeja (System Tray):** Executa em segundo plano com consumo ínfimo de RAM (~15 MB via Python/C++ headless).
2. **WebTorrent Seeder Real:** Mantém arquivos públicos do Vox (snapshots do feed, avatares, mídias e manifests de comunidades) semeados via protocolo BitTorrent/WebRTC para clientes web.
3. **Servidor de Cache LAN:** Serve o conteúdo via HTTP (`127.0.0.1:3921`) para navegadores locais e dispositivos na mesma rede Wi-Fi.
4. **Modos de Execução:**
   - *Ajuda Imediata:* Inicia com 1 clique.
   - *Iniciar com Windows:* Registro em `Run` do usuário sem exigir permissões de administrador.
   - *Ajuda Inteligente:* Ativa o seeding pesado somente quando o computador estiver ocioso (Idle state detectado via Win32 API).

### 3.2. Android: Abordagem Oportunista em 3 Níveis (Light Worker)
Reconhecendo as restrições estritas de economia de bateria do Android 14+ (Doze mode, Foreground Service restrictions):
- **Nível 1 — Ajuda Imediata (Foreground):** Ativo exclusivamente enquanto o usuário navega no app. Compartilha cache via WebRTC DataChannels com pares próximos.
- **Nível 2 — Guardião Noturno (`WorkManager`):** Tarefas em lote disparadas pelo sistema operacional somente quando satisfeitas **quatro restrições simultâneas**:
  1. Conexão Wi-Fi não tarifada (`NetworkType.UNMETERED`).
  2. Aparelho conectado ao carregador (`setRequiresCharging(true)`).
  3. Bateria não-baixa (`setRequiresBatteryNotLow(true)`).
  4. Armazenamento disponível adequado.
  *Ações:* Atualização de manifestos, verificação de integridade de hashes e sincronização de filas.
- **Nível 3 — Guardião Ativo (Sessão Voluntária):** Modo explicitamente iniciado pelo usuário com Notificação Persistente de Primeiro Plano (`ForegroundService`), com botão direto "Parar de Ajudar".

### 3.3. Descoberta Local Zero-Config (mDNS / DNS-SD)
Para eliminar a dependência de trackers externos na mesma rede física (bibliotecas, comitês, praças com Wi-Fi):
- O nó anuncia o serviço: `_vox-relay._tcp.local` na porta `3921`.
- Clientes Android (via `NsdManager`) e computadores locais descobrem o endereço IP privado do Farol/VoxSeeder automaticamente.
- Todas as requisições de leitura de mídia e tópicos são atendidas pela rede local em velocidade de gigabit, sem consumir tráfego de internet.

---

## 4. Avaliação de Tecnologias Futuras

| Tecnologia | Avaliação Vox Operator | Papel Estratégico |
| :--- | :--- | :--- |
| **WebTorrent** | **Prioridade Máxima (MVP)** | Infraestrutura já presente no Vox; seeder desktop viabiliza download descentralizado imediato. |
| **mDNS / DNS-SD** | **Prioridade Máxima (MVP)** | Baixíssimo custo, nativo no Android/Windows/Linux, resolve conectividade local sem servidor. |
| **Iroh (Rust/QUIC)** | **Laboratório de Pesquisa (Fase 4)** | Candidato ideal para Content-Addressed Chunks e hole-punching direto; manter em PoC isolada. |
| **libp2p** | **Apenas Consulta Arquitetural** | Sobrecarga de protocolos concorrentes; não integrar no MVP para evitar complexidade excessiva. |
| **Helia (JS IPFS)** | **Laboratório de Pesquisa** | Útil para protótipos de chunking em memória no navegador; Kubo descartado por consumo de RAM (>6GB). |

---

## 5. Princípios de Confiança e Transparência

1. **Compartilhamento Estritamente Público:**
   - Apenas dados com hash auditável, públicos e assinados (tópicos de comunidades, cartões de perfil, anexos públicos) são cacheados e semeados.
   - Nenhuma mensagem privada (DMs criptografadas), chave de carteira ou histórico confidencial é transferido a terceiros.
2. **Telemetria 100% Local e Honesta:**
   - O painel exibe dados físicos reais medidos no aparelho: espaço cedido, megabytes compartilhados no mês, conexões atendidas e tempo ativo.
   - Rejeição estrita de contadores fictícios, moedas inflacionárias ou rankings competitivos artificiais.
3. **Pausabilidade Imediata:**
   - O usuário pode interromper a contribuição a qualquer momento com um único clique no botão de interrupção ou fechando o aplicativo.

---

## 6. Roteiro de Implementação do MVP (Fase 1)

1. **Passo 1:** Transformação do `VoxSeeder.exe` em Seeder WebTorrent real para Windows (distribuição de pacotes públicos em background).
2. **Passo 2:** Anúncio e Descoberta LAN via mDNS em Python (`zeroconf` leve ou socket nativo) e Android (`NsdManager`).
3. **Passo 3:** Botão "Ajude o Vox" com 3 perfis (Ajudante, Guardião, Farol) na interface de configurações.
4. **Passo 4:** Integração do Guardião Noturno com restrições de bateria no Android.
