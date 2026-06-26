# Local Packaging Resources

This folder is for large binary resources used by local builds.

Expected layout after running `packaging\scripts\collect_resources.ps1`:

```text
resources\
  ffmpeg\
    bin\
      ffmpeg.exe
      ffprobe.exe
  insightface\
    models\
      buffalo_l\
        *.onnx
```

These resources are intentionally gitignored because FFmpeg binaries and InsightFace model packs are large and may have redistribution license requirements.
