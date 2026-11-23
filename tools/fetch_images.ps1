<#
  fetch_images.ps1
  Automatically resolves, verifies (1:1 single-bottle match, no bundles/sets, exact age/number match),
  and downloads bottle thumbnail images for catalog items in liquor_data.json that do not yet have
  a local image in assets/images/<product_id>.<ext>, and logs sources to ASSET_SOURCES.md.
#>
param(
    [string]$DataPath = "liquor_data.json",
    [string]$ImageDir = "assets\images",
    [string]$AssetLog = "ASSET_SOURCES.md",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

$root = (Get-Location).Path
$dataFull = if ([System.IO.Path]::IsPathRooted($DataPath)) { $DataPath } else { Join-Path $root $DataPath }
$imgDirFull = if ([System.IO.Path]::IsPathRooted($ImageDir)) { $ImageDir } else { Join-Path $root $ImageDir }
if (-not (Test-Path $imgDirFull)) { New-Item -ItemType Directory -Path $imgDirFull | Out-Null }
$tmpJson = Join-Path $env:TEMP "boozebase_ds_search.json"

Write-Host "[1/3] Fetching Dailyshot buildId..."
& curl.exe -s -L -A $UA --max-time 20 -o $tmpJson "https://dailyshot.co/m/search/result?q=whisky"
$probeHtml = [System.IO.File]::ReadAllText($tmpJson, [System.Text.Encoding]::UTF8)
$buildMatch = [regex]::Match($probeHtml, '"buildId"\s*:\s*"([^"]+)"')
if (-not $buildMatch.Success) {
    Write-Error "Could not extract Dailyshot buildId."
    exit 1
}
$buildId = $buildMatch.Groups[1].Value
Write-Host "      buildId = $buildId"

$stopQueryEn = @("the", "and", "of", "by", "in", "single", "malt", "grain", "blended", "whisky", "whiskey", "bourbon", "scotch", "irish", "japanese", "craft", "puente", "alto", "chile", "argentina", "italy", "mosel", "washington", "vintage", "champagne", "sake", "soju", "cognac", "tequila", "gin", "vodka", "rum", "original", "cream", "premium", "selected", "vineyards", "vintners", "private", "label")
$ignoreExtraEn = @("the", "and", "of", "by", "in", "de", "la", "di", "du", "le", "whisky", "whiskey", "bourbon", "scotch", "single", "malt", "grain", "blended", "champagne", "sake", "soju", "gin", "vodka", "tequila", "rum", "cognac", "wine", "cellars", "label", "jiu", "purple", "700ml", "750ml", "500ml", "375ml", "1l", "600ml", "900ml", "720ml", "18l", "pack")

# Pure ASCII Unicode regex patterns for Korean bundle/package terms:
# 세트=\uC138\uD2B8 | 바이알=\uBC14\uC774\uC54C | 무알콜=\uBB34\uC54C\uCF5C | 4캔=4\uCE94 | 하이볼=\uD558\uC774\uCFC4 | 병=\uBCD1 | 미니어처=\uBBF8\uB2C8\uC5B4\uCC98
# 전용잔=\uC804\uC6A9\uC794 | 패키지=\uD328\uD0A4\uC9C0 | 케이스=\uCF00\uC774\uC2A4 | 구형=\uAD6C\uD615 | 에디션=\uC5D0\uB514\uC158
$rxHardExcludeKo = "&|\+|\uC138\uD2B8|\uBC14\uC774\uC54C|\uBB34\uC54C\uCF5C|4\uCE94|\uD558\uC774\uCFC4|[2-9]\uBCD1|12\uBCD1|\uBBF8\uB2C8\uC5B4\uCC98"
$rxSoftPenaltyKo = "\uC804\uC6A9\uC794|\uD328\uD0A4\uC9C0|\uCF00\uC774\uC2A4|\uAD6C\uD615|\uC5D0\uB514\uC158"

function Normalize-En([string]$s) {
    $c = $s.ToLowerInvariant()
    $c = $c -replace "['\u2018\u2019]", ""
    $c = $c -replace "1\.8l", "1800ml"
    $c = $c -replace "x\.premium", "xp"
    $c = $c -replace "x\.p", "xp"
    $c = $c -replace "v\.s\.o\.p", "vsop"
    $c = $c -replace "x\.o", "xo"
    $c = $c -replace "no\.?\s*10", "no ten"
    $c = $c -replace "\bran\s+zacapa\b", "ron zacapa"
    $c = $c -replace "houou\s*biden", "phoenix bihou"
    $c = $c -replace "(\d+)yo\b", '$1'
    $c = $c -replace "[^a-z0-9\s]", " "
    $c = ($c -replace "\s+", " ").Trim()
    return $c
}

function Search-Dailyshot([string]$query, [string]$buildId, [string]$tmpFile) {
    $enc = [uri]::EscapeDataString($query)
    $url = "https://dailyshot.co/m/_next/data/$buildId/search/result.json?q=$enc"
    & curl.exe -s -L -A $UA --max-time 15 -o $tmpFile $url
    if (-not (Test-Path $tmpFile)) { return @() }
    try {
        $rawText = [System.IO.File]::ReadAllText($tmpFile, [System.Text.Encoding]::UTF8)
        $json = $rawText | ConvertFrom-Json
        $pages = $json.pageProps.dehydratedState.queries[0].state.data.pages
        if ($pages -and $pages.Count -gt 0 -and $pages[0].results) {
            return @($pages[0].results)
        }
    } catch {}
    return @()
}

function Find-VerifiedMatch($item, [string]$buildId, [string]$tmpFile, [hashtable]$usedTopIds) {
    $slug = [string]$item.product_id
    $name = [string]$item.name
    $allSlugWords = @( (Normalize-En ($slug -replace "-", " ")).Split(" ") | Where-Object { $_ -and $_ -ne "label" } )
    $querySlugWords = @($allSlugWords | Where-Object { $stopQueryEn -notcontains $_ })
    $nums = @($allSlugWords | Where-Object { $_ -match "^\d+$" })

    $queries = [System.Collections.Generic.List[string]]::new()
    if ($querySlugWords.Count -ge 3) {
        $queries.Add(($querySlugWords[0..2] -join " "))
    }
    if ($querySlugWords.Count -ge 2) {
        $queries.Add(($querySlugWords -join " "))
        $queries.Add(($querySlugWords[0..1] -join " "))
    }
    if ($querySlugWords.Count -ge 1) {
        $queries.Add($querySlugWords[0])
    }
    $kWords = @(($name -replace "\s+", " ").Trim().Split(" ") | Where-Object { $_.Length -ge 2 })
    if ($kWords.Count -ge 2) {
        $queries.Add(($kWords[0..1] -join " "))
        $queries.Add(($kWords[1..([Math]::Min(2, $kWords.Count-1))] -join " "))
    }

    $seenIds = @{}
    $allResults = [System.Collections.Generic.List[object]]::new()
    foreach ($q in ($queries | Select-Object -Unique | Select-Object -First 6)) {
        $res = Search-Dailyshot $q $buildId $tmpFile
        foreach ($r in $res) {
            $tid = if ($r.top_product_id) { [string]$r.top_product_id } else { [string]$r.id }
            if (-not $seenIds.ContainsKey($tid) -and -not [string]::IsNullOrWhiteSpace($r.thumbnail_image)) {
                $seenIds[$tid] = $true
                $allResults.Add($r)
            }
        }
    }

    $best = $null
    $bestScore = -9999
    foreach ($r in $allResults) {
        $tid = if ($r.top_product_id) { [string]$r.top_product_id } else { [string]$r.id }
        if ($usedTopIds.ContainsKey($tid) -and $usedTopIds[$tid] -ne $slug) { continue }

        $topName = ([string]$r.top_product_name).ToLowerInvariant()
        $rName = ([string]$r.name).ToLowerInvariant()
        $enRaw = ([string]$r.en_name).ToLowerInvariant()

        if ($topName -match $rxHardExcludeKo -or $rName -match "&|\+|\uBC14\uC774\uC54C|\uBB34\uC54C\uCF5C|4\uCE94") { continue }
        if ($enRaw -match "&|\+|\bvial\b|\bcan\b|non-alcoholic|highball|\bset\b|\b(50|100|125|200)ml\b") { continue }

        $enNorm = Normalize-En $enRaw
        $enWords = @($enNorm.Split(" ") | Where-Object { $_ })
        $enNoSpace = ($enNorm -replace "\s+", "")
        $combined = "$topName $enNorm"

        $candNums = @($enWords | Where-Object { $_ -match "^\d+$" -and $_ -notmatch "^(199\d|20[0-2]\d|375|500|600|700|720|750|900|1000|1800)$" })
        if ($nums.Count -gt 0) {
            $conflict = $false
            foreach ($cn in $candNums) {
                if ($nums -notcontains $cn) { $conflict = $true; break }
            }
            if ($conflict) { continue }
            $hasAllNums = $true
            foreach ($n in $nums) {
                if ($combined -notmatch "(^|[^0-9])$n([^0-9]|$)") { $hasAllNums = $false; break }
            }
            if (-not $hasAllNums -and $candNums.Count -gt 0) { continue }
        } else {
            if ($candNums.Count -gt 0) { continue }
        }

        $enMatches = 0
        foreach ($sw in $allSlugWords) {
            if ($sw -match "^\d+$") { continue }
            if ($enWords -contains $sw) {
                $enMatches++
            } elseif ($sw.Length -ge 8 -and $enNoSpace.Contains($sw)) {
                $enMatches++
            }
        }
        $koMatches = 0
        foreach ($kw in $kWords) {
            if ($topName -match [regex]::Escape($kw.ToLowerInvariant())) { $koMatches++ }
        }

        if ($enMatches -eq 0) { continue }
        $firstSw = $querySlugWords[0]
        $brandOk = ($enWords -contains $firstSw) -or ($firstSw.Length -ge 8 -and $enNoSpace.Contains($firstSw))
        if (-not $brandOk) { continue }

        $extraWords = 0
        foreach ($ew in $enWords) {
            if ($ew -match "^(199\d|20[0-2]\d|\d+ml|\d+l|\d+)$") { continue }
            if ($ignoreExtraEn -contains $ew) { continue }
            if (($allSlugWords -notcontains $ew) -and -not (($allSlugWords -join "").Contains($ew))) {
                $extraWords++
            }
        }

        $score = ($enMatches * 160) + ($koMatches * 55) - ($extraWords * 55)
        foreach ($n in $nums) {
            if ($combined -match "(^|[^0-9])$n([^0-9]|$)") { $score += 140 }
        }
        if ($topName -match $rxSoftPenaltyKo) { $score -= 90 }
        if ($enRaw -match "\bpackage\b|\bglass\b|\bedit[io]+n\b|\bgift\b|\bcase\b|\bluminous\b") { $score -= 90 }
        if ($enRaw -match "\b(700|750)ml\b") { $score += 15 }
        $score += [Math]::Min(35, [int]($r.review_count / 40))

        if ($score -gt $bestScore) {
            $bestScore = $score
            $best = $r
        }
    }
    return $best
}

$items = [System.IO.File]::ReadAllText($dataFull, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$usedTopIds = @{}
foreach ($existing in $items) {
    $exId = [string]$existing.product_id
    $exImg = [string]$existing.image
    $exUrl = [string]$existing.image_source_url
    if (-not $Force -and $exImg -and $exUrl -match "dailyshot\.co/m/item/(\d+)") {
        $usedTopIds[$Matches[1]] = $exId
    }
}

$downloaded = 0
$skipped = 0
$failed = @()
$logLines = [System.Collections.Generic.List[string]]::new()
$today = Get-Date -Format "yyyy-MM-dd"

Write-Host "[2/3] Resolving, verifying, and downloading missing bottle images..."
foreach ($item in $items) {
    $id = [string]$item.product_id
    $existingImg = [string]$item.image
    if (-not $Force -and $existingImg) {
        $localCheck = Join-Path $root (($existingImg -replace "^\./", "") -replace "/", "\")
        if (Test-Path $localCheck) {
            $skipped++
            continue
        }
    }

    $matchedItem = Find-VerifiedMatch $item $buildId $tmpJson $usedTopIds
    if (-not $matchedItem) {
        $failed += $id
        Write-Host "  [MISS] $id ($($item.name))"
        continue
    }

    $imgUrl = [string]$matchedItem.thumbnail_image
    $ext = "webp"
    if ($imgUrl -match "\.(png|jpe?g|webp)(\?|$)") {
        $ext = ($Matches[1] -replace "jpeg", "jpg").ToLowerInvariant()
    }
    $fileName = "$id.$ext"
    $destPath = Join-Path $imgDirFull $fileName

    & curl.exe -s -L -A $UA --max-time 25 -o $destPath $imgUrl
    if (-not (Test-Path $destPath) -or (Get-Item $destPath).Length -lt 1000) {
        if (Test-Path $destPath) { Remove-Item $destPath -Force }
        $failed += $id
        Write-Host "  [FAIL] $id"
        continue
    }

    $topId = if ($matchedItem.top_product_id) { [string]$matchedItem.top_product_id } else { [string]$matchedItem.id }
    $usedTopIds[$topId] = $id
    $sourcePage = "https://dailyshot.co/m/item/$topId"
    $sourceTitle = if ($matchedItem.top_product_name) { "Dailyshot - $($matchedItem.top_product_name)" } else { "Dailyshot - $($matchedItem.name)" }

    $item | Add-Member -NotePropertyName "image" -NotePropertyValue "./assets/images/$fileName" -Force
    $item | Add-Member -NotePropertyName "image_source_url" -NotePropertyValue $sourcePage -Force
    $item | Add-Member -NotePropertyName "image_source_title" -NotePropertyValue $sourceTitle -Force
    $item | Add-Member -NotePropertyName "image_license_note" -NotePropertyValue "Retailer public thumbnail reference" -Force
    $item | Add-Member -NotePropertyName "image_checked_on" -NotePropertyValue $today -Force

    if ([string]$item.market_source_url -match "dailyshot\.co/m/" -or [string]$item.market_source_url -eq "https://m.kihya.com/") {
        $item | Add-Member -NotePropertyName "market_source_url" -NotePropertyValue $sourcePage -Force
    }

    $downloaded++
    $logLines.Add("| ``$id`` | $($item.name) | `./assets/images/$fileName` | [$sourceTitle]($sourcePage) | $today |")
    Write-Host "  [OK] $id -> $sourceTitle ($((Get-Item $destPath).Length) bytes)"
}

if ($downloaded -gt 0) {
    $jsonOut = ConvertTo-Json -InputObject @($items) -Depth 8
    [System.IO.File]::WriteAllText($dataFull, $jsonOut + "`n", [System.Text.UTF8Encoding]::new($false))

    $logFull = Join-Path $root $AssetLog
    if (Test-Path $logFull) {
        $header = "`n## Verified Single-Bottle Thumbnails ($today)`n`n| product_id | Name | Local Path | Source Page | Checked |`n|---|---|---|---|---|`n"
        [System.IO.File]::AppendAllText($logFull, $header + ($logLines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
    }
}

Write-Host ""
Write-Host "[3/3] Done! Downloaded: $downloaded | Existing: $skipped | Unmatched: $($failed.Count)"
if ($failed.Count -gt 0) {
    Write-Host "Unmatched IDs: $($failed -join ', ')"
}
