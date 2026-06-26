param(
    [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackagingDir = Split-Path -Parent $ScriptDir

if (-not $ExePath) {
    $ExePath = Join-Path $PackagingDir "dist\AI Video Sorter\AI Video Sorter.exe"
}

if (-not (Test-Path $ExePath)) {
    throw "Executable not found: $ExePath"
}

$Proc = Start-Process -FilePath $ExePath -PassThru -WindowStyle Hidden
try {
    $Deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 700
        try {
            $Resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/" -UseBasicParsing -TimeoutSec 2
            if ($Resp.StatusCode -eq 200) {
                Write-Host "Dashboard responded with HTTP 200."
                break
            }
        } catch {
        }
    } while ((Get-Date) -lt $Deadline)

    if ((Get-Date) -ge $Deadline) {
        throw "Packaged app did not respond on http://127.0.0.1:5000/ within 60 seconds."
    }

    $Config = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/config" -Method Get -TimeoutSec 5
    Write-Host "Config endpoint responded. Model pack: $($Config.model_pack)"

    $WatchParty = Invoke-WebRequest -Uri "http://127.0.0.1:5000/watch-party" -UseBasicParsing -TimeoutSec 5
    Write-Host "Watch Party route responded with HTTP $($WatchParty.StatusCode)."
} finally {
    if ($Proc -and -not $Proc.HasExited) {
        Stop-Process -Id $Proc.Id -Force
    }
}
