# Vox Farol — Nó Comunitário Autônomo para Linux (Raspberry Pi / x86)

> **Módulo:** `vox-farol`  
> **Arquitetura Canônica:** [ADR-008](../docs/adr/008-vox-farol-community-node-architecture.md)  
> **Doutrina:** Operação Silenciosa / Prontidão Fria (Cold Readiness)

O **Vox Farol** é um pacote para implantação de nós comunitários autônomos de baixo consumo energético em sistemas operacionais baseados em Linux (Raspberry Pi 3/4/5, mini-PCs x86_64/ARM64 e servidores caseiros).

---

## 1. Princípios Arquiteturais

1. **Autonomia do Criador:** O nó funciona indefinidamente mesmo que o computador do mantenedor esteja offline e todos os serviços de nuvem sejam desativados.
2. **Segurança por Padrão (Loopback):** O serviço é iniciado estritamente em `127.0.0.1:3921`. Nenhuma interface de rede externa (LAN ou WAN) é aberta automaticamente na instalação.
3. **Mínimo Privilégio e Sandboxing:** O serviço executa sob usuário isolado (`vox-farol`), sem privilégios administrativos e sob proteção estrita do systemd (`ProtectSystem=full`, `ProtectHome=true`, `PrivateTmp=true`, `NoNewPrivileges=true`).
4. **Aplicação Real de Limites de Recursos:**
   - **CPU:** `CPUQuota=40%` aplicado via cgroups do systemd.
   - **Memória RAM:** `MemoryMax=512M` aplicado via cgroups do systemd.
   - **Armazenamento:** `VOX_RELAY_MAX_CACHE_MB=2048` (2 GB) aplicado em tempo de execução com descarte LRU automático de transações antigas.
5. **Transparência e Telemetria Honesta:**
   - O serviço declara explicitamente o status real de cada subsistema: o relay HTTP está operacional; o processo daemon WebTorrent seeder ainda não está implementado neste MVP e é reportado honestamente como `seederStatus: not_implemented`.
   - Telemetria de CPU, memória, temperatura e disco é medida no hardware real e salva localmente em `/opt/vox-farol/monitoring/status.json` via temporizador systemd a cada 5 minutos.
   - Zero telemetria centralizada (sem phone-home).

---

## 2. Estrutura do Pacote

```
vox-farol/
├── config/
│   └── farol.json                 # Configuração de rede e cotas de disco
├── systemd/
│   ├── vox-farol.service          # Unidade do relay com isolamento e cgroups
│   ├── vox-farol-health.service   # Serviço de verificação de telemetria
│   └── vox-farol-health.timer     # Agendador periódico (5 minutos)
├── monitoring/
│   └── status.json                # Telemetria local honesta
├── install.sh                     # Instalador com verificação estrita de boot
├── uninstall.sh                   # Desinstalador limpo com opção de purga
├── update.sh                      # Atualização segura preservando dados locais
├── health-check.sh                # Script de checagem periódica e medição real
└── README.md                      # Este documento de referência
```

---

## 3. Instalação e Verificação

### Requisitos:
- Linux com systemd (Debian 11+, Ubuntu 20.04+, Raspberry Pi OS).
- Python 3.8+ (biblioteca padrão).
- Conexão de rede (Ethernet ou Wi-Fi estável).

### Instalação Interativa:
```bash
cd vox-farol
bash install.sh
```

### Instalação Não Interativa (Bancada/CI):
```bash
bash install.sh --yes
```

O instalador executa uma verificação obrigatória de prontidão (`systemctl is-active` + `HTTP GET http://127.0.0.1:3921/health`) e encerra com erro fatal (`exit 1`) caso o serviço não inicie com sucesso.

---

## 4. Configuração de Rede e Acesso LAN (Opcional)

Por padrão de segurança, o Farol escuta apenas em `127.0.0.1` (loopback). Caso deseje disponibilizar o cache local para outros dispositivos conectados na mesma rede Wi-Fi/Ethernet doméstica:

1. Edite `config/farol.json`:
   ```json
   "network": {
     "listenHost": "0.0.0.0",
     "listenPort": 3921,
     "enableLanDiscovery": true
   }
   ```
2. Configure o serviço systemd para escutar no host desejado ou `0.0.0.0` em `/etc/systemd/system/vox-farol.service`:
   ```ini
   ExecStart=/usr/bin/python3 -m relay.server --port 3921 --host 0.0.0.0
   ```
3. Configure o firewall local (UFW) para restringir o acesso apenas à sub-rede local (ex: `192.168.1.0/24`), **nunca expondo a porta 3921 à WAN**:
   ```bash
   sudo ufw allow from 192.168.1.0/24 to any port 3921 proto tcp comment "Vox Farol LAN"
   ```
4. Reinicie o serviço:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart vox-farol.service
   ```

---

## 5. Comandos de Operação

- **Status do serviço principal:**
  ```bash
  systemctl status vox-farol.service
  ```
- **Status do temporizador de saúde:**
  ```bash
  systemctl status vox-farol-health.timer
  ```
- **Logs ao vivo:**
  ```bash
  journalctl -u vox-farol.service -f
  ```
- **Executar diagnóstico manual:**
  ```bash
  bash /opt/vox-farol/health-check.sh
  cat /opt/vox-farol/monitoring/status.json
  ```
- **Desinstalação limpa:**
  ```bash
  bash uninstall.sh
  ```
