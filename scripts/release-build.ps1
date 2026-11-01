param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

# Keep GitHub tokens out of tests and third-party build scripts.
[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', $null, 'Process')
[Environment]::SetEnvironmentVariable('GH_TOKEN', $null, 'Process')

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments)

    $application = Get-Command $Command -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $previousPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 can turn redirected native stderr into error records.
        # Progress on stderr is allowed; the exit code decides whether the step failed.
        $ErrorActionPreference = 'Continue'
        & $application.Source @Arguments
        $nativeExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($nativeExitCode -ne 0) {
        throw "$Command exited with code $nativeExitCode"
    }
}

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    Invoke-Native node -Arguments @('scripts/pet-bundle.mjs', '--check', '--expect-tag', "v$Version")
    Invoke-Native npm.cmd -Arguments @('test')
    Invoke-Native cargo -Arguments @('test', '--locked', '--manifest-path', 'pet/app/src-tauri/Cargo.toml')
    Invoke-Native cargo -Arguments @('install', 'cargo-about', '--version', '0.9.3', '--locked', '--features', 'cli')

    New-Item -ItemType Directory -Force dist | Out-Null
    Invoke-Native cargo -Arguments @('about', 'generate', '--format', 'json', '--locked', '--fail', '--manifest-path', 'pet/app/src-tauri/Cargo.toml', '--config', 'pet/app/src-tauri/about.toml', '--output-file', 'dist/pet-about.json')
    Invoke-Native node -Arguments @('scripts/pet-notices.mjs', '--about', 'dist/pet-about.json', '--out', 'pet/app/ui/notices/THIRD-PARTY-NOTICES.txt')
    Invoke-Native cargo -Arguments @('build', '--release', '--locked', '--manifest-path', 'pet/app/src-tauri/Cargo.toml')

    $releaseVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $versionInfo = (Get-Item pet/app/src-tauri/target/release/codex-delegate-pet.exe).VersionInfo
    if ($versionInfo.ProductVersion -ne $releaseVersion) {
        throw "Executable ProductVersion '$($versionInfo.ProductVersion)' does not match package version '$releaseVersion'"
    }
    if ($versionInfo.FileVersion -ne $releaseVersion) {
        throw "Executable FileVersion '$($versionInfo.FileVersion)' does not match package version '$releaseVersion'"
    }

    Invoke-Native node -Arguments @('scripts/pet-bundle.mjs', '--expect-tag', "v$Version", '--notices', 'pet/app/ui/notices/THIRD-PARTY-NOTICES.txt', '--out', 'dist')
}
finally {
    Pop-Location
}
