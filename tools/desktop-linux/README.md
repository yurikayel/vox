# Vox Desktop — Cliente Nativo Ultraleve para Linux

Cliente leve para computadores rodando GNU/Linux (Ubuntu, Debian, Fedora, Arch, Raspberry Pi OS).

---

## ⚡ Como Funciona

- **Ultraleve:** o script/binário consome menos de **30 KiB** no disco.
- **Motor WebKitGTK / Modo App:** renderiza via WebKit2GTK do sistema ou navegação em modo app sem barras de endereço.
- **Integração com o Nó Dedicado:** ao abrir o cliente, ele detecta se o serviço `vox-populi` está rodando em segundo plano e dispara o sinal de **Boost** automático via loopback (`127.0.0.1:3921/3922`).
- **Menu de Aplicativos:** integra-se diretamente ao GNOME, KDE Plasma, XFCE e demais ambientes através de `vox.desktop`.

---

## 🚀 Instalação Rápida (1 Comando)

No terminal Linux, a partir da raiz de `vox`:

```bash
bash tools/desktop-linux/install-client.sh
```

Depois de instalado, abra pelo menu do sistema ou digite:
```bash
vox
```

---

## 🧪 Autoteste e Validação

```bash
python3 tools/desktop-linux/vox.py --check
```

---

## 📦 Compilação C Opcional (ELF ~25 KiB)

Se desejar gerar o binário compilado nativo em C com WebKit2GTK:

```bash
sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev
gcc -O2 tools/desktop-linux/vox.c -o vox $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.0)
```
