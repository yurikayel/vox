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

## Nós Participativos, Relays e Responsabilidade sobre Cache (Fases 3 e 3.1)

- Na **Fase 3.1 (Pacto Vox)**, a participação distribuída do nó leve é **ativa por padrão (default-on)** mediante contrato transparente apresentado na primeira abertura do app.
- O app armazena cópias de cache local no IndexedDB exclusivamente para aceleração de navegação e compartilhamento peer-to-peer de dados que já são 100% públicos e imutáveis no permaweb Arweave.
- O modelo garante reciprocidade: soberania dos dados do usuário (chaves locais) em troca de infraestrutura compartilhada sem servidores corporativos centrais.
- Usuários mantêm autonomia absoluta para pausar ou desligar a contribuição a qualquer momento através de `#/settings/network` ("Pausar contribuição").
- Limites de proteção diários (teto de banda de 50 MB/dia, cache de 25 MB e salvaguardas de Wi-Fi) asseguram que a rede não gere ônus imprevisto de dados ou bateria.
- Operadores de relay desktop (`vox/relay/`) e nós leves mantêm total prerrogativa para limpar o cache a qualquer momento.
- Espelhos públicos que recebam notificações judiciais devem suprimir a renderização dos conteúdos ilícitos em seus índices locais, em estrita observância ao Marco Civil da Internet (Art. 19).

## Escalonamento comunitário

1. Criador define moderadores (transação de configuração).
2. Moderadores emitem `mod-action`.
3. Membros reportam via link externo ou futuro fluxo off-chain (Fase 2+).
4. Fork de cliente ou espelho se a comunidade discordar da política global de um espelho.
