# Manifesto de comunidade v1 (subrede)

> **Status:** rascunho (espera o aceite do [ADR-038](../adr/038-subrede-malha-e-manifesto.md); nada implementado) · **Owner:** mantenedor · **Revisado:** 2026-11-17

Substitui o [rascunho v0](./community-module-manifest-v0.md) (Horizonte C, 23/10), que cobria só infraestrutura. As decisões (quem assina, versões, tema, módulos, extensões, fork) estão no ADR-038; esta spec dá o formato e as regras que o código vai conferir. Ameaça: [T28](../THREAT-MODEL.md).

## 1. Item na malha

O manifesto é um item da malha como os posts, com `type: "community_manifest"`, assinado pelo autor do mesmo jeito que um `community_update` (`author`, `sig`, `sigv`; a assinatura cobre todos os campos abaixo). Circula pelo gossip e pela memória central e passa pelo mesmo portão do PM-09 (`isCommunityUpdateAcceptable`, estendido ao tipo novo): de comunidade conhecida, só é gravado e repassado se o autor for o dono do post canônico `c_<communityId>` ou moderador listado nele.

```json
{
  "type": "community_manifest",
  "v": 1,
  "id": "cm_<communityId>_<issuedAt>_<8 hex aleatórios>",
  "communityId": "…",
  "author": "vx_…",
  "issuedAt": 1795430400000,
  "prev": "sha256:<hex>",
  "about": { "text": "…", "rules": "…", "links": [{ "label": "…", "url": "https://…" }] },
  "theme": { "accent": "#1f6feb", "onAccent": "#ffffff", "link": "#0b57d0", "surface": "#ffffff", "text": "#1b1b1b" },
  "modules": [{ "kind": "relay-http", "url": "https://…", "label": "…", "operator": "vx_…" }],
  "forkOf": { "communityId": "…", "manifest": "sha256:<hex>" },
  "sig": "…",
  "sigv": "…"
}
```

| Campo | Obrigatório | Regra |
|---|:---:|---|
| `v` | sim | `1`. Outro valor é recusado (leitor não adivinha formato, ADR-036) |
| `communityId` | sim | comunidade a que o manifesto se refere |
| `author` | sim | quem assina; o portão confere dono ou moderador (§2) |
| `issuedAt` | sim | inteiro em milissegundos; regras no §3 |
| `prev` | sim | `"sha256:<hex>"` do manifesto em que se baseou, ou `null` no primeiro |
| `about` | não | grupo do texto (§2). Texto longo (`text`, `rules`, `links`); **não** traz título, descrição curta, foto, categoria nem modo de publicação, que continuam só no `community_update` |
| `theme` | não | grupo do texto; formato no §4 |
| `modules` | não | grupo do dono; formato no §5 |
| `forkOf` | não | só no primeiro manifesto de uma comunidade derivada (§7) |
| `extensions` | — | **proibido no v1**: manifesto com o campo é recusado (§6) |

**Hash do manifesto:** SHA-256 da forma assinada canônica (a mesma usada para `sig`), escrito `sha256:<hex minúsculo>`. É o que `prev`, `forkOf.manifest` e o desempate do §3 usam.

**Limites:** item inteiro até 16 KB; `about.text` e `about.rules` até 2.000 caracteres cada; `about.links` até 8, só `https:`; `modules` até 32 (como no v0). Fora disso, recusado.

## 2. Quem pode mudar cada grupo

| Grupo | Campos | Dono | Moderador |
|---|---|:---:|:---:|
| texto | `about`, `theme` | sim | sim |
| dono | `modules` (e `extensions` na v2) | sim | não |

- Manifesto de moderador com `modules` presente (mesmo vazio) é **recusado inteiro**.
- Para limpar um grupo, o autor manda o campo vazio (`"modules": []`, `"about": {}`); campo ausente quer dizer "não mexo neste grupo".
- A autoridade é conferida contra o registro atual da comunidade a cada cálculo: manifesto de quem deixou de ser moderador para de valer.

## 3. Versão efetiva

O aparelho guarda os manifestos válidos de cada comunidade (até 32; quando passa, apaga o mais antigo que não é efetivo em nenhum grupo) e calcula o efetivo **por grupo**:

1. Descarta os que não passam no §1 e no §2.
2. Separa os que têm `issuedAt` mais de 10 minutos à frente do relógio do aparelho: ficam guardados e são reavaliados depois, mas não valem agora.
3. Para cada grupo, entre os manifestos que trazem aquele grupo, vence o maior `issuedAt`; no empate, o maior hash (comparação de bytes).
4. O resultado nunca volta para um `issuedAt` menor que o efetivo anterior do grupo (sem rollback). Manifesto antigo reenviado perde no passo 3 e não muda nada.

O cálculo é determinístico: o mesmo conjunto dá o mesmo efetivo em qualquer aparelho e em qualquer ordem de chegada. A mudança que perdeu fica no histórico; a tela de histórico pode mostrar duas versões com o mesmo `prev` como "editadas ao mesmo tempo".

**`community_update` no mesmo cálculo:** as regras 2 a 4 acima (futuro limitado a 10 minutos, maior data com desempate pelo hash, sem volta) valem também para o `community_update`, usando a data dele (`updatedAt` ou `ts`). Hoje ele só ordena pela data, sem limite para o futuro (ADR-038 §3.3).

**Troca de dono:** não existe hoje (o dono vem só do post canônico). A regra para quando existir está no ADR-038 §3.3.

## 4. `theme`

Lista fechada de tokens. Token fora da lista recusa o manifesto.

| Token | Usado em | Formato |
|---|---|---|
| `accent` | botões e destaques das telas da comunidade | `#rrggbb` |
| `onAccent` | texto sobre `accent` | `#rrggbb` |
| `link` | links nas telas da comunidade | `#rrggbb` |
| `surface` | fundo do cabeçalho e dos cartões da comunidade | `#rrggbb` |
| `text` | texto sobre `surface` | `#rrggbb` |

- Sem CSS livre, `url()`, fonte, imagem, gradiente, transparência ou seletor (T1).
- **Contraste**, pela fórmula de luminância relativa do WCAG 2.1: `text`/`surface`, `onAccent`/`accent` e `link`/`surface` com pelo menos 4,5:1. Tema que falha não é aplicado (a comunidade aparece com o tema padrão); a moderação vê o motivo. Se o tema traz só parte dos tokens, os que faltam vêm do tema padrão, e o contraste é conferido no resultado.
- O tema vale **só** nas telas da comunidade e é aplicado pelo próprio app em variáveis CSS já existentes, escopadas ao contêiner da comunidade. Nunca toca: barra de navegação, avisos de segurança, confirmações, a faixa "Foi você?" do cofre na malha (ADR-037), selo de assinatura, telas de identidade, cofre e guardiões.
- No modo escuro, o app usa o tema padrão escuro e ignora o da comunidade, a menos que uma versão futura traga tokens escuros.

## 5. `modules[]`

| Campo | Regra |
|---|---|
| `kind` | `index` \| `turn` \| `ar-pool` \| `signaling` \| `relay-http` (os do v0) |
| `url` | `https:` ou `wss:`; para `turn`, `turns:`. Sem credenciais na URL |
| `label` | até 60 caracteres |
| `operator` | opcional: `vx_…` de quem opera, para a tela mostrar o perfil |

- **Nunca aplicar sozinho.** Cada módulo aparece como sugestão em Ajustes → Rede, com o nome da comunidade, e só passa a valer quando a pessoa aceita aquele módulo.
- Antes de aceitar, a tela diz o que o serviço vê (endereço IP, horários e com quem a pessoa troca mensagens, sem o conteúdo; T22) e quem o opera.
- Manifesto novo que tira ou troca um módulo não desliga o que a pessoa aceitou: o aceito fica marcado "a comunidade não sugere mais", e só a pessoa desliga.
- Segredos (senha de TURN, token de relay) nunca vêm no manifesto. Se o serviço pedir, a pessoa consegue por outro canal.
- `pinHints[]` do v0 sai do manifesto: pins continuam no [`cache-manifest`](./cache-manifest-v0.md), que já é a fonte deles.

## 6. `extensions[]` (v2, fora do v1)

Reservado. Na v2: lista de cartuchos Webxdc (ADR-012) referenciados por `sha256:<hex>` do pacote, rodando no sandbox do ADR-012, cada um aceito pela pessoa e de novo a cada hash novo. Só entra depois de uma ameaça própria no THREAT-MODEL e da revisão do sandbox.

## 7. Fork (EXP-03)

1. Quem faz o fork cria uma comunidade nova (novo `communityId`, novo post canônico assinado por ele, que é o dono).
2. O primeiro manifesto da nova pode copiar `about`, `theme` e `modules` do efetivo da original e declarar `forkOf: { communityId, manifest }`, com `prev: null`.
3. `forkOf` é só informação: a tela mostra "derivada de <nome>". Não dá direito nenhum sobre a original e não é conferido contra ela; a original não precisa existir no aparelho.
4. Posts e membros não migram. Cada pessoa entra na nova se quiser.

Especificação completa do fluxo, invariantes anti-impersonação e matriz de verificação: [fork-comunidade-exp03.md](./fork-comunidade-exp03.md).

## 8. Fora do escopo

Cotas e capacidades por comunidade, cobrança, nota pública, imposição de relay, bloqueio de quem não aceita sugestões, passagem de dono, ponte com o Fediverso (fica na borda, ADR-028).

## 9. Testes esperados no código (antes da implementação)

Um teste por regra: manifesto de outra chave não é gravado nem repassado; moderador com `modules` é recusado; `extensions` no v1 é recusado; token fora da lista e contraste baixo não aplicam tema; `issuedAt` no futuro distante não vale; reenvio de manifesto antigo não muda o efetivo; dois manifestos com o mesmo `issuedAt` dão o mesmo efetivo em qualquer ordem; manifesto de moderador mais novo não desfaz `modules` do dono; manifesto novo sem um módulo não desliga o módulo aceito; tema não alcança a interface global; `community_update` datado mais de 10 minutos no futuro não muda título nem descrição; `community_update` antigo reenviado não desfaz o mais novo.
