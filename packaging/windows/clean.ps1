$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackagingDir = Split-Path -Parent $ScriptDir

foreach ($Name in @("build", "dist", "output")) {
    $Path = Join-Path $PackagingDir $Name
    if (Test-Path $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
        Write-Host "Removed $Path"
    }
}
