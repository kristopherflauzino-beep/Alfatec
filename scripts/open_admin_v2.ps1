$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationFramework

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$healthUrl = "http://127.0.0.1:8787/api/health"

function Test-AdminHealth {
  try {
    $null = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-AdminHealth)) {
  try {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    Start-Process $nodePath -ArgumentList "v2\backend\server.js" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  } catch {
    [System.Windows.MessageBox]::Show(
      "Nao foi possivel iniciar o servidor do admin V2. Verifique se o Node.js esta instalado.",
      "Central Admin V2"
    ) | Out-Null
    exit 1
  }

  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 350
    if (Test-AdminHealth) {
      break
    }
  }
}

if (Test-AdminHealth) {
  exit 0
}

[System.Windows.MessageBox]::Show(
  "O servidor local da central admin nao respondeu a tempo. Tente novamente em alguns segundos.",
  "Central Admin V2"
) | Out-Null

exit 1
