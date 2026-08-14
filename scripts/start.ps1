[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "src\backend"
$frontendDir = Join-Path $root "src\frontend"
$envFile = Join-Path $root ".env"

function Import-AppEnvironment {
    if (-not (Test-Path $envFile)) {
        return
    }

    foreach ($line in Get-Content $envFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }

        $key, $value = $trimmed.Split("=", 2)
        $key = $key.Trim()
        if ($key -notin @("NEIS_API_KEY", "NEIS_BASE_URL")) {
            continue
        }
        if ([Environment]::GetEnvironmentVariable($key, "Process")) {
            continue
        }

        $value = $value.Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

Import-AppEnvironment

if (-not $env:NEIS_API_KEY -or $env:NEIS_API_KEY -eq "replace-with-your-neis-api-key") {
    throw "Set NEIS_API_KEY in .env before starting the app."
}

$python = $null
foreach ($name in @("python3", "python")) {
    $candidate = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $candidate) {
        continue
    }

    & $candidate.Source -c "import sys; raise SystemExit(sys.version_info < (3, 11))" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $python = $candidate
        break
    }
}
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue

if (-not $python) {
    throw "Python 3.11 or newer is required."
}
if (-not $node -or -not $npm) {
    throw "Node.js 24 and npm are required."
}

& $python.Source -c "import fastapi, httpx, pydantic_settings, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing backend dependencies..."
    & $python.Source -m pip install -e $backendDir
    if ($LASTEXITCODE -ne 0) {
        throw "Backend dependency installation failed."
    }
}

$viteEntry = Join-Path $frontendDir "node_modules\vite\bin\vite.js"
if (-not (Test-Path $viteEntry)) {
    Write-Host "Installing frontend dependencies..."
    & $npm.Source ci --prefix $frontendDir
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend dependency installation failed."
    }
}

Write-Host "Starting API at http://127.0.0.1:8000"
$backend = Start-Process -FilePath $python.Source -ArgumentList @(
    "-m", "uvicorn", "app.main:app",
    "--app-dir", $backendDir,
    "--host", "127.0.0.1",
    "--port", "8000"
) -NoNewWindow -PassThru

Write-Host "Starting app at http://127.0.0.1:5173"
$frontend = Start-Process -FilePath $node.Source -ArgumentList @(
    $viteEntry,
    $frontendDir,
    "--host", "127.0.0.1",
    "--port", "5173"
) -NoNewWindow -PassThru

try {
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Milliseconds 500
        $backend.Refresh()
        $frontend.Refresh()
    }

    if ($backend.HasExited) {
        throw "The backend process exited with code $($backend.ExitCode)."
    }
    throw "The frontend process exited with code $($frontend.ExitCode)."
}
finally {
    foreach ($process in @($frontend, $backend)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id
            $process.WaitForExit()
        }
    }
}
