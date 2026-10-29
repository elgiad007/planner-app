[CmdletBinding()]
param(
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'
$releasePath = Join-Path $projectRoot 'release'
$archivePath = $null
$temporaryArchive = Join-Path $releasePath ('build-' + [guid]::NewGuid().ToString('N') + '.zip')

$timer = [System.Diagnostics.Stopwatch]::StartNew()
$succeeded = $false
$locationPushed = $false
$failureMessage = $null
$originalPath = $env:Path
try {
    $package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
    $version = [string]$package.version
    if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
        throw 'package.json must contain a valid release version for the ZIP filename.'
    }
    $archivePath = Join-Path $releasePath "my-pastel-planner-v$version.zip"
    Write-Host "`nMy Pastel Planner - Update release" -ForegroundColor Cyan
    Write-Host "Source: $projectRoot"
    Write-Host "`nLocating Node.js and pnpm..." -ForegroundColor Cyan
    $bundledDependencies = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
    # Resolve both tools before changing PATH, so installed tools take priority.
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $pnpmCommand = Get-Command pnpm.cmd,pnpm.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $bundledDependencies 'node\bin\node.exe' }
    $pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else { Join-Path $bundledDependencies 'bin\fallback\pnpm.cmd' }
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
        throw 'Node.js was not found on PATH or in the Codex bundled runtime. Install Node.js LTS, reopen the launcher, and try again.'
    }
    if (-not (Test-Path -LiteralPath $pnpmPath -PathType Leaf)) {
        throw 'pnpm was not found on PATH or in the Codex bundled runtime. Install pnpm, reopen the launcher, and try again.'
    }
    # Child build commands also need node on PATH. This change lasts only for this run.
    $env:Path = (Split-Path -Parent $nodePath) + ';' + (Split-Path -Parent $pnpmPath) + ';' + $originalPath
    Write-Host "Node.js: $nodePath"
    Write-Host "pnpm:    $pnpmPath"
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules') -PathType Container)) {
        throw 'Dependencies are missing. Run pnpm install --frozen-lockfile in the project folder before updating the release.'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Push-Location -LiteralPath $projectRoot
    $locationPushed = $true
    Write-Host "`n[1/4] Building current source..." -ForegroundColor Cyan
    & $pnpmPath build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed (exit $LASTEXITCODE). The previous release ZIP was preserved."
    }

    foreach ($requiredFile in @('index.html', 'sw.js', 'manifest.webmanifest', '.htaccess', 'LICENSE.txt', 'COPYRIGHT.txt', 'source.tar.gz', 'third-party-notices.txt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $distPath $requiredFile) -PathType Leaf)) {
            throw "Build output is missing $requiredFile. The previous release ZIP was preserved."
        }
    }

    Write-Host "`n[2/4] Packaging dist (including hidden files)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
    # ZipFile includes hidden files such as .htaccess and omits the dist wrapper folder.
    [System.IO.Compression.ZipFile]::CreateFromDirectory($distPath, $temporaryArchive)
    # Windows PowerShell's .NET Framework can use backslashes in ZIP entry names.
    $normalizedArchive = [System.IO.Compression.ZipFile]::Open($temporaryArchive, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($entry in @($normalizedArchive.Entries)) {
            if ($entry.FullName.Contains('\')) {
                $replacement = $normalizedArchive.CreateEntry($entry.FullName.Replace('\', '/'))
                $inputStream = $entry.Open()
                $outputStream = $replacement.Open()
                try { $inputStream.CopyTo($outputStream) }
                finally {
                    $outputStream.Dispose()
                    $inputStream.Dispose()
                }
                $entry.Delete()
            }
        }
    }
    finally { $normalizedArchive.Dispose() }

    Write-Host "`n[3/4] Verifying ZIP file counts and SHA-256 hashes..." -ForegroundColor Cyan
    $archive = [System.IO.Compression.ZipFile]::OpenRead($temporaryArchive)
    try {
        $files = @(Get-ChildItem -LiteralPath $distPath -File -Recurse -Force)
        $entries = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
        if ($entries.Count -ne $files.Count) {
            throw 'Release ZIP file count does not match dist.'
        }
        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($distPath.Length + 1).Replace('\', '/')
            $entry = $archive.GetEntry($relativePath)
            if ($null -eq $entry -or $entry.Length -ne $file.Length) {
                throw "Release ZIP is missing or has an incorrect size for $relativePath."
            }
            $stream = $entry.Open()
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try {
                $zipHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
                $sourceStream = [System.IO.File]::OpenRead($file.FullName)
                try {
                    $sourceHash = [BitConverter]::ToString($sha.ComputeHash($sourceStream)).Replace('-', '')
                }
                finally {
                    $sourceStream.Dispose()
                }
                if ($zipHash -ne $sourceHash) {
                    throw "Release ZIP content does not match dist: $relativePath."
                }
                Write-Host "  Verified: $relativePath"
            }
            finally {
                $sha.Dispose()
                $stream.Dispose()
            }
        }
    }
    finally {
        $archive.Dispose()
    }

    Write-Host "`n[4/4] Saving verified release ZIP..." -ForegroundColor Cyan
    Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
    $archiveSize = (Get-Item -LiteralPath $archivePath).Length
    $succeeded = $true
}
catch {
    $failureMessage = $_.Exception.Message
}
finally {
    $env:Path = $originalPath
    try {
        if (Test-Path -LiteralPath $temporaryArchive) {
            Remove-Item -LiteralPath $temporaryArchive
        }
    }
    catch {
        Write-Host "Could not remove temporary ZIP: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    if ($locationPushed) { Pop-Location }
    $timer.Stop()
    Write-Host "`n---------------- Results ----------------"
    if ($succeeded) {
        Write-Host 'SUCCESS - dist and release updated.' -ForegroundColor Green
        Write-Host "Verified files: $($files.Count)"
        Write-Host ('ZIP size: {0:N0} bytes ({1:N1} KB)' -f $archiveSize, ($archiveSize / 1KB))
    }
    else {
        Write-Host 'FAILED - release update did not finish.' -ForegroundColor Red
        Write-Host $failureMessage -ForegroundColor Red
        Write-Host 'The previous release ZIP was preserved. dist may contain partial build output.'
    }
    Write-Host "Build folder: $distPath"
    Write-Host "Release ZIP:  $archivePath"
    Write-Host ('Elapsed: {0:N1} seconds' -f $timer.Elapsed.TotalSeconds)
    if (-not $NoPause) {
        Write-Host ''
        Read-Host 'Press Enter to exit' | Out-Null
    }
}
if (-not $succeeded) { exit 1 }
