# Vox no Ecossistema Apple (macOS & iOS)

Como rodar o **Cliente Vox** e o **Nó Dedicado Vox Populi** no ecossistema Apple (Mac, iPhone e iPad).

---

## 📱 1. iOS & iPadOS (iPhone / iPad)

A Apple não permite a instalação de APKs ou pacotes soltos fora da App Store tradicional sem expiração semanal de certificados.

A solução **canônica, nativa e sem intermediários** para iOS é o **PWA com Aceleração WebKit**:

1. No iPhone ou iPad, abra o Safari e acesse:
   👉 **`https://vox-9df.pages.dev/`**
2. Toque no botão de **Compartilhar** (ícone do quadrado com a seta para cima no Safari).
3. Role para baixo e selecione **"Adicionar à Tela de Início"** (*Add to Home Screen*).
4. O app será instalado instantaneamente com o ícone oficial do Vox.

### Recursos Nativos no iOS:
- **Modo Tela Cheia:** Abre sem a barra de endereços do Safari (`display: standalone`).
- **Ajuste de Notch e Dynamic Island:** Suporte nativo a `viewport-fit=cover`.
- **Offline & Soberania:** Banco de dados local via IndexedDB e chaves criptográficas WebCrypto mantidos localmente no aparelho.

---

## 💻 2. macOS (MacBook, Mac mini, iMac)

### A. Cliente Vox no Mac:
No macOS Sonoma / Ventura, o Safari permite transformar qualquer PWA em uma aplicação desktop nativa do Mac:
1. Abra `https://vox-9df.pages.dev/` no Safari do Mac.
2. No menu superior, clique em **Arquivo** > **Adicionar ao Dock...** (ou botão Compartilhar > Adicionar ao Dock).
3. O Vox torna-se um aplicativo Mac (`.app`) independente na pasta de Aplicativos e no Dock, com janelas próprias e integração de notificações.

### B. Nó Dedicado Vox Populi no Mac (`127.0.0.1:3921`):
Para rodar o nó de infraestrutura comunitária em segundo plano no macOS:
```bash
bash tools/node-macos/install-node-macos.sh
```
O serviço é registrado no `launchd` (daemon nativo do macOS) e inicia automaticamente com o sistema, mantendo o relay em loopback e o cache local ativo.
