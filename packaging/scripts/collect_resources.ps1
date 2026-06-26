param(
    [string]$ModelPack = "buffalo_l",
    [string]$InsightFaceHome = "$env:USERPROFILE\.insightface",
    [string]$FfmpegBinDir = "",
    [switch]$SkipModels,
    [switch]$SkipFfmpeg
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackagingDir = Split-Path -Parent $ScriptDir
$ResourcesDir = Join-Path $PackagingDir "resources"

New-Item -ItemType Directory -Force -Path $ResourcesDir | Out-Null

if (-not $SkipFfmpeg) {
    if (-not $FfmpegBinDir) {
        $Ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
        if ($Ffmpeg) {
            $FfmpegBinDir = Split-Path -Parent $Ffmpeg.Source
        }
    }

    if ($FfmpegBinDir -and (Test-Path (Join-Path $FfmpegBinDir "ffmpeg.exe")) -and (Test-Path (Join-Path $FfmpegBinDir "ffprobe.exe"))) {
        $Dest = Join-Path $ResourcesDir "ffmpeg\bin"
        New-Item -ItemType Directory -Force -Path $Dest | Out-Null
        Copy-Item -LiteralPath (Join-Path $FfmpegBinDir "ffmpeg.exe") -Destination $Dest -Force
        Copy-Item -LiteralPath (Join-Path $FfmpegBinDir "ffprobe.exe") -Destination $Dest -Force
        Write-Host "Copied FFmpeg tools from $FfmpegBinDir"
    } else {
        Write-Warning "FFmpeg/FFprobe were not found. Install FFmpeg or pass -FfmpegBinDir."
    }
}

if (-not $SkipModels) {
    $SourceModelDir = Join-Path $InsightFaceHome "models\$ModelPack"
    if (Test-Path $SourceModelDir) {
        $DestModelDir = Join-Path $ResourcesDir "insightface\models\$ModelPack"
        New-Item -ItemType Directory -Force -Path $DestModelDir | Out-Null
        Copy-Item -Path (Join-Path $SourceModelDir "*") -Destination $DestModelDir -Recurse -Force
        Write-Host "Copied InsightFace model pack '$ModelPack' from $SourceModelDir"
    } else {
        Write-Warning "InsightFace model pack was not found: $SourceModelDir"
        Write-Warning "Run the app once in a dev environment to download models, or provide -InsightFaceHome."
    }
}

$Cloudflared = Join-Path (Split-Path -Parent $PackagingDir) "cloudflared.exe"
if (Test-Path $Cloudflared) {
    Copy-Item -LiteralPath $Cloudflared -Destination (Join-Path $ResourcesDir "cloudflared.exe") -Force
    Write-Host "Copied cloudflared.exe"
}
