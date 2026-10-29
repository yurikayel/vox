# -*- mode: python ; coding: utf-8 -*-
import pathlib
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

root = pathlib.Path(SPECPATH).resolve().parents[1]

datas = [
    (str(root / "client"), "client"),
]
datas += collect_data_files("webview")

hiddenimports = [
    "clr",
    "clr_loader",
    "pythonnet",
]
hiddenimports += collect_submodules("webview")

a = Analysis(
    [str(root / "tools" / "desktop-seeder-windows" / "vox_desktop_app.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="VoxSeeder",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(root / "tools" / "desktop-seeder-windows" / "vox.ico"),
)
