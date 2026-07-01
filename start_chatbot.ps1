$ErrorActionPreference = "Stop"
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

Set-Location $AppDir

if (-not (Test-Path "$AppDir\investment_index.db")) {
    & $Python "$AppDir\indexer.py" --skip-pdf
}

Write-Host "Opening Investment File Assistant at http://127.0.0.1:8765"
Start-Process "http://127.0.0.1:8765"
& $Python "$AppDir\server.py"
