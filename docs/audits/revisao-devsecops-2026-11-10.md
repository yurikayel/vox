# Revisão de estado, arquitetura e DevSecOps — 10/11/2026

> **Status:** auditoria · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-10 · Base: `main` em `be02f4d` (SW v7.60)
> Relacionados: [THREAT-MODEL](../THREAT-MODEL.md) · [ROADMAP](../ROADMAP.md) · [HARDENING](../HARDENING.md) · [SECURITY.md](../../SECURITY.md) · [ARCHITECTURE](../ARCHITECTURE.md)
> Não substitui o ROADMAP. Os achados de severidade crítica e alta estão **sob divulgação responsável** ([SECURITY.md §3](../../SECURITY.md)): aqui aparecem só a área afetada e o plano, sem o caminho de exploração.

## 1. Veredito

- **O que melhorou muito.** A integridade do **conteúdo** que circula entre aparelhos: assinatura conferida em todos os caminhos de entrada (gossip, sincronização ao conectar, memória central), forma assinada preservada no banco, foto que verifica, eco de cartão contido. A CSP sem script inline segura bem o XSS clássico. O pipeline tem gates reais: ruleset no `main`, 5 checks obrigatórios, secret scanning com push protection e proveniência dos binários.
- **O que está fraco.** A **custódia e a recuperação da identidade**, e a **confiança no servidor de memória central**. A revisão achou **3 problemas críticos e 3 altos** nessas áreas; eles estão sob divulgação responsável. Juntos, permitem que um terceiro tome a conta de uma pessoa sem tocar no aparelho dela, em cenários realistas.
- **Para o público-alvo** (militância, pauta política sensível), o Vox **não deve ser divulgado como seguro para identidade de longo prazo** até fechar o lote PM-90…PM-94. Para teste com grupo pequeno e consciente, segue usável.

## 2. Estado do projeto

| Item | Valor |
|---|---|
| `main` | `be02f4d`, SW `vox-pwa-v7.60` ([release-metadata](../release-metadata.json)) |
| Testes | 938 JS (`node:test`) + 91 Python (`unittest`), verdes; CI em Node 22/24 e Python 3.11/3.12 |
| Código | ~206 módulos JS no cliente (~39 mil linhas), relay Python com ~4,2 mil linhas, sem build |
| Dívida medida | 26 arquivos acima de 350 linhas (aviso de legado, com catraca); 0 violação de função, complexidade ou aninhamento ([HARDENING](../HARDENING.md)) |
| Roadmap | 43 itens feitos, 70 abertos |
| Precache (PM-02) | dentro do teto, com ~1,2 KB de folga |

**Fechado em 10/11** (PRs yurikayel/vox#48–#56):

| Item | O que fez |
|---|---|
| Canal (PM-81) | comunidade em que só a moderação publica |
| Vínculo assinado (PM-82) | convite com aceite e confirmação assinados |
| Forma assinada no banco (#49) | post guardado volta a bater com a assinatura |
| Memória central verifica (PM-86) | o que volta do servidor passa pelas regras da malha |
| Foto ao vivo verifica (PM-87) | post com foto chega a quem recebe ao vivo |
| Foto na sincronização (PM-88) | foto vai junto na sincronização ao conectar |
| Foto ao Arweave (PM-89) | foto do composer volta a subir com o MIME certo |
| Eco de cartão (PM-84) | cartão de perfil só segue adiante se for versão nova |

**Em aberto, conhecido:**

| Item | Situação |
|---|---|
| PM-85 | campos aninhados fora da assinatura |
| PM-83 | moderador natural |
| PM-90…PM-95 | os achados desta revisão |

## 3. Arquitetura

```
 Aparelho (PWA, sem build)                       Infra opcional
 ┌──────────────────────────────────────┐       ┌───────────────────────────────────┐
 │ UI: app/*, render/*                  │       │ Sinalização: Render + Nostr       │
 │ Domínio: cache-node (IndexedDB),     │ WebRTC│ Relay Python (server.py):         │
 │  post-wire, peers, peer-sync,        │◄─────►│  caixa de DM (TTL), memória       │
 │  central-memory(-hydrate), vox-link  │ gossip│  central, cofres, OAuth exchange  │
 │ Identidade: local-account (ECDSA),   │       │ Nó local (VoxPopuli / Node Zero)  │
 │  crypto-dm (ECDH+AES-GCM), cofres    │──────►│ Arweave via Turbo + 4 gateways    │
 └──────────────────────────────────────┘ HTTPS └───────────────────────────────────┘
```

### Acertos
- **Local-first de verdade.** O aparelho é a fonte da verdade e todo dado de fora é conferido por assinatura (desde #49, PM-86 e PM-87). Servidor caído não derruba a leitura.
- **Sem build e com poucas dependências.** A superfície de cadeia de suprimentos é mínima ([DEPENDENCIAS](../DEPENDENCIAS.md)): um bundle vendorizado do Arweave e nenhum `npm install` em produção.
- **Regras de domínio aplicadas no recebimento** (PM-09, PM-81), não só na tela: cada aparelho decide sozinho.
- **Disciplina de engenharia:** catraca de tamanho e complexidade, testes por mudança, evidência PASS/FAIL/NOT RUN, orçamento de precache.

### Críticas
1. **"Local-first" com sincronização implícita.**
   - **O problema:** a memória central recebe **todo** item gravado (auto-push), e a escolha de qual servidor recebe ficou automática demais (ver PM-91).
   - **O que falta:** para o público-alvo, o fluxo de dados precisa ser **consentido e visível**: qual servidor, desde quando, o que vai.
2. **Formato de assinatura frágil (PM-85).** `canonicalString` só cobre as chaves de primeiro nível. Cada correção recente precisou contornar isso: `accept` como texto no PM-82, `mediaHash` no topo no PM-87. É dívida de **protocolo**: precisa de versão (`sigv: 2`) e período de convivência, não de mais um contorno.
3. **Identidade e recuperação são a parte mais sensível e a menos revisada.** O desenho do cofre (ADR-014) prometia "conhecimento zero", e a implementação não cumpre (detalhes sob divulgação). O ADR e o `IDENTITY.md` foram corrigidos nesta revisão para não prometer o que não entregam.
4. **Arquivos grandes concentram risco.** `peers.js` (823 linhas), `cache-node.js`, `render/profile.js` e outros 23 arquivos acima de 350 linhas. A catraca impede piora, mas as rotas de entrada da malha (`handleGossipMessage` e afins) merecem um módulo de política de entrada, com testes de tabela, e não ajustes linha a linha.
5. **Muitos caminhos de entrada para o mesmo dado.** Gossip, gossip de atualização, sincronização por inventário, envio completo, memória central, cartão de diretório sem assinatura, beacon. Cada um reimplementou "já vi?", "é mais novo?" e "é do mesmo autor?". **Proposta:** uma função única `acceptIncoming(item, origem)`, usada por todos.
6. **Relay sem modelo de autorização.** Todos os endpoints são abertos por desenho ("relay cego"). Isso serve para envelopes cifrados com TTL, mas não para cofres, para apagar coisas, nem para nó exposto por túnel (PM-94).

## 4. Segurança da aplicação

### Já mitigado (com evidência no código ou nos testes)
- XSS com execução de script: CSP `script-src 'self'` sem `unsafe-inline`/`unsafe-eval`, `escapeHtml` nos templates, cartuchos em iframe sem `allow-same-origin` (T1).
- Conteúdo forjado na malha e na memória central: `verifyPayload` em todos os caminhos de post (T16, PM-86).
- Edição de comunidade por quem não pode: PM-09, aplicado em gossip e hidratação (T15).
- Inundação: 20 posts por chave a cada 10 min; cartão repetido não circula (T10, T18).
- DM: ECDH P-256 com chave efêmera por mensagem e AES-GCM (T4).

### Sob divulgação responsável (sem detalhes aqui)

| ID | Severidade | Área | Plano |
|---|---|---|---|
| PM-90 | crítica | cofre de recuperação por login (Google/Meta) | cofre com segredo que só a pessoa tem; migração dos cofres antigos |
| PM-91 | crítica | escolha do servidor de memória central | trocar de servidor só por ação explícita, mostrando o domínio |
| PM-92 | crítica | sincronização entre aparelhos | o link não pode bastar sozinho para abrir a conta |
| PM-93 | alta | chaves guardadas no aparelho | chave não extraível; carteira cifrada |
| PM-94 | alta | autorização no relay e no nó local | escrita e remoção autenticadas pelo dono; conferir `Origin`/`Host` e `Content-Type` |

Relato e prazos: [SECURITY.md](../../SECURITY.md). O mantenedor tem o relatório completo.

### Endurecimento de média e baixa prioridade (público)
- **CSP larga demais para saída.** `connect-src https: wss:`, `img-src https:` e `frame-src https:` deixam um eventual XSS levar dados para qualquer host. Restringir `connect-src` à lista real (sinalização, relays, gateways, Turbo) e servir imagens remotas por `blob:` depois do download.
- **GitHub Pages não manda cabeçalhos.** O `_headers` só vale na Cloudflare. No Pages, a `<meta>` CSP não suporta `frame-ancestors`, então o app pode ser embutido em iframe (clickjacking). Preferir a Cloudflare como origem canônica ou pôr um *frame-buster* em JS.
- **`style-src 'unsafe-inline'`** permite injeção de CSS (exfiltração por seletor é teórica, mas existe).
- **DM sem sigilo futuro** (T4) e **cartões de diretório sem assinatura** (`hydrateProfiles`, ponto aberto do T16).
- **Cartões novos sem limite por chave** (T18).

## 5. DevSecOps — pipeline e operação

| Controle | Estado | Crítica / ação |
|---|---|---|
| Proteção do `main` | ✅ ruleset ativo, sem bypass, sem force-push nem deleção, 5 checks obrigatórios | `required_approving_review_count: 0`: agentes e o mantenedor mergeiam sem segunda revisão. Com bus factor 1 (T3) é compreensível, mas convém exigir 1 aprovação em PR que toque `local-account.js`, `oauth-vault.js`, `crypto-dm.js`, `relay/` (CODEOWNERS) |
| Checks obrigatórios | ✅ cliente (Node 22/24), relay (Py 3.11/3.12), auditoria de segredos | `strict: false`: PR desatualizado entra sem rodar contra o `main` novo. O build do Node Zero não é obrigatório |
| Secret scanning | ✅ GitHub com push protection | A "Auditoria de Segurança" do CI só procura `BEGIN … PRIVATE KEY`. Não pega **JWK privada** (`"d":`), o formato que o Vox usa. Acrescentar um padrão para JWK e para `.voxid` |
| SAST | ❌ sem CodeQL nem Semgrep | Ligar CodeQL (JS e Python), que é grátis em repositório público |
| Dependências | ⚠️ Dependabot security updates **desligado**; `deps-mensal.yml` abre issue | Ligar o Dependabot (npm, pip, actions). `pip-audit` no relay e `npm audit --omit=dev` no CI |
| Actions de terceiros | ⚠️ fixadas por **tag** (`@v5`, `cloudflare/wrangler-action@v3`) | Fixar por **SHA**, ao menos as de deploy, que têm `id-token: write` ou secrets |
| Permissões de workflow | ✅ mínimas por workflow; sem `pull_request_target` | `ci.yml` não declara `permissions:` e herda o padrão do repositório. Declarar `contents: read` |
| Binários | ✅ build no CI, `SHA256SUMS`, `attest-build-provenance` | Sem assinatura Authenticode no `Vox.exe`/`VoxPopuli.exe`: o SmartScreen avisa, e a confiança do leigo vai para o aviso. Avaliar assinatura (SignPath grátis para OSS) |
| Documentação de segurança | ⚠️ `SECURITY.md`, ADR-014 e `IDENTITY.md` prometiam mais do que o código fazia | Corrigidos nesta revisão. **Regra nova:** afirmação de segurança nos docs precisa citar o teste que a prova |
| Resposta a incidente | ❌ sem plano escrito (quem revoga, como avisar usuários, como girar a chave da memória) | Escrever `docs/operations/incidente.md` curto |
| Conta e deploy (T3) | ❌ 2FA não documentado; um só mantenedor | Documentar 2FA e chaves de hardware; segundo administrador de emergência |

## 6. Plano

| Ordem | Item | Por quê primeiro |
|---|---|---|
| 1 | PM-92 e PM-91 | pequenos, só no cliente, e fecham o vazamento mais fácil |
| 2 | PM-90 junto com o endurecimento do cofre por senha | mudam o formato do cofre; uma migração só |
| 3 | PM-94 | relay; protege quem expõe o nó por túnel |
| 4 | PM-95 (pipeline: CodeQL, Dependabot, SHA nas actions, `permissions` no CI, padrão de JWK, `strict`) | barato, e evita regressão dos itens acima |
| 5 | PM-93 | muda o formato de conta e o backup; precisa de UX |
| 6 | PM-85 (`sigv: 2`) e depois PM-83 | protocolo antes da moderação que depende dele |

## 7. Como esta revisão foi feita
- Leitura de código no `main` em `be02f4d`: `local-account.js`, `oauth-vault.js`, `wallet.js`, `central-memory*.js`, `peers*.js`, `crypto-dm.js`, `relay/server.py`, `relay/central_memory.py`, `relay/inbox.py`, `index.html`, `_headers` e os workflows.
- Consulta à API do GitHub: ruleset, configuração de secret scanning e Dependabot, ausência de análise do code scanning.
- **NOT RUN:** pentest dinâmico, exploração contra instância real, teste de *Local Network Access* em navegadores, revisão do bundle vendorizado do Arweave.
