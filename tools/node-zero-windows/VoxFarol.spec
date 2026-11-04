# -*- mode: python ; coding: utf-8 -*-
import pathlib

root = pathlib.Path(SPECPATH).resolve().parents[1]
node_zero_tools = root / "tools" / "node-zero-windows"
icon_path = root / "tools" / "desktop-seeder-windows" / "vox.ico"

a = Analysis(
    [str(node_zero_tools / "tray_app.py")],
    pathex=[str(root), str(node_zero_tools)],
    binaries=[],
    datas=[(str(icon_path), ".")],
    hiddenimports=[
        "node_zero",
        "windows_host",
        "relay.inbox",
        "relay.mirror_validate",
        "relay.server",
    ],
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
    name="VoxFarol",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(icon_path),
    version=str(node_zero_tools / "version_info_farol.txt"),
)
