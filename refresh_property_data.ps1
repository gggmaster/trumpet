param(
    [string]$PythonPath = "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
    [string]$NodePath = "C:\Users\ll_ga\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $root
try {
    & $PythonPath .\fetch_property_indicators.py
    & $PythonPath .\export_powerbi_csv.py
    Push-Location .\property_data_app
    try {
        & $NodePath .\scripts\build-public-data.mjs
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
