# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — run: pyinstaller tools/steward-kit-windows/VoxStewardKit.spec
import pathlib

root = pathlib.Path(SPECPATH).resolve().parents[1]

a = Analysis(
    [str(root / "tools" / "steward-kit-windows" / "steward_launcher.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[
        (str(root / "relay"), "relay"),
        (str(root / "client"), "client"),
    ],
    hiddenimports=[
        "relay",
        "relay.server",
        "relay.inbox",
        "relay.mirror_validate",
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
    name="VoxStewardKit",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=str(root / "tools" / "steward-kit-windows" / "vox.ico"),
)
