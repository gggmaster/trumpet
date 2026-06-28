$ErrorActionPreference = "Stop"

$env:VITE_API_APP = "true"
if (-not $env:VITE_PROPERTY_API_BASE_URL) {
    $env:VITE_PROPERTY_API_BASE_URL = "/api"
}

npm.cmd exec tsc -- -b --noCheck
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

npm.cmd exec vite -- build --base /trumpet/
exit $LASTEXITCODE
