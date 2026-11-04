# ADR-008: Arquitetura do Vox Populi — Nó Comunitário Autônomo de Baixo Consumo

**Status:** accepted · **Fase 3.4 (Perenidade e Autonomia)**

---

## 1. Contexto

A sustentação a longo prazo da rede Vox sem depender de infraestrutura pessoal do mantenedor ou de nuvens comerciais centralizadas exige a existência de pontos de ancoragem comunitários. 

O brainstorm inicial explorou ideias de nós perpétuos em smartphones e micro-shards com Reed-Solomon. No entanto, após rigorosa avaliação técnica e alinhamento com a doutrina de **Cold Readiness (Prontidão Fria)**, estabeleceu-se que:
1. **Arweave Turbo Free Tier não é armazenamento infinito gratuito:** Existe um limite acumulado de 10 MiB por carteira/subnet no nível gratuito (`ar.io`), inviabilizando uploads ilimitados contínuos a $0. A Arweave deve ser tratada como camada canônica para metadados e posts leves, não como depósito irrestrito de fragmentos de arquivos grandes.
2. **STUN não substitui TURN:** Adicionar servidores STUN públicos amplia a descoberta de IPs reflexivos, mas dispositivos sob CGNAT simétrico estrito ainda exigem trânsito por relay.
3. **Plataforma alvo:** Dispositivos móveis e TV Boxes Android possuem restrições agressivas de execução em segundo plano (*Doze Mode*, restrições de bateria) e hardware excessivamente fragmentado. O primeiro alvo de hardware deve ser previsível, auditável e padronizado: **Linux Debian/Ubuntu (Raspberry Pi, mini-PCs x86_64/ARM64 e servidores domésticos ociosos)**.

---

## 2. Decisão

Aprova-se a criação do **Vox Populi (MVP Linux)** como subsistema independente empacotado em `vox-populi/`, governado pelos seguintes princípios arquiteturais:

### A. Papel do Vox Populi na Malha Cívica
O Vox Populi atua como um nó servidor de baixo consumo operado voluntariamente por coletivos, sindicatos, associações ou militantes domésticos. Ele cumpre quatro funções conceituais delimitadas:
1. **Relay & Cache Local:** Espelha e retém em cache SSD/microSD os tópicos e mídias das comunidades inscritas, servindo clientes na rede local (Wi-Fi comunitário) ou via rendezvous WebRTC.
2. **Discovery Anchor:** Atua como ponto de presença estável para sinalização WebSocket e troca de endereços efêmeros.
3. **Seeder Silencioso:** Retransmite dados via WebTorrent DataChannels sem que nenhum usuário individual precise manter a aba do navegador aberta.
4. **Health Guardian:** Mede e expõe localmente telemetria objetiva de integridade (temperatura de hardware, uso de memória, latência com gateways Arweave e status de conectividade).

Essas funções descrevem a arquitetura-alvo, não o estado completo do código. Em 1º de novembro de 2026, os pacotes Linux e Windows implementam relay/cache HTTP local; WebTorrent seeding e descoberta P2P ainda não estão implementados. No cliente, os endereços Nostr são apenas candidatos catalogados: não há publicação, subscrição nem transporte de sinalização Nostr integrado ao WebRTC. O tráfego outbound implementado pelo relay busca dados nos gateways Arweave configurados.

### B. Especificação Operacional Estrita
1. **Usuário Dedicado sem Privilégios:** A execução ocorre sob o usuário de sistema `vox-populi`, sem acesso root e sem permissão de sudo.
2. **Zero Portas Inbound Obrigatórias:** O pacote Linux atual fixa o relay/cache em loopback (`127.0.0.1:3921`) e faz consultas outbound aos gateways Arweave configurados. A lista de relays Nostr não é conectada, o seeder WebTorrent e a descoberta LAN não existem; portanto, não se deve inferir tráfego para esses serviços a partir desta ADR. Acesso LAN exige implementação e validação explícitas futuras; não edite a unidade atual nem regras de firewall para expor o serviço.
3. **Limites Rígidos de Recursos:** O arquivo de configuração `config/vox-populi.json` impõe limites de armazenamento (padrão: 2 GB), cota máxima de tráfego mensal e limitação de threads de CPU.
4. **Instalação Reproduzível e Desinstalação Limpa:** Scripts shell idempotentes (`install.sh`, `uninstall.sh`, `update.sh`, `health-check.sh`) com validação de checksum e confirmação interativa explícita.
5. **Autonomia do Criador:** O nó opera e sobrevive independentemente de qualquer servidor central; se o mantenedor desaparecer, o Vox Populi continua servindo sua comunidade.

---

## 3. Rejeitado / Não Permitido

- **Não** introduzir dependências pesadas como Docker obrigatório, Kubernetes ou Node.js runtime no Vox Populi (utiliza o relay nativo Python 3 da biblioteca padrão já auditado em `vox/relay/server.py`).
- **Não** anunciar consumo de energia fixo inferior a 2W sem aferição de bancada com wattímetro em cada modelo específico de hardware.
- **Não** implementar fragmentação Reed-Solomon diretamente em produção antes de validação experimental controlada em laboratório.
- **Não** fazer phoning home ou telemetria centralizada: os dados de status residem estritamente no nó (`monitoring/status.json`).

---

## 4. Consequências

- O pacote do Vox Populi é auto-contido na pasta `vox-populi/` no sub-repo `vox/`.
- Permite que qualquer usuário com um Raspberry Pi 3/4/5 ou mini-PC crie um nó resiliente em 2 minutos via `bash install.sh`.
- Prepara o terreno técnico para o futuro Vox Populi em TV Box Android (Fase 2 do roadmap).
- Cobertura de integridade garantida por testes unitários e de sintaxe shell em `tests/vox-populi.test.js`.
