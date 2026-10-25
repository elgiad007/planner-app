[CmdletBinding()]
param(
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'
$releasePath = Join-Path $projectRoot 'release'
$archivePath = Join-Path $releasePath 'my-pastel-planner-phase1.zip'
$temporaryArchive = Join-Path $releasePath ('build-' + [guid]::NewGuid().ToString('N') + '.zip')

$timer = [System.Diagnostics.Stopwatch]::StartNew()
$succeeded = $false
$locationPushed = $false
$failureMessage = $null
try {
    Write-Host "`nMy Pastel Planner - Update release" -ForegroundColor Cyan
    Write-Host "Source: $projectRoot"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Push-Location -LiteralPath $projectRoot
    $locationPushed = $true
    Write-Host "`n[1/4] Building current source..." -ForegroundColor Cyan
    & pnpm build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed (exit $LASTEXITCODE). The previous release ZIP was preserved."
    }

    foreach ($requiredFile in @('index.html', 'sw.js', 'manifest.webmanifest', '.htaccess')) {
        if (-not (Test-Path -LiteralPath (Join-Path $distPath $requiredFile) -PathType Leaf)) {
            throw "Build output is missing $requiredFile. The previous release ZIP was preserved."
        }
    }

    Write-Host "`n[2/4] Packaging dist (including hidden files)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
    # ZipFile includes hidden files such as .htaccess and omits the dist wrapper folder.
    [System.IO.Compression.ZipFile]::CreateFromDirectory($distPath, $temporaryArchive)

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
                $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
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
