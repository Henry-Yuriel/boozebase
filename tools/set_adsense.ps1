# set_adsense.ps1 - Configures Google AdSense Publisher ID and optional Ad Slot IDs, then rebuilds the site & deploy ZIP
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\set_adsense.ps1 -PublisherId "ca-pub-1234567890123456"
param(
    [Parameter(Mandatory = $true)]
    [string]$PublisherId,
    [string]$HomeMidSlot = "",
    [string]$HomeBottomSlot = "",
    [string]$ListTopSlot = "",
    [string]$ListBottomSlot = "",
    [string]$BottleMidSlot = "",
    [string]$BottleBottomSlot = "",
    [string]$TestResultSlot = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cfgPath = Join-Path $root "site_src\site_config.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$cleanPub = $PublisherId.Trim()
if ($cleanPub -match "^pub-\d+$") {
    $cleanPub = "ca-" + $cleanPub
}
if ($cleanPub -ne "" -and $cleanPub -notmatch "^ca-pub-\d{10,20}$") {
    Write-Error "PublisherId must look like 'ca-pub-1234567890123456' (or 'pub-1234567890123456')."
    exit 1
}

$cfg = [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$cfg.adsense.client = $cleanPub
if ($HomeMidSlot)      { $cfg.adsense.slots.home_mid      = $HomeMidSlot.Trim() }
if ($HomeBottomSlot)   { $cfg.adsense.slots.home_bottom   = $HomeBottomSlot.Trim() }
if ($ListTopSlot)      { $cfg.adsense.slots.list_top      = $ListTopSlot.Trim() }
if ($ListBottomSlot)   { $cfg.adsense.slots.list_bottom   = $ListBottomSlot.Trim() }
if ($BottleMidSlot)    { $cfg.adsense.slots.bottle_mid    = $BottleMidSlot.Trim() }
if ($BottleBottomSlot) { $cfg.adsense.slots.bottle_bottom = $BottleBottomSlot.Trim() }
if ($TestResultSlot)   { $cfg.adsense.slots.test_result   = $TestResultSlot.Trim() }

$jsonOut = ConvertTo-Json -InputObject $cfg -Depth 10
[System.IO.File]::WriteAllText($cfgPath, $jsonOut + "`n", $utf8NoBom)
Write-Host "Updated Google AdSense Publisher ID in site_config.json -> $cleanPub"

if (-not $SkipBuild) {
    $buildScript = Join-Path $PSScriptRoot "build_site.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript
}
