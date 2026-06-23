$ErrorActionPreference = "Stop"

$env:VITE_PUBLIC_APP = "true"

npm.cmd exec tsc -- -b --noCheck
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

npm.cmd exec vite -- build --base /trumpet/
exit $LASTEXITCODE
