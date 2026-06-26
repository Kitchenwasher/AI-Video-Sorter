param(
    [switch]$SkipResourceCollection,
    [switch]$SkipInstaller,
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackagingDir = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $PackagingDir
$SpecPath = Join-Path $ScriptDir "ai_video_sorter.spec"
$DistDir = Join-Path $PackagingDir "dist"
$BuildDir = Join-Path $PackagingDir "build"
$OutputDir = Join-Path $PackagingDir "output"
$InstallerScript = Join-Path $ScriptDir "installer.iss"
$VersionPath = Join-Path $ScriptDir "version.json"

Set-Location $RepoRoot

$VersionInfo = Get-Content -Raw $VersionPath | ConvertFrom-Json

if (-not $SkipResourceCollection) {
    & (Join-Path $PackagingDir "scripts\collect_resources.ps1")
}

& $Python -m PyInstaller --version *> $null
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller is not installed. Run: $Python -m pip install pyinstaller"
}

New-Item -ItemType Directory -Force -Path $DistDir, $BuildDir, $OutputDir | Out-Null

& $Python -m PyInstaller `
    --clean `
    --noconfirm `
    --distpath $DistDir `
    --workpath $BuildDir `
    $SpecPath

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed."
}

$ExePath = Join-Path $DistDir "AI Video Sorter\AI Video Sorter.exe"
if (-not (Test-Path $ExePath)) {
    throw "Expected executable was not created: $ExePath"
}

Write-Host "Built app folder: $($ExePath | Split-Path -Parent)"

if (-not $SkipInstaller) {
    $Iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if (-not $Iscc) {
        $Common = @(
            "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
            "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
            "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
        )
        foreach ($Candidate in $Common) {
            if (Test-Path $Candidate) {
                $Iscc = Get-Item $Candidate
                break
            }
        }
    }

    if ($Iscc) {
        Push-Location $ScriptDir
        try {
            & $Iscc.Source `
                "/DAppName=$($VersionInfo.app_name)" `
                "/DAppPublisher=$($VersionInfo.publisher)" `
                "/DAppVersion=$($VersionInfo.app_version)" `
                "/DAppId=$($VersionInfo.app_id)" `
                $InstallerScript
            if ($LASTEXITCODE -ne 0) {
                throw "Inno Setup compiler failed."
            }
        } finally {
            Pop-Location
        }
        Write-Host "Installer output: $OutputDir"
    } else {
        Write-Warning "Inno Setup was not found. App folder built, installer skipped."
    }
}
