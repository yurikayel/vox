# Teste aberto — pacote de convite (testers)

> **Status:** canônico · **Owner:** community-doc · **Revisado:** 2026-10  
> **Tipo DoD:** `doc` (T-01, T-09, T-10, T-19, T-20) · **Não substitui** [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md) (V-P09)

Material para quem **convida** participantes do teste aberto do PWA. Tom informativo, alinhado a [COMPLIANCE-BR.md](../COMPLIANCE-BR.md): isto **não** é lançamento comercial nem produto com SLA.

---

## T-01 — URLs e espelhos no convite

| Espelho | Papel | URL / status |
|---------|--------|----------------|
| **A (canônico)** | GitHub Pages | **https://yurikayel.github.io/vox/** |
| **B (alternativo)** | Shell estático read-only | **`planned`** — sem URL pública no repositório |

**Texto sugerido no convite (copiar/colar):**

> Abra o Vox pelo link oficial do teste: **https://yurikayel.github.io/vox/**  
> Use **hard refresh** (`Ctrl+Shift+R`) se a tela parecer desatualizada após um deploy.

**Waiver T2 (espelho B):** enquanto `shell-b` estiver **`planned`** em [ops-shell-mirrors.md](./ops-shell-mirrors.md), **não** prometa URL alternativa. Se o GitHub Pages (espelho A) ficar indisponível, **pausar o teste aberto** até A voltar **ou** até B estar `live` com paridade de `CACHE_NAME` — ver [T-19](#t-19--pages-indisponível-mensagem-no-canal) abaixo.

---

## T-20 — Expectativas honestas para testers

Comunique **antes** da primeira sessão:

1. **Identidade de teste:** podem usar persona fictícia ou conta de experimento; **não** é obrigatório expor nome civil, CPF ou endereço residencial real no app ou no canal.
2. **Endereço e dados sensíveis:** **não** publiquem endereço de casa, documentos ou dados de terceiros; conteúdo on-chain é **público e persistente** ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)).
3. **Sem promessa de permanência:** comunidades, relays e caches de teste podem ser **desligados ou apagados** sem aviso longo; não há garantia de backup central do projeto.
4. **Não é lançamento:** o teste serve para feedback técnico e de UX; **não** vendemos plano, suporte 24h nem estabilidade de produção.
5. **Mantenedor do repo:** não presta suporte **1:1** por DM privado — dúvidas no canal do teste (ver [teste-aberto-canal-apoio.md](./teste-aberto-canal-apoio.md)).

---

## T-09 — Checklist do tester (~15 min)

1. Abrir **https://yurikayel.github.io/vox/** em navegador atualizado (Chrome/Edge/Firefox recente).
2. Passar pela **Porta da Cantina** (*Entrar — sou humano*) e completar o tour se aparecer.
3. Entrar na comunidade indicada no convite (`#/c/<slug>`) ou criar comunidade de sandbox conforme orientação do host.
4. Publicar **um post de teste** (texto curto; sem dados pessoais reais).
5. Abrir **Configurações → Rede** e confirmar que gateways carregam (sem spinner infinito).
6. Opcional: abrir `#/status` e anotar `CACHE_NAME` / erros de espelho para o relatório.
7. Opcional: comentar no próprio post ou em thread da comunidade.
8. Se algo quebrar: captura de tela + passo a passo no **canal do teste** (não DM ao mantenedor).
9. Após deploy anunciado pelo host: **hard refresh** e repetir passos 1 e 6.
10. Ao encerrar a sessão: dizer no canal se **conseguiu** ou **bloqueou** em qual passo.

---

## T-10 — Como ver a versão do shell

Testers e hosts conferem a **mesma release** por três vias (qualquer uma basta para triagem):

| Onde | O que olhar |
|------|-------------|
| **`#/status`** | Tela de diagnóstico local: exporta telemetria de espelho, erros recentes e contexto da sessão ([`client/DEV.md`](../client/DEV.md)). |
| **`CACHE_NAME`** | Valor canônico no topo de [`client/sw.js`](../client/sw.js) **e** no `sw.js` servido pela URL aberta (`…/vox/sw.js`). Devem coincidir após hard refresh. |
| **README — tabela de release** | [README.md](../README.md) (*Linha de release*): SHA curto, contagem de testes, string do service worker. |

**Registro executável de espelhos:** paridade A/B documentada em [ops-shell-mirrors.md](./ops-shell-mirrors.md) (T2). Enquanto B estiver `planned`, a referência operacional é **só A + README + `#/status`**.

---

## T-19 — Pages indisponível: mensagem no canal

Se **https://yurikayel.github.io/vox/** não responder (HTTP erro, shell em branco, deploy falhou):

**Mensagem para colar no grupo (ajuste data/hora):**

> ⚠️ **Pausa no teste aberto Vox** — o espelho oficial (GitHub Pages) está indisponível ou servindo shell quebrado.  
> **Não** insistam em cache antigo sem orientação.  
> Host do teste: sigam [ops-pages-rollback.md](./ops-pages-rollback.md) e, se aplicável, o drill em [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md).  
> Retomamos quando A estiver estável **ou** quando houver URL B `live` na tabela T2 ([ops-shell-mirrors.md](./ops-shell-mirrors.md)).  
> Dúvidas **neste canal** — sem DM ao mantenedor do repositório.

**Operador (host):** rollback Pages conforme [ops-pages-rollback.md](./ops-pages-rollback.md); comunicar hard refresh se `CACHE_NAME` mudou; **não** marcar V-P09 como concluído só por reabrir o site.

---

## Referências cruzadas

- Canal e regras: [teste-aberto-canal-apoio.md](./teste-aberto-canal-apoio.md) (T-03)  
- Carta E2 (praça de teste): [teste-aberto-carta-moderacao-e2.md](./teste-aberto-carta-moderacao-e2.md) (T-17)  
- Gate piloto / alpha: [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md)

**Versão:** 1.0
