# Roteiro de teste no celular em 5 minutos (PM-73)

> **Status:** rascunho · **Owner:** produto / QA piloto · **Revisado:** 2026-11-22
> **Relacionados:** [voluntariado-tres-trabalhos.md](./voluntariado-tres-trabalhos.md) · [template de retrospectiva](../pilot/piloto-comunidade-retrospectiva-template.md) · [critérios Go/No-Go beta](../strategy/criterios-go-beta-lan28.md)

## 1. Para quem é este roteiro

Qualquer voluntário do piloto com um celular comum (especialmente Android de entrada com 2–4 GB de RAM ou iPhone com Safari), sem precisar de treino técnico. Leva **5 minutos**, não coleta dados pessoais e gera matéria-prima direta para a retrospectiva (`PIL-03`) e para `REV-14`.

> **Privacidade:** não inclua nome civil, e-mail, telefone, endereço IP nem capturas com conversas privadas no relato.

## 2. Os 8 passos (marcar "Funcionou" ou "Não funcionou")

| Passo | ID | Ação no celular | O que observar |
| :---: | :--- | :--- | :--- |
| 1 | `open_pwa` | Abrir o link da Vox no navegador principal (Chrome / Safari / Firefox) | Primeira tela carrega em tempo razoável (anotar sensação em 3G/4G/Wi-Fi). |
| 2 | `install_a2hs` | Tocar em **Adicionar à Tela de Início** (A2HS) e abrir pelo ícone | App abre em tela limpa sem barra confusa. |
| 3 | `create_identity` | Aceitar o pacto, criar conta de teste e conferir aviso de persistência (`REV-14`) | Conta criada sem pedir e-mail, Google ou telefone. |
| 4 | `backup_check` | Abrir a tela de saída/frase (`#/frase`) e conferir se o texto está legível | Botões cabem na tela sem corte horizontal e têm leitura confortável. |
| 5 | `publish_post` | Publicar um post curto de teste no feed local | Post aparece imediatamente sem erro no topo. |
| 6 | `offline_reload` | Ativar o **modo avião**, fechar e reabrir o app | App abre offline (Service Worker) e o post publicado continua lá. |
| 7 | `reconnect_status` | Desligar o modo avião, abrir `#/status` e aguardar até 30 s | Ver se conectou por WebSocket ou Nostr (`PM-18`) e qual origem de leitura aparece. |
| 8 | `export_diag` | Exportar o resumo local sem PII (ou anotar nos campos abaixo) | Nenhum dado pessoal no JSON exportado. |

## 3. Formato JSON padronizado (zero PII, agregável via CLI)

Os relatos coletados no grupo do piloto podem ser reunidos num arquivo JSON e consolidados offline por `scripts/mobile-field-report.mjs` (sem telemetria central):

> **O que sai da CLI:** só valores de lista fechada. `os` e `browser` viram "Família + versão principal" (ex.: `Android 12`, `Chrome 130`; família fora da lista vira `desconhecido`); `deviceModel` vira apenas a classe (`celular`, `tablet`, `desktop` ou `desconhecido`) e o modelo digitado é descartado; `id` de passo precisa ser um dos oito do roteiro (outros são ignorados); `networkType` fora da lista vira `unknown`. Texto livre digitado nunca chega ao JSON nem ao Markdown.

```json
[
  {
    "deviceModel": "Moto G22",
    "os": "Android 12",
    "browser": "Chrome 130",
    "ramGb": 4,
    "networkType": "4g",
    "steps": [
      { "id": "open_pwa", "ok": true, "durationMs": 1800 },
      { "id": "install_a2hs", "ok": true },
      { "id": "create_identity", "ok": true },
      { "id": "backup_check", "ok": true },
      { "id": "publish_post", "ok": true },
      { "id": "offline_reload", "ok": true },
      { "id": "reconnect_status", "ok": true, "durationMs": 2400 },
      { "id": "export_diag", "ok": true }
    ],
    "signaling": {
      "wsAttempts": 2,
      "wsSuccess": 2,
      "nostrAttempts": 2,
      "nostrSuccess": 1,
      "connectMs": 2400
    },
    "readOrigins": {
      "cache": 12,
      "p2p": 5,
      "relay": 3,
      "gateway": 0,
      "unknown": 0
    }
  }
]
```
