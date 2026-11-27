# Mesa entre aparelhos pela rede (v0)

> **Status:** aceita (v0; decisões da §8 registradas em 2026-11-25; código liberado) · **Owner:** mantenedor · **Revisado:** 2026-11-25
> **Relacionados:** [subversus-vtt-v0.md](./subversus-vtt-v0.md) · [relay-api.md](./relay-api.md) · [ADR-040](../adr/040-fairplay-rolagem-verificavel-na-mesa.md) · [ADR-024](../adr/024-divulgacao-responsavel-e-honestidade-de-seguranca.md) · ROADMAP `SUB-08`

Item `SUB-08` do [ROADMAP](../ROADMAP.md): hoje a entrada na mesa só funciona entre abas da mesma origem; falta ligar a mesa a um canal que cruze aparelhos. Esta spec descreve o que existe (com arquivo e linha), o que falta, as opções e o que depende do mantenedor. **Convenção:** o que está no código ou nos docs vai como fato, com a fonte; o que não está vai marcado **(proposta)**. O teste com pessoas é o `SUB-14` e fica fora.

## 1. O que existe hoje

### 1.1 Protocolo e transporte da mesa

- **Contrato do transporte:** `createVttSyncPeer` (`client/js/dungeon/vtt-sync.js:445`) recebe um `transport` com `peerId`, `send(toPeerId, msg)`, `onMessage(fn)` e `close()`. Nada no protocolo depende de como a mensagem viaja.
- **Hub em memória:** `createInMemorySyncHub` (`vtt-sync.js:24`), só para testes sem rede.
- **BroadcastChannel:** `createBroadcastChannelTransport(roomId, peerId)` (`vtt-sync.js:61`), canal `vox-vtt-room-<tableId>`; só alcança abas do mesmo navegador e da mesma origem. É o único transporte ligado à tela: o jogador entra por `wirePlayerSyncPeer` (`client/js/dungeon/dungeon-vtt-join.js:29`), que recusa sem `BroadcastChannel` (`dungeon-vtt-join.js:66`).
- **Estrela com o Mestre como hub:** o jogador manda `ACTION_OP`, o Mestre aplica, filtra por jogador (`filterOpForPlayer`, `vtt-sync.js:158`) e reenvia `COMMIT_OP` (ADR-040 §1.1). Mensagens: `HELLO_SYNC` (`vtt-sync.js:273`), `SNAPSHOT_FILTERED` (`:172`), `COMMIT_OP` (`:182`), `WANT_BLOB` e pedaços de blob (`BLOB_CHUNK_BYTES` 16 KiB, `vtt-sync-codec.js:10`), `OP_REJECTED` (`:251`).
- **Convite:** `buildRoomInviteHref` (`vtt-sync-codec.js:48`) monta `#/dungeon/entrar/<tableId>?gm=<routeId>#k=<roomKey>`; a `roomKey` fica no fragmento, fora da query (`vtt-sync-codec.js:39,57`).
- **Reenvio do `HELLO_SYNC` (#575):** o jogador envia e repete até 4 vezes com espera dobrando (400, 800, 1600, 3200 ms, mais 6400 ms de espera final; ~12,4 s no total), depois chama `onHelloGaveUp` (`vtt-sync.js:369-373`). O aviso ao jogador na interface é do `SUB-03`. Isso já serve de base para canal com perda e atraso.

### 1.2 Peças de rede que o app já tem (fora da mesa)

- **Sinalização WebSocket** (`relay/signaling.py`, [relay-api.md §1](./relay-api.md), L22): `register`, `offer`, `answer`, `ice`, `ping`; responde `registered`, `peer-joined`, `peer-left` (`signaling.py:507-545`). Só troca SDP e ICE, não guarda conteúdo; quadro máximo de 1 MB; limite de conexões e de mensagens por IP (`signal`: 30/min; `signal_msg`: 600/min; [relay-api.md §6](./relay-api.md)).
- **WebRTC:** `client/js/webrtc-connection.js` (`createPeerConnection` L224, oferta/resposta/ICE L317-L352, `closePeerConnection` L393), com sinalização em `webrtc-signaling-ws.js` e `webrtc-signaling-send.js`, e canais de dados usados pela malha de fofoca (`client/js/webrtc-messaging.js`, `peers-channel.js`). A malha só entrega tipos conhecidos (`VOX_MESSAGE_HANDLERS`, `peers-channel.js:60-70`); mensagens da mesa não têm tipo ali.
- **STUN/TURN:** `client/js/turn-credentials.js` busca credenciais e descarta qualquer entrada que não seja `turn:`, `turns:` ou `stun:` (L22, L62). **Hoje não há TURN em operação:** a operação de TURN e o 2º nó (`INF-01…04`) estão adiados até passar de 50 usuários ativos (decisão de 19/11/2026, [ROADMAP](../ROADMAP.md) L16 e L57).
- **Relay cego:** `relay/blind_relay.py` ([relay-api.md](./relay-api.md), L57): `POST /relay/envelope/<canal>` com envelope opaco de até 64 KB e retenção de 7 dias, `GET` por `serial`, e snapshot de até 512 KB por canal. Limite `mailbox`: 120 por minuto, rajada 60 ([relay-api.md §6](./relay-api.md)).
- **Nostr:** `client/js/nostr-signaling.js` lista relays candidatos, mas o transporte de sinalização **não está integrado** ([ROADMAP](../ROADMAP.md), `REV-09`, L71); a integração à mesa não existe.

## 2. O que falta para ligar a mesa a esses canais

1. **Um transporte de rede** que cumpra o contrato do §1.1 (`peerId`, `send`, `onMessage`, `close`) sobre WebRTC e/ou relay. Não existe hoje.
2. **Descoberta e convite entre aparelhos:** o convite hoje carrega só `tableId`, `gm` (routeId) e `roomKey`; nada diz onde o Mestre está na rede. **(proposta)** o `routeId` do Mestre serve de endereço na sinalização, a confirmar na D2.
3. **Entrada do jogador sem `BroadcastChannel`:** `attachVttPlayerJoin` hoje devolve `broadcast_channel_unavailable` (`dungeon-vtt-join.js:66`); precisa escolher o transporte.
4. **Estado de conexão honesto na tela** (conectando, perdeu o Mestre, reconectando), que depende do `SUB-03`.
5. **Tamanho de mensagem:** `SNAPSHOT_FILTERED` e os pedaços de blob precisam caber no limite do canal (quadro de 1 MB na sinalização; 64 KB por envelope e 512 KB por snapshot no relay cego). Hoje nenhum limite de tamanho é aplicado pelo transporte da mesa.
6. **Reconexão:** o protocolo não tem retomada de sessão; depois da queda o jogador volta pelo `HELLO_SYNC`.

## 3. Segurança: o que existe

- **Assinatura:** toda operação é assinada com ECDSA P-256 pela chave de quem a criou (`signVttOp`), e o Mestre confere assinatura e autorização antes de aplicar (`vtt-sync.js`, ADR-040 §1.1). O Fairplay verifica a assinatura de novo no jogador (`verifiedFairplayOps`).
- **A `roomKey` não cifra mensagens.** Ela viaja em cada mensagem como identificador de sala e é conferida na chegada (`vtt-sync.js:449`); o app usa o fragmento `#k=` só para não mandá-la ao servidor. Não existe hoje cifra de mensagem da mesa; no `BroadcastChannel` isso não importa, porque tudo fica no navegador.
- **Cifra existente:** só as partes de backup do Fairplay (ECDH P-256 + HKDF-SHA-256 + AES-256-GCM, `client/js/dungeon/vtt-fairplay-cipher.js`).
- **Canais:** o relay cego guarda envelope opaco e não o inspeciona ([relay-api.md](./relay-api.md), L57). **(proposta, ainda não verificada para a mesa)** o canal de dados WebRTC é cifrado pelo protocolo WebRTC (DTLS) entre as duas pontas; o código abre canais de dados em `webrtc-connection.js:142` (`vox-peer-v0`) e `:144` (`vox-dm-v0`), mas a mesa não usa nenhum deles hoje e nenhum teste do repositório prova a cifra de transporte. Um relay que repassa a mensagem da mesa em claro veria o conteúdo e os metadados (quem fala com quem, quando, tamanho); isso é consequência de a mensagem não ser cifrada, não de falha do relay.
- **Fairplay (ADR-040):** o desenho não depende de o canal ser confiável: cada fase é uma operação assinada no log da campanha, o Mestre é hub mas não pode forjar rolagem, e o estado do Fairplay do snapshot é refeito das operações reverificadas (`applySnapshot`, `vtt-sync.js`). Trocar o transporte não muda isso; muda o que um observador da rede enxerga e o que se perde com atraso (prazos das fases do Fairplay são em tempo).

## 4. Opções

| Opção | O que é | Custo | Risco |
| :--- | :--- | :--- | :--- |
| **A. WebRTC direto** (via `signaling.py`) | Cada jogador abre um canal de dados com o Mestre; `send` e `onMessage` sobre esse canal. **(proposta)** | Adaptador de transporte novo sobre `webrtc-connection.js`; reconexão e estado de conexão; testes com RTC falso. Sem servidor novo. | NAT: sem TURN, não conecta em NAT simétrico e em parte das redes móveis com CGNAT; com TURN há custo de servidor de terceiros. A sinalização é um nó público único hoje ([ROADMAP](../ROADMAP.md) cita o risco de depender de 1 nó). |
| **B. Relay cego** (store-and-forward) | Mensagens da mesa como envelopes no relay, com o canal derivado da sala. **(proposta)** | Adaptador novo com consulta periódica ou espera longa; paginação por `serial`; limites de tamanho (64 KB). | Latência pior (rolagens com prazo); limite `mailbox` de 120/min pode estrangular uma mesa ativa; mensagem não cifrada hoje, então exigiria cifra de mensagem (D3); o relay vê metadados. |
| **C. Os dois, com queda de A para B** | Tenta WebRTC; se não conectar em N segundos, usa o relay. **(proposta)** | A + B + política de queda e de volta. | Maior superfície e mais casos de teste; o jogador pode ver comportamentos diferentes conforme a rede. |

**Limitações de rede (A):** conexão direta depende de NAT permitir; NAT simétrico e CGNAT costumam exigir TURN. O app já sabe buscar credenciais TURN (`turn-credentials.js`), mas **hoje não há TURN em operação**: a operação de TURN está adiada até passar de 50 usuários ativos (decisão de 19/11/2026, [ROADMAP](../ROADMAP.md) L16 e L57). Até lá, a opção A só conecta onde STUN basta.

## 5. Recomendação

**(proposta)** Começar pela **opção A** como v1 (estrela com o Mestre, sem servidor novo, usando a sinalização e o STUN que já existem), com o transporte atrás do contrato do §1.1, e deixar a **B** para uma segunda etapa só se a medição de campo (`SUB-14`) mostrar que a parcela de jogadores sem conexão direta é grande. Motivo: reaproveita o que existe e não exige servidor novo. **Ressalva:** a cifra do canal de dados WebRTC é propriedade do protocolo, ainda não verificada para a mesa; se a D3 exigir cifra de mensagem própria, ela vale para as duas opções.

## 6. Mudanças previstas por arquivo **(proposta)**

- `client/js/dungeon/vtt-rtc-transport.js` (novo, sob demanda): transporte WebRTC que cumpre o contrato do §1.1, com `HELLO_SYNC` reenviado pelo próprio protocolo.
- `dungeon-vtt-join.js`: escolher o transporte (BroadcastChannel quando a origem é a mesma; rede quando não).
- `dungeon-scene-actions.js` (convite): incluir o que falta para achar o Mestre (D2).
- Não mexe no protocolo nem nos arquivos do Fairplay.
- Módulo carregado por `import()` dinâmico; nenhum byte em `SHELL_ASSETS`.

## 7. Testes previstos e o que falharia na base

| # | Teste | Falha na base? |
| :-- | :--- | :--- |
| 1 | O transporte de rede cumpre o contrato (`send`, `onMessage`, `close`, `peerId`) com dois pares sobre RTC falso | Sim: o módulo não existe |
| 2 | Jogador e Mestre em origens diferentes completam `HELLO_SYNC` → `SNAPSHOT_FILTERED` pelo transporte de rede | Sim: hoje só `BroadcastChannel` |
| 3 | `HELLO_SYNC` perdido é reenviado e a entrada conclui com o canal descartando as primeiras mensagens | Parcial: o reenvio existe (#575), o transporte não |
| 4 | Mensagem com `roomKey` diferente é descartada | Não: já existe (`vtt-sync.js:449`); entra como regressão |
| 5 | Mensagem acima do limite do canal é recusada ou fragmentada sem travar a mesa | Sim: nenhum limite no transporte hoje |
| 6 | Queda do canal mostra o estado "perdeu o Mestre" e reconecta pelo `HELLO_SYNC` | Sim |
| 7 | Rolagem Fairplay completa entre dois transportes de rede (fases assinadas, estado refeito) | Sim: depende do transporte; protocolo sem alteração |
| 8a | Depois de criar o módulo de rede, ele não está em `SHELL_ASSETS` | Não: passa trivialmente sem o módulo; entra como regressão |
| 8b | O módulo de rede só carrega ao entrar por rede (`import()` dinâmico) | Sim |
| 9 | Sem WebRTC no navegador, a entrada mostra o motivo em português e não quebra | Parcial: hoje devolve `broadcast_channel_unavailable` |

O teste com pessoas e redes reais é o `SUB-14` e fica fora.

## 8. Decisões abertas para o mantenedor

- **D1. Opção:** A (recomendada), B ou C?
  - Decidido em 25/11/2026: opção A (WebRTC) (opção recomendada; autorização geral do mantenedor).
- **D2. Endereço do Mestre:** o `routeId` do Mestre como identidade na sinalização, ou o convite passa a levar outro dado?
  - Decidido em 25/11/2026: o `routeId` do Mestre é a identidade na sinalização e o convite não muda (opção recomendada; autorização geral do mantenedor).
  - **Emenda (26/11/2026):** a identidade vale com prova de posse no canal, não no nó: ao abrir o canal, Mestre e jogador assinam com a chave da mesa quem são, com quem falam e as impressões DTLS das duas pontas, e cada lado confere que a chave deriva o `routeId` do elo. Sem a prova, nada da mesa passa e o elo cai (`auth_failed`).
- **D3. Cifra de mensagem da mesa:** exigir cifra de mensagem da mesa (derivada da `roomKey` ou outra) já no v1, ou só se a opção B entrar?
  - Decidido em 25/11/2026: sem cifra própria de mensagem no v1; as ops seguem assinadas. **Condição:** o código prova, por teste, que a mesa usa só `RTCDataChannel`; se a opção B entrar, a cifra volta a ser exigida (opção recomendada; autorização geral do mantenedor).
  - **Emenda (26/11/2026):** a D3 deixa de se apoiar em "o DTLS autentica o par": a autenticação é a prova de posse no canal descrita na D2.
- **D4. TURN:** não há TURN hoje; a operação de TURN e o 2º nó (`INF-01…04`) ficam adiados até passar de 50 usuários ativos (decisão de 19/11/2026). Confirmar que a mesa em rede aceita, no v1, só conectar onde STUN basta, e que o TURN entra depois do gatilho.
  - Decidido em 25/11/2026: confirmado: só STUN no v1 e TURN depois do gatilho (opção recomendada; autorização geral do mantenedor).
- **D5. Sinalização:** a mesa usa o nó de sinalização público atual ou espera o caminho Nostr (REV-09)?
  - Decidido em 25/11/2026: o nó de sinalização público atual; o caminho Nostr fica para depois do REV-09 (opção recomendada; autorização geral do mantenedor).
- **D6. Metadados:** a sinalização e o relay veem quem fala com quem, quando e o tamanho; aceitável no v1?
  - Decidido em 25/11/2026: aceitável no v1, com o aviso documentado nesta spec (opção recomendada; autorização geral do mantenedor).
- **D7. Fora do v1:** mais de um Mestre, e jogador que reentra depois de dias.
  - Decidido em 25/11/2026: confirmado fora do v1 (opção recomendada; autorização geral do mantenedor).

## Estado da implementação (SUB-08, fatia 2c)

- **Flag de laboratório:** `vox.lab.mesa-rede` = `"1"` no `localStorage` liga a Mesa pela rede neste aparelho; o endereço do nó fica em `vox.lab.mesa-rede.url` (o convite não muda, D2). O endereço é validado e normalizado: `wss:` sempre; `ws:` só para localhost, 127.0.0.1 e [::1]; recusa usuário, senha, consulta (`?`) e fragmento (`#`), host vazio, barra invertida e caracteres de controle. Sem a flag, ou sem endereço válido, a Mesa usa `BroadcastChannel` (mesma origem).
- **Queda:** se a rede não montar (módulo, WebSocket ou endereço), usa `BroadcastChannel` e a tela diz que a rede ficou indisponível. Depois de montada, um nó que não responde mostra o estado de erro ("Sem conexão com o nó de sinalização"); a troca de transporte ao vivo não existe.
- **Estado na tela:** `connecting`, `waiting_peer`, `open` e `error`, em região `aria-live="polite"` (`renderVttConnection`).
- **Liveness:** esgotadas as 4 ofertas por elo, um Mestre que reinicia só é reofertado quando o app cria um elo novo para ele.
- **STUN:** sem configuração o padrão do produto segue o decidido (STUN público). `vox.lab.mesa-rede.ice` aceita até 4 entradas `stun:host[:porta]`; texto vazio = só candidatos locais (nenhum tráfego externo, o que os testes usam); entrada inválida também vira lista vazia.
- **Prova de posse no canal:** com `auth` (par de chaves da mesa), o transporte manda um `VTT_AUTH` ao abrir o canal e só libera a mesa depois de conferir o do outro lado; prazo de 10 s. O `chooseVttTransport` sempre passa o par de chaves; sem ele a rede não abre e a Mesa usa `BroadcastChannel`. Estado novo na tela do jogador: `auth_failed` ("Não foi possível confirmar que este é o Mestre da Mesa.").
