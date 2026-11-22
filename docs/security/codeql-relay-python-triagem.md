# Triagem CodeQL Python — relay (alertas 10–14 e 287)

Triagem curta; sem detalhes de exploração (ADR-024). Nenhum alerta foi dispensado: a
dispensa depende do OK do mantenedor.

| Alerta | Regra | Local | Veredito |
| :-- | :-- | :-- | :-- |
| 287 | `py/partial-ssrf` | `relay/server.py` `_fetch_transaction` | Falso positivo (aguarda dispensa pelo mantenedor) |
| 10–14 | `py/path-injection` | `relay/central_memory.py` (blobs) | Sem exploração real; endurecido |

## 287 — partial-ssrf
O host e o esquema vêm de `UPSTREAM_GATEWAYS` (constantes `https://`). Só o sufixo `tx_id`
é externo e é validado antes por `is_tx_id` (43 caracteres de `A-Za-z0-9_-`: sem `/`, `?`, `#`
ou `@`), então não muda host, esquema nem caminho. O CodeQL não reconhece o validador por
conjunto de caracteres como barreira. Nenhuma alteração de código.

## 10–14 — path-injection
O nome do arquivo do blob já era um sha256 hex conferido contra o conteúdo, então não havia
caminho controlável. O caminho agora passa por `safe_path.child_of` (`_blob_path`), a barreira
que o CodeQL reconhece, que também recusa um symlink em `blobs/` apontando para fora.
Teste: `relay/test_central_memory_blob_path.py`.
