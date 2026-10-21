$ErrorActionPreference = 'Stop'
$targetDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../deploy/secrets'))
$names = @('jwt_secret', 'vault_key', 'database_password', 'redis_password')
foreach ($secretName in $names) {
    if (Test-Path -LiteralPath (Join-Path $targetDirectory $secretName)) { throw 'Production secrets already exist. Refusing to overwrite them.' }
}
New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($secretName in $names) {
        $bytes = New-Object byte[] 48
        if ($secretName -eq 'vault_key') { $bytes = New-Object byte[] 32 }
        $generator.GetBytes($bytes)
        $value = if ($secretName -eq 'vault_key') { [Convert]::ToBase64String($bytes) } else { [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant() }
        [IO.File]::WriteAllText((Join-Path $targetDirectory $secretName), $value, (New-Object Text.UTF8Encoding $false))
    }
} finally { $generator.Dispose() }
if ($env:OS -eq 'Windows_NT') {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $targetDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict secret directory permissions.' }
}
Write-Output 'Production secrets created without displaying their values. Keep them outside Git and include them in encrypted backups.'
