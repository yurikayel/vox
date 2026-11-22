# Benchmark de carga da sinalização WebSocket (LAN-09)

> **Status:** canônico (medição em loopback local, 500 pares) · **Owner:** mantenedor · **Revisado:** 2026-11-21

Relatório operacional da capacidade do servidor de sinalização ([`relay/signaling.py`](../../relay/signaling.py)) sob carga concorrente em loopback local (`127.0.0.1`, porta efêmera `0`, zero tráfego externo — *Cold Readiness*), acompanhado de smoke test rápido para CI ([`relay/test_signaling_load_smoke.py`](../../relay/test_signaling_load_smoke.py)) e ferramenta reprodutível ([`tools/signaling-load-bench.py`](../../tools/signaling-load-bench.py)).

## 1. Ambiente e comandos executados

- **Sistema:** `Windows-11-10.0.26200-SP0` · 24 CPUs lógicas · 15,91 GB RAM · Python `3.12.10`
- **Alvo:** instância local isolada de `ThreadedTCPServer` + `WebSocketHandler` (`relay/signaling.py` sem alterações)
- **Comandos reais executados:**

```powershell
python tools/signaling-load-bench.py --peers 500
python tools/signaling-load-bench.py --peers 500 --concurrency 100 --json
python tools/signaling-load-bench.py --peers 500 --default-limits --timeout 5 --json
python tools/signaling-load-bench.py --peers 500 --max-connections 64 --timeout 5 --json
python -m unittest relay/test_signaling_load_smoke.py -v
```

## 2. Limites e variáveis de configuração descobertos

Antes de medir 500 pares no mesmo IP de loopback (`127.0.0.1`), a inspeção e execução contra `relay/signaling.py` e [`relay/rate_limit.py`](../../relay/rate_limit.py) confirmaram os seguintes limites de fábrica:

| Parâmetro | Valor padrão | Variável de ambiente | Efeito em 500 pares no mesmo IP |
| :--- | :--- | :--- | :--- |
| Teto global de conexões | `64` | `VOX_SIGNAL_MAX_CONNECTIONS` | Fecha conexões 65+ imediatamente (`EOF` / `ConnectionResetError`) |
| Rate limit handshake WS (`signal`) | `30 / min`, rajada `15` | `VOX_RELAY_RATE_SIGNAL_PER_MIN`, `VOX_RELAY_RATE_SIGNAL_BURST` | Rejeita com HTTP `429 Too Many Requests` após a 15ª conexão simultânea do mesmo IP |
| Rate limit mensagens (`signal_msg`) | `600 / min`, rajada `200` | `VOX_RELAY_RATE_SIGNAL_MSG_PER_MIN`, `VOX_RELAY_RATE_SIGNAL_MSG_BURST` | Descarta mensagens silenciosamente acima da rajada |
| Fila de `listen()` (`TCPServer`) | `5` (`request_queue_size`) | — (atributo da classe base stdlib) | Rajadas muito acima de 25 handshakes simultâneos podem sofrer `ConnectionResetError` no aceite |

## 3. Resultados reais medidos (500 pares)

| Cenário | Conectados | Registrados | Conexão WS (`p50` / `p95` / `p99`) | Registro (`p50` / `p95` / `p99`) | Roundtrip `offer`→`answer` (`p50` / `p95` / `p99`) | Erros | Memória servidor (RSS / peak WSet / `tracemalloc`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Padrão de fábrica** (`--default-limits`, `concurrency=100`) | 15 / 500 | 15 / 15 | 26,47 ms / 36,48 ms / 39,33 ms (9,7 peers/s) | 2,24 ms / 4,10 ms / 4,51 ms | 3,25 ms / 9,42 ms / 10,07 ms (21 trocas) | 483 `http_429`, 2 `ConnectionResetError` | 19,39 MB / 20,24 MB / 1,31 MB |
| **Cap 64 conexões** (`--max-connections 64`, rate limit liberado) | 64 / 500 | 64 / 64 | 25,93 ms / 34,56 ms / 37,53 ms (41,3 peers/s) | 11,86 ms / 26,53 ms / 32,50 ms (1534,3 peers/s) | 15,56 ms / 159,20 ms / 162,86 ms (96 trocas) | 436 `IncompleteReadError` | 20,68 MB / 20,68 MB / 1,38 MB |
| **500 pares loopback ajustado** (`--peers 500`, `concurrency=25`) | **500 / 500** | **500 / 500** | **3,06 ms / 12,14 ms / 525,62 ms** (479,9 peers/s; 1,042 s) | **51,94 ms / 140,39 ms / 174,18 ms** (375,4 peers/s; 1,332 s) | **167,63 ms / 7891,19 ms / 8060,29 ms** (750 trocas em 8,098 s) | **0** (`signal=0`, `decode=0`) | **39,21 MB / 40,99 MB / 5,34 MB** (tempo total 10,528 s) |
| **500 pares rajada alta** (`concurrency=100`) | 492 / 500 | 492 / 492 | 3,97 ms / 518,73 ms / 1029,54 ms (312,4 peers/s) | 92,72 ms / 271,86 ms / 359,04 ms | 180,80 ms / 9375,09 ms / 9474,19 ms (738 trocas) | 8 `ConnectionResetError` | 39,21 MB / 40,59 MB / 5,38 MB (tempo total 11,902 s) |

Smoke test determinístico para CI (`python -m unittest relay/test_signaling_load_smoke.py -v`): **50 pares simultâneos**, registro + troca `offer`/`answer` entre os 25 pares, **0 erros** em **1,274 s** (limite alvo `< 5s`).

## 4. Análise de gargalos observados

1. **Fan-out $O(N^2)$ de `peer-joined` no registro em massa:** em `WebSocketHandler.on_register`, cada par recém-registrado responde `registered` e, na mesma thread antes de retornar ao `receive_loop()`, executa `registry.broadcast_others(...)` para todos os pares já conectados. Para 500 pares simultâneos, isso gera ~125 mil quadros `peer-joined` (`130.148` quadros recebidos pelos clientes no run de 500 pares, incluindo `peer-joined` extras quando dois registros concorrem entre `registry.register` e `broadcast_others`). Enquanto as threads drenam esse broadcast, as primeiras trocas `offer`/`answer` enfileiram atrás dele, explicando a diferença entre a mediana (`p50 = 167,63 ms`) e a cauda (`p95 = 7,89 s`, `p99 = 8,06 s`).
2. **Backlog TCP padrão (`request_queue_size = 5`):** `ThreadedTCPServer` herda `request_queue_size = 5` de `socketserver.TCPServer`. Com `concurrency=100` (rajada de 100 handshakes simultâneos), 8 conexões receberam `ConnectionResetError`; com `concurrency=25`, duas execuções atingiram `500/500` sem falhas e uma atingiu `496/500` (`4 ConnectionRefusedError`), confirmando sensibilidade do `listen(5)` a rajadas de abertura.
3. **Modelo 1-thread-por-conexão:** 500 threads simultâneas consumiram ~39,21 MB de RSS (~40 KB de working set adicional por conexão acima do baseline de ~19,4 MB), com heap Python de pico em 5,34 MB via `tracemalloc`.
4. **Rate limit padrão por IP (`15` de rajada):** protege contra abuso de um único IP, mas impede testes ou cenários atrás de NAT/CGNAT compartilhado com >15 clientes abrindo WebSocket ao mesmo tempo sem `VOX_RELAY_TRUST_PROXY_HOPS` e ajuste das variáveis `VOX_RELAY_RATE_SIGNAL_*`.

## 5. Interpretação operacional frente ao gatilho de 50 ativos

Conforme [gatilho-infra-50-ativos.md](./gatilho-infra-50-ativos.md):

- **Abaixo de 50 usuários ativos (estado atual):** os padrões de fábrica (`VOX_SIGNAL_MAX_CONNECTIONS=64`, ~20,7 MB RSS) comportam até 64 conexões simultâneas com latência baixa (`p50 = 15,56 ms`, `p95 = 159,20 ms` para `offer`→`answer` em 64 pares) e zero custo extra de infraestrutura.
- **Ao cruzar o gatilho (>50 ativos / crescimento para centenas de pares simultâneos):** antes ou junto de **INF-02** / **INF-03**, será preciso elevar `VOX_SIGNAL_MAX_CONNECTIONS`, configurar `VOX_RELAY_TRUST_PROXY_HOPS` atrás de proxy reverso e calibrar `VOX_RELAY_RATE_SIGNAL_*` / `VOX_RELAY_RATE_SIGNAL_MSG_*`. Para picos de centenas de pares entrando juntos na mesma sala global, recomenda-se também tratar o broadcast $O(N^2)$ de `peer-joined` e o backlog `request_queue_size` de `ThreadedTCPServer`.
