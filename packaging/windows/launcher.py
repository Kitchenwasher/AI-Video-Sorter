import ctypes
import json
import os
import runpy
import shutil
import socket
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path


APP_DIR_NAME = "AI Video Sorter"
PORT = 5000
HOST = "127.0.0.1"
URL = f"http://{HOST}:{PORT}"


def _bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parents[1]


def _load_version(bundle_root: Path) -> dict:
    for candidate in (
        bundle_root / "version.json",
        Path(__file__).resolve().parent / "version.json",
        Path(__file__).resolve().parent / "packaging" / "windows" / "version.json",
    ):
        if candidate.exists():
            with candidate.open("r", encoding="utf-8") as fh:
                return json.load(fh)
    return {"app_name": APP_DIR_NAME, "app_version": "0.0.0"}


def _local_app_data() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if base:
        return Path(base) / APP_DIR_NAME
    return Path.home() / f".{APP_DIR_NAME.replace(' ', '').lower()}"


class TeeStream:
    def __init__(self, original, log_file):
        self.original = original
        self.log_file = log_file

    def write(self, data):
        try:
            self.log_file.write(data)
            self.log_file.flush()
        except Exception:
            pass
        try:
            if self.original:
                self.original.write(data)
                self.original.flush()
        except Exception:
            pass

    def flush(self):
        try:
            self.log_file.flush()
        except Exception:
            pass
        try:
            if self.original:
                self.original.flush()
        except Exception:
            pass


def _message_box(title: str, body: str) -> None:
    if os.name == "nt":
        try:
            ctypes.windll.user32.MessageBoxW(None, body, title, 0x00000010)
            return
        except Exception:
            pass
    print(f"{title}: {body}", file=sys.stderr)


def _is_port_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex((HOST, PORT)) == 0


def _can_bind_port() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((HOST, PORT))
            return True
        except OSError:
            return False


def _create_mutex():
    if os.name != "nt":
        return None, False
    mutex_name = "Local\\AIVideoSorterLauncher"
    handle = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    already_exists = ctypes.windll.kernel32.GetLastError() == 183
    return handle, already_exists


def _copy_tree_contents(src: Path, dst: Path) -> None:
    if not src.exists():
        return
    shutil.copytree(src, dst, dirs_exist_ok=True)


def _stage_runtime_app(bundle_root: Path, app_data: Path, version: dict) -> Path:
    source_root = bundle_root / "app_src"
    if not source_root.exists():
        source_root = Path(__file__).resolve().parents[2]

    runtime_root = app_data / "runtime" / "app"
    runtime_root.mkdir(parents=True, exist_ok=True)

    for filename in ("app.py", "config.py", "pipeline.py", "tasks.py", "verify_setup.py"):
        src = source_root / filename
        if src.exists():
            shutil.copy2(src, runtime_root / filename)

    for dirname in ("modules", "utils", "templates", "static"):
        _copy_tree_contents(source_root / dirname, runtime_root / dirname)

    for filename in ("README.md", "SYSTEM_DOCUMENTATION.md", "PRD.md", "SOUND_LICENSES.md"):
        src = source_root / filename
        if src.exists():
            shutil.copy2(src, runtime_root / filename)

    default_settings = bundle_root / "resources" / "defaults" / "settings.json"
    runtime_settings = runtime_root / "settings.json"
    if default_settings.exists() and not runtime_settings.exists():
        shutil.copy2(default_settings, runtime_settings)

    cloudflared = source_root / "cloudflared.exe"
    if cloudflared.exists():
        shutil.copy2(cloudflared, runtime_root / "cloudflared.exe")

    for dirname in ("input", "output", ".cache", ".temp_keyframes"):
        (runtime_root / dirname).mkdir(parents=True, exist_ok=True)

    metadata = {
        "app_version": version.get("app_version", "0.0.0"),
        "staged_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": str(source_root),
    }
    with (runtime_root / ".packaged_runtime.json").open("w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)

    return runtime_root


def _copy_models(bundle_root: Path, app_data: Path) -> Path:
    model_home = app_data / "models" / ".insightface"
    bundled = bundle_root / "resources" / "insightface"
    if bundled.exists():
        _copy_tree_contents(bundled, model_home)
    model_home.mkdir(parents=True, exist_ok=True)
    return model_home


def _patch_insightface_model_home(model_home: Path) -> None:
    original_expanduser = os.path.expanduser

    def expanduser(path):
        normalized = str(path).replace("\\", "/")
        if normalized == "~/.insightface":
            return str(model_home)
        if normalized.startswith("~/.insightface/"):
            suffix = normalized[len("~/.insightface/") :]
            return str(model_home / Path(suffix))
        return original_expanduser(path)

    os.path.expanduser = expanduser


def _configure_external_tools(bundle_root: Path) -> None:
    ffmpeg_bin = bundle_root / "resources" / "ffmpeg" / "bin"
    if ffmpeg_bin.exists():
        os.environ["PATH"] = str(ffmpeg_bin) + os.pathsep + os.environ.get("PATH", "")


def _open_browser_when_ready(log):
    deadline = time.time() + 45
    while time.time() < deadline:
        if _is_port_open():
            time.sleep(0.8)
            webbrowser.open(URL)
            print(f"Opened {URL}", file=log)
            return
        time.sleep(0.5)
    print(f"Server did not become ready within timeout: {URL}", file=log)


def _run_app(runtime_root: Path) -> None:
    if getattr(sys, "frozen", False):
        restart_target = str(Path(sys.executable).resolve())
        sys.argv = [restart_target, *sys.argv[1:]]
        if hasattr(sys, "orig_argv"):
            sys.orig_argv = [restart_target, *sys.argv[1:]]
    else:
        restart_target = str(Path(__file__).resolve())
        sys.argv = [restart_target, *sys.argv[1:]]
        if hasattr(sys, "orig_argv"):
            sys.orig_argv = [sys.executable, restart_target, *sys.argv[1:]]
    os.chdir(runtime_root)
    sys.path.insert(0, str(runtime_root))
    runpy.run_path(str(runtime_root / "app.py"), run_name="__main__")


def main() -> int:
    bundle_root = _bundle_root()
    version = _load_version(bundle_root)
    app_data = _local_app_data()
    logs_dir = app_data / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / f"launcher_{time.strftime('%Y%m%d_%H%M%S')}.log"

    with log_path.open("a", encoding="utf-8", errors="backslashreplace") as log_file:
        sys.stdout = TeeStream(sys.__stdout__, log_file)
        sys.stderr = TeeStream(sys.__stderr__, log_file)
        print(f"Starting {version.get('app_name', APP_DIR_NAME)} {version.get('app_version', '')}")
        print(f"Bundle root: {bundle_root}")
        print(f"App data: {app_data}")

        is_werkzeug_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
        mutex_handle, already_running = _create_mutex()
        if already_running and not is_werkzeug_child:
            if _is_port_open():
                webbrowser.open(URL)
                return 0
            _message_box(APP_DIR_NAME, "AI Video Sorter is already starting. Please wait a moment and try again.")
            return 1

        if not _can_bind_port():
            if _is_port_open():
                webbrowser.open(URL)
                return 0
            _message_box(APP_DIR_NAME, f"Port {PORT} is already in use. Close the other app using {HOST}:{PORT}, then launch AI Video Sorter again.")
            return 1

        try:
            _configure_external_tools(bundle_root)
            runtime_root = _stage_runtime_app(bundle_root, app_data, version)
            model_home = _copy_models(bundle_root, app_data)
            _patch_insightface_model_home(model_home)
            os.environ.setdefault("AI_VIDEO_SORTER_APPDATA", str(app_data))
            os.environ.setdefault("AI_VIDEO_SORTER_LOG_DIR", str(logs_dir))
            os.environ.setdefault("DATABASE_URL", f"sqlite:///{(runtime_root / '.cache' / 'face_embeddings_cache.db').as_posix()}")

            if not is_werkzeug_child:
                browser_thread = threading.Thread(target=_open_browser_when_ready, args=(log_file,), daemon=True)
                browser_thread.start()
            _run_app(runtime_root)
            return 0
        except Exception:
            traceback.print_exc()
            _message_box(APP_DIR_NAME, f"AI Video Sorter failed to start. Logs are saved in:\n{logs_dir}")
            return 1
        finally:
            if os.name == "nt" and mutex_handle:
                try:
                    ctypes.windll.kernel32.CloseHandle(mutex_handle)
                except Exception:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
