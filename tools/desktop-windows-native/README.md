# Vox Desktop — Executável Nativo Ultraleve Windows (.NET 4.8 / WebView2)

Executável nativo standalone em arquivo único para Windows, compilado diretamente pelo compilador embutido no sistema operacional (`csc.exe` do .NET Framework 4.8).

---

## ⚡ Vantagens em Relação ao Pacote Legado (PyInstaller)

| Métrica | Executável PyInstaller (Legado) | Executável Nativo (.NET 4.8) | Ganho |
|:---|:---:|:---:|:---:|
| **Tamanho do Arquivo Único** | ~24.500 KiB (24,5 MB) | **967 KiB (< 1 MB)** | **-96% menor** |
| **Tempo de Inicialização** | ~1,5 a 2,5 segundos | **< 0,1 segundo** | **Instantâneo** |
| **Consumo de Memória RAM** | ~90 MB a 140 MB | **~20 MB a 35 MB** | **-75% de RAM** |
| **Dependências Externas** | Interpretador Python embutido | **Nenhuma** (nativo do Windows 10/11) | **Zero dependências** |

---

## 🚀 Como Usar

Basta baixar e dar duplo clique em:
👉 **`dist/Vox.exe`** *(ou em `D:\Downloads\Vox.exe`)*

- **Janela nativa fluida:** renderizada via Microsoft Edge WebView2 Evergreen nativo do Windows.
- **Integração na Bandeja (*System Tray*):** ao abrir o cliente, o aplicativo verifica ou inicia o nó dedicado **Vox Populi** em segundo plano e emite uma notificação nativa na bandeja informando que o nó comunitário está ativo (`127.0.0.1:3921`) com **boost** automático via cache local.
- **Menu da Bandeja:** permite consultar o status do nó, pausar/retomar a contribuição, restaurar a janela e fechar o aplicativo.

---

## 🧪 Autoteste e Validação

Para validar o binário em terminal ou esteiras CI sem abrir a interface gráfica:

```powershell
.\dist\Vox.exe --check
```

Saída esperada:
```
--- [Autoteste Vox Desktop (Nativo C# / .NET 4.8)] ---
[OK] Runtime .NET Framework 4.8 ativo
[OK] Sondagem de portas de Nó Dedicado (3921=False, 3922=False)
[OK] Motor WebView2 e classes de inicialização validados
--- [Todos os autotestes do executável nativo passaram!] ---
ExitCode: 0
```

---

## 🔨 Como Recompilar

Não é necessário instalar Visual Studio ou SDKs externos; o script utiliza o compilador oficial embutido no Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\desktop-windows-native\build.ps1
```
