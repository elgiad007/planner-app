[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 5173,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalPath = $env:Path
$locationPushed = $false
$serverExitCode = 1

try {
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
        Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
        throw 'Node.js was not found on PATH or in the Codex bundled runtime. Install Node.js LTS and try again.'
    }
    $vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $vitePath -PathType Leaf)) {
        throw 'Dependencies are missing. Run pnpm install --frozen-lockfile in the project folder and try again.'
    }
    $env:Path = (Split-Path -Parent $nodePath) + ';' + $originalPath
    Push-Location -LiteralPath $projectRoot
    $locationPushed = $true
    Write-Host "`nMy Pastel Planner - Local test server" -ForegroundColor Cyan
    Write-Host "Source: $projectRoot"
    Write-Host "Node.js: $nodePath"
    Write-Host "Open: http://127.0.0.1:$Port"
    Write-Host 'Edits refresh automatically. Keep this window open; press Ctrl+C to stop.'
    Write-Host 'Local planner data is separate from the live site. Nothing is uploaded.'
    $viteArguments = @($vitePath, '--host', '127.0.0.1', '--port', [string]$Port, '--strictPort')
    if (-not $NoOpen) { $viteArguments += '--open' }
    & $nodePath @viteArguments
    $serverExitCode = $LASTEXITCODE
    if ($serverExitCode -ne 0) {
        Write-Host "Server failed (exit $serverExitCode). If the port is busy, close the other server or use -Port 5174." -ForegroundColor Red
    }
}
catch {
    Write-Host "Test server failed: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    $env:Path = $originalPath
    if ($locationPushed) { Pop-Location }
}
exit $serverExitCode
