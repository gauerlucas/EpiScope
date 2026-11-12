# EpiScope — mise à jour d'un poste : télécharge le dernier EpiScope.html publié sur GitHub (Releases) et remplace
# celui du dossier, après en avoir gardé une copie datée. Les dossiers de patients ne sont pas touchés : ils vivent
# ailleurs (dossier choisi dans l'application), pas dans le dossier de l'application.
#   Clic droit → « Exécuter avec PowerShell », ou :  powershell -ExecutionPolicy Bypass -File tools\update_episcope.ps1
param(
  [string]$Repo = 'gauerlucas/EpiScope',
  [string]$Target = ''
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $Target) { $Target = Join-Path $root 'dist\EpiScope.html' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent' = 'EpiScope-update' }
$asset = $rel.assets | Where-Object { $_.name -eq 'EpiScope.html' } | Select-Object -First 1
if (-not $asset) { throw "Aucun EpiScope.html attaché à la dernière version ($($rel.tag_name))." }
$url = $asset.browser_download_url; $version = $rel.tag_name
Write-Host "EpiScope $version ← $url"
$tmp = "$Target.download"
Invoke-WebRequest -Uri $url -OutFile $tmp -Headers @{ 'User-Agent' = 'EpiScope-update' }
if ((Get-Item $tmp).Length -lt 1MB) { Remove-Item $tmp; throw 'Fichier téléchargé trop petit : téléchargement incomplet ?' }
if (Test-Path $Target) {
  $bak = Join-Path (Split-Path -Parent $Target) ("EpiScope_avant_" + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.html')
  Move-Item -Force $Target $bak; Write-Host "ancienne version gardée : $bak"
}
Move-Item -Force $tmp $Target
Write-Host "Mis à jour : $Target"
