# Sucessão steward — relay buddy (V-P08)

> **Status:** canônico (runbook ops) · **Owner:** Community-doc · **Revisado:** 2026-11  
> **Tipo DoD:** `doc` (este arquivo) · handoff/buddy **na comunidade real** = `ops-humano` — ver [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md) e [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md).  
> **Complementa:** [steward-relay-kit.md](./steward-relay-kit.md) (V-I08) · **Não substitui** espelho shell A/B ([ops-shell-mirrors.md](./ops-shell-mirrors.md)).

Objetivo: o relay e os índices comunitários (`POST /vox/mirror`, `GET /vox/index/<id>.json`) **não** dependem de uma única pessoa. Um **relay buddy** (segundo voluntário treinado) assume ou cobre férias, queda de VPS e handoff — sem recorrer ao mantenedor do repositório Vox.

---

## Steward ≠ moderador

| Papel | Escopo | Onde está definido |
|-------|--------|-------------------|
| **Steward / buddy** | Disco, banda, saúde do relay, TTL de cache, URL do sinal/relay documentada, canal para ordem judicial na **camada espelhada** | [GOVERNANCE.md](../GOVERNANCE.md) § participação · wizard `#/settings/network/steward` |
| **Moderador** | Regras do espaço, `mod-action`, deliberação, appeal E1–E5 | [GOVERNANCE.md](../GOVERNANCE.md) · [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) § C.5 |

Hospedar relay **não** concede poder de moderador. O buddy **não** herda mandato de mod ao receber credenciais da VPS — só infraestrutura acordada com o coletivo.

---

## Quando nomear o buddy (antes do burnout)

Heurísticas (ajustar no grupo, sem impor ranking):

- Nomear **relay buddy** quando o steward principal sobe **Caminho B** ([steward-seed-15min.md](./steward-seed-15min.md)) ou quando **≥3 comunidades** usam o mesmo relay.
- Meta operacional do projeto: ~**1 steward / 3–5 comunidades** — acima disso, planejar segundo relay ou buddy com handoff escrito.
- Registrar o papel no go/no-go e na retrospectiva V-P09 (**campo Relay Buddy** — preencher **só** com nome/contato acordado offline; **não** inventar no git).

---

## Checklist — segundo voluntário (`ops-humano`)

Marcar **fora** deste repo (ata, issue privada do coletivo ou retrospectiva). Caixas abaixo ficam **abertas** até evidência humana.

- [ ] Buddy é **voluntário distinto** do steward principal e **não** é o mantenedor do repo Vox (smoke NET-04).
- [ ] Buddy completou subida de teste com [steward-relay-kit.md](./steward-relay-kit.md) ou acompanhou um deploy real (compose + `/health`).
- [ ] Acordo escrito: quem paga VPS (se houver), janela de plantão, canal de escalação (Zap/Telegram **do coletivo**, não issue pública com segredos).
- [ ] Comunidade sabe **qual URL** de relay/index usar se a primária falhar (pin ou post de governança — mod/fundador visibiliza; buddy **não** modera por isso).
- [ ] Campo **Relay Buddy** em [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md) / retrospectiva preenchido **ou** decisão explícita **Caminho A — risco aceito** (sem relay comunitário).

---

## Checklist — handoff de credenciais (`ops-humano`)

Preferir checklist **escrito** + rotação de segredos; evitar colar senhas no WhatsApp sem combinar expurgo.

- [ ] Inventário entregue: host VPS ou kit local, domínio (`signal.exemplo.org`), paths `relay/deploy/`, volume Docker `vox_relay_cache`.
- [ ] Arquivo `.env` / segredos: `VOX_RELAY_MAX_CACHE_MB`, senha TURN, tokens — **rotacionar** o que vazou no chat após o handoff.
- [ ] **Compose + Caddy:** buddy consegue `docker compose ps`, renovar TLS, ler logs Caddy e `vox-relay`.
- [ ] **WSS / relay HTTP:** mesma origem HTTPS no wizard (ver [steward-relay-kit.md](./steward-relay-kit.md) § Caddy).
- [ ] Backup dos **`index_*.json`** / espelhos em disco (cópia do volume ou export documentado); teste de `GET /vox/index/<Community-Id>.json` após restore.
- [ ] Acesso DNS/registrar (se o buddy assume domínio) ou plano B com novo domínio + anúncio à comunidade.
- [ ] Contato **Art. 19** / judicial documentado no README do coletivo ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)) — URL do relay, filtros aplicados no espelho, e-mail ou canal formal.
- [ ] Aviso à comunidade: mudança de URL de relay (não confundir com espelho shell — [ops-shell-mirrors.md](./ops-shell-mirrors.md)).

---

## Procedimento de emergência — 72 h (`ops-humano`)

Dois sentidos de **72 h** no ecossistema Vox:

1. **Inbox DM efêmero** — envelopes no relay expiram em **72 h** ([`relay/inbox.py`](../relay/inbox.py)). Se o relay cai, DMs offline pendentes podem **não** ser entregues após TTL; usuários devem reenviar quando o relay voltar.
2. **Janela de resposta do buddy** — se o steward principal ficou inacessível, o buddy tem até **72 h** para restaurar serviço **ou** publicar URL alternativa + estado honesto (“índice congelado desde …”).

Passos sugeridos (buddy ou mod/fundador **visibilidade**, buddy **execução técnica**):

1. Confirmar falha: `curl -sS https://<relay>/health` (timeout/5xx) e pill **Leitura reserva** frequente no grupo.
2. Subir relay de backup (mesmo compose, restore de volume) **ou** relay temporário + `POST /vox/mirror` com último índice válido (validação [mirror-validate-v1.md](./mirror-validate-v1.md)).
3. Comunicar no canal paralelo: URL nova ou mesma, o que foi perdido (inbox TTL), sem prometer backup central do projeto.
4. Se também cair o **shell** PWA: acionar espelho **B** ([ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md)) — papel distinto do relay.
5. Dentro de **72 h**: rotação de segredos se houve incidente ou handoff de emergência; registrar data na retrospectiva.

- [ ] Drill de emergência **executado** pelo coletivo (evidência datada) — **não** confundir com a existência deste runbook.

---

## Offboarding do steward (`ops-humano`)

- [ ] Handoff completo para buddy ou relay sucessor nomeado.
- [ ] Revogar chaves/API cloud e acesso SSH do steward que sai.
- [ ] Comunidade confirma URL de index ativa; mods atualizam pin se a URL mudou.
- [ ] Opcional: segundo `POST /vox/mirror` de outro host ([brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) T4) — reduz SPOF de **disco**, não substitui buddy.

---

## Referências rápidas

| Tópico | Doc |
|--------|-----|
| Subir relay | [steward-relay-kit.md](./steward-relay-kit.md) · [steward-seed-15min.md](./steward-seed-15min.md) |
| Espelho cliente A/B | [ops-shell-mirrors.md](./ops-shell-mirrors.md) |
| Piloto + buddy no gate | [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md) |
| ID backlog | [backlog-participacao-rede.md](./backlog-participacao-rede.md) V-P08 |

**Versão:** 1.0 · nov/2026
