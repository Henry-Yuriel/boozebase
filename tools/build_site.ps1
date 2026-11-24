# build_site.ps1 - Booze Base v2 static site generator (pure ASCII; Korean text lives in site_src/*.json and templates)
# Usage: powershell -ExecutionPolicy Bypass -File .\tools\build_site.ps1
param(
    [string]$OutDir = "",
    [switch]$SkipRootSync,
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
Remove-Item Alias:h -Force -ErrorAction SilentlyContinue
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "site_src"
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $root "dist" }
$utf8 = New-Object System.Text.UTF8Encoding($false)

function ReadText([string]$p) { return [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }
function WriteText([string]$p, [string]$t) {
    $d = Split-Path -Parent $p
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    [IO.File]::WriteAllText($p, $t, $utf8)
}
function H($s) {
    if ($null -eq $s) { return "" }
    return ([string]$s).Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace('"', "&quot;").Replace("'", "&#39;")
}
function Fill([string]$tpl, [hashtable]$map) {
    $sb = New-Object System.Text.StringBuilder($tpl)
    foreach ($k in $map.Keys) { [void]$sb.Replace("{{" + $k + "}}", [string]$map[$k]) }
    return $sb.ToString()
}
function Fmt([string]$s, [hashtable]$map) {
    foreach ($k in $map.Keys) { $s = $s.Replace("{" + $k + "}", [string]$map[$k]) }
    return $s
}
function Won([int]$n) { return [char]0x20A9 + ("{0:N0}" -f $n) }
function Norm([string]$s) { return ($s.ToLowerInvariant() -replace "\s+", "") }

# ---------- load ----------
$cfg   = ReadText (Join-Path $src "site_config.json") | ConvertFrom-Json
$items = ReadText (Join-Path $root "liquor_data.json") | ConvertFrom-Json
$S = $cfg.strings
$site = $cfg.site
$siteUrl = $site.url.TrimEnd("/")
$build = Get-Date -Format "yyyyMMddHHmm"

$tplDir = Join-Path $src "templates"
$T = @{}
foreach ($n in @("layout", "card", "home", "list", "bottle", "test", "guides", "guide")) { $T[$n] = ReadText (Join-Path $tplDir ($n + ".html")) }

$catByKey = @{}
foreach ($c in $cfg.categories) { $catByKey[$c.key] = $c }
$flavorLabel = @{}
$flavorBit = @{}
$bitIdx = 0
foreach ($f in $cfg.flavor_tags) {
    $flavorLabel[$f.key] = $f.label
    $flavorBit[$f.key] = (1 -shl $bitIdx)
    $bitIdx++
}
$flavorOrder = @($cfg.flavor_tags | ForEach-Object { $_.key })
$featured = @($cfg.featured_ids)
$noteRegex = [string]$S.price_note_regex

$pairKeys = @($cfg.affiliate.pairing_keywords.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object { $_.Length } -Descending)

# ---------- enrich bottles ----------
$bottles = New-Object System.Collections.ArrayList
$order = 0
foreach ($it in $items) {
    $order++
    $id = [string]$it.product_id
    $cat = [string]$it.category
    $name = [string]$it.name
    $price = [int]$it.price
    $vol = [int]$it.attributes.volume_ml
    if ($vol -le 0) { $vol = 750 }
    $img = ([string]$it.image) -replace "^\./", "/"
    if (-not $img.StartsWith("/")) { $img = "/" + $img }
    $note = [string]$it.price_note
    $pairing = [string]$it.pairing_item
    $text = $name + " " + $note

    # flavor tags
    $tags = New-Object System.Collections.ArrayList
    foreach ($ft in $cfg.flavor_tags) {
        $cats = @($ft.cats)
        if ($cats.Count -gt 0 -and -not ($cats -contains $cat)) { continue }
        $hit = $false
        if ($ft.id_regex -and ($id -match [string]$ft.id_regex)) { $hit = $true }
        if (-not $hit) { foreach ($kw in $ft.keywords) { if ($text.Contains([string]$kw)) { $hit = $true; break } } }
        if ($hit) { [void]$tags.Add([string]$ft.key) }
    }
    $flavorOnly = @($tags | Where-Object { $_ -ne "highball" })
    if ($flavorOnly.Count -eq 0) {
        foreach ($d in @($cfg.default_flavors.$cat)) { if (-not $tags.Contains([string]$d)) { [void]$tags.Insert(0, [string]$d) } }
    }
    $tags = @($flavorOrder | Where-Object { $tags -contains $_ })
    if ($tags.Count -gt 4) { $tags = @($tags[0..3]) }

    # pairing groups
    $groups = @()
    foreach ($pg in $cfg.pairing_groups) {
        foreach ($kw in $pg.keywords) { if ($pairing.Contains([string]$kw)) { $groups += [string]$pg.key; break } }
    }

    # snack affiliate link
    $snackUrl = ""; $snackPartner = $false
    $direct = $cfg.affiliate.direct.$id
    if ($direct) { $snackUrl = [string]$direct; $snackPartner = $true }
    else {
        foreach ($k in $pairKeys) {
            if ($pairing.Contains($k)) { $snackUrl = [string]$cfg.affiliate.pairing_keywords.$k; $snackPartner = $true; break }
        }
    }
    if (-not $snackUrl -and ([string]$it.affiliate_link) -match '^https://link\.coupang\.com/') {
        $snackUrl = [string]$it.affiliate_link; $snackPartner = $true
    }
    if (-not $snackUrl) { $snackUrl = [string]$cfg.affiliate.fallback_search + [Uri]::EscapeDataString($pairing) }

    # barware
    $bw = $null
    foreach ($b in $cfg.affiliate.barware) {
        if (-not (@($b.cats) -contains $cat)) { continue }
        $hasRule = ([string]$b.id_regex) -or (@($b.keywords).Count -gt 0)
        $ok = $false
        if ($b.id_regex -and ($id -match [string]$b.id_regex)) { $ok = $true }
        if (-not $ok) { foreach ($kw in $b.keywords) { if ($name.Contains([string]$kw)) { $ok = $true; break } } }
        if ($ok -or -not $hasRule) { $bw = $b; break }
    }

    $isPriceNote = $note -and ($note -match $noteRegex)
    $tagLabels = ($tags | ForEach-Object { $flavorLabel[$_] }) -join " "
    $tMask = 0
    foreach ($tk in $tags) { if ($flavorBit.ContainsKey($tk)) { $tMask = $tMask -bor $flavorBit[$tk] } }
    $logP = [Math]::Log([double]([Math]::Max(1, $price)))
    $catObj = $catByKey[$cat]

    $obj = [pscustomobject]@{
        id = $id; name = $name; cat = $cat; price = $price; vol = $vol; img = $img; order = $order
        note = $note; isPriceNote = $isPriceNote; pairing = $pairing; tags = $tags; tagMask = $tMask; logPrice = $logP; groups = $groups
        snackUrl = $snackUrl; snackPartner = $snackPartner; bw = $bw
        checked = [string]$it.price_checked_on; sourceUrl = [string]$it.market_source_url
        sourceTitle = $(if ($it.source_title) { [string]$it.source_title } else { [string]$it.attributes.listing_label })
        listing = [string]$it.attributes.listing_label
        featured = ($featured -contains $id)
        catLabel = [string]$catObj.label; catSlug = [string]$catObj.slug; catEmoji = [string]$catObj.emoji
        search = (Norm ($name + " " + $id + " " + $pairing + " " + $catObj.label + " " + $tagLabels))
        url = "/bottle/" + $id + "/"
    }
    [void]$bottles.Add($obj)
}
$total = $bottles.Count
$byId = @{}
foreach ($b in $bottles) { $byId[$b.id] = $b }

# ---------- render helpers ----------
function TagChips($b, [int]$max) {
    $out = ""
    $i = 0
    foreach ($t in $b.tags) {
        if ($i -ge $max) { break }
        $out += '<span class="chip" data-f="' + $t + '">' + (H $flavorLabel[$t]) + '</span>'
        $i++
    }
    return $out
}
$cardCache = @{}
foreach ($b in $bottles) {
    $cardCache[$b.id] = (Fill $T.card @{
        SEARCH = (H $b.search); PRICE_RAW = $b.price; TAGS_RAW = ($b.tags -join " "); ORDER = $b.order
        IMG = (H $b.img); NAME = (H $b.name); CAT_LABEL = (H $b.catLabel); VOL = $b.vol; URL = $b.url
        TAG_CHIPS = (TagChips $b 2); PRICE = (Won $b.price)
    })
}
function Card($b) { return $cardCache[$b.id] }
function PriceBand([int]$p) {
    if ($p -le 30000) { return $S.price_band_1 }
    if ($p -le 70000) { return $S.price_band_2 }
    if ($p -le 150000) { return $S.price_band_3 }
    if ($p -le 300000) { return $S.price_band_4 }
    return $S.price_band_5
}
$footerCats = ($cfg.categories | ForEach-Object { '<li><a href="/category/' + $_.slug + '/">' + (H $_.label) + '</a></li>' }) -join ""
$footerPicks = ($cfg.picks | ForEach-Object { '<li><a href="/picks/' + $_.slug + '/">' + (H $_.short) + '</a></li>' }) -join ""

$adCfg = $cfg.adsense
$adClient = $(if ($adCfg -and $adCfg.client) { ([string]$adCfg.client).Trim() } else { "" })
$hasAdClient = ($adClient -match "^ca-pub-\d{10,20}$" -and $adClient -ne "ca-pub-0000000000000000")
$adsenseHead = $(if ($hasAdClient) {
    '<meta name="google-adsense-account" content="' + (H $adClient) + '">' + "`n" +
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + (H $adClient) + '" crossorigin="anonymous"></script>'
} else { "" })
$adTestSlot = $(if ($adCfg -and $adCfg.slots -and $adCfg.slots.test_result) { ([string]$adCfg.slots.test_result).Trim() } else { "" })
$reviewMode = [bool]($adCfg -and $adCfg.review_mode)

function AdSlot([string]$slotKey, [string]$nativeKey) {
    $slotId = $(if ($adCfg -and $adCfg.slots -and $adCfg.slots.$slotKey) { ([string]$adCfg.slots.$slotKey).Trim() } else { "" })
    if ($hasAdClient -and $slotId) {
        return '<aside class="ad-slot" aria-label="AD"><span class="ad-badge">AD &middot; GOOGLE ADSENSE</span><ins class="adsbygoogle" style="display:block" data-ad-client="' + (H $adClient) + '" data-ad-slot="' + (H $slotId) + '" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></aside>'
    }
    if (-not $reviewMode -and $nativeKey -and $adCfg -and $adCfg.native_banners -and $adCfg.native_banners.$nativeKey) {
        $nb = $adCfg.native_banners.$nativeKey
        return '<aside class="ad-slot" aria-label="SPONSORED"><span class="ad-badge">' + (H $nb.badge) + '</span><div class="ad-native"><span class="ad-native-ico" aria-hidden="true">' + $nb.emoji + '</span><div class="ad-native-txt"><b>' + (H $nb.title) + '</b><p>' + (H $nb.desc) + '</p></div><a class="btn btn-primary btn-sm" href="' + (H $nb.url) + '" target="_blank" rel="sponsored nofollow noopener">' + (H $nb.cta) + '</a></div></aside>'
    }
    return ""
}

function Page([string]$relPath, [hashtable]$p) {
    $canon = $siteUrl + $p.path
    $map = @{
        TITLE = (H $p.title); DESC = (H $p.desc); CANONICAL = $canon; ROBOTS = $(if ($p.robots) { $p.robots } else { "index,follow,max-image-preview:large" })
        NAVER_VERIFY = $site.naver_verification; GOOGLE_VERIFY = $site.google_verification
        OG_TYPE = $(if ($p.ogType) { $p.ogType } else { "website" })
        OG_IMAGE = $(if ($p.ogImage) { $p.ogImage } else { $siteUrl + "/assets/images/og-cover.png" })
        BUILD = $build; ADSENSE_HEAD = $adsenseHead; ADSENSE_CLIENT = $(if ($hasAdClient) { (H $adClient) } else { "" }); ADSENSE_TEST_SLOT = (H $adTestSlot)
        JSONLD = [string]$p.jsonld; PAGE = $p.page; ENDPOINT = (H $site.reviews_endpoint)
        BODY = $p.body; TOTAL = $total; FOOTER_CATS = $footerCats; FOOTER_PICKS = $footerPicks; SCRIPTS = [string]$p.scripts
    }
    $map[("NAV_" + [string]$p.nav)] = "is-active"
    $html = Fill $T.layout $map
    $html = $html -replace "\{\{NAV_[^}]+\}\}", ""
    WriteText (Join-Path $OutDir $relPath) $html
}
function Crumbs($pairs) {
    $list = @()
    $i = 1
    foreach ($pr in $pairs) {
        $list += [ordered]@{ "@type" = "ListItem"; position = $i; name = $pr[0]; item = ($siteUrl + $pr[1]) }
        $i++
    }
    $obj = [ordered]@{ "@context" = "https://schema.org"; "@type" = "BreadcrumbList"; itemListElement = $list }
    return '<script type="application/ld+json">' + (ConvertTo-Json -InputObject $obj -Depth 6 -Compress) + '</script>'
}

# ---------- clean output ----------
if (Test-Path $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# ---------- assets ----------
foreach ($sub in @("css", "js")) {
    $from = Join-Path $src ("assets\" + $sub)
    $to = Join-Path $OutDir ("assets\" + $sub)
    New-Item -ItemType Directory -Path $to -Force | Out-Null
    Copy-Item -Path (Join-Path $from "*") -Destination $to -Recurse -Force
}
$imgTo = Join-Path $OutDir "assets\images"
New-Item -ItemType Directory -Path $imgTo -Force | Out-Null
& robocopy (Join-Path $root "assets\images") $imgTo /E /NFL /NDL /NJH /NJS /NP | Out-Null

# search / quiz index
$idx = foreach ($b in $bottles) {
    [ordered]@{ id = $b.id; n = $b.name; c = $b.cat; p = $b.price; v = $b.vol; i = $b.img; t = @($b.tags); g = @($b.groups); a = $b.pairing; u = $b.snackUrl; bl = $b.bw.label; bu = $b.bw.url; s = $b.search; f = [int]$b.featured }
}
WriteText (Join-Path $OutDir "assets\data\index.json") (ConvertTo-Json -InputObject @($idx) -Depth 4 -Compress)

$seedAll = @($cfg.seed_reviews)
function ReviewCard($r) {
    $b = $byId[[string]$r.product_id]
    $n = [Math]::Max(1, [Math]::Min(5, [int]$r.rating))
    $stars = ([string][char]0x2605) * $n + ([string][char]0x2606) * (5 - $n)
    $title = $(if ($b) { '<a href="' + $b.url + '">' + (H $b.name) + '</a>' } else { "" })
    return '<article class="review"><div class="review-top"><b>' + $title + '</b><span class="stars">' + $stars + '</span></div><p>' + [char]0x201C + (H $r.comment) + [char]0x201D + '</p><div class="review-foot"><span class="review-snack">' + (H $r.pairing_snack) + '</span><span>' + (H $r.nickname) + '</span></div></article>'
}

# ---------- guides load ----------
$guideOrder = @(
    "whisky-beginner-guide", "cask-guide", "peat-islay-guide", "japanese-whisky-guide", "whisky-tasting-method", "highball-guide",
    "wine-label-guide", "red-wine-grapes", "white-sparkling-guide", "wine-serving-guide",
    "sake-grade-guide", "sake-temperature-guide", "korean-spirits-guide",
    "meat-pairing-guide", "seafood-pairing-guide", "glassware-guide", "gift-guide", "home-bar-budget"
)
$guidesDir = Join-Path $src "guides"
$guidesRaw = @{}
if (Test-Path $guidesDir) {
    foreach ($gf in (Get-ChildItem -Path $guidesDir -Filter "*.html" -File)) {
        $raw = ReadText $gf.FullName
        $m = [regex]::Match($raw, '(?s)^\s*<!--meta\s*(\{.*?\})\s*-->\s*(.*)$')
        if (-not $m.Success) { throw ("Missing <!--meta {...} --> header in " + $gf.Name) }
        $meta = $m.Groups[1].Value | ConvertFrom-Json
        $content = $m.Groups[2].Value.Trim()
        # Inject sec-N ids on h2 and build TOC
        $tocItems = New-Object System.Collections.ArrayList
        $script:secIdx = 0
        $content = [regex]::Replace($content, '<h2>(.*?)</h2>', {
            param($match)
            $script:secIdx++
            $sid = "sec-" + $script:secIdx
            $inner = $match.Groups[1].Value
            $plain = [regex]::Replace($inner, '<[^>]+>', '')
            [void]$tocItems.Add('<li><a href="#' + $sid + '">' + $plain + '</a></li>')
            return '<h2 id="' + $sid + '">' + $inner + '</h2>'
        })
        $tocHtml = $(if ($tocItems.Count -ge 2) { '<nav class="guide-toc" aria-label="TOC"><b>' + (H $S.guide_toc) + '</b><ol>' + ($tocItems -join "") + '</ol></nav>' } else { "" })
        $gObj = [pscustomobject]@{
            slug = [string]$meta.slug; title = [string]$meta.title; h1 = [string]$meta.h1; desc = [string]$meta.desc
            emoji = [string]$meta.emoji; category = [string]$meta.category; updated = [string]$meta.updated
            read_min = [int]$meta.read_min
            related_bottles = @($meta.related_bottles); related_picks = @($meta.related_picks); related_categories = @($meta.related_categories)
            content = $content; toc = $tocHtml; url = "/guide/" + [string]$meta.slug + "/"
        }
        $guidesRaw[$gObj.slug] = $gObj
    }
}
$guides = New-Object System.Collections.ArrayList
foreach ($slug in $guideOrder) { if ($guidesRaw.ContainsKey($slug)) { [void]$guides.Add($guidesRaw[$slug]) } }
foreach ($k in ($guidesRaw.Keys | Sort-Object)) { if (-not ($guideOrder -contains $k)) { [void]$guides.Add($guidesRaw[$k]) } }

function GuideCard($g) {
    return '<article class="guide-card" data-cat="' + (H $g.category) + '"><div class="guide-card-top"><span class="chip chip-accent">' + $g.emoji + ' ' + (H $g.category) + '</span><span>' + $g.read_min + ' min</span></div><h3><a href="' + $g.url + '">' + (H $g.h1) + '</a></h3><p>' + (H $g.desc) + '</p><div class="guide-card-foot"><span>' + (H $g.updated) + '</span><span>' + (H $S.guide_read_more) + '</span></div></article>'
}

# ---------- home ----------
$heroIds = @($featured[0], $featured[4], $featured[1])
$heroCards = ($heroIds | ForEach-Object { $b = $byId[$_]; '<div class="hero-card"><img src="' + (H $b.img) + '" alt="" width="190" height="190"><b>' + (H $b.name) + '</b><span>' + (Won $b.price) + '</span></div>' }) -join ""
$catTiles = ($cfg.categories | ForEach-Object {
    $k = $_.key; $cnt = @($bottles | Where-Object { $_.cat -eq $k }).Count
    '<a class="tile" href="/category/' + $_.slug + '/"><span class="tile-emoji" aria-hidden="true">' + $_.emoji + '</span><b>' + (H $_.label) + '</b><small>' + $cnt + (H $S.unit_kinds) + '</small></a>'
}) -join ""

function PickMembers($pk) {
    switch ([string]$pk.rule) {
        "price_max"   { return @($bottles | Where-Object { $_.price -le [int]$pk.max }) }
        "price_min"   { return @($bottles | Where-Object { $_.price -ge [int]$pk.min }) }
        "price_range" { return @($bottles | Where-Object { $_.price -ge [int]$pk.min -and $_.price -le [int]$pk.max }) }
        "tag"         { $tg = [string]$pk.tag; return @($bottles | Where-Object { $_.tags -contains $tg }) }
        "group"       { $gp = [string]$pk.group; return @($bottles | Where-Object { $_.groups -contains $gp }) }
    }
    return @()
}
$pickMembers = @{}
foreach ($pk in $cfg.picks) { $pickMembers[$pk.slug] = PickMembers $pk }
$pickTiles = ($cfg.picks | ForEach-Object {
    '<a class="pick" href="/picks/' + $_.slug + '/"><span class="pick-emoji" aria-hidden="true">' + $_.emoji + '</span><span><b>' + (H $_.title) + '</b><small>' + $pickMembers[$_.slug].Count + (H $S.unit_kinds) + '</small></span></a>'
}) -join ""
$adHomeMid = AdSlot "home_mid" "home_mid"
$adHomeBottom = AdSlot "home_bottom" "home_bottom"
$adListTop = AdSlot "list_top" "list_top"
$adListBottom = AdSlot "list_bottom" "list_bottom"
$adBottleMid = AdSlot "bottle_mid" "home_mid"
$adBottleBottom = AdSlot "bottle_bottom" ""

$homeGuideSlugs = @("whisky-beginner-guide", "wine-label-guide", "sake-grade-guide", "highball-guide", "meat-pairing-guide", "glassware-guide")
$homeGuideList = @($homeGuideSlugs | Where-Object { $guidesRaw.ContainsKey($_) } | ForEach-Object { $guidesRaw[$_] })
if ($homeGuideList.Count -lt 6) {
    foreach ($g in $guides) {
        if ($homeGuideList.Count -ge 6) { break }
        if (-not ($homeGuideList | Where-Object { $_.slug -eq $g.slug })) { $homeGuideList += $g }
    }
}
$homeGuidesHtml = ($homeGuideList | ForEach-Object { GuideCard $_ }) -join ""

$featCards = ($featured | ForEach-Object { Card $byId[$_] }) -join ""
$homeReviews = ($seedAll | Select-Object -First 6 | ForEach-Object { ReviewCard $_ }) -join ""
$homeBody = Fill $T.home @{ TOTAL = $total; HERO_CARDS = $heroCards; CATEGORY_TILES = $catTiles; FEATURED_CARDS = $featCards; PICK_TILES = $pickTiles; HOME_GUIDES = $homeGuidesHtml; REVIEW_CARDS = $homeReviews; AD_HOME_MID = $adHomeMid; AD_HOME_BOTTOM = $adHomeBottom }
$siteLd = '<script type="application/ld+json">' + (ConvertTo-Json -Compress -InputObject ([ordered]@{ "@context" = "https://schema.org"; "@type" = "WebSite"; name = $site.name; alternateName = $site.name_en; url = ($siteUrl + "/") })) + '</script>'
Page "index.html" @{ path = "/"; title = $S.title_home; desc = $site.description; body = $homeBody; page = "home"; nav = "home"; jsonld = $siteLd }

# ---------- guide hub & article pages ----------
if ($guides.Count -gt 0) {
    $gCats = @()
    foreach ($g in $guides) { if (-not ($gCats -contains $g.category)) { $gCats += $g.category } }
    $gCatBtns = '<button type="button" data-gcat="" aria-pressed="true">' + (H $S.all_flavors) + ' ' + $guides.Count + '</button>'
    foreach ($gc in $gCats) {
        $cnt = @($guides | Where-Object { $_.category -eq $gc }).Count
        $gCatBtns += '<button type="button" data-gcat="' + (H $gc) + '" aria-pressed="false">' + (H $gc) + ' ' + $cnt + '</button>'
    }
    $gCardsAll = ($guides | ForEach-Object { GuideCard $_ }) -join ""
    $guidesBody = Fill $T.guides @{ H1 = (H $S.guides_h1); INTRO = (H $S.guides_intro); CAT_BUTTONS = $gCatBtns; GUIDE_CARDS = $gCardsAll; TOTAL = $total }
    Page "guide\index.html" @{ path = "/guide/"; title = $S.title_guides; desc = $S.desc_guides; body = $guidesBody; page = "guides"; nav = "guide"; jsonld = (Crumbs @(@("Home", "/"), @($S.guides_h1, "/guide/"))) }

    foreach ($g in $guides) {
        $relB = @($g.related_bottles | Where-Object { $byId.ContainsKey($_) } | ForEach-Object { Card $byId[$_] }) -join ""
        $relBSec = $(if ($relB) { '<section class="section-sm"><div class="wrap"><div class="sec-head"><div><h2>' + (H $S.guide_related_bottles) + '</h2></div><a class="more" href="/test/">' + (H $S.nf_test) + ' &rarr;</a></div><div class="grid">' + $relB + '</div></div></section>' } else { "" })
        $otherGuides = @($guides | Where-Object { $_.slug -ne $g.slug -and $_.category -eq $g.category }) + @($guides | Where-Object { $_.slug -ne $g.slug -and $_.category -ne $g.category })
        $relGHtml = ($otherGuides | Select-Object -First 3 | ForEach-Object { GuideCard $_ }) -join ""

        $gBody = Fill $T.guide @{
            CAT = (H $g.category); EMOJI = $g.emoji; H1 = (H $g.h1); OPERATOR = (H $site.operator_name)
            UPDATED = (H $g.updated); READ_MIN = $g.read_min; TOC = $g.toc; CONTENT = $g.content
            RELATED_BOTTLES_SECTION = $relBSec; RELATED_GUIDES = $relGHtml
        }
        $artObj = [ordered]@{
            "@context" = "https://schema.org"; "@type" = "Article"; headline = $g.h1; description = $g.desc
            dateModified = $g.updated; datePublished = $g.updated
            author = [ordered]@{ "@type" = "Organization"; name = $site.operator_name }
            publisher = [ordered]@{ "@type" = "Organization"; name = $site.name; url = ($siteUrl + "/") }
            mainEntityOfPage = ($siteUrl + $g.url)
        }
        $artLd = '<script type="application/ld+json">' + (ConvertTo-Json -InputObject $artObj -Depth 6 -Compress) + '</script>'
        $gCrumbs = Crumbs @(@("Home", "/"), @($S.guides_h1, "/guide/"), @($g.h1, $g.url))
        Page ("guide\" + $g.slug + "\index.html") @{
            path = $g.url; title = ($g.title + " | " + $site.name); desc = $g.desc; body = $gBody; page = "guide"; nav = "guide"
            ogType = "article"; jsonld = ($gCrumbs + "`n" + $artLd)
        }
    }
}

# ---------- list pages ----------
function FlavorButtons($members) {
    $out = '<button type="button" data-f="" aria-pressed="true">' + (H $S.all_flavors) + '</button>'
    foreach ($fk in $flavorOrder) {
        $c = @($members | Where-Object { $_.tags -contains $fk }).Count
        if ($c -gt 0) { $out += '<button type="button" data-f="' + $fk + '" aria-pressed="false">' + (H $flavorLabel[$fk]) + ' ' + $c + '</button>' }
    }
    return $out
}
foreach ($c in $cfg.categories) {
    $k = $c.key
    $members = @($bottles | Where-Object { $_.cat -eq $k })
    $sub = ($cfg.categories | ForEach-Object { '<a href="/category/' + $_.slug + '/"' + $(if ($_.key -eq $k) { ' class="is-active" aria-current="page"' } else { "" }) + '>' + $_.emoji + ' ' + (H $_.label) + '</a>' }) -join ""
    $body = Fill $T.list @{ CRUMB = (H $c.label); EMOJI = $c.emoji; H1 = (H $c.label); INTRO = (H $c.desc); SUBNAV = $sub; FLAVOR_BUTTONS = (FlavorButtons $members); COUNT = $members.Count; CARDS = (($members | ForEach-Object { Card $_ }) -join ""); TOTAL = $total; AD_LIST_TOP = $adListTop; AD_LIST_BOTTOM = $adListBottom }
    $vars = @{ label = $c.label; count = $members.Count; desc = $c.desc }
    Page ("category\" + $c.slug + "\index.html") @{ path = ("/category/" + $c.slug + "/"); title = (Fmt $S.title_category $vars); desc = (Fmt $S.desc_category $vars); body = $body; page = "list"; nav = $c.slug; jsonld = (Crumbs @(@("Home", "/"), @($c.label, ("/category/" + $c.slug + "/")))) }
}
foreach ($pk in $cfg.picks) {
    $members = @($pickMembers[$pk.slug])
    $sub = ($cfg.picks | ForEach-Object { '<a href="/picks/' + $_.slug + '/"' + $(if ($_.slug -eq $pk.slug) { ' class="is-active" aria-current="page"' } else { "" }) + '>' + $_.emoji + ' ' + (H $_.short) + '</a>' }) -join ""
    $body = Fill $T.list @{ CRUMB = (H $S.crumb_picks) + " &rsaquo; " + (H $pk.title); EMOJI = $pk.emoji; H1 = (H $pk.title); INTRO = (H $pk.desc); SUBNAV = $sub; FLAVOR_BUTTONS = (FlavorButtons $members); COUNT = $members.Count; CARDS = (($members | ForEach-Object { Card $_ }) -join ""); TOTAL = $total; AD_LIST_TOP = $adListTop; AD_LIST_BOTTOM = $adListBottom }
    $vars = @{ title = $pk.title; count = $members.Count; desc = $pk.desc }
    Page ("picks\" + $pk.slug + "\index.html") @{ path = ("/picks/" + $pk.slug + "/"); title = (Fmt $S.title_pick $vars); desc = (Fmt $S.desc_pick $vars); body = $body; page = "list"; nav = "picks"; jsonld = (Crumbs @(@("Home", "/"), @($pk.title, ("/picks/" + $pk.slug + "/")))) }
}

# ---------- bottle pages ----------
$byCat = @{}
foreach ($b in $bottles) { if (-not $byCat.ContainsKey($b.cat)) { $byCat[$b.cat] = New-Object System.Collections.ArrayList }; [void]$byCat[$b.cat].Add($b) }
$catPriceRank = @{}
$catTagCount = @{}
foreach ($ck in $byCat.Keys) {
    $sortedCat = @($byCat[$ck] | Sort-Object price, order)
    $rk = 0
    foreach ($sb in $sortedCat) { $rk++; $catPriceRank[$sb.id] = $rk }
    foreach ($fk in $flavorOrder) {
        $catTagCount[$ck + "|" + $fk] = @($byCat[$ck] | Where-Object { $_.tags -contains $fk }).Count
    }
}

function BottleGuideHtml($b) {
    $flvItems = @($b.tags | ForEach-Object {
        $ex = $cfg.flavor_explain.$_
        if ($ex) { '<li>' + (H $ex) + '</li>' }
    }) -join ""
    $srv = $cfg.category_serving.($b.cat)
    $pgKey = $(if ($b.groups.Count -gt 0 -and $cfg.pairing_explain.($b.groups[0])) { $b.groups[0] } else { "default" })
    $pairTxt = Fmt ([string]$cfg.pairing_explain.$pgKey) @{ pairing = $b.pairing }
    $pourMl = 30
    if ($b.cat -eq "red_wine" -or $b.cat -eq "white_wine") { $pourMl = 125 }
    elseif ($b.cat -eq "sake") { $pourMl = 90 }
    elseif ($b.cat -eq "other" -and $b.price -le 55000) { $pourMl = 45 }
    $pours = [Math]::Max(1, [int][Math]::Round($b.vol / $pourMl))
    $perPour = [Math]::Max(500, [int]([Math]::Round(($b.price / $pours) / 100) * 100))
    $pourTxt = Fmt ([string]$S.bg_pour) @{ vol = $b.vol; pour = $pourMl; n = $pours; per = (Won $perPour) }
    $rankTxt = Fmt ([string]$S.bg_rank) @{ cat = $b.catLabel; count = $byCat[$b.cat].Count; rank = $catPriceRank[$b.id]; band = (PriceBand $b.price) }
    $peerTxt = ""
    if ($b.tags.Count -gt 0) {
        $t0 = $b.tags[0]
        $peerTxt = Fmt ([string]$S.bg_tagpeers) @{ tag = $flavorLabel[$t0]; cat = $b.catLabel; count = $catTagCount[$b.cat + "|" + $t0] }
    }
    $h2 = Fmt ([string]$S.bg_title) @{ name = $b.name }
    return '<section class="bottle-guide-sec"><div class="wrap"><div class="bottle-guide-box"><h2>' + (H $h2) + '</h2><div class="bottle-guide-grid">' +
        '<div class="bottle-guide-card"><h3>' + (H $S.bg_flavor) + '</h3><ul>' + $flvItems + '</ul></div>' +
        '<div class="bottle-guide-card"><h3>' + (H $S.bg_serve) + '</h3><div class="bottle-guide-kv"><span><b>' + (H $S.bg_temp) + '</b> ' + (H $srv.temp) + '</span><span><b>' + (H $S.bg_glass) + '</b> ' + (H $srv.glass) + '</span></div><p>' + (H $srv.how) + '</p></div>' +
        '<div class="bottle-guide-card"><h3>' + (H $S.bg_pair) + '</h3><p>' + (H $pairTxt) + '</p></div>' +
        '<div class="bottle-guide-card"><h3>' + (H $S.bg_price) + '</h3><p>' + (H $pourTxt) + ' ' + (H $rankTxt) + '</p>' + $(if ($peerTxt) { '<p>' + (H $peerTxt) + '</p>' } else { '' }) + '</div>' +
        '</div></div></div></section>'
}

function BottleGuidesLinks($b) {
    if ($guides.Count -eq 0) { return "" }
    $picks = New-Object System.Collections.ArrayList
    $addSlug = {
        param([string]$sl)
        if ($guidesRaw.ContainsKey($sl) -and -not ($picks -contains $sl)) { [void]$picks.Add($sl) }
    }
    if ($b.cat -eq "whisky") {
        if ($b.tags -contains "smoky") { & $addSlug "peat-islay-guide" }
        if ($b.tags -contains "sherry") { & $addSlug "cask-guide" }
        if ($b.tags -contains "highball") { & $addSlug "highball-guide" }
        & $addSlug "whisky-tasting-method"
        & $addSlug "whisky-beginner-guide"
    } elseif ($b.cat -eq "red_wine") {
        & $addSlug "red-wine-grapes"
        & $addSlug "wine-label-guide"
        & $addSlug "wine-serving-guide"
    } elseif ($b.cat -eq "white_wine") {
        & $addSlug "white-sparkling-guide"
        & $addSlug "wine-serving-guide"
        & $addSlug "wine-label-guide"
    } elseif ($b.cat -eq "sake") {
        & $addSlug "sake-grade-guide"
        & $addSlug "sake-temperature-guide"
    } else {
        & $addSlug "korean-spirits-guide"
        if ($b.tags -contains "highball") { & $addSlug "highball-guide" }
        & $addSlug "glassware-guide"
    }
    if ($b.groups -contains "meat") { & $addSlug "meat-pairing-guide" }
    elseif ($b.groups -contains "seafood") { & $addSlug "seafood-pairing-guide" }
    & $addSlug "glassware-guide"
    & $addSlug "home-bar-budget"

    $chosen = @($picks | Select-Object -First 3 | ForEach-Object { GuideCard $guidesRaw[$_] }) -join ""
    if (-not $chosen) { return "" }
    return '<section class="section-sm"><div class="wrap"><div class="sec-head"><div><h2>' + (H $S.bottle_guides_h2) + '</h2><p>' + (H $S.bottle_guides_p) + '</p></div><a class="more" href="/guide/">' + (H $S.guides_h1) + ' &rarr;</a></div><div class="guide-grid">' + $chosen + '</div></div></section>'
}

$popTable = New-Object int[] 256
for ($pi = 0; $pi -lt 256; $pi++) {
    $v = $pi; $cnt = 0
    while ($v -gt 0) { $cnt += ($v -band 1); $v = $v -shr 1 }
    $popTable[$pi] = $cnt
}

foreach ($b in $bottles) {
    # fast top-4 similar in category
    $s1 = -1e9; $s2 = -1e9; $s3 = -1e9; $s4 = -1e9
    $o1 = $null; $o2 = $null; $o3 = $null; $o4 = $null
    $bm = $b.tagMask; $blp = $b.logPrice
    foreach ($o in $byCat[$b.cat]) {
        if ($o.order -eq $b.order) { continue }
        $shared = $popTable[($bm -band $o.tagMask) -band 255]
        $diff = $o.logPrice - $blp
        if ($diff -lt 0) { $diff = -$diff }
        $sc = $shared * 10.0 - $diff * 12.0
        if ($sc -gt $s4) {
            if ($sc -gt $s1) { $s4 = $s3; $o4 = $o3; $s3 = $s2; $o3 = $o2; $s2 = $s1; $o2 = $o1; $s1 = $sc; $o1 = $o }
            elseif ($sc -gt $s2) { $s4 = $s3; $o4 = $o3; $s3 = $s2; $o3 = $o2; $s2 = $sc; $o2 = $o }
            elseif ($sc -gt $s3) { $s4 = $s3; $o4 = $o3; $s3 = $sc; $o3 = $o }
            else { $s4 = $sc; $o4 = $o }
        }
    }
    $sim = ""
    if ($o1) { $sim += $cardCache[$o1.id] }
    if ($o2) { $sim += $cardCache[$o2.id] }
    if ($o3) { $sim += $cardCache[$o3.id] }
    if ($o4) { $sim += $cardCache[$o4.id] }

    $sourceHtml = $(if ($b.sourceUrl -match "^https?://") { '<a href="' + (H $b.sourceUrl) + '" target="_blank" rel="nofollow noopener">' + (H $S.source_prefix) + ': ' + (H $b.listing) + '</a>' } else { (H $S.source_none) })
    $priceNote = $(if ($b.isPriceNote) { (H $b.note) + ' ' + (H $S.price_note_default) } else { (H $S.price_note_default) })
    $tasting = $(if ($b.note -and -not $b.isPriceNote) { '<div class="note"><b>' + (H $S.tasting_label) + '</b> &middot; ' + (H $b.note) + '</div>' } else { "" })
    $seed = @($seedAll | Where-Object { $_.product_id -eq $b.id } | ForEach-Object { [ordered]@{ submitted_at = $_.submitted_at; product_id = $_.product_id; nickname = $_.nickname; rating = $_.rating; pairing_snack = $_.pairing_snack; comment = $_.comment } })
    $seedJson = $(if ($seed.Count -gt 0) { ConvertTo-Json -InputObject $seed -Depth 3 -Compress } else { "[]" })
    $tagText = ($b.tags | Select-Object -First 2 | ForEach-Object { $flavorLabel[$_] }) -join ", "

    $body = Fill $T.bottle @{
        ID = (H $b.id); NAME = (H $b.name); IMG = (H $b.img); VOL = $b.vol; CAT_URL = ("/category/" + $b.catSlug + "/"); CAT_LABEL = (H $b.catLabel); CAT_EMOJI = $b.catEmoji; CAT_KEY = $b.cat
        TAG_CHIPS = (TagChips $b 4); PRICE = (Won $b.price); CHECKED = (H $b.checked); SOURCE_HTML = $sourceHtml; PRICE_BAND = (H (PriceBand $b.price)); PRICE_NOTE = $priceNote
        TASTING_NOTE = $tasting; PAIRING = (H $b.pairing); SNACK_URL = (H $b.snackUrl); SNACK_REL = $(if ($b.snackPartner) { "sponsored nofollow noopener" } else { "nofollow noopener" })
        BARWARE_LABEL = (H $b.bw.label); BARWARE_REASON = (H $b.bw.reason); BARWARE_URL = (H $b.bw.url)
        BOTTLE_GUIDE = (BottleGuideHtml $b); BOTTLE_GUIDES = (BottleGuidesLinks $b)
        SIMILAR_CARDS = $sim; SEED_JSON = $seedJson; AD_BOTTLE_MID = $adBottleMid; AD_BOTTLE_BOTTOM = $adBottleBottom
    }
    $vars = @{ name = $b.name; vol = $b.vol; price = (Won $b.price); tags = $tagText; cat = $b.catLabel; pairing = $b.pairing }
    Page ("bottle\" + $b.id + "\index.html") @{
        path = $b.url; title = (Fmt $S.title_bottle $vars); desc = (Fmt $S.desc_bottle $vars); body = $body; page = "bottle"; nav = $b.catSlug
        ogType = "article"; ogImage = ($siteUrl + $b.img)
        jsonld = (Crumbs @(@("Home", "/"), @($b.catLabel, ("/category/" + $b.catSlug + "/")), @($b.name, $b.url)))
    }
}

# ---------- legal / info pages (about, privacy, terms, contact) ----------
$legalSlugs = @()
if ($cfg.legal_pages) {
    foreach ($lp in $cfg.legal_pages) {
        $slug = [string]$lp.slug
        $legalSlugs += $slug
        $secHtml = ($lp.sections | ForEach-Object {
            $pHtml = H $_.p
            if ($site.contact_email) {
                $em = H ([string]$site.contact_email)
                $pHtml = $pHtml.Replace($em, '<a href="mailto:' + $em + '" style="color:var(--accent-ink);font-weight:700;text-decoration:underline">' + $em + '</a>')
            }
            $pHtml = $pHtml.Replace('(/contact/)', '(<a href="/contact/" style="color:var(--accent-ink);font-weight:700;text-decoration:underline">/contact/</a>)')
            '<div class="legal-sec"><h2>' + (H $_.h2) + '</h2><p>' + $pHtml + '</p></div>'
        }) -join ""
        $lpBody = '<div class="wrap"><article class="legal-doc"><nav class="crumb" aria-label="breadcrumb"><a href="/">Home</a><span aria-hidden="true">&rsaquo;</span><span>' + (H $lp.h1) + '</span></nav><h1>' + (H $lp.h1) + '</h1><p class="lead">' + (H $lp.lead) + '</p>' + $secHtml + '</article></div>'
        Page ($slug + "\index.html") @{
            path = ("/" + $slug + "/"); title = $lp.title; desc = $lp.lead; body = $lpBody; page = "legal"; nav = ""
            jsonld = (Crumbs @(@("Home", "/"), @($lp.h1, ("/" + $slug + "/"))))
        }
    }
}

# ---------- test ----------
Page "test\index.html" @{ path = "/test/"; title = $S.title_test; desc = $S.desc_test; body = (Fill $T.test @{ TOTAL = $total }); page = "test"; nav = "test"; scripts = '<script src="/assets/js/test.js?v=' + $build + '" defer></script>' }

# ---------- 404 ----------
$nfBody = '<section class="section"><div class="wrap" style="text-align:center;max-width:560px"><p style="font-size:56px">&#129346;</p><h1 style="font-size:28px;margin-top:10px">' + (H $S.nf_h1) + '</h1><p style="color:var(--muted);margin-top:10px">' + (H $S.nf_p) + '</p><div class="hero-cta" style="justify-content:center"><a class="btn btn-dark" href="/">' + (H $S.nf_home) + '</a><a class="btn btn-ghost" href="/test/">' + (H $S.nf_test) + '</a></div></div></section>'
Page "404.html" @{ path = "/404.html"; title = $S.title_404; desc = $site.description; body = $nfBody; page = "404"; nav = ""; robots = "noindex" }

# ---------- ads.txt / sitemap / robots / redirects / headers ----------
$pubNo = $(if ($hasAdClient) { $adClient -replace "^ca-", "" } else { "pub-0000000000000000" })
$adsTxt = $(if ($hasAdClient) { "google.com, $pubNo, DIRECT, f08c47fec0942fa0`n" } else { "# Set your Google AdSense Publisher ID via: powershell -ExecutionPolicy Bypass -File .\tools\set_adsense.ps1 -PublisherId ca-pub-XXXXXXXXXXXXXXXX`n# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0`n" })
WriteText (Join-Path $OutDir "ads.txt") $adsTxt

$today = Get-Date -Format "yyyy-MM-dd"
$guideUrls = $(if ($guides.Count -gt 0) { @("/guide/") + @($guides | ForEach-Object { $_.url }) } else { @() })
$urls = @("/", "/test/") + $guideUrls + @($legalSlugs | ForEach-Object { "/" + $_ + "/" }) + @($cfg.categories | ForEach-Object { "/category/" + $_.slug + "/" }) + @($cfg.picks | ForEach-Object { "/picks/" + $_.slug + "/" }) + @($bottles | ForEach-Object { $_.url })
$sm = New-Object System.Text.StringBuilder
[void]$sm.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sm.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
foreach ($u in $urls) { [void]$sm.AppendLine("  <url><loc>" + $siteUrl + $u + "</loc><lastmod>" + $today + "</lastmod></url>") }
[void]$sm.AppendLine('</urlset>')
WriteText (Join-Path $OutDir "sitemap.xml") $sm.ToString()
WriteText (Join-Path $OutDir "robots.txt") ("User-agent: *`nAllow: /`nSitemap: " + $siteUrl + "/sitemap.xml`n")

$rd = New-Object System.Text.StringBuilder
[void]$rd.AppendLine("# Legacy query-string links from v1 (blog posts) -> v2 static pages")
[void]$rd.AppendLine("/  bottle=:bottle  /bottle/:bottle/  301!")
foreach ($pk in $cfg.picks) { [void]$rd.AppendLine("/  preset=" + $pk.legacy + "  /picks/" + $pk.slug + "/  301!") }
foreach ($c in $cfg.categories) { [void]$rd.AppendLine("/  category=" + $c.key + "  /category/" + $c.slug + "/  301!") }
[void]$rd.AppendLine("/index.html  /  301")
WriteText (Join-Path $OutDir "_redirects") $rd.ToString()

$hd = @"
/assets/css/*
  Cache-Control: public, max-age=31536000, immutable
/assets/js/*
  Cache-Control: public, max-age=31536000, immutable
/assets/data/*
  Cache-Control: public, max-age=86400
/assets/images/*
  Cache-Control: public, max-age=2592000
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
"@
WriteText (Join-Path $OutDir "_headers") $hd

# ---------- sync generated files to project root & package deploy ZIP ----------
if (-not $SkipRootSync) {
    foreach ($rf in @("index.html", "404.html", "ads.txt", "sitemap.xml", "robots.txt", "_redirects", "_headers")) {
        Copy-Item -Path (Join-Path $OutDir $rf) -Destination (Join-Path $root $rf) -Force
    }
    $syncDirs = @("test", "category", "picks", "bottle") + $legalSlugs
    if ($guides.Count -gt 0) { $syncDirs += "guide" }
    foreach ($rdName in $syncDirs) {
        $dstDir = Join-Path $root $rdName
        if (Test-Path $dstDir) { Remove-Item -LiteralPath $dstDir -Recurse -Force }
        & robocopy (Join-Path $OutDir $rdName) $dstDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
    }
    foreach ($sub in @("css", "js", "data")) {
        $dstSub = Join-Path $root ("assets\" + $sub)
        if (Test-Path $dstSub) { Remove-Item -LiteralPath $dstSub -Recurse -Force }
        & robocopy (Join-Path $OutDir ("assets\" + $sub)) $dstSub /E /NFL /NDL /NJH /NJS /NP | Out-Null
    }
}

$zipPath = Join-Path $root "liquortrack-final-deploy.zip"
if (-not $SkipZip) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, "Create")
    $outPrefix = $OutDir.TrimEnd("\") + "\"
    Get-ChildItem -Path $OutDir -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($outPrefix.Length).Replace("\", "/")
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, "Optimal")
    }
    $zip.Dispose()
}

$sw.Stop()
$fileCount = (Get-ChildItem $OutDir -Recurse -File | Measure-Object).Count
Write-Host ("Built {0} bottles, {1} files into {2} + synced to root + packaged {3} in {4:N1}s (build {5})" -f $total, $fileCount, $OutDir, $zipPath, $sw.Elapsed.TotalSeconds, $build)
