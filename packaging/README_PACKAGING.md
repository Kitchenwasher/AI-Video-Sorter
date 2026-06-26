# AI Video Sorter Windows Packaging

This packaging layer turns the existing Flask app into a Windows desktop app without changing the core app code.

## Approach

The Windows build uses:

- PyInstaller one-folder build for the Python runtime and dependencies.
- A small launcher executable that copies the unchanged app source into `%LOCALAPPDATA%\AI Video Sorter\runtime\app` and runs it there.
- Bundled FFmpeg/FFprobe under `resources\ffmpeg\bin`, placed at the front of `PATH` before the app starts.
- Bundled InsightFace models under `resources\insightface\models\<model_pack>`, copied into the app data model cache on first launch.
- Inno Setup installer for shortcuts, uninstall support, versioned output, and optional desktop icon.

The launcher runs the real app from a writable app data directory because the current app intentionally writes `settings.json`, `.cache`, `.temp_keyframes`, `input`, and `output` next to `app.py`. This keeps that behavior intact while avoiding writes to Program Files or the packaged executable directory.

## Prerequisites

Install these on the build machine:

1. Python 3.11 or 3.12 for the most predictable PyInstaller/dependency support.
2. Inno Setup 6 if you want to produce the installer.
3. The repo dependencies from `requirements.txt`.
4. FFmpeg and FFprobe available on `PATH`, or pass their paths to the resource collection script.
5. InsightFace model files already downloaded in `%USERPROFILE%\.insightface\models\buffalo_l`, or pass a model cache path.

## Build Steps

From the repo root:

```powershell
.\packaging\scripts\collect_resources.ps1
.\packaging\windows\build.ps1
```

The PyInstaller output appears in:

```text
packaging\dist\AI Video Sorter\
```

If Inno Setup is installed, the installer appears in:

```text
packaging\output\AI_Video_Sorter_Setup_1.0.0.exe
```

## Testing The App Folder

Run:

```powershell
.\packaging\dist\"AI Video Sorter"\"AI Video Sorter.exe"
```

Expected behavior:

- The launcher prevents duplicate instances.
- `http://127.0.0.1:5000` opens in the default browser.
- Runtime state is created under `%LOCALAPPDATA%\AI Video Sorter`.
- Logs are written under `%LOCALAPPDATA%\AI Video Sorter\logs`.
- FFmpeg is resolved from the bundled `resources\ffmpeg\bin` folder.
- InsightFace uses the bundled/copied model cache under `%LOCALAPPDATA%\AI Video Sorter\models\.insightface`.

## Testing The Installer

1. Run the setup executable from `packaging\output`.
2. Keep or disable the desktop shortcut option.
3. Launch from Start Menu or Desktop.
4. Confirm the dashboard loads.
5. Open Watch Party from the app UI.
6. Save settings and confirm `%LOCALAPPDATA%\AI Video Sorter\runtime\app\settings.json` updates.
7. Run a small face-detection job and confirm the model load does not download from the internet.
8. Uninstall from Windows Settings or the Start Menu uninstaller.

The uninstaller removes the installed program files. It intentionally does not delete `%LOCALAPPDATA%\AI Video Sorter` so user settings, cache, and logs survive uninstall/reinstall.

## Updating Version

Update `packaging\windows\version.json`:

```json
{
  "app_name": "AI Video Sorter",
  "app_version": "1.0.0"
}
```

The build script passes this version into PyInstaller and the Inno Setup script reads it.

## Updating Models

The app currently uses `buffalo_l` by default. To refresh bundled models:

```powershell
.\packaging\scripts\collect_resources.ps1 -ModelPack buffalo_l
```

This copies from:

```text
%USERPROFILE%\.insightface\models\buffalo_l
```

to:

```text
packaging\resources\insightface\models\buffalo_l
```

Large model files are gitignored. Keep them as local build resources or attach them to release artifacts; do not commit them unless you intentionally want the repository to carry hundreds of megabytes of model binaries.

## Updating FFmpeg

Run:

```powershell
.\packaging\scripts\collect_resources.ps1 -FfmpegBinDir "C:\path\to\ffmpeg\bin"
```

The script copies `ffmpeg.exe` and `ffprobe.exe` into:

```text
packaging\resources\ffmpeg\bin
```

Review the FFmpeg build license before distributing the installer. Some builds are GPL; that may be fine for your use, but it affects redistribution obligations.

## Known Limitations

- The unchanged app binds to `127.0.0.1:5000`. The launcher detects conflicts and gives a friendly error, but changing ports would require app-code changes.
- The unchanged app starts Flask/Socket.IO with Werkzeug debug mode. The launcher works with it, but a production server swap would require touching core startup code.
- InsightFace model licensing must be verified before public redistribution. The packaging supports offline bundling, but legal distribution depends on the model sources and licenses.
- Installer creation requires Inno Setup. If `ISCC.exe` is not installed, `build.ps1` still creates the PyInstaller app folder.
