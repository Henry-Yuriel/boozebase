param(
    [ValidateSet("all500", "under50k", "gift100k", "highball", "meat", "seafood")]
    [string]$Theme = "under50k",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $projectRoot "liquor_data.json"
$tplPath  = Join-Path $PSScriptRoot "blog_templates.json"

if (-not (Test-Path $dataPath)) {
    throw "liquor_data.json not found at $dataPath"
}
if (-not (Test-Path $tplPath)) {
    throw "blog_templates.json not found at $tplPath"
}

$items = [System.IO.File]::ReadAllText($dataPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$tpl   = [System.IO.File]::ReadAllText($tplPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

$itemMap = @{}
foreach ($it in $items) {
    $itemMap[[string]$it.product_id] = $it
}

$themeObj = $tpl.themes.$Theme
$siteUrl  = $tpl.site_url
$h        = $tpl.headers
$u        = $tpl.ui

$tagsList  = @($themeObj.tags)
$tagsCsv   = $tagsList -join ", "
$tagsHash  = ($tagsList | ForEach-Object { "#$_" }) -join " "
$presetUrl = "$siteUrl$($themeObj.preset_query)"

function Get-BottleMetrics($it, [string]$currentTheme) {
    $catKo = $tpl.cat_labels.($it.category)
    $price = [int]$it.price
    $vol   = [int]$it.attributes.volume_ml
    if ($vol -le 0) { $vol = 750 }

    $pourMl = 30
    $barMarkup = 3.6
    if ($it.category -eq "red_wine" -or $it.category -eq "white_wine") {
        $pourMl = 125
        $barMarkup = 2.6
    } elseif ($it.category -eq "sake") {
        $pourMl = 90
        $barMarkup = 2.8
    } elseif ($it.category -eq "other") {
        if ($price -le 55000) {
            $pourMl = 45
            $barMarkup = 2.5
        } else {
            $pourMl = 30
            $barMarkup = 3.2
        }
    }

    $totalPours = [Math]::Max(1, [Math]::Round($vol / $pourMl))
    $perPour    = [Math]::Max(500, [Math]::Round(($price / $totalPours) / 100) * 100)
    $savingsMan = [Math]::Max(1, [Math]::Round(($price * ($barMarkup - 1.0)) / 10000))

    $priceFormatted = ("{0:N0}" -f $price) + $u.currency_unit
    $pourFormatted  = ("{0:N0}" -f [int]$perPour) + $u.currency_unit
    $savingsText    = $u.lbl_savings_prefix + [string]$savingsMan + $u.lbl_savings_suffix
    $deepLink       = "$($siteUrl)bottle/$($it.product_id)/"

    # Match pairing snack link
    $snackUrl = [string]$tpl.snack_links.default
    $pairingText = [string]$it.pairing_item
    foreach ($prop in $tpl.snack_links.PSObject.Properties) {
        if ($prop.Name -ne "default" -and $pairingText.Contains($prop.Name)) {
            $snackUrl = [string]$prop.Value
            break
        }
    }

    # Match barware key
    $id = [string]$it.product_id
    $bwKey = "nosing_glass"
    if ($currentTheme -eq "highball") {
        if ($id -match "(hendricks|tanqueray|bombay|roku)") {
            $bwKey = "cocktail_shaker"
        } else {
            $bwKey = "highball_kit"
        }
    } elseif ($it.category -eq "whisky") {
        if ($id -match "(suntory-kakubin|jim-beam|makers-mark)") {
            $bwKey = "highball_kit"
        } elseif ($id -match "(jameson|wild-turkey|buffalo-trace|monkey-shoulder|jack-daniels|evan-williams|bulleit)" -and $price -lt 65000) {
            $bwKey = "ontherocks_ice"
        } else {
            $bwKey = "nosing_glass"
        }
    } elseif ($it.category -eq "red_wine") {
        if ($id -match "(pinot-noir|bourgogne|louis-jadot|andre-goichot)") {
            $bwKey = "burgundy_glass"
        } else {
            $bwKey = "bordeaux_glass"
        }
    } elseif ($it.category -eq "white_wine") {
        if ($id -match "(champagne|moscato|prosecco|cava|asti|moet|veuve|dom-perignon|krug)") {
            $bwKey = "champagne_flute"
        } else {
            $bwKey = "white_wine_glass"
        }
    } elseif ($it.category -eq "sake") {
        $bwKey = "sake_tokkuri"
    } else {
        if ($id -match "(hennessy|remy-martin|camus|martell|cognac|armagnac|calvados)") {
            $bwKey = "cognac_snifter"
        } elseif ($id -match "(hendricks|tanqueray|bombay|roku|gin|vodka|rum|tequila)") {
            $bwKey = "cocktail_shaker"
        } elseif ($id -match "(maotai|wuliangye|kaoliang|erguotou|fenjiu|yantai|dream-of-blue)") {
            $bwKey = "baijiu_glass"
        } else {
            $bwKey = "soju_ontherocks"
        }
    }

    $bwObj = $tpl.barware_links.$bwKey

    return @{
        CatKo          = $catKo
        Vol            = $vol
        PourMl         = $pourMl
        TotalPours     = $totalPours
        PriceFormatted = $priceFormatted
        PourFormatted  = $pourFormatted
        SavingsText    = $savingsText
        DeepLink       = $deepLink
        SnackUrl       = $snackUrl
        BarwareLabel   = [string]$bwObj.label
        BarwareReason  = [string]$bwObj.reason
        BarwareUrl     = [string]$bwObj.url
    }
}

# Build Markdown & HTML sections
$sb = New-Object System.Text.StringBuilder
$cardsHtml = New-Object System.Text.StringBuilder
$tableRowsHtml = New-Object System.Text.StringBuilder

$hookLeadPlain = ($themeObj.hook_lead -replace "<br><br>", "`n`n" -replace "<[^>]+>", "")
$closingPlain  = ($themeObj.closing_cta -replace "<[^>]+>", "")

[void]$sb.AppendLine("# $($themeObj.title)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> $($themeObj.subtitle)")
[void]$sb.AppendLine(">")
[void]$sb.AppendLine("> **$($u.website_label)**: [$presetUrl]($presetUrl)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine($hookLeadPlain)
[void]$sb.AppendLine("")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## $($u.section1_title)")
[void]$sb.AppendLine("")

$rank = 1
foreach ($spotId in $themeObj.spotlight_ids) {
    $it = $itemMap[[string]$spotId]
    if ($null -eq $it) { continue }
    $m = Get-BottleMetrics $it $Theme
    $pickBadge = ("PICK {0:D2}" -f $rank)

    # Markdown Story Card
    [void]$sb.AppendLine("### [$pickBadge] $($it.name) ($($m.CatKo) / $($m.Vol)ml)")
    [void]$sb.AppendLine("- **$($u.lbl_tasting)**: $($it.price_note)")
    [void]$sb.AppendLine("- **$($u.lbl_calc)**: $($u.lbl_bottle_price) **$($m.PriceFormatted)** -> $($u.lbl_pour_cost) **$($m.PourFormatted)** ($($m.PourMl)ml / $($u.lbl_total_pours) $($m.TotalPours)$($u.lbl_glass_unit) | **$($m.SavingsText)**)")
    [void]$sb.AppendLine("- **$($u.lbl_pairing)**: [$($it.pairing_item) ($($u.lbl_snack_cta))]($($m.SnackUrl))")
    [void]$sb.AppendLine("- **$($u.lbl_barware)**: [$($m.BarwareLabel) ($($u.lbl_barware_cta))]($($m.BarwareUrl)) - $($m.BarwareReason)")
    [void]$sb.AppendLine("- [$($u.lbl_bottle_cta)]($($m.DeepLink))")
    [void]$sb.AppendLine("")

    # HTML Story Card (Table-based card for 100% SmartEditor ONE fidelity)
    [void]$cardsHtml.AppendLine("      <table border='1' style='border-collapse:collapse; width:100%; border:1px solid #cbd5e1; margin-bottom:22px; background:#ffffff;'>")
    [void]$cardsHtml.AppendLine("        <tr style='background:#0f172a; color:#ffffff;'>")
    [void]$cardsHtml.AppendLine("          <td colspan='2' style='padding:12px 16px; border:1px solid #0f172a; font-size:16px; font-weight:bold; color:#ffffff;'>")
    [void]$cardsHtml.AppendLine("            <span style='background:#03c75a; color:#ffffff; padding:3px 8px; border-radius:4px; font-size:12px; margin-right:8px;'>$pickBadge</span>")
    [void]$cardsHtml.AppendLine("            <span>[$($m.CatKo)] $($it.name) ($($m.Vol)ml)</span>")
    [void]$cardsHtml.AppendLine("          </td>")
    [void]$cardsHtml.AppendLine("        </tr>")
    [void]$cardsHtml.AppendLine("        <tr>")
    [void]$cardsHtml.AppendLine("          <td style='width:26%; padding:10px 14px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:bold; color:#334155;'>$($u.lbl_tasting)</td>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; color:#1e293b;'><strong>$($it.price_note)</strong></td>")
    [void]$cardsHtml.AppendLine("        </tr>")
    [void]$cardsHtml.AppendLine("        <tr>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:bold; color:#334155;'>$($u.lbl_calc)</td>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; color:#1e293b;'>")
    [void]$cardsHtml.AppendLine("            $($u.lbl_bottle_price) <strong>$($m.PriceFormatted)</strong> &#10140; $($u.lbl_pour_cost) <strong style='color:#029a45; font-size:15px;'>$($m.PourFormatted)</strong> <span style='color:#64748b; font-size:12.5px;'>($($m.PourMl)ml &middot; $($u.lbl_total_pours) $($m.TotalPours)$($u.lbl_glass_unit))</span>")
    [void]$cardsHtml.AppendLine("            <span style='display:inline-block; background:#fef3c7; color:#b45309; font-weight:bold; font-size:12px; padding:2px 8px; border-radius:4px; margin-left:6px;'>$($m.SavingsText)</span>")
    [void]$cardsHtml.AppendLine("          </td>")
    [void]$cardsHtml.AppendLine("        </tr>")
    [void]$cardsHtml.AppendLine("        <tr>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:bold; color:#334155;'>$($u.lbl_pairing)</td>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; color:#1e293b;'>")
    [void]$cardsHtml.AppendLine("            <strong>$($it.pairing_item)</strong> &nbsp;|&nbsp; <a href='$($m.SnackUrl)' target='_blank' style='color:#e11d48; font-weight:bold; text-decoration:underline;'>$($u.lbl_snack_cta)</a>")
    [void]$cardsHtml.AppendLine("          </td>")
    [void]$cardsHtml.AppendLine("        </tr>")
    [void]$cardsHtml.AppendLine("        <tr>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:bold; color:#334155;'>$($u.lbl_barware)</td>")
    [void]$cardsHtml.AppendLine("          <td style='padding:10px 14px; border:1px solid #e2e8f0; color:#1e293b;'>")
    [void]$cardsHtml.AppendLine("            <strong>$($m.BarwareLabel)</strong> &nbsp;|&nbsp; <a href='$($m.BarwareUrl)' target='_blank' style='color:#2563eb; font-weight:bold; text-decoration:underline;'>$($u.lbl_barware_cta)</a>")
    [void]$cardsHtml.AppendLine("            <div style='color:#475569; font-size:12.5px; margin-top:4px;'>$($m.BarwareReason)</div>")
    [void]$cardsHtml.AppendLine("          </td>")
    [void]$cardsHtml.AppendLine("        </tr>")
    [void]$cardsHtml.AppendLine("        <tr style='background:#f0fdf4;'>")
    [void]$cardsHtml.AppendLine("          <td colspan='2' style='padding:10px 14px; border:1px solid #bbf7d0; text-align:center;'>")
    [void]$cardsHtml.AppendLine("            <a href='$($m.DeepLink)' target='_blank' style='color:#029a45; font-weight:bold; font-size:14px; text-decoration:none;'>$($u.lbl_bottle_cta)</a>")
    [void]$cardsHtml.AppendLine("          </td>")
    [void]$cardsHtml.AppendLine("        </tr>")
    [void]$cardsHtml.AppendLine("      </table>")

    # Summary Table Row for Spotlight Pick
    [void]$tableRowsHtml.AppendLine("          <tr>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:center; padding:9px 8px; border:1px solid #cbd5e1; font-weight:bold; color:#029a45;'>TOP $rank</td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:center; padding:9px 8px; border:1px solid #cbd5e1;'>$($m.CatKo)</td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:left; padding:9px 10px; border:1px solid #cbd5e1;'><strong>$($it.name)</strong> ($($m.Vol)ml)<div style='font-size:12px; color:#64748b;'>$($it.price_note)</div></td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:right; padding:9px 8px; border:1px solid #cbd5e1; font-weight:bold;'>$($m.PriceFormatted)</td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:right; padding:9px 8px; border:1px solid #cbd5e1;'><strong style='color:#029a45;'>$($m.PourFormatted)</strong><div style='font-size:11.5px; color:#b45309;'>$($m.SavingsText)</div></td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:left; padding:9px 10px; border:1px solid #cbd5e1;'><a href='$($m.SnackUrl)' target='_blank' style='color:#1e293b; text-decoration:underline;'>$($it.pairing_item)</a><div style='font-size:11.5px; margin-top:2px;'><a href='$($m.BarwareUrl)' target='_blank' style='color:#2563eb; text-decoration:none;'>+ $($m.BarwareLabel)</a></div></td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:center; padding:9px 8px; border:1px solid #cbd5e1;'><a href='$($m.DeepLink)' target='_blank' style='color:#03c75a; font-weight:bold; text-decoration:none;'>$($h.link_label)</a></td>")
    [void]$tableRowsHtml.AppendLine("          </tr>")

    $rank++
}

[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## $($u.section2_title)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> $($u.section2_desc)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| $($h.col_no) | $($h.col_cat) | $($h.col_name) | $($h.col_price) | $($h.col_pour) | $($h.col_pairing) | $($h.col_link) |")
[void]$sb.AppendLine("| :---: | :---: | :--- | ---: | ---: | :--- | :---: |")

$mdRank = 1
foreach ($spotId in $themeObj.spotlight_ids) {
    $it = $itemMap[[string]$spotId]
    if ($null -eq $it) { continue }
    $m = Get-BottleMetrics $it $Theme
    [void]$sb.AppendLine("| TOP $mdRank | $($m.CatKo) | **$($it.name)** ($($m.Vol)ml) | $($m.PriceFormatted) | **$($m.PourFormatted)** ($($m.SavingsText)) | [$($it.pairing_item)]($($m.SnackUrl)) | [$($h.link_label)]($($m.DeepLink)) |")
    $mdRank++
}

$hRank = 1
foreach ($hp in $themeObj.hidden_picks) {
    $it = $itemMap[[string]$hp.id]
    if ($null -eq $it) { continue }
    $m = Get-BottleMetrics $it $Theme

    [void]$sb.AppendLine("| HIDDEN $hRank | $($m.CatKo) | **$($hp.teaser_name)** ($($hp.hint)) | $($m.PriceFormatted) | **$($m.PourFormatted)** ($($m.SavingsText)) | [$($it.pairing_item)]($($m.SnackUrl)) | [**$($h.hidden_link_label)**]($($m.DeepLink)) |")

    [void]$tableRowsHtml.AppendLine("          <tr style='background:#fffbeb;'>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:center; padding:10px 8px; border:1px solid #cbd5e1; font-weight:bold; color:#d97706;'>HIDDEN $hRank</td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:center; padding:10px 8px; border:1px solid #cbd5e1; font-weight:bold;'>$($m.CatKo)</td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:left; padding:10px 10px; border:1px solid #cbd5e1;'><strong style='color:#b45309;'>$($hp.teaser_name)</strong><div style='font-size:12px; color:#78350f; margin-top:2px;'>Hint: $($hp.hint)</div></td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:right; padding:10px 8px; border:1px solid #cbd5e1; font-weight:bold;'>$($m.PriceFormatted)</td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:right; padding:10px 8px; border:1px solid #cbd5e1;'><strong style='color:#d97706;'>$($m.PourFormatted)</strong><div style='font-size:11.5px; color:#b45309;'>$($m.SavingsText)</div></td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:left; padding:10px 10px; border:1px solid #cbd5e1;'><a href='$($m.SnackUrl)' target='_blank' style='color:#1e293b; text-decoration:underline;'>$($it.pairing_item)</a><div style='font-size:11.5px; margin-top:2px;'><a href='$($m.BarwareUrl)' target='_blank' style='color:#2563eb; text-decoration:none;'>+ $($m.BarwareLabel)</a></div></td>")
    [void]$tableRowsHtml.AppendLine("            <td style='text-align:center; padding:10px 8px; border:1px solid #cbd5e1;'><a href='$($m.DeepLink)' target='_blank' style='display:inline-block; background:#d97706; color:#ffffff; padding:5px 10px; border-radius:4px; font-weight:bold; font-size:12px; text-decoration:none;'>$($h.hidden_link_label)</a></td>")
    [void]$tableRowsHtml.AppendLine("          </tr>")

    $hRank++
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine($closingPlain)
[void]$sb.AppendLine("")
[void]$sb.AppendLine("### [$($u.lbl_archive_cta)]($presetUrl)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> $($u.disclosure_text)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("### $($u.tags_section_title)")
[void]$sb.AppendLine("> **$($u.tags_guide)**")
[void]$sb.AppendLine('> ```text')
[void]$sb.AppendLine("> $tagsCsv")
[void]$sb.AppendLine('> ```')
[void]$sb.AppendLine("")
[void]$sb.AppendLine($tagsHash)

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $projectRoot ("NAVER_BLOG_THEME_" + $Theme.ToUpper() + ".md")
}
$htmlPath = [System.IO.Path]::ChangeExtension($OutputPath, ".html")

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $sb.ToString(), $utf8NoBom)

# Build Alternative Titles HTML buttons
$altTitlesHtml = New-Object System.Text.StringBuilder
$altIdx = 1
foreach ($alt in $themeObj.alt_titles) {
    $escapedAlt = $alt.Replace("'", "&#39;").Replace('"', "&quot;")
    [void]$altTitlesHtml.AppendLine("      <button type='button' class='alt-title-btn' data-title=""$escapedAlt"" onclick='copyTitleBtn(this)'><span class='alt-badge'>Title $altIdx</span> <span>$alt</span></button>")
    $altIdx++
}

# Build Tag Chips HTML
$tagChipsHtml = New-Object System.Text.StringBuilder
foreach ($t in $tagsList) {
    [void]$tagChipsHtml.Append("<span style='display:inline-block; background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:99px; font-size:12.5px; font-weight:600; margin:3px 4px 3px 0;'>#$t</span>")
}

# Assemble HTML Viewer
$hsb = New-Object System.Text.StringBuilder
[void]$hsb.AppendLine("<!DOCTYPE html>")
[void]$hsb.AppendLine("<html lang='ko'>")
[void]$hsb.AppendLine("<head>")
[void]$hsb.AppendLine("  <meta charset='UTF-8'>")
[void]$hsb.AppendLine("  <meta name='viewport' content='width=device-width, initial-scale=1'>")
[void]$hsb.AppendLine("  <title>$($themeObj.title)</title>")
[void]$hsb.AppendLine("  <style>")
[void]$hsb.AppendLine("    body { font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif; line-height: 1.65; max-width: 980px; margin: 28px auto; padding: 0 20px; color: #1e293b; background: #f8fafc; }")
[void]$hsb.AppendLine("    .action-box { background: #f0fdf4; border: 2px solid #03c75a; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 4px 14px rgba(3,199,90,0.12); }")
[void]$hsb.AppendLine("    .action-box h2 { margin: 0 0 8px; font-size: 19px; color: #029a45; }")
[void]$hsb.AppendLine("    .action-box p { margin: 0 0 14px; font-size: 13.5px; color: #334155; }")
[void]$hsb.AppendLine("    .alt-titles-box { background: #ffffff; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }")
[void]$hsb.AppendLine("    .alt-titles-box h3 { margin: 0 0 8px; font-size: 13px; color: #0f172a; }")
[void]$hsb.AppendLine("    .alt-title-btn { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 6px; font-size: 13px; color: #1e293b; cursor: pointer; transition: all 0.15s; }")
[void]$hsb.AppendLine("    .alt-title-btn:hover { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; }")
[void]$hsb.AppendLine("    .alt-badge { background: #0f172a; color: #fff; font-size: 11px; font-weight: bold; padding: 2px 7px; border-radius: 4px; flex-shrink: 0; }")
[void]$hsb.AppendLine("    .btn-group { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }")
[void]$hsb.AppendLine("    .btn { display: inline-flex; align-items: center; gap: 6px; background: #03c75a; color: white; border: none; padding: 11px 16px; font-size: 13.5px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: background 0.2s, transform 0.1s; }")
[void]$hsb.AppendLine("    .btn:hover { background: #029a45; transform: translateY(-1px); }")
[void]$hsb.AppendLine("    .btn-dark { background: #0f172a; }")
[void]$hsb.AppendLine("    .btn-dark:hover { background: #1e293b; }")
[void]$hsb.AppendLine("    .btn-amber { background: #d97706; }")
[void]$hsb.AppendLine("    .btn-amber:hover { background: #b45309; }")
[void]$hsb.AppendLine("    .btn-blue { background: #2563eb; }")
[void]$hsb.AppendLine("    .btn-blue:hover { background: #1d4ed8; }")
[void]$hsb.AppendLine("    .toast { display: none; margin-top: 12px; padding: 9px 14px; background: #dcfce7; border: 1px solid #86efac; border-radius: 6px; font-size: 13.5px; font-weight: bold; color: #166534; }")
[void]$hsb.AppendLine("    .content-preview { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 28px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); }")
[void]$hsb.AppendLine("    .tags-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px 20px; margin-top: 24px; }")
[void]$hsb.AppendLine("    .tags-box h3 { margin: 0 0 8px; font-size: 15px; color: #1e293b; display: flex; align-items: center; justify-content: space-between; }")
[void]$hsb.AppendLine("    .tags-input { width: 100%; box-sizing: border-box; padding: 9px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; color: #334155; margin-top: 8px; font-family: monospace; }")
[void]$hsb.AppendLine("  </style>")
[void]$hsb.AppendLine("</head>")
[void]$hsb.AppendLine("<body>")
[void]$hsb.AppendLine("  <div class='action-box'>")
[void]$hsb.AppendLine("    <h2>$($u.box_title)</h2>")
[void]$hsb.AppendLine("    <p>$($u.box_desc)</p>")
[void]$hsb.AppendLine("    <div class='alt-titles-box'>")
[void]$hsb.AppendLine("      <h3>$($u.alt_titles_heading)</h3>")
[void]$hsb.Append($altTitlesHtml.ToString())
[void]$hsb.AppendLine("    </div>")
[void]$hsb.AppendLine("    <div class='btn-group'>")
[void]$hsb.AppendLine("      <button type='button' class='btn' onclick='copyFullPost()'>$($u.btn_copy_all)</button>")
[void]$hsb.AppendLine("      <button type='button' class='btn btn-dark' onclick='copyCards()'>$($u.btn_copy_cards)</button>")
[void]$hsb.AppendLine("      <button type='button' class='btn btn-amber' onclick='copyTable()'>$($u.btn_copy_table)</button>")
[void]$hsb.AppendLine("      <button type='button' class='btn btn-blue' onclick='copyTags()'>$($u.btn_copy_tags)</button>")
[void]$hsb.AppendLine("    </div>")
[void]$hsb.AppendLine("    <div id='toast' class='toast'></div>")
[void]$hsb.AppendLine("  </div>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("  <div id='full-post-area' class='content-preview'>")
[void]$hsb.AppendLine("    <h1 id='post-title' style='font-size:22px; color:#0f172a; margin-top:0; line-height:1.4;'>$($themeObj.title)</h1>")
[void]$hsb.AppendLine("    <p style='color:#475569; font-size:14px; margin-bottom:14px;'>$($themeObj.subtitle)</p>")
[void]$hsb.AppendLine("    <div style='background:#f8fafc; padding:16px 18px; border-left:4px solid #03c75a; border-radius:4px; font-size:15px; line-height:1.75; color:#1e293b; margin-bottom:22px;'>")
[void]$hsb.AppendLine("      $($themeObj.hook_lead)")
[void]$hsb.AppendLine("    </div>")
[void]$hsb.AppendLine("    <hr style='border:0; border-top:1px solid #e2e8f0; margin:24px 0;'>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("    <div id='cards-container'>")
[void]$hsb.AppendLine("      <h2 style='font-size:18px; color:#0f172a; margin:0 0 14px;'>$($u.section1_title)</h2>")
[void]$hsb.Append($cardsHtml.ToString())
[void]$hsb.AppendLine("    </div>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("    <hr style='border:0; border-top:1px solid #e2e8f0; margin:26px 0;'>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("    <div id='table-container'>")
[void]$hsb.AppendLine("      <h2 style='font-size:18px; color:#0f172a; margin:0 0 8px;'>$($u.section2_title)</h2>")
[void]$hsb.AppendLine("      <p style='font-size:13px; color:#b45309; background:#fffbeb; padding:8px 12px; border-radius:4px; margin:0 0 12px; font-weight:bold;'>$($u.section2_desc)</p>")
[void]$hsb.AppendLine("      <table id='blog-table' border='1' style='border-collapse:collapse; width:100%; border:1px solid #cbd5e1; font-size:13px; background:#ffffff;'>")
[void]$hsb.AppendLine("        <thead>")
[void]$hsb.AppendLine("          <tr style='background:#f1f5f9; color:#0f172a;'>")
[void]$hsb.AppendLine("            <th style='padding:10px 8px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_no)</th>")
[void]$hsb.AppendLine("            <th style='padding:10px 8px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_cat)</th>")
[void]$hsb.AppendLine("            <th style='padding:10px 10px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_name)</th>")
[void]$hsb.AppendLine("            <th style='padding:10px 8px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_price)</th>")
[void]$hsb.AppendLine("            <th style='padding:10px 8px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_pour)</th>")
[void]$hsb.AppendLine("            <th style='padding:10px 10px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_pairing)</th>")
[void]$hsb.AppendLine("            <th style='padding:10px 8px; border:1px solid #cbd5e1; text-align:center;'>$($h.col_link)</th>")
[void]$hsb.AppendLine("          </tr>")
[void]$hsb.AppendLine("        </thead>")
[void]$hsb.AppendLine("        <tbody>")
[void]$hsb.Append($tableRowsHtml.ToString())
[void]$hsb.AppendLine("        </tbody>")
[void]$hsb.AppendLine("      </table>")
[void]$hsb.AppendLine("    </div>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("    <div style='background:#f0fdf4; border:2px solid #03c75a; border-radius:8px; padding:18px 20px; margin-top:26px; text-align:center;'>")
[void]$hsb.AppendLine("      <p style='font-size:14.5px; color:#1e293b; margin:0 0 12px; line-height:1.6;'>$($themeObj.closing_cta)</p>")
[void]$hsb.AppendLine("      <a href='$presetUrl' target='_blank' style='display:inline-block; background:#03c75a; color:#ffffff; padding:11px 20px; border-radius:6px; font-weight:bold; font-size:14.5px; text-decoration:none;'>$($u.lbl_archive_cta)</a>")
[void]$hsb.AppendLine("    </div>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("    <p style='font-size:12px; color:#64748b; margin-top:18px; padding-top:12px; border-top:1px dashed #cbd5e1;'>$($u.disclosure_text)</p>")
[void]$hsb.AppendLine("  </div>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("  <div class='tags-box'>")
[void]$hsb.AppendLine("    <h3><span>$($u.tags_section_title)</span> <button type='button' class='btn btn-blue' style='padding:5px 10px; font-size:12px;' onclick='copyTags()'>$($u.btn_copy_tags)</button></h3>")
[void]$hsb.AppendLine("    <div style='margin-bottom:8px;'>$($tagChipsHtml.ToString())</div>")
[void]$hsb.AppendLine("    <p style='margin:6px 0 0; font-size:12px; color:#64748b;'>$($u.tags_guide)</p>")
[void]$hsb.AppendLine("    <input type='text' id='tags-input' class='tags-input' readonly value='$tagsCsv' onclick='this.select();'>")
[void]$hsb.AppendLine("    <input type='text' id='temp-title-input' style='position:absolute; left:-9999px;' readonly value=''>")
[void]$hsb.AppendLine("  </div>")
[void]$hsb.AppendLine("")
[void]$hsb.AppendLine("  <script>")
[void]$hsb.AppendLine("    function showToast(msg) {")
[void]$hsb.AppendLine("      var t = document.getElementById('toast');")
[void]$hsb.AppendLine("      t.textContent = msg;")
[void]$hsb.AppendLine("      t.style.display = 'block';")
[void]$hsb.AppendLine("      setTimeout(function() { t.style.display = 'none'; }, 4000);")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("    function copyElementHtml(element, successMsg) {")
[void]$hsb.AppendLine("      try {")
[void]$hsb.AppendLine("        var range = document.createRange();")
[void]$hsb.AppendLine("        range.selectNode(element);")
[void]$hsb.AppendLine("        var selection = window.getSelection();")
[void]$hsb.AppendLine("        selection.removeAllRanges();")
[void]$hsb.AppendLine("        selection.addRange(range);")
[void]$hsb.AppendLine("        document.execCommand('copy');")
[void]$hsb.AppendLine("        selection.removeAllRanges();")
[void]$hsb.AppendLine("        showToast(successMsg);")
[void]$hsb.AppendLine("      } catch (err) {")
[void]$hsb.AppendLine("        alert('$($u.err_msg)');")
[void]$hsb.AppendLine("      }")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("    function copyFullPost() {")
[void]$hsb.AppendLine("      var target = document.getElementById('full-post-area');")
[void]$hsb.AppendLine("      copyElementHtml(target, '$($u.toast_all)');")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("    function copyCards() {")
[void]$hsb.AppendLine("      var target = document.getElementById('cards-container');")
[void]$hsb.AppendLine("      copyElementHtml(target, '$($u.toast_cards)');")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("    function copyTable() {")
[void]$hsb.AppendLine("      var target = document.getElementById('table-container');")
[void]$hsb.AppendLine("      copyElementHtml(target, '$($u.toast_table)');")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("    function copyTags() {")
[void]$hsb.AppendLine("      var input = document.getElementById('tags-input');")
[void]$hsb.AppendLine("      input.select();")
[void]$hsb.AppendLine("      document.execCommand('copy');")
[void]$hsb.AppendLine("      showToast('$($u.toast_tags)');")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("    function copyTitleBtn(btn) {")
[void]$hsb.AppendLine("      var text = btn.getAttribute('data-title');")
[void]$hsb.AppendLine("      var input = document.getElementById('temp-title-input');")
[void]$hsb.AppendLine("      input.value = text;")
[void]$hsb.AppendLine("      input.select();")
[void]$hsb.AppendLine("      document.execCommand('copy');")
[void]$hsb.AppendLine("      showToast('$($u.toast_title)');")
[void]$hsb.AppendLine("    }")
[void]$hsb.AppendLine("  </script>")
[void]$hsb.AppendLine("</body>")
[void]$hsb.AppendLine("</html>")

[System.IO.File]::WriteAllText($htmlPath, $hsb.ToString(), $utf8NoBom)
Write-Host ("Generated Magazine Blog Post (.md): {0}" -f $OutputPath)
Write-Host ("Generated SmartEditor HTML Viewer (.html): {0}" -f $htmlPath)
