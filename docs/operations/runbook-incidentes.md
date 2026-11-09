# Runbook de incidentes (LAN-24)

**Status:** rascunho de 08/11/2026. Só conta como entregue depois de **1 simulado datado** (tabela no fim).
**Quem usa:** quem estiver de plantão. Até o LAN-30 fechar, o plantão é o mantenedor + a 2ª pessoa com acesso ao GitHub e ao Render.

## Regra geral

1. **Conter primeiro, investigar depois.** Se houver dúvida, desligue o recurso pelo kill-switch e explique no `notice`.
2. **Registrar:** abrir uma issue privada (ou nota no canal do plantão) com hora de início, o que foi feito e por quem.
3. **Comunicar:** o `notice` de `client/config/flags.json` (até 280 caracteres) aparece no topo do app na próxima recarga.
4. **Encerrar:** religar o que foi desligado, escrever o pós-incidente (o que aconteceu, impacto, o que muda) em até 7 dias.

### Kill-switch (LAN-08)

Arquivo: [`client/config/flags.json`](../../client/config/flags.json). Mude o valor para `false`, faça commit em `main`; o Pages publica e os clientes obedecem na próxima abertura (o arquivo não fica no cache do service worker).

| Flag | O que pausa |
|---|---|
| `arweaveUpload` | Publicar no Arweave (posts permanentes, mídia) |
| `feira` | A Feira |
| `pixZaps` | Pix Zaps |
| `communityCreate` | Criar comunidades novas |
| `electoralMode: true` (fora de `flags`) | Força o modo eleitoral (REV-24) |

Rollback do PWA e do `CACHE_NAME`: [ops-pages-rollback.md](./ops-pages-rollback.md).

## Cenários

| Cenário | Sinal | Conter (primeiros 15 min) | Depois |
|---|---|---|---|
| **Nó de sinalização caiu** | Status (LAN-07) vermelho; usuários sem pares | Conferir o 2º caminho (REV-01 / Nostr REV-09). Se só houver um nó, `notice`: "Conexão entre aparelhos instável; leitura e escrita seguem funcionando" | Reiniciar no Render; ver [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md) |
| **Banda do Render estourada** (REV-21) | Alerta de billing ou `/metrics` de bytes | Confirmar que o nó só sinaliza; subir limite de taxa; se preciso, apontar `signaling.json` para o nó reserva | Revisar o teto mensal em INFRA-CUSTOS |
| **Vazamento de chave do projeto** (secret do CI, token do Render/HF) | Aviso do GitHub secret scanning, uso estranho | **Revogar o token na origem**, trocar o secret no GitHub, reexecutar o deploy | Auditar logs do período; pós-incidente público se afetou usuários |
| **Vazamento de chave de usuário** (relato de conta tomada) | Denúncia ou post estranho assinado | Orientar a pessoa a criar identidade nova e avisar os contatos; o projeto **não** consegue revogar chave Vox | Se for bug do cliente, tratar como vulnerabilidade (SECURITY.md) |
| **Conteúdo grave** (abuso infantil, íntimo não consentido, ameaça) | Denúncia no app (LAN-12) ou externa | Seguir o **LAN-04** (≤2 h para íntimo não consentido); ocultar no PWA oficial (LAN-13); se houver upload em curso, `arweaveUpload: false` | Preservar evidência sem redistribuir; registro para autoridade conforme o parecer REV-12 |
| **Ordem judicial** | Ofício, e-mail de autoridade | **Não** responder sozinho: encaminhar ao jurídico (REV-12/LAN-01). Cumprir o que for tecnicamente possível (ocultação no PWA oficial); o projeto não tem como apagar do Arweave nem da malha | Registrar no relatório de transparência (REV-20) |
| **Ataque de spam** | Muitos posts de chaves novas, denúncias em massa | O limite por chave do gossip (LAN-14) segura a malha. Se chegar ao Arweave: `arweaveUpload: false`; se for em comunidades novas: `communityCreate: false` | Ajustar `GOSSIP_MAX_PER_WINDOW` em `client/js/rate-limit.js` |
| **Golpe com Pix Zap** | Denúncia de cobrança falsa | `pixZaps: false` + `notice` explicando | Revisar o aviso do DICT (REV-13) |
| **Gateway Arweave fora / cobrando (402)** | Leituras falhando | Nada a fazer no cliente: ele já tenta 3 gateways GraphQL e 4 para conteúdo (LAN-27, PM-50). Se todos falharem, `notice` | Avaliar trocar a ordem em `client/config/gateways.json` |

## Simulados

| Data | Cenário | Quem participou | Tempo até conter | O que mudou no runbook |
|---|---|---|---|---|
| — | — | — | — | — |
