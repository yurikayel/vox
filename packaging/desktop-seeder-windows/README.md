# Vox Desktop — Windows 1-Clique (.EXE)

Aplicativo desktop WebView2 para usar o Vox no PC em uma janela independente, com servidor HTTP local de fallback e **notificação na bandeja do sistema (system tray) do nó dedicado Vox Populi em execução em segundo plano**.

---

## 🚀 Como Usar

Basta baixar e dar duplo clique em:
👉 **`dist/Vox.exe`** *(ou `dist/VoxPopuliDesktop.exe`)*

- **Sem necessidade de emuladores ou WSA.**
- **Sem necessidade de ter Python ou Node.js instalados.**
- **Janela nativa fluida:** renderizada via Microsoft Edge WebView2 Evergreen nativo do Windows.
- **Notificação e Integração na Bandeja (*System Tray*):** ao abrir o cliente, o aplicativo verifica ou inicia o nó dedicado Vox Populi em segundo plano e emite uma notificação nativa na bandeja informando que o nó comunitário está ativo (`127.0.0.1:3921`) com **boost** automático.
- **Menu da Bandeja:** permite consultar o status do nó, pausar/retomar a contribuição, restaurar a janela e fechar o aplicativo.
- **Fallback offline:** se a conexão com a nuvem falhar, o executável inicia automaticamente um micro-servidor HTTP local servindo o cliente estático embutido.

---

## 📦 Executável Dedicado do Nó (Sem o Client)

Se o objetivo for **somente executar o nó de infraestrutura comunitária sem abrir a interface de usuário do cliente**, utilize o executável dedicado:
👉 **`dist/VoxPopuli.exe`** em [`packaging/node-zero-windows`](../node-zero-windows/README.md).

---

## 🧪 Autoteste e Validação

Para validar o binário em terminal ou esteiras CI sem abrir a interface gráfica:

```powershell
.\dist\VoxPopuliDesktop.exe --check
```

Saída esperada:
```
--- [Autoteste Vox Populi Desktop] ---
[OK] Servidor local ativo na porta 18085
[OK] Resposta HTTP 200 recebida (3245 bytes)
[OK] Bridge JavaScript <-> Python validada com sucesso
[OK] Servidor local encerrado com sucesso
--- [Todos os autotestes do executavel passaram!] ---
ExitCode: 0
```

---

## 🔨 Como Recompilar

```powershell
cd vox
.\packaging\desktop-seeder-windows\build.ps1
```
