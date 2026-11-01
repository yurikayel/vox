# Vox Farol — Nó Comunitário Autônomo para Linux (Raspberry Pi / x86)

> **Módulo:** `vox-farol`  
> **Arquitetura Canônica:** [ADR-008](../docs/adr/008-vox-farol-community-node-architecture.md)  
> **Doutrina:** Operação Silenciosa / Prontidão Fria (Cold Readiness)

O **Vox Farol** é um pacote para implantação de nós comunitários autônomos de baixo consumo energético em sistemas operacionais baseados em Linux (Raspberry Pi 3/4/5, mini-PCs x86_64/ARM64 e servidores caseiros).

---

## 1. Princípios Arquiteturais

1. **Autonomia do Desenvolvedor:** O nó funciona indefinidamente mesmo que o computador do criador esteja offline e todos os serviços de nuvem sejam desativados.
2. **Zero Portas Inbound Expostas:** O Farol opera primordialmente em conexões *outbound* com relays Nostr e trackers WebTorrent, ou servindo tráfego exclusivamente na rede local (LAN privada `192.168.x.x:3921`). Nenhuma porta precisa ser aberta no roteador doméstico.
3. **Mínimo Privilégio:** O serviço executa sob usuário de sistema isolado (`vox-farol`), sem privilégios de superusuário e protegido por diretivas de sandbox do systemd (`ProtectSystem=full`, `ProtectHome=true`, `PrivateTmp=true`).
4. **Transparência de Consumo:** Não prometemos milagres. Um equipamento de 2 W ligado 24h/dia consome:
   $$2\text{ W} \times 24\text{ h} \times 30\text{ dias} / 1000 = 1{,}44\text{ kWh/mês}$$
   o que representa um custo real modesto na conta de luz local (< R$ 1,50/mês), porém mensurável pelo operador.

---

## 2. Estrutura do Pacote

```
vox-farol/
├── config/
│   └── farol.json           # Configuração de rede, cotas de disco e tráfego
├── systemd/
│   └── vox-farol.service    # Unidade systemd com sandboxing rigoroso
├── monitoring/
│   └── status.json          # Telemetria local (CPU, RAM, temp, conectividade)
├── install.sh               # Instalador idempotente (requer confirmação explícita)
├── uninstall.sh             # Desinstalador limpo com opção de purga de cache
├── update.sh                # Atualização segura preservando identidades locais
├── health-check.sh          # Script de checagem periódica e diagnóstico
└── README.md                # Este documento de referência
```

---

## 3. Instalação no Raspberry Pi / Mini-PC

### Requisitos:
- Linux com systemd (Debian 11+, Ubuntu 20.04+, Raspberry Pi OS).
- Python 3.8+ (biblioteca padrão).
- Conexão de rede (Ethernet ou Wi-Fi estável).

### Instalação:
```bash
cd vox-farol
bash install.sh
```
*Para automação não interativa em laboratório:*
```bash
bash install.sh --yes
```

---

## 4. Comandos de Operação

- **Verificar status do serviço:**
  ```bash
  systemctl status vox-farol.service
  ```
- **Acompanhar logs ao vivo:**
  ```bash
  journalctl -u vox-farol.service -f
  ```
- **Executar diagnóstico de saúde manual:**
  ```bash
  bash /opt/vox-farol/health-check.sh
  cat /opt/vox-farol/monitoring/status.json
  ```
- **Atualizar o nó:**
  ```bash
  bash update.sh
  ```
- **Desinstalar:**
  ```bash
  bash uninstall.sh
  ```

---

## 5. Limites e Segurança

- Armazenamento em cache limitado por padrão a 2 GB (`maxStorageMb: 2048`).
- Nenhuma telemetria é enviada para servidores centrais (estritamente local).
- Sem dependência de Docker, NodeJS ou bancos SQL externos.
