param([string]$Path, [string]$Ready, [string]$Stop, [int]$Delay)
$ErrorActionPreference = 'Stop'
# Permit other readers/writers, but deliberately omit FileShare.Delete to
# reproduce a Windows handle that prevents unlinking or renaming the file.
$stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
try {
    [System.IO.File]::WriteAllText($Ready, '')
    while (-not [System.IO.File]::Exists($Stop)) { Start-Sleep -Milliseconds 10 }
    Start-Sleep -Milliseconds $Delay
} finally {
    $stream.Dispose()
}
