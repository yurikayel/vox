# 🇧🇷 Vox — A Voz Soberana da Rede

> **Poste uma vez. Pertença a comunidades reais. Ecoe em todas as redes.**  
> O Vox é uma iniciativa de rede social aberta, leve e descentralizada, desenhada para devolver a soberania digital e o controle do conteúdo às mãos dos brasileiros — sem dependência de Big Techs, sem servidores centrais para pagar e com foco em comunidades no estilo Orkut.

---

## 🎯 Por que o Vox existe?

No modelo atual da internet, a comunicação de mais de 200 milhões de brasileiros está refém de um punhado de corporações estrangeiras:
1. **Risco de Apagão e Censura:** Contas bloqueadas arbitrariamente, algoritmos opacos que sufocam o alcance e a vulnerabilidade constante de ficar sem seus laços sociais caso uma plataforma estrangeira seja suspensa ou mude de dono.
2. **Dependência de Falsas Alternativas:** Mesmo novas redes abertas estrangeiras mantêm dependências de servidores nos EUA e empresas centralizadoras.
3. **Morte das Comunidades Reais:** O modelo algorítmico do feed infinito matou a convivência comunitária orgânica que o Brasil dominava na era do Orkut.

O **Vox** adota o espírito do **Pix**: uma infraestrutura pública, descentralizada e aberta, onde você é dono da sua identidade e do seu conteúdo.

---

## 🏛️ Os Três Pilares do Vox

### 1. Comunidades Primeiro (Estilo Orkut)
* **Fóruns por Tópicos:** Discussões organizadas por assunto com tópicos e respostas encadeadas, e não apenas rolagens infinitas de dopamina.
* **Membros no Perfil:** As comunidades às quais você pertence definem a sua identidade e seus interesses no seu perfil.
* **Moderação Distribuída:** Os criadores e moderadores possuem ferramentas locais para filtrar spam e manter a ordem comunitária sem depender de censura centralizada.

### 2. Soberania na Camada de Dados (Permaweb / GraphQL)
* **Zero Servidores Centrais:** O Vox não possui um servidor Node, Python ou banco de dados relacional caro que voluntários precisam bancar.
* **Infraestrutura Descentralizada:** Utiliza a arquitetura Permaweb (Arweave + nós de gateway AR.IO / Turbo). 
* **Leitura Livre via GraphQL:** Todas as comunidades, tópicos e perfis são indexados e consultados via GraphQL aberto nos gateways globais distribuídos (`/graphql`).
* **Sua Chave é Você:** Identidade criptográfica gerada direto no dispositivo com WebCrypto (Ed25519/Passkeys).

### 3. Crossposting: O Vox como Centro de Gravidade
* O Vox não exige que seus contatos abandonem outras plataformas para você ter voz.
* Ao publicar no Vox, o post original assinado fica salvo permanentemente no seu controle.
* Com **1 toque**, o app despacha o conteúdo para **WhatsApp, Instagram, TikTok e X** através da Web Share API nativa e web intents.

### 4. Mensagens Diretas (DMs) com Privacidade
* Comunicação privada ponto a ponto usando criptografia assimétrica de ponta a ponta (WebCrypto).
* Apenas o destinatário detém a chave para decifrar a mensagem. Nenhum intermediário lê suas conversas.

---

## ⚙️ Arquitetura Técnica do MVP

```
┌─────────────────────────────────────────────────────────────┐
│                 Vox Web Client (PWA Ultraleve)              │
│       HTML5 + CSS Minimalista + Vanilla JS (< 50 KB)        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
        [Leitura Pública]               [Escrita & DMs]
               │                               │
               ▼                               ▼
      Gateways Descentralizados       Assinatura Local
        (AR.IO / Turbo GraphQL)        (WebCrypto no Aparelho)
               │                               │
               ▼                               ▼
    Consultas de Comunidades/Posts     Turbo Bundler (L2 Arweave)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                       Permaweb (Arweave)
```

### Esquema de Tags (Sem Banco de Dados)
Todo dado no Vox é identificado por tags semânticas universais:

| Ação | Tag `Type` | Tags Adicionais |
|---|---|---|
| **Criar Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` |
| **Entrar em Comunidade** | `membership` | `Community-Id` |
| **Criar Tópico** | `topic` | `Community-Id`, `Topic-Title` |
| **Responder Tópico** | `reply` | `Community-Id`, `Reply-To` (TX ID) |
| **Mensagem Direta** | `dm` | `Recipient` (Chave pública) |
| **Moderação** | `mod-action` | `Community-Id`, `Action` (hide/ban), `Target` |

---

## 🗺️ Roadmap de Execução

- [x] **Fase 0: Concepção & Arquitetura**
  - Definição da estratégia de soberania digital sem servidor central.
  - Adoção do modelo Permaweb + Turbo Gateway.
- [ ] **Fase 1: MVP do Fórum & Leitura (A Rua + Comunidades)**
  - Cliente PWA leve capaz de ler comunidades e tópicos via GraphQL.
  - Interface nostálgica e limpa (estilo Orkut moderno).
- [ ] **Fase 2: Autoria, Chaves & Crossposting**
  - Geração de chave criptográfica local no navegador.
  - Publicação de tópicos e respostas.
  - Botões de compartilhamento rápido para WhatsApp, Insta, X e TikTok.
- [ ] **Fase 3: Mensagens Diretas Criptografadas**
  - DMs com chave pública do destinatário.
- [ ] **Fase 4: Domínio & Identidade .vox.br**
  - Nomes amigáveis e resolução descentralizada.

---

## 🤝 Como Contribuir

O Vox é mantido pela boa vontade de desenvolvedores, designers e entusiastas brasileiros da soberania digital.

* Código aberto sob licença MIT.
* Princípio de projeto: **Menor esforço, maior impacto**. Zero inchaço algorítmico, sem dependência de Big Techs.
