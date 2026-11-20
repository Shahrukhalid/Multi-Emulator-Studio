# Protected Windows candidate build. Run only on a dedicated ephemeral signing runner.
$ErrorActionPreference = 'Stop'
if (-not $env:WINDOWS_CERTIFICATE -or -not $env:WINDOWS_CERTIFICATE_PASSWORD -or -not $env:WINDOWS_SIGNING_THUMBPRINT) { throw 'Windows signing credentials are not configured' }
$thumbprint = $env:WINDOWS_SIGNING_THUMBPRINT.ToUpperInvariant().Replace(' ', '')
if ($thumbprint -notmatch '^[A-F0-9]{40}$') { throw 'Invalid expected certificate thumbprint' }
$storePath = "Cert:\CurrentUser\My\$thumbprint"
if (Test-Path $storePath) { throw 'Expected certificate is already present; use a fresh signing runner' }
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ('mes-sign-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$pfx = Join-Path $temp 'signing.pfx'
$config = Join-Path $temp 'tauri.sign.json'
try {
  [System.IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
  $password = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
  Import-PfxCertificate -FilePath $pfx -CertStoreLocation 'Cert:\CurrentUser\My' -Password $password | Out-Null
  $certificate = Get-Item $storePath
  if (-not $certificate.HasPrivateKey) { throw 'Expected certificate private key unavailable' }
  @{ bundle = @{ windows = @{ certificateThumbprint = $thumbprint; digestAlgorithm = 'sha256'; timestampUrl = 'https://timestamp.digicert.com'; tsp = $true } } } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $config
  cargo tauri build --bundles nsis --config $config --ci -- --locked
  if ($LASTEXITCODE -ne 0) { throw 'Signed Tauri build failed' }
  $installer = @(Get-ChildItem 'target/release/bundle/nsis' -File -Filter '*.exe')
  if ($installer.Count -ne 1) { throw 'Expected exactly one signed NSIS installer' }
  $binary = Get-Item 'target/release/multi-emulator-studio.exe'
  foreach ($file in @($binary) + $installer) {
    $signature = Get-AuthenticodeSignature -FilePath $file.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $thumbprint -or -not $signature.TimeStamperCertificate) { throw "Authenticode verification failed for $($file.Name)" }
  }
  Write-Host 'Expected publisher and timestamp verified for the application and installer.'
} finally {
  if (Test-Path $storePath) { Remove-Item -LiteralPath $storePath -Force }
  if (Test-Path $pfx) { Remove-Item -LiteralPath $pfx -Force }
  if (Test-Path $config) { Remove-Item -LiteralPath $config -Force }
  if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Force }
}
