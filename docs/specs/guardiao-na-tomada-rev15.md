# Spec F6 redesenhada: Guardião na Tomada (REV-15)

> **Status:** rascunho · **Owner:** arquitetura / produto · **Revisado:** 2026-11-22
> **Relacionados:** [voluntariado-tres-trabalhos.md](../product/voluntariado-tres-trabalhos.md) · [pesquisa-deep-research-2026-11.md](../research/pesquisa-deep-research-2026-11.md) · [replicacao-por-grau-v0.md](./replicacao-por-grau-v0.md) · [mochila-dm-v0.md](./mochila-dm-v0.md) · [ADR-039](../adr/039-rust-por-fases.md)

## 1. Por que redesenhar F6

A pesquisa técnica ([pesquisa-deep-research-2026-11.md](../research/pesquisa-deep-research-2026-11.md), pontos V7/V8) confirmou que navegadores móveis encerram Service Workers em segundo plano agressivamente:

- **iOS Safari:** não suporta `periodicSync`; abas em segundo plano são suspensas em poucos minutos e dados podem sofrer eviction sem A2HS + persistência (`REV-14`).
- **Android Doze / OEMs:** `periodicSync` no Chromium depende de *site engagement*, não tem garantia de cadência e pode ficar horas sem disparar.

Por isso, o papel de guardião em navegador deixa de prometer "sincronização em segundo plano" e passa a ser um modo honesto e previsível: **Guardião na Tomada**.

## 2. Modo principal: Guardião na Tomada (PWA)

Quando a pessoa ativa o modo guardião (ex.: num celular antigo ou durante a noite):

1. **Pré-condições explícitas na UI:**
   - Exibir status real de **rede Wi-Fi** (pausa automática em rede móvel/metered quando `navigator.connection.saveData` ou `type === "cellular"` estiverem disponíveis, com aviso honesto quando o navegador não expõe `NetworkInformation`).
   - Exibir indicador de **carregamento na tomada** (quando `navigator.getBattery()` existir; caso contrário, lembrete manual claro).
2. **Tela ativa via Screen Wake Lock (`navigator.wakeLock.request("screen")`):**
   - Mantém o PWA vivo enquanto a aba estiver em primeiro plano; re-adquire automaticamente no evento `visibilitychange` ao retornar à aba.
   - Modo **tela escura / relógio discreto** (fundo `#000000`, elementos móveis leves ou estáticos de baixíssimo contraste opcional fora dos botões de controle) para reduzir consumo e desgaste OLED.
3. **Cotas locais e privacidade:**
   - Respeita os mesmos tetos da [replicação por grau](./replicacao-por-grau-v0.md) (teto de armazenamento local, ex. 500 MB configurável) e da [mochila de DMs](./mochila-dm-v0.md) (até 200 envelopes cegos no modo guardião, 7 dias TTL, zero leitura de conteúdo).
   - Mostra contador local honesto: pares atendidos na sessão, bytes replicados e espaço usado em IndexedDB (sem telemetria central nem ranking público).

## 3. Papel restrito do `periodicSync`

- Registrado **apenas como complemento oportunista** em navegadores Chromium que concedam permissão `periodic-background-sync`.
- **Nunca** anunciado como garantia de entrega ou disponibilidade; se indisponível ou bloqueado pelo sistema, a UI não exibe erro falso — apenas informa que o modo guardião funciona com a tela aberta na tomada.

## 4. Ponte para o nó nativo (`vox-populi.apk` e ADR-039)

Para quem deseja deixar um celular Android antigo como nó contínuo **com tela apagada**, o caminho de médio prazo é o wrapper nativo `vox-populi.apk` com serviço em primeiro plano + biblioteca Rust (`libvoxnode.so`, [ADR-039](../adr/039-rust-por-fases.md) Fases 4–5). O modo PWA "Guardião na Tomada" cobre o período até lá e funciona em qualquer navegador sem instalar APK.

## 5. Critérios de aceite (`DoD` antes de implementar)

1. Teste unitário simulando aquisição, liberação e re-aquisição de `WakeLock` em `visibilitychange`, mais fallback limpo quando `navigator.wakeLock` não existe.
2. Teste garantindo pausa de replicação pesada em rede móvel (`cellular` / `saveData`) e respeito ao teto de quota local.
3. Copy revisada contra `DOC-04`: declara explicitamente que iOS e Android encerram o app ao fechar a tela no navegador.
4. Impacto no orçamento do shell (`LAN-23`) mantido dentro do teto (carregamento sob demanda se necessário).
