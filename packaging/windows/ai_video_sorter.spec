# -*- mode: python ; coding: utf-8 -*-

import json
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, copy_metadata


WINDOWS_DIR = Path(SPECPATH)
ROOT = WINDOWS_DIR.parent
REPO_ROOT = ROOT.parent
RESOURCES_DIR = ROOT / "resources"

version = json.loads((WINDOWS_DIR / "version.json").read_text(encoding="utf-8"))
app_name = version.get("app_name", "AI Video Sorter")


def existing_datas(items):
    return [(str(src), dest) for src, dest in items if Path(src).exists()]


datas = existing_datas([
    (WINDOWS_DIR / "version.json", "."),
    (RESOURCES_DIR / "README.md", "resources"),
    (RESOURCES_DIR / "defaults", "resources/defaults"),
    (RESOURCES_DIR / "ffmpeg", "resources/ffmpeg"),
    (RESOURCES_DIR / "insightface", "resources/insightface"),
    (RESOURCES_DIR / "cloudflared.exe", "app_src"),
    (REPO_ROOT / "app.py", "app_src"),
    (REPO_ROOT / "config.py", "app_src"),
    (REPO_ROOT / "pipeline.py", "app_src"),
    (REPO_ROOT / "tasks.py", "app_src"),
    (REPO_ROOT / "verify_setup.py", "app_src"),
    (REPO_ROOT / "README.md", "app_src"),
    (REPO_ROOT / "SYSTEM_DOCUMENTATION.md", "app_src"),
    (REPO_ROOT / "PRD.md", "app_src"),
    (REPO_ROOT / "SOUND_LICENSES.md", "app_src"),
    (REPO_ROOT / "cloudflared.exe", "app_src"),
    (REPO_ROOT / "modules", "app_src/modules"),
    (REPO_ROOT / "utils", "app_src/utils"),
    (REPO_ROOT / "templates", "app_src/templates"),
    (REPO_ROOT / "static", "app_src/static"),
])

hiddenimports = [
    "app",
    "config",
    "pipeline",
    "tasks",
    "modules.clustering",
    "modules.duplicate_detector",
    "modules.face_analyzer",
    "modules.keyframe_extractor",
    "modules.name_resolver",
    "modules.profile_manager",
    "modules.scanner",
    "modules.screen_time",
    "modules.sorter",
    "utils.cache",
    "utils.logger",
    "utils.models",
    "utils.turn_server",
    "bs4",
    "engineio.async_drivers.threading",
    "flask_socketio",
    "onnxruntime",
    "onnxruntime.capi.onnxruntime_pybind11_state",
    "sklearn.cluster",
    "sklearn.metrics",
    "sklearn.neighbors",
    "sqlalchemy.dialects.sqlite",
]

binaries = []

for package in ("flask", "flask_socketio", "flask_sqlalchemy", "sqlalchemy", "jinja2", "werkzeug", "socketio", "engineio"):
    try:
        datas += collect_data_files(package)
        datas += copy_metadata(package)
    except Exception:
        pass

try:
    binaries += collect_dynamic_libs("onnxruntime")
except Exception:
    pass

for package in ("cv2", "insightface", "onnxruntime", "sklearn", "numpy", "scipy"):
    try:
        datas += copy_metadata(package)
    except Exception:
        pass


a = Analysis(
    [str(WINDOWS_DIR / "launcher.py")],
    pathex=[str(REPO_ROOT), str(WINDOWS_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=sorted(set(hiddenimports)),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["matplotlib", "notebook", "IPython"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=app_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(RESOURCES_DIR / "icons" / "app.ico") if (RESOURCES_DIR / "icons" / "app.ico").exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name=app_name,
)
