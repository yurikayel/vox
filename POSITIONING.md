# Posicionamento — Vox

> Diagnóstico comparativo detalhado e matriz 5×5 → [LESSONS.md](./LESSONS.md)

## Metáfora Pix: interoperabilidade, não jurisdição

O **Pix** não significa “tudo acontece só no Brasil”. Significa **padrão aberto**, **sem dono único de infraestrutura** e **qualquer participante pode implementar** o mesmo protocolo. O Vox usa a mesma honestidade:

- **Permaweb (Arweave)** é uma camada global de armazenamento e indexação; gateways (Turbo, AR.IO, `arweave.net`) operam em várias regiões.
- **App-Name `vox-brasil`** e convenções de tags são o “arranjo” brasileiro — comunidades, moderação e UX pensados para cultura de fórum e Orkut — não uma promessa de que bytes ficam fisicamente só em território nacional.
- **Soberania** aqui é: *você assina, você publica, ninguém apaga sua transação na chain* — não “100% hospedado no Brasil” como slogan de marketing.
- **Chave Pix no Perfil (Fase A):** Enquanto atributo social opcional, a chave Pix no perfil serve para apoios voluntários e diretos entre participantes (sem intermediação de plataforma), reafirmando que o valor circula diretamente entre as pontas, exatamente como a mensagem e o post. O Vox não é banco nem arranjo de pagamento fechado.

## Três lógicas: fazenda, pensão, movimento

Não confundir dono da terra, síndico da pensão e bem comum:

1. **Big Tech = fazenda.** A terra é de outro. Você planta audiência; o dono leiloa atenção, muda a cerca e pode despejar a conta. Alcance vira aluguel.
2. **Fediverso clássico = pensão / serviço.** Instância Mastodon/Lemmy tem operador: alguém paga VPS, modera e não falir. A soberania do coletivo cabe no humor (e no boleto) do síndico.
3. **Vox = movimento / bem comum.** O espaço cívico é o cliente no aparelho mais o protocolo. **Inalienável** é a chave no bolso — não o slogan de rede indestrutível. Gateways e relays são leitura reserva e vizinhos voluntários; um URL fora do ar não equivale a confiscar cada celular, e o contrário também não é verdadeiro (aparelho, backup e índice ainda importam).

Este recorte não altera os modelos A–D abaixo. Tese de militância (esquerda e direita pró-democráticas como **praça comum**, não partido): [docs/tese-praca-civica-militancia-pro-democratica-2026-10.md](./docs/tese-praca-civica-militancia-pro-democratica-2026-10.md).

## Posicionamento diante dos 4 modelos cívicos (A–D)

Diante do debate recorrente sobre redes sociais brasileiras e soberania (ver [docs/campo-debate-aberto-ndp-2026-10.md](./docs/campo-debate-aberto-ndp-2026-10.md)), o Vox adota posição inequívoca:

- **Não somos o clone soberano (Modelo A):** Criar um “Twitter/Instagram nacional” em servidor central no Brasil não resolve a opacidade algorítmica nem a custódia das contas. Continua sendo um silo vulnerável com ponto único de falha.
- **Não somos instância Mastodon (Modelo B):** Voluntário e movimento social não devem ser sobrecarregados pagando e operando VPS para a comunidade existir.
- **Somos o Modelo C (Malha Local-first + PWA + POSSE):** Rede cívica cronológica, chaves no aparelho, leitura de backup via gateways públicos e distribuição ativa para onde a massa já conversa (WhatsApp, Instagram, X), sem prender o original.
- **Modelo D (Participação governamental / Orçamento Participativo):** Integrações institucionais com dados públicos e consultas do Estado não entram no P0; pontes cívicas só serão avaliadas após a validação do piloto humano (V-P09).

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

- Transações assinadas com tags `App-Name: vox-brasil` (comunidade, tópico, resposta, `mod-action`, `listing`, `governance-proposal`, etc.).
- Conteúdo referenciado pelo ID da transação (TX ID).

**Mutável apenas na experiência do usuário:**

- Listagens filtradas por moderadores (`mod-action` hide/ban) — ver [GOVERNANCE.md](./GOVERNANCE.md).
- Bloqueios locais (silenciar autor).
- Índices espelho opcionais curados por operadores de gateway ou espelhos comunitários — não apagam a TX original.

## Rede como Repo Público (Democracia Direta e FOSS)

Em plataformas centralizadas, regras de comunidade e algoritmos de alcance mudam por canetada corporativa a portas fechadas. No Vox:

- **Proposta pública e diff:** Quem quer mudar regras ou habilitar novas funções em uma comunidade abre uma proposta auditável (`Type: governance-proposal`), expondo o que muda e o porquê.
- **Voto transparente:** Membros participam com votos explícitos e auditáveis (`yes`, `no`, `abstain`), com trava de corte temporal (`Eligibility-Cutoff`) impedindo brigading Sybil.
- **Regras acordadas, não impostas:** Assim como o código aberto permite inspecionar commits antes do merge, a governança local permite inspecionar e votar antes que uma regra passe a valer.

## Feira Comunitária vs Meta Marketplace

Muitos brasileiros recorrem ao Instagram e Facebook para vender produtos caseiros, artesanato, brechós e serviços. Contudo, são submetidos a algoritmos predatórios que exigem impulsionamento pago para que seus próprios seguidores vejam seus posts:

| Dimensão | Meta Marketplace / Instagram | Vox (Feira Comunitária) |
|---|---|---|
| **Ambiente** | Shopping corporativo invasivo misturado com timeline | Feira local em aba dedicada da comunidade |
| **Ativação** | Imposta globalmente a todos os usuários | Opt-in soberano votado pela comunidade (default-off) |
| **Feed principal** | Inundado por anúncios e posts comerciais | Estritamente preservado: ofertas nunca entram no feed principal |
| **Monetização da plataforma** | Cobrança por alcance (Ads), leilões e taxas | Zero taxas, zero anúncios pagos, visibilidade cronológica honesta |
| **Transação** | Bloqueios de checkout corporativo | Pix direto para a chave do vendedor + conversa no DM |

A feira comunitária do Vox valoriza a economia popular real sem mercantilizar o espaço comunitário de debates.

## Pix Zaps Nativos: Microapoio Direto vs Plataformas Extrativistas

Redes centralizadas (Substack, YouTube, TikTok, Medium, X) impõem muros financeiros extrativistas: retêm de 10% a 30% de comissões, exigem limites mínimos de saque e impõem janelas de liquidação de 30 a 60 dias. No outro extremo, redes como Nostr dependem de Zaps com satoshis (Lightning Network), cuja volatilidade cambial e barreiras técnicas de onboarding afastam a população brasileira comum.

O Vox adota uma terceira via soberana com os **Pix Zaps Nativos** (especificação BR Code EMV offline):

- **Microapoios Instantâneos no Post:** O leitor apoia criadores de conteúdo, educadores populares ou coletivos locais com valores acessíveis (R$ 2, R$ 5, R$ 10 ou valor livre) em apenas um toque no feed ou na discussão (`⚡ Apoiar`).
- **Geração 100% Offline e Segura:** O código Pix Copia e Cola é gerado localmente pelo navegador do usuário em milissegundos via algoritmo BR Code EMV + CRC16-CCITT puro, sem qualquer dependência de servidores intermediários ou APIs de bancos.
- **Taxa Zero e Repasse Integral:** 100% do apoio chega à conta do recebedor em segundos no ecossistema Pix do Banco Central. O Vox não cobra comissão, não retém valores e não atua como instituição de pagamento.
- **Economia Solidária Circular:** Criadores sustentam suas produções locais diretamente por meio da comunidade que consome suas ideias, sem dependência de anunciantes, algoritmos de engajamento predatório ou intermediários de pagamento.

## Fora do escopo atual

- Intermediação financeira, custódia de valores ou split de pagamentos (o Vox não é e não será gateway bancário).
- Impulsionamento pago de posts ou anúncios patrocinados corporativos.
- Mensagens diretas privadas ponto a ponto — roadmap Fase 4 (ver [README.md](./README.md)).
