# Vox Desktop & P2P Seeder — Windows 1-Clique (.EXE)

Equivalente desktop nativo ao aplicativo Android (`vox-seeder.apk`), desenvolvido para que qualquer pessoa possa usar o Vox no PC em uma janela independente e colaborar diretamente com a rede semeando dados na malha WebRTC P2P (swarm).

---

## 🚀 Como Usar

Basta baixar e dar duplo clique em:
👉 **`dist/VoxSeeder.exe`**

- **Sem necessidade de emuladores ou WSA.**
- **Sem necessidade de ter Python ou Node.js instalados.**
- **Janela nativa fluida:** renderizada via Microsoft Edge WebView2 Evergreen nativo do Windows.
- **Fallback offline:** se a conexão com a nuvem falhar, o executável inicia automaticamente um micro-servidor HTTP local servindo o cliente estático embutido.

---

## 🧪 Autoteste e Validação

Para validar o binário em terminal ou esteiras CI sem abrir a interface gráfica:

```powershell
.\dist\VoxSeeder.exe --check
```

Saída esperada:
```
--- [Autoteste Vox Desktop Seeder] ---
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
