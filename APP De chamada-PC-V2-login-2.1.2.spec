# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\Kristopher Cunha\\Desktop\\Chamada\\app_desktop_v2.py'],
    pathex=[],
    binaries=[('C:\\Program Files\\nodejs\\node.exe', '.')],
    datas=[('C:\\Users\\Kristopher Cunha\\Desktop\\Chamada\\assets', 'assets'), ('C:\\Users\\Kristopher Cunha\\Desktop\\Chamada\\v2', 'v2')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='APP De chamada-PC-V2-login-2.1.2',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['C:\\Users\\Kristopher Cunha\\Desktop\\Chamada\\assets\\app-icon.ico'],
)
