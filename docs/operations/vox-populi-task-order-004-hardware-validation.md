# Vox Populi — Task Order 004: validação em hardware físico

> **Status:** rascunho (procedimento preparado; validação L2 em hardware ainda bloqueada, ver "Estado" abaixo) · **Owner:** mantenedor · **Revisado:** 2026-11-01

**Estado:** L2 bloqueado neste ambiente; procedimento reproduzível preparado<br>
**Escopo:** Raspberry Pi 4/5 ou mini-PC Linux dedicado<br>

## Parecer de entrada

O material fornecido pelo mantenedor classifica a Task Order 003 como L1 aprovado em Ubuntu 24.04/WSL2 e L2 pendente. Essa evidência não foi repetida nesta tarefa. A Task Order 004 fecha a validação física pendente; não autoriza publicar um serviço na LAN nem declara o seeder WebTorrent operacional.

Não há um Raspberry Pi ou mini-PC Linux físico disponível para inspeção nesta sessão. O host acessível é Windows; a consulta de distribuições WSL (`wsl.exe --list --quiet`) foi recusada pelo ambiente com `Wsl/E_ACCESSDENIED`. Logo, não foi possível instalar o serviço ou medir hardware. Nenhum valor de CPU, memória, temperatura, energia, rede ou armazenamento é declarado como medido. **L2 permanece bloqueado**, sem simulação de resultados.

## Procedimento reproduzível

### Preparação e identificação

1. Registrar modelo/revisão da placa ou mini-PC, SoC/CPU, RAM, armazenamento, fonte, sistema operacional e versão do kernel.
2. Preferir Raspberry Pi OS Lite 64-bit ou Ubuntu Server 64-bit em instalação limpa; registrar a imagem e seu SHA-256.
3. Usar Ethernet quando possível, cartão/disco dedicado e medidor físico de energia. Registrar também temperatura ambiente e periféricos conectados.
4. Guardar comandos, saídas e horários em UTC no diretório de evidências da execução. Redigir endereços IP públicos, identificadores de rede e quaisquer dados pessoais.

### Instalação e segurança

1. Confirmar arquitetura (`uname -m`), versão de systemd e cgroups v2.
2. Instalar a revisão sob avaliação a partir de checkout limpo; guardar commit e saída integral do instalador.
3. Confirmar usuário de serviço sem privilégios, unidades instaladas e estado `active (running)` após instalação e reinicialização.
4. Confirmar `CPUQuota=40%`, `MemoryMax=512M`, `TasksMax=100` e limites efetivos no cgroup.
5. Confirmar listener apenas em `127.0.0.1:3921` e sandboxing da unidade. Testar a partir de outro dispositivo da rede que a porta não esteja acessível. Não mudar bind, firewall ou encaminhamento para expor o serviço.
6. Confirmar health check HTTP e temporizador de cinco minutos; conferir que telemetria declara `seederActive: false` e `seederStatus: not_implemented`.

### Persistência, recuperação e pressão de armazenamento

1. Gravar conteúdo de teste no cache, reiniciar o equipamento e confirmar que os dados persistem.
2. Interromper e restaurar a conectividade WAN; registrar detecção, erros, recuperação automática e tempo até o health check voltar ao estado saudável.
3. Com dados descartáveis, preencher o cache acima da cota configurada de 2 GiB, realizar leituras concorrentes e confirmar eviction LRU, integridade dos itens retidos e ausência de crescimento acima da cota. Guardar tamanhos antes/depois e logs.
4. Executar atualização e desinstalação seguindo os scripts do pacote. Confirmar versão, saúde do serviço, preservação de dados na atualização e comportamento de dados/serviços na remoção.

### Observação de sete dias

Manter o equipamento ligado por sete dias contínuos, com relógio sincronizado. Registrar em cada reinicialização e, no mínimo, a cada cinco minutos: timestamp, uptime, CPU, RAM, temperatura do SoC, espaço usado/livre, estado do relay, estado de conectividade e estado do cgroup. Registrar energia do medidor em intervalos regulares e totais por dia. Anotar quedas de energia/rede, intervenções, falhas de serviço e recuperação. Não substituir lacunas por estimativas.

Modelo de linha para CSV (uma linha por amostra):

```text
timestamp_utc,uptime_s,cpu_percent,ram_used_mb,temp_c,disk_used_mb,disk_free_mb,energy_wh,relay_state,wan_state,cgroup_cpu,cgroup_memory,notes
```

## Critérios do parecer L2

Marcar **aprovado** apenas com evidências anexadas para instalação limpa, boot/reboot, cgroups, loopback visto localmente e inacessibilidade a partir de outro dispositivo, persistência, recuperação de rede, eviction sob pressão, ciclo de update/uninstall e sete dias de medições reais. Relatar falhas e lacunas; não generalizar para modelos de hardware não testados.

Se não houver equipamento físico durante a execução, registrar **L2 bloqueado por falta de hardware** e entregar este procedimento sem inventar medições. A indisponibilidade de hardware não equivale a aprovação ou reprovação funcional.

## Limites

- O Vox Populi permanece relay-only; seeding WebTorrent continua não implementado.
- O bind padrão permanece em loopback. A Task Order não aprova exposição LAN.
- O resultado WSL2 reportado na TO003 não substitui medições físicas nem os sete dias de observação.

## Evidências registradas na sessão anterior

- Host acessível: Windows PowerShell.
- `wsl.exe --list --quiet`: falhou com `Wsl/E_ACCESSDENIED`.
- Equipamento físico, medições e instalação: não disponíveis/não executados nesta sessão.
- Veredito: **L1 reportado previamente; L2 bloqueado, aguardando bancada física**.
