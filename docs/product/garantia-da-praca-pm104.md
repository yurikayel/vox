# Garantia da Praça — Vox (PM-104)

> **Status:** rascunho (PM-104 — texto público base para repositório e Voxpedia; revisão jurídica final pós-REV-12) · **Owner:** mantenedor / comunicação · **Revisado:** 2026-11-22  
> **Referências canônicas:** [POSITIONING.md](./POSITIONING.md) · [GOVERNANCE.md](../../GOVERNANCE.md) · [FEATURES.md](../FEATURES.md) · [IDENTITY.md](../IDENTITY.md)

Esta página resume, em linguagem direta para qualquer cidadã ou cidadão, quais garantias técnicas o protocolo Vox oferece hoje sobre a sua conta, o que cada nível de governança pode ou não fazer, e quais são os limites reais do sistema — sem promessas mágicas.

---

## 1. O que NINGUÉM pode fazer com sua conta (nem o projeto Vox)

1. **Apagar seus dados de aparelhos alheios sem sua chave:** sua conta, chaves e histórico nascem no seu aparelho. Publicações que já circularam para aparelhos de seguidores ou espelhos comunitários não podem ser destruídas remotamente por um único servidor.
2. **Falsificar posts, votos ou ações em seu nome:** todo conteúdo publicado e toda ação comunitária levam assinatura criptográfica local **ECDSA P-256** (envelope `sigv: 2`, padrão a partir de `SIGV2_FROM` em 24/11/2026, com compatibilidade de leitura `v1`). Sem a sua chave privada, ninguém fabrica uma assinatura válida da sua conta.
3. **Ler suas mensagens diretas (DMs) cifradas ponta a ponta:** DMs usam criptografia ponta a ponta (**ECDH P-256 + AES-GCM-256**) entre remetente e destinatário. Quando um relay comunitário guarda mensagens temporariamente para entrega offline, ele atua apenas como caixa postal cega e transitória (TTL máximo de 72 h), sem acesso ao texto claro.
4. **Trancar você fora do protocolo aberto:** o código do cliente e do relay é livre sob licença **GNU AGPLv3** ([LICENSE](../../LICENSE)). Qualquer comunidade ou pessoa pode publicar seu próprio espelho do PWA, operar seu próprio relay ou nó (`Vox Populi` ou `Vox Memoria`) e ler ou publicar fora da instância oficial.

---

## 2. O que CADA NÍVEL PODE fazer (transparência radical)

| Nível | O que pode fazer | Onde atua e com que limites |
|---|---|---|
| **Você (dona ou dono da conta no aparelho)** | Ocultar posts e silenciar/bloquear perfis localmente; pausar ou retomar sua contribuição de cache P2P em `#/settings/network`; exportar backup assinado dos próprios posts e mídias (`own-posts` em `#/settings/network`); converter a exportação em arquivo **HTML standalone offline** (`EXP-04`, [`scripts/export-html-backup.mjs`](../../scripts/export-html-backup.mjs)); configurar frase de recuperação (12/24 palavras), cofre com senha e cofre na malha (`ADR-037`); e, quando o **PM-101** for implementado, encerrar a conta com **lápide assinada** enquanto tiver a chave ou o cartão de recuperação (**PM-13**). | A ocultação local vale só no seu aparelho. A lápide de conta (`PM-101`, planejada para T2/2027) depende de assinatura válida; sem chave e sem cartão (`PM-13`), não há como provar encerramento pela rede. |
| **Moderadores da comunidade** | Emitir ações públicas e assinadas (`mod-action`) para fixar, trancar ou ocultar tópicos e banir contas **dentro da comunidade**; ativar o **modo Canal** (`PM-81`, onde só a moderação publica tópicos principais e todos comentam); receber denúncias assinadas por DM cifrada com arquivamento temporário até revisão em 48 h (`PM-69`, em produção). | A moderação atua apenas na camada de exibição daquela comunidade. Moderadores não conseguem apagar sua chave, ler suas DMs com terceiros nem impedir você de participar de outras comunidades. |
| **Instância PWA oficial (`vox-app`)** | Publicar e operar a futura lista assinada de ocultação (`hide-list`, `LAN-13`, planejada para o portão G2) exclusivamente para **conteúdo grave** (abuso infantil, terrorismo, tráfico, imagem íntima não consentida — SLA previsto ≤ 2 h) ou **ordem judicial específica**, com motivo categorizado, data, assinatura verificável e **recurso público** em até 7 dias úteis por ≥ 2 revisores independentes ([GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31)). | Vale **apenas** na camada de renderização da instância oficial (GitHub Pages e espelho B). Não apaga dados de aparelhos de terceiros nem impede outros clientes ou espelhos comunitários de exibirem ou ignorarem a lista. |

---

## 3. Limites honestos (o que o Vox NÃO promete)

- **Perda definitiva sem recuperação prévia:** não existe banco de senhas nem botão central de "esqueci minha senha". Se você perder o aparelho **e** não tiver salvo a frase de recuperação, o cofre v2 (`.voxid` ou kit por e-mail), o cofre na malha nem guardiões suficientes, **ninguém consegue recuperar sua conta**. Sem a chave nem futuro cartão de recuperação (`PM-13`), também não será possível emitir lápide de encerramento (`PM-101`).
- **Visibilidade de IP em conexões WebRTC:** conexões P2P diretas trocam endereços IP entre os pares que estabelecem a chamada no navegador. O ajuste "Esconder meu IP" (modo só-TURN, `LAN-19`) já aparece em `#/settings/network`, **mas hoje ainda não tem efeito prático enquanto não houver servidor TURN público configurado** em `signaling.json` (`REV-10` pendente).
- **Cópias offline já baixadas não somem à força:** quando outras pessoas ou espelhos já replicaram uma publicação pública sua, ocultar na instância oficial ou excluir localmente não força o apagamento em aparelhos que já baixaram aquela cópia.
- **Gravação no Arweave pausada (`arweaveUpload: false`):** hoje **nada é salvo automaticamente em blockchain ou no Arweave**. A circulação e a preservação acontecem pela **rede de seguidores** e por nós opcionais (`Vox Populi` / `Vox Memoria`). O Arweave é usado apenas para leitura de registros públicos existentes e fica reservado para eventuais recursos futuros específicos.
- **Estado atual do projeto (Prontidão Fria):** o Vox ainda não abriu para o público geral nem iniciou o piloto humano (`V-P09`). O lançamento público (`G3`) depende de parecer jurídico (`REV-12`), plantão de conteúdo grave (`LAN-04`) e descentralização operacional (`bus factor ≥ 2`, `LAN-30`). Este texto é rascunho sujeito à validação jurídica do `REV-12` antes de entrar na Voxpedia e nos Termos finais.
