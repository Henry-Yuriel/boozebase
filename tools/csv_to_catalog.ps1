param(
    [Parameter(Mandatory = $false)]
    [string]$CsvPath = "tools\catalog_template.csv",

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = "liquor_data.json",

    [Switch]$Replace,

    [Switch]$SkipImageFetch
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CsvPath)) {
    Write-Error "CSV file not found: $CsvPath"
    exit 1
}

$itemMap = [ordered]@{}

if (-not $Replace -and (Test-Path $OutputPath)) {
    $existingRaw = [System.IO.File]::ReadAllText((Resolve-Path $OutputPath).Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($existingRaw -is [System.Array]) {
        $existingItems = $existingRaw
    } elseif ($null -ne $existingRaw.PSObject.Properties["items"]) {
        $existingItems = $existingRaw.items
    } else {
        $existingItems = @($existingRaw)
    }
    foreach ($item in $existingItems) {
        $id = [string]$item.product_id
        if (-not [string]::IsNullOrWhiteSpace($id)) {
            $itemMap[$id] = $item
        }
    }
}

$rows = Import-Csv -Path $CsvPath -Encoding UTF8
foreach ($row in $rows) {
    $id = ([string]$row.product_id).Trim()
    if ([string]::IsNullOrWhiteSpace($id)) { continue }

    $prev = if ($itemMap.Contains($id)) { $itemMap[$id] } else { $null }

    $vol = 750
    [void][int]::TryParse(([string]$row.volume_ml).Trim(), [ref]$vol)

    $priceClean = ([string]$row.price).Replace(",", "").Trim()
    $priceVal = 0
    [void][int]::TryParse($priceClean, [ref]$priceVal)

    $listingLabel = if ([string]::IsNullOrWhiteSpace($row.listing_label)) { "Dailyshot Pickup" } else { ([string]$row.listing_label).Trim() }
    $rowImg = ([string]$row.image).Trim()
    $finalImg = if ($rowImg) { $rowImg } elseif ($prev -and $prev.image) { [string]$prev.image } else { "" }
    $rowSrcUrl = ([string]$row.market_source_url).Trim()
    $finalSrcUrl = if ($prev -and $prev.market_source_url -and ($rowSrcUrl -match "dailyshot\.co/m/search" -or $rowSrcUrl -eq "https://m.kihya.com/")) {
        [string]$prev.market_source_url
    } else {
        $rowSrcUrl
    }

    $obj = [ordered]@{
        product_id        = $id
        name              = ([string]$row.name).Trim()
        category          = ([string]$row.category).Trim()
        price             = $priceVal
        currency          = "KRW"
        image             = $finalImg
        stock_status      = if ([string]::IsNullOrWhiteSpace($row.stock_status)) { "unknown" } else { ([string]$row.stock_status).Trim() }
        stock_quantity    = $null
        attributes        = [pscustomobject]([ordered]@{
            volume_ml     = $vol
            listing_label = $listingLabel
        })
        pairing_item      = ([string]$row.pairing_item).Trim()
        affiliate_link    = ([string]$row.affiliate_link).Trim()
        market_source_url = $finalSrcUrl
        source_title      = if ([string]::IsNullOrWhiteSpace($row.source_title)) { "Retailer Product Page" } else { ([string]$row.source_title).Trim() }
        source            = "market_research"
        price_checked_on  = if ([string]::IsNullOrWhiteSpace($row.price_checked_on)) { (Get-Date -Format "yyyy-MM-dd") } else { ([string]$row.price_checked_on).Trim() }
        price_note        = ([string]$row.price_note).Trim()
    }

    if ($prev) {
        foreach ($metaKey in @("image_source_url", "image_source_title", "image_license_note", "image_checked_on")) {
            if ($prev.PSObject.Properties[$metaKey] -and $prev.$metaKey) {
                $obj[$metaKey] = $prev.$metaKey
            }
        }
    }

    $itemMap[$id] = [pscustomobject]$obj
}

$finalList = @($itemMap.Values)
$jsonOut = ConvertTo-Json -InputObject $finalList -Depth 6
$targetFullPath = if (Test-Path $OutputPath) { (Resolve-Path $OutputPath).Path } else { Join-Path (Get-Location).Path $OutputPath }
[System.IO.File]::WriteAllText($targetFullPath, $jsonOut + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] Merged $($finalList.Count) catalog items into $OutputPath" -ForegroundColor Green

if (-not $SkipImageFetch) {
    $fetchScript = Join-Path $PSScriptRoot "fetch_images.ps1"
    if (Test-Path $fetchScript) {
        Write-Host "[AUTO-IMAGE] Running fetch_images.ps1 to resolve any missing bottle images..." -ForegroundColor Cyan
        & $fetchScript -DataPath $OutputPath
    }
}
