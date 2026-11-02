# Vox Populi Desktop — Windows 1-Clique (.EXE)

Aplicativo desktop WebView2 para usar o Vox no PC em uma janela independente. Ele pode servir os arquivos estáticos do cliente por loopback como fallback local. Não executa relay comunitário, descoberta de peers nem seeding WebTorrent.

---

## 🚀 Como Usar

Basta baixar e dar duplo clique em:
👉 **`dist/VoxPopuliDesktop.exe`**

- **Sem necessidade de emuladores ou WSA.**
- **Sem necessidade de ter Python ou Node.js instalados.**
- **Janela nativa fluida:** renderizada via Microsoft Edge WebView2 Evergreen nativo do Windows.
- **Fallback offline:** se a conexão com a nuvem falhar, o executável inicia automaticamente um micro-servidor HTTP local servindo o cliente estático embutido.

O executável desktop é um cliente. Para relay/cache local controlado pela bandeja, use o **VoxPopuli Node Zero — Community Node** (`tools/node-zero-windows`). O seeder WebTorrent continua não implementado.

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
.\tools\desktop-seeder-windows\build.ps1
```
