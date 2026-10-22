# Governança e moderação

O Vox não possui um “time de trust & safety” central. Comunidades são espaços com regras locais; a permaweb guarda o registro; **clientes decidem o que mostrar**.

## Princípios

1. **Transparência:** Ações de moderação são transações públicas (`Type: mod-action`), assinadas por chaves reconhecidas como moderadoras daquela comunidade.
2. **Não-deleção:** Esconder ≠ apagar. Usuários avançados ou outros clientes podem ignorar filtros.
3. **Autonomia pessoal:** Todo usuário pode bloquear autores ou ocultar conteúdo só para si (preferências locais, Fase 2+).

## Tag `mod-action`

| Tag | Valor |
|-----|--------|
| `App-Name` | `vox-brasil` |
| `Type` | `mod-action` |
| `Community-Id` | ID da comunidade (geralmente TX ID da transação `community`) |
| `Action` | `hide` \| `ban` \| `unhide` \| `unban` (extensível) |
| `Target` | TX ID do tópico/resposta, ou endereço Arweave do autor (para `ban`) |

### Validação no cliente (Fase 1: leitura preparada)

1. Carregar lista de moderadores autorizados (publicada pela comunidade — tag ou documento referenciado; convenção a detalhar na Fase 2).
2. Para cada `mod-action`, verificar assinatura do `owner` contra essa lista.
3. Aplicar regras:
   - **hide:** não renderizar `Target` na listagem da comunidade/tópico.
   - **ban:** ocultar todo conteúdo cujo `owner.address` coincida com `Target`.

Ordem: ações mais recentes prevalecem (`HEIGHT_DESC` por moderador ou merge por timestamp de bloco).

## Índice espelho opcional

Gateways GraphQL indexam tudo; um **espelho Vox** (JSON estático ou query curada) pode:

- Pré-aplicar `mod-action` conhecidos para listagens “family-friendly”.
- Destacar comunidades verificadas manualmente.

Espelhos são **opcionais** e **substituíveis**; o client Fase 1 fala direto com gateways públicos em [client/config/gateways.json](./client/config/gateways.json).

## Abuso e conteúdo ilegal

- Clientes podem integrar listas de hash/TX reportadas (espelho).
- Obrigações legais brasileiras (LGPD, conteúdo eleitoral) estão resumidas em [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) — **não substituem assessoria jurídica**.

## Nós Participativos, Relays e Responsabilidade sobre Cache (Fase 3)

- Usuários que ativam o nó participativo de leitura (`peers.js`) ou executam o Vox Relay Desktop (`vox/relay/`) armazenam cópias de cache local exclusivamente para aceleração de navegação em suas próprias máquinas.
- O cache replica apenas transações que já são públicas e perenes na rede Arweave.
- Operadores de relay e nós locais mantêm autonomia total para esvaziar seu cache a qualquer momento (pela interface `#/settings/network` ou excluindo o diretório `.cache/`).
- Operadores de espelhos públicos que recebam notificações judiciais devem suprimir a renderização dos conteúdos ilícitos em seus índices locais, em observância ao Marco Civil da Internet (Art. 19).

## Escalonamento comunitário

1. Criador define moderadores (transação de configuração).
2. Moderadores emitem `mod-action`.
3. Membros reportam via link externo ou futuro fluxo off-chain (Fase 2+).
4. Fork de cliente ou espelho se a comunidade discordar da política global de um espelho.
