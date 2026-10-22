# Posicionamento — Vox

> Diagnóstico comparativo detalhado e matriz 5×5 → [LESSONS.md](./LESSONS.md)

## Metáfora Pix: interoperabilidade, não jurisdição

O **Pix** não significa “tudo acontece só no Brasil”. Significa **padrão aberto**, **sem dono único de infraestrutura** e **qualquer participante pode implementar** o mesmo protocolo. O Vox usa a mesma honestidade:

- **Permaweb (Arweave)** é uma camada global de armazenamento e indexação; gateways (Turbo, AR.IO, `arweave.net`) operam em várias regiões.
- **App-Name `vox-brasil`** e convenções de tags são o “arranjo” brasileiro — comunidades, moderação e UX pensados para cultura de fórum e Orkut — não uma promessa de que bytes ficam fisicamente só em território nacional.
- **Soberania** aqui é: *você assina, você publica, ninguém apaga sua transação na chain* — não “100% hospedado no Brasil” como slogan de marketing.

## Vox vs Iniciativas Arquetípicas

Para aprofundamento das lições e armadilhas evitadas, consulte [LESSONS.md](./LESSONS.md):

* **vs. Bluesky (AT Protocol):** Rejeitamos a dependência do AppView e das regras corporativas centralizadas da Bluesky PBC (EUA); no Vox, múltiplos gateways neutros indexam o protocolo livremente.
* **vs. Mastodon (Fediverso):** Eliminamos a fricção de "escolher servidores" e a sobrecarga financeira de manter instâncias VPS; a descentralização do Vox é invisível para o usuário e tem custo zero para os devs.
* **vs. Varanda (Holepunch P2P):** Herdamos o modelo de identidade Ed25519 local e diários assinados, mas cortamos radicalmente a exigência de semeadores (*seeders*) e os gargalos de conexão móvel/CGNAT.
* **vs. BemTeVi:** Não competimos em “bandeira no datacenter” ou promessa de hospedagem física nacional; competimos em **formato comunitário Orkut**, **portabilidade de chaves** e **estratégia de ponte (crossposting)** sem aprisionamento em ilhas isoladas.

| Aspecto | Narrativa comum (ex. BemTeVi) | Vox |
|--------|-------------------------------|-----|
| Infra | “Rede brasileira”, servidores/nós no país | Permaweb global + nós locais default-on (Pacto Vox: seus dados são seus ↔ cache cooperativo) |
| Dados | Dependem de operadores nacionais | Transações públicas indexadas via GraphQL em gateways abertos |
| Moderação | Central ou institucional | Client-side + `mod-action` assinado por moderadores da comunidade |
| Conexão com outras redes | Rede isolada | Ponte ativa: publica no Vox e despacha para WhatsApp, Insta, X e TikTok |
| Fase atual | Varia por produto | **Fases 1, 2, 3 e 3.1 entregues** — nós participativos default-on operacionais; DMs na Fase 4 |

## O que é imutável vs o que o cliente esconde

**Imutável (on-chain / permaweb):**

- Transações assinadas com tags `App-Name: vox-brasil` (comunidade, tópico, resposta, `mod-action`, etc.).
- Conteúdo referenciado pelo ID da transação (TX ID).

**Mutável apenas na experiência do usuário:**

- Listagens filtradas por moderadores (`mod-action` hide/ban) — ver [GOVERNANCE.md](./GOVERNANCE.md).
- Bloqueios locais (silenciar autor).
- Índices espelho opcionais curados por operadores de gateway ou espelhos comunitários — não apagam a TX original.

**Fora do escopo atual:**

- Mensagens diretas privadas ponto a ponto — roadmap Fase 4 (ver [README.md](./README.md)).
