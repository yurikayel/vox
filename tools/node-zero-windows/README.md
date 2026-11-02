# VoxPopuli Node Zero — Community Node

Nó comunitário para operação local de relay e cache, com controle de recursos e gerenciamento pelo tray. O `VoxPopuli.exe` fica na área de notificação do Windows e abre um menu de controle com clique direito.

## Máquina de referência

Dados informados na captura do usuário: Windows 11 Pro 25H2, AMD Ryzen 9 5900X de 12 núcleos, 16 GB de RAM, RTX 3060 com 12 GB e aproximadamente 240 GB livres em 1,36 TB. A GPU não é usada pelo Nó Zero.

## O que esta versão faz

- Serve o relay/cache Vox em `http://127.0.0.1:3921` e a API de controle em `http://127.0.0.1:3922`.
- Cria uma identidade UUID persistente por conta do Windows.
- Mantém cache, inbox, identidade, token local, preferências e status em `%LOCALAPPDATA%\VoxPopuli\NodeZero` (com fallback para `%USERPROFILE%\AppData\Local`).
- Expõe pausa, retomada e encerramento somente em loopback, com token local para operações de controle.
- Mede CPU ociosa, memória disponível e tempo desde a última entrada do usuário.
- No estado IDLE, limita o processo a até 70% da capacidade ociosa de CPU medida; no estado ACTIVE usa até 20% da capacidade ociosa. PRESSURE reduz a cota de CPU para 1%. Esses percentuais são ajustáveis nas preferências locais, dentro desses tetos de segurança.
- Dimensiona o limite de memória com base na disponibilidade, reserva ao menos 4 GB para o Windows e impõe um teto configurável de 4 GB. Cache em disco permanece limitado a 2 GB por padrão.
- Usa Windows Job Objects quando disponíveis. Se a cota de CPU não puder ser aplicada pelo Job Object, tenta reduzir a prioridade do processo e informa o modo usado no status.
- As preferências podem ser alteradas em **Preferências…** no menu da bandeja: CPU ociosa (1–70%), CPU ativa (1–20%), memória (512–8192 MB) e cache (64–65536 MB). O status mostra valores configurados e efetivamente aplicados. Os valores iniciais por ambiente podem ser definidos por `VOX_NODE_ZERO_CACHE_MB` e `VOX_NODE_ZERO_MEMORY_MB`; os padrões são 2048 MB e 4096 MB.
- Leituras de transações em cache são verificadas por SHA-256 local; dados sem hash ou alterados são removidos e buscados novamente. Cada leitura válida atualiza a idade LRU. Arquivos de hash contam no limite de disco, e `/health` informa falhas de integridade.
- Registra temperatura como indisponível quando o Windows não oferece uma leitura confiável.

## Usar o executável

Abra `dist\VoxPopuli.exe`. O ícone aparece na bandeja e o relay/cache inicia em segundo plano. O menu oferece status, preferências, pausar/retomar, iniciar/parar o nó, habilitar/desabilitar inicialização com o Windows e sair. Sair encerra o nó local; se o controle não confirmar o encerramento, o app permanece na bandeja e mostra um aviso. A inicialização com o Windows fica desligada até ser ativada no menu; a opção usa apenas o perfil atual e não exige administrador. Se o Explorer reiniciar, o launcher recria o ícone da bandeja.

O aplicativo não abre janela, não mostra balões periódicos, não altera firewall e não instala serviços globais. Duplo clique no ícone abre um resumo do estado e dos limites aplicados.

## Executar a partir do código

No PowerShell, na raiz de `vox/`:

```powershell
python .\tools\node-zero-windows\tray_app.py
```

Para iniciar o runner sem bandeja durante desenvolvimento:

```powershell
python .\tools\node-zero-windows\node_zero.py start
python .\tools\node-zero-windows\node_zero.py status
python .\tools\node-zero-windows\node_zero.py health
python .\tools\node-zero-windows\node_zero.py pause
python .\tools\node-zero-windows\node_zero.py resume
python .\tools\node-zero-windows\node_zero.py stop
```

## Compilar

```powershell
.\tools\node-zero-windows\build.ps1
```

O build produz `dist\VoxPopuli.exe` como executável único sem console e com metadados de versão do produto. O desktop WebView do Vox é empacotado separadamente como `dist\VoxPopuliDesktop.exe`.

## Limites conhecidos

- Esta entrega é um relay/cache local, não um nó P2P completo.
- Seeder WebTorrent e descoberta de peers não estão implementados; o status os declara como indisponíveis.
- O modo Bootstrap é apenas local neste estágio; não anuncia nem publica a identidade do nó.
- Nenhuma regra de firewall ou porta de roteador é alterada. Endpoints escutam somente em `127.0.0.1`.
- O estado de pressão considera CPU e memória. Temperatura confiável e telemetria elétrica ainda não estão disponíveis neste Windows runner.
- A disponibilidade e aplicação real do Job Object são registradas no status; prioridade reduzida é um fallback e não equivale a um hard cap.

O ensaio contínuo de 24 horas e depois de sete dias continua como etapa de validação operacional, após a primeira execução e revisão do status local.
