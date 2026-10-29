# Steward Kit — Windows 1-Clique (.EXE)

Pacote autônomo para operadores comunitários e stewards: executa o servidor de relay local HTTP (`127.0.0.1:8787`) e abre o assistente de governança/rede do Vox.

---

## 🚀 Como Usar

Basta baixar e dar duplo clique em:
👉 **`dist/VoxStewardKit.exe`**

- **100% Standalone:** já inclui o código do relay Python e o cliente web estático embutidos no `.exe`.
- **Sem necessidade de instalar Python, venv ou dependências externas.**
- Abre automaticamente o navegador na tela de configuração do steward (`http://127.0.0.1:8080/#/settings/network/steward`).

---

## 🧪 Autoteste e Validação

Para validar o binário em terminal ou esteiras CI sem abrir o navegador:

```powershell
.\dist\VoxStewardKit.exe --check
```

Saída esperada:
```
--- [Autoteste Vox Steward Kit] ---
[OK] Relay healthcheck 200: {"status": "ok", "app": "vox-relay", "version": "0.2.1", ...}
[OK] Cliente estatico servido com sucesso
--- [Todos os autotestes do Steward Kit passaram!] ---
ExitCode: 0
```

---

## 🔨 Como Recompilar

```powershell
cd vox
.\tools\steward-kit-windows\build.ps1
```
