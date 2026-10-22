# 🖥️ Vox Relay Desktop — Nó Local de Espelho & Cache

O **Vox Relay Desktop** é um serviço leve e opcional para computadores pessoais. Ele atua como um nó local de cache acelerador e espelho parcial para o cliente web (PWA) do Vox, reduzindo requisições a gateways públicos e garantindo navegação rápida mesmo com conexão instável.

---

## 🚀 Como Iniciar

O servidor utiliza apenas a biblioteca padrão do Python 3 (nenhuma instalação via `pip` é necessária):

```bash
cd vox/relay
python server.py
```

O serviço iniciará na porta padrão `3920`:
```text
======================================================
  Vox Relay Desktop — Nó Local de Espelho & Cache
  Escutando em: http://127.0.0.1:3920
  Verificação de status: http://127.0.0.1:3920/health
  Diretório de cache: .../relay/.cache
======================================================
```

---

## 🛠️ Como o PWA se conecta ao Relay

Ao abrir o Vox no navegador (`http://127.0.0.1:8080`), o cliente consulta automaticamente `http://127.0.0.1:3920/health`.
* Se o relay estiver ligado, o Vox prioriza buscar os corpos de transações via `http://127.0.0.1:3920/tx/<txId>`, que armazena os dados no disco local (`.cache/`).
* Na tela **"Nó"** (`#/settings/network`), o badge exibirá:  
  `🟢 Relay Online (127.0.0.1:3920) — X itens em disco`.

---

## 🌐 Endpoints Disponíveis

| Rota | Método | Descrição |
|---|---|---|
| `/health` | `GET` | Retorna status do serviço, versão e contagem de itens em cache. |
| `/tx/<txId>` | `GET` | Retorna o payload da transação (Cache HIT se local; busca em `arweave.net` se MISS). |
| `/vox/index/<commId>.json` | `GET` | Retorna índice consolidado da comunidade armazenado localmente. |
| `/vox/mirror` | `POST` | Salva espelho local de comunidade recebido pelo cliente. |

---

## 📡 Servidor de Sinalização WebRTC (`signaling.py` — Fase 3.2)

Para conectar instâncias do Vox em **dispositivos diferentes** (mesma rede local Wi-Fi ou pela internet) via WebRTC DataChannel, o relay inclui um servidor WebSocket leve baseado na biblioteca padrão:

```bash
cd vox/relay
python signaling.py --port 3921
```

* **Porta padrão:** `3921` (`ws://127.0.0.1:3921`).
* **Função estrita:** Apenas troca de ofertas/respostas SDP e candidatos ICE entre pares. O servidor **não armazena conteúdo**, não analisa mensagens e não faz persistência.
* **Rede descentralizada:** Comunidades, coletivos ou usuários avançados podem rodar seu próprio servidor de sinalização em LAN ou VPS (`wss://seu-dominio/`), configurando a URL customizada diretamente no PWA em `#/settings/network`.

---

## 🔒 Segurança e Privacidade

* **Escuta apenas em `127.0.0.1`:** Por padrão, o relay não expõe portas para a internet externa.
* **Dados públicos:** O relay armazena em cache apenas transações públicas que já estão gravadas na rede Arweave.
* **Pasta `.cache/` no `.gitignore`:** Nenhum dado baixado é versionado no repositório Git.
