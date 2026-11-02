# Auditoria de branding — VoxPopuli Node Zero

**Data:** 2026-11-01

**Escopo:** textos visíveis, tray, build PyInstaller, ícones, dados de versão, instalação e alegações de capacidade.

## Resultado

- Nome canônico do nó Windows: **VoxPopuli Node Zero — Community Node**.
- Descrição: **Nó comunitário para operação local de relay e cache, com controle de recursos e gerenciamento pelo tray.**
- O executável principal continua se chamando `VoxPopuli.exe` para preservar o nome já usado. O desktop WebView permanece separado como `VoxPopuliDesktop.exe`.
- Ambos os specs PyInstaller usam o ícone `tools/desktop-seeder-windows/vox.ico` e agora incluem recursos de versão com `ProductName`, `FileDescription`, versões `1.0.0.0` e nome original do executável.
- O título do tray, das preferências e dos diálogos usa VoxPopuli Node Zero; tooltips/status do menu usam a forma curta Vox Populi. O identificador técnico do processo no protocolo local permanece `Vox Populi Node Zero` para manter compatibilidade com instâncias já executando. O atalho de inicialização por usuário, quando ativado explicitamente, mantém o identificador `VoxPopuliNodeZero` e aponta para o executável VoxPopuli.
- O instalador Linux e os serviços systemd exibem Vox Populi e relay/cache. Os caminhos e unidades `vox-farol` restantes são usados somente para detectar e migrar/remover instalações antigas.
- Não existe instalador Windows nem criação de atalhos no menu Iniciar nesta entrega; a distribuição descrita é o executável standalone. O nome interno do diretório `tools/desktop-seeder-windows` permanece legado e não é exibido ao usuário.

## Alegações corrigidas

O desktop WebView não faz seeding WebTorrent, descoberta de peers nem relay comunitário. O bridge reporta `seed_active: false`; README, texto de build e saída de console não anunciam uma malha P2P ativa. O serviço Node Zero permanece relay/cache local, com os estados de seeder declarados como não implementados.

Na revisão ampliada de 1º de novembro, foram encontrados textos antigos que ainda prometiam seeding ou nós participativos ativos em `docs/adr/010-vox-contribution-engine-execute-e-ajude.md`, `android/README.md`, nas strings e comentários do wrapper Android e em `POSITIONING.md`. Esses textos agora distinguem arquitetura proposta do estado atual: relay/cache local em Windows/Linux; sem WebTorrent seeding ou descoberta de nós na LAN; APK Android descrito como wrapper PWA/foreground WebView. A descrição do estado Android não foi recompilada em APK nesta rodada.

## Validação visual

A bandeja é uma aplicação sem janela principal. A tentativa de abrir `VoxPopuli.exe` via Computer Use foi bloqueada pelo controle da sessão (`Computer Use was not approved to use voxpopuli`). Nenhuma alternativa foi usada para contornar o bloqueio. Ícone, apresentação do menu e feedback de cada ação continuam **pendentes de inspeção manual**; não foram aprovados nem classificados como falha funcional.

## Evidências e limites

- Specs, scripts de build, README desktop, README do Node Zero, serviço systemd, tray, launcher, README Android, textos do app, posicionamento e ADR-010 foram inspecionados.
- Os dois builds PyInstaller 6.22.3 terminaram em `C:\Users\yurik\AppData\Local\Temp\vox-brand-audit-1dd007409d52489ea57240158db3cd50`; os dois recursos PE exibem os nomes e versões esperados, conferidos com `pyi-grab_version`. O build desktop emitiu um aviso não fatal porque uma coleta opcional tentou importar o módulo Android do WebView, ausente no Windows.
- Nenhum instalador foi executado, nenhum autostart foi ativado e nenhum executável ativo foi substituído.
