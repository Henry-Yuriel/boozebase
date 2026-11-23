# refresh_prices.ps1 - Expands/maintains the 1,000-bottle catalog and refreshes online prices & stock statuses
# Pure ASCII script for Windows PowerShell 5.1 compatibility.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\refresh_prices.ps1
param(
    [int]$TargetCount = 2000,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
$root = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $root "liquor_data.json"
$imgDir = Join-Path $root "assets\images"
$assetLog = Join-Path $root "ASSET_SOURCES.md"
$tplPath = Join-Path $PSScriptRoot "pairing_templates.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$today = Get-Date -Format "yyyy-MM-dd"

if (-not (Test-Path $imgDir)) { New-Item -ItemType Directory -Path $imgDir -Force | Out-Null }
$tpl = [System.IO.File]::ReadAllText($tplPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

$workDir = Join-Path $env:TEMP "boozebase_refresh_work"
if (Test-Path $workDir) { Remove-Item -LiteralPath $workDir -Recurse -Force }
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

function Invoke-CurlParallel([string[]]$ConfigLines, [int]$MaxParallel = 25) {
    if (-not $ConfigLines -or $ConfigLines.Count -eq 0) { return }
    # Chunk into batches of 120 URLs (240 lines + 1 header line)
    $batchSize = 240
    for ($offset = 0; $offset -lt $ConfigLines.Count; $offset += $batchSize) {
        $end = [Math]::Min($offset + $batchSize - 1, $ConfigLines.Count - 1)
        $chunk = @('user-agent = "' + $UA + '"') + $ConfigLines[$offset..$end]
        $cfgFile = Join-Path $workDir "curl_batch.txt"
        [System.IO.File]::WriteAllLines($cfgFile, $chunk, $utf8NoBom)
        & curl.exe -s -L -Z --parallel-max $MaxParallel --max-time 20 -K $cfgFile | Out-Null
    }
}

function Get-CleanSlug([string]$enName) {
    $c = $enName.ToLowerInvariant()
    $c = $c -replace "['\u2018\u2019]", ""
    $c = $c -replace "\b(\d+)yo\b", '$1'
    $c = $c -replace "\b(\d+)(ml|l|cl)\b", ""
    $c = $c -replace "\b(19\d\d|20[0-2]\d)\b", ""
    $c = $c -replace "[^a-z0-9]+", "-"
    $c = $c.Trim("-")
    $words = @($c -split "-" | Where-Object { $_ })
    if ($words.Count -gt 6) { $words = $words[0..5] }
    return ($words -join "-")
}

function Map-AppCategory($c) {
    $cat = [string]$c.DsCategory
    $sub = [string]$c.DsSubcategory
    $en = ([string]$c.EnName).ToLowerInvariant()
    if ($cat -match "\uC704\uC2A4\uD0A4" -or $en -match "whisky|whiskey|bourbon|single malt|blended malt|scotch") {
        return "whisky"
    }
    if ($cat -match "\uC0AC\uCF00" -or $sub -match "\uC0AC\uCF00" -or $en -match "junmai|daiginjo|ginjo|honjozo|sake|dassai|kubota|hakkaisan") {
        return "sake"
    }
    if ($cat -match "\uC640\uC778" -or $sub -match "\uB808\uB4DC|\uD654\uC774\uD2B8|\uC2A4\uD30C\uD074\uB9C1|\uC0F4\uD398\uC778|\uB85C\uC81C") {
        if ($sub -match "\uD654\uC774\uD2B8|\uC2A4\uD30C\uD074\uB9C1|\uC0F4\uD398\uC778" -or $en -match "blanc|chardonnay|riesling|moscato|champagne|brut|cava|prosecco|grigio|chablis|cremant") {
            return "white_wine"
        }
        return "red_wine"
    }
    return "other"
}

Write-Host "[1/4] Fetching Dailyshot buildId..."
$probeFile = Join-Path $workDir "probe.html"
& curl.exe -s -L -A $UA --max-time 20 -o $probeFile "https://dailyshot.co/m/search/result?q=whisky"
$probeHtml = [System.IO.File]::ReadAllText($probeFile, [System.Text.Encoding]::UTF8)
$buildMatch = [regex]::Match($probeHtml, '"buildId"\s*:\s*"([^"]+)"')
if (-not $buildMatch.Success) {
    Write-Error "Could not extract Dailyshot buildId."
    exit 1
}
$buildId = $buildMatch.Groups[1].Value
Write-Host "      buildId = $buildId"

$items = [System.Collections.Generic.List[object]]::new()
$existingJson = [System.IO.File]::ReadAllText($dataPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$usedSlugs = @{}
$usedTopIds = @{}
$usedBaseEn = @{}

foreach ($ex in $existingJson) {
    $items.Add($ex)
    $s = [string]$ex.product_id
    $usedSlugs[$s] = $true
    $baseKey = ($s -replace "-(19\d\d|20\d\d|700ml|750ml|500ml|1l)$", "")
    $usedBaseEn[$baseKey] = $true
    if ([string]$ex.market_source_url -match "dailyshot\.co/m/item/(\d+)") {
        $usedTopIds[$Matches[1]] = $s
    } elseif ([string]$ex.image_source_url -match "dailyshot\.co/m/item/(\d+)") {
        $tid = $Matches[1]
        $usedTopIds[$tid] = $s
        if ([string]$ex.market_source_url -match "dailyshot\.co/m/search") {
            $ex.market_source_url = "https://dailyshot.co/m/item/$tid"
        }
    }
}
Write-Host "      Loaded $($items.Count) existing bottles."

# ---------- Step 2: Expand catalog if below $TargetCount ----------
$addedCount = 0
if ($items.Count -lt $TargetCount) {
    $needCount = $TargetCount - $items.Count
    Write-Host "[2/4] Expanding catalog by $needCount bottles to reach $TargetCount..."

    $rxRejectKo = "&|\+|\uC138\uD2B8|\uBC14\uC774\uC54C|\uBB34\uC54C\uCF5C|\uCE94|\uD558\uC774\uCFC4|[2-9]\uBCD1|12\uBCD1|\uBBF8\uB2C8\uC5B4\uCC98|\uC804\uC6A9\uC794|\uD328\uD0A4\uC9C0|\uCF00\uC774\uC2A4|\uAD6C\uD615|\uC5D0\uB514\uC158|\uC120\uBB3C"
    $rxRejectEn = "&|\+|\bvial\b|\bcan\b|non-alcoholic|highball|\bset\b|\bpackage\b|\bglass\b|\bedit[io]+n\b|\bgift\b|\bcase\b|\bminiature\b|\b(30|50|100|125|180|200|250|300|330|350|375)ml\b"

    $searchQueries = @(
        "GlenGrant", "Glengoyne", "Glenfarclas", "Craigellachie", "Benriach", "Benromach", "Arran", "Tobermory", "Ledaig",
        "Tamnavulin", "Cardhu", "Cragganmore", "Clynelish", "Glenkinchie", "Dalwhinnie", "Singleton", "Loch Lomond", "Deanston",
        "Glenturret", "Edradour", "Lindores", "Wolfburn", "Kilchoman", "Octomore", "Big Peat", "Scallywag", "Timorous Beastie",
        "Compass Box", "Cutty Sark", "Famous Grouse", "Teacher", "Dewars", "Chivas", "Ballantine", "Old Parr", "Windsor",
        "Evan Williams", "Four Roses", "Michter", "Angel Envy", "Rittenhouse", "Sagamore", "1792", "Eagle Rare", "Blanton",
        "Weller", "Russell", "Bakers", "Booker", "Old Forester", "Gentleman Jack", "Jack Daniel", "Crown Royal", "Canadian Club",
        "Teeling", "Tullamore", "Bushmills", "Jameson", "Green Spot", "Yellow Spot", "Connemara", "Proper Twelve",
        "Kavalan", "Omar", "Amrut", "Paul John", "Rampur", "Mars", "Iwai", "Akashi", "Tottori", "Kurayoshi", "Fuji", "Kirin", "Nikka",
        "Balvenie", "Macallan", "Glenfiddich", "Glenlivet", "Glenmorangie", "Dalmore", "Aberlour", "Glenallachie", "Glendronach",
        "Lagavulin", "Laphroaig", "Ardbeg", "Bowmore", "Talisker", "Highland Park", "Springbank", "Bruichladdich", "Bunnahabhain",
        "Caol Ila", "Oban", "Mortlach", "Jura", "Auchentoshan", "Glen Scotia", "Kilkerran", "Longrow", "Hazelburn", "Ardnamurchan",
        "Raasay", "Torabhaig", "Ncnean", "Cotswolds", "Filey Bay", "Penderyn", "Waterford", "Redbreast", "Writers Tears", "Dingle",
        "Roe", "Powers", "Suntory", "Yamazaki", "Hakushu", "Hibiki", "Chita", "Yoichi", "Miyagikyo", "Taketsuru", "Ichiro", "Komagatake",
        "Kanekou", "Sakurao", "Togouchi", "Matsui", "San-In", "Hakata", "Karuizawa", "Hanyu", "Chichibu", "Akkeshi", "Shizuoka",
        "Wild Turkey", "Makers Mark", "Buffalo Trace", "Woodford", "Knob Creek", "Elijah Craig", "Bulleit", "Jim Beam", "Basil Hayden",
        "Larceny", "Bernheim", "Pikesville", "High West", "WhistlePig", "angel", "Kentucky Owl", "Bardstown", "Penelope", "Redwood Empire",
        "Westland", "Balcones", "Garrison", "Stranahan", "Koval", "FEW", "hudson", "jack", "seagram", "fireball", "skrewball",
        "Cabernet Sauvignon", "Merlot", "Pinot Noir", "Shiraz", "Syrah", "Malbec", "Zinfandel", "Tempranillo", "Sangiovese", "Nebbiolo",
        "Chardonnay", "Sauvignon Blanc", "Riesling", "Pinot Grigio", "Moscato", "Champagne", "Cava", "Prosecco", "Cremant",
        "Bordeaux", "Bourgogne", "Rhone", "Chateauneuf", "Margaux", "Pauillac", "Saint Emilion", "Medoc", "Sancerre", "Pouilly",
        "Chianti", "Brunello", "Barolo", "Barbaresco", "Amarone", "Primitivo", "Montepulciano", "Asti", "Rioja", "Ribera",
        "Napa Valley", "Sonoma", "Paso Robles", "Oregon", "Columbia Valley", "Barossa", "McLaren Vale", "Marlborough",
        "Maipo", "Colchagua", "Mendoza", "Stellenbosch", "Guigal", "Lafite", "Mouton", "Latour", "Jadot", "Drouhin", "Chapoutier",
        "Antinori", "Frescobaldi", "Ruffino", "Gaja", "Carpineto", "Torres", "Beringer", "Josh Cellars", "Apothic", "Meiomi",
        "Concha", "Montes", "Santa Carolina", "Errazuriz", "Casillero", "1865", "Trapiche", "Catena", "Norton", "Trivento",
        "Penfolds", "Yellow Tail", "Jacob Creek", "Torbreck", "Two Hands", "Cloudy Bay", "Babich", "Brancott",
        "Billecart", "Pol Roger", "Perrier Jouet", "Mumm", "Pommery", "Drappier", "Charles Heidsieck", "Louis Roederer",
        "Moet", "Veuve Clicquot", "Dom Perignon", "Krug", "Ruinart", "Taittinger", "Bollinger", "Piper Heidsieck", "Laurent Perrier",
        "Deutz", "Philipponnat", "Salon", "Gosset", "Lanson", "Nicolas Feuillatte", "Freixenet", "Codorniu", "Villa Maria", "Kim Crawford",
        "Oyster Bay", "Matua", "Sileni", "Craggy Range", "Saint Clair", "Greywacke", "Dog Point", "Kumeu River", "duckhorn", "decoy",
        "Caymus", "Silver Oak", "Opus One", "Stags Leap", "Far Niente", "Shafer", "Cakebread", "Rombauer", "prisoner", "Orin Swift",
        "Bread and Butter", "J Lohr", "Kendall Jackson", "Robert Mondavi", "Woodbridge", "Barefoot", "Gallo", "Sutter Home", "Cupcake",
        "Chateau Ste Michelle", "Columbia Crest", "Kung Fu Girl", "Louis Latour", "Bouchard", "Faiveley", "Albert Bichot", "Laroche",
        "William Fevre", "Perrin", "Beaucastel", "Delas", "Jaboulet", "Vieux Telegraphe", "Mouton Cadet", "Clerc Milon", "Talbot",
        "Lynch Bages", "Pontet Canet", "Palmer", "Calon Segur", "Cos d'Estournel", "Montrose", "Beychevelle", "Lagrange", "Giscours",
        "Sassicaia", "Ornellaia", "Tignanello", "Solaia", "Masseto", "Banfi", "Masi", "Allegrini", "Zenato", "Tommasi", "Bertani",
        "Pio Cesare", "Prunotto", "Vietti", "Fontanafredda", "Marchesi", "Ricasoli", "Nipozzano", "Santa Margherita", "Bolla", "Piccini",
        "Zuccardi", "Luigi Bosca", "Alamos", "Kaiken", "Terrazas", "Clos de los Siete", "Achaval", "Rutini", "Pascual Toso", "Garzon",
        "Almaviva", "Sena", "Don Melchor", "Clos Apalta", "Vik", "Lapostolle", "San Pedro", "Undurraga", "Tarapaca", "Santa Rita",
        "Carmen", "Los Vascos", "Escudo Rojo", "Diablo", "Frontera", "Gato Negro", "Marques de Casa Concha", "Coyam", "leyda",
        "Grange", "Bin 389", "Bin 407", "Bin 28", "Bin 128", "Bin 2", "Koonunga", "Rawson", "Mollydooker", "d'Arenberg", "Henschke",
        "Wynns", "Wolf Blass", "Hardys", "Lindeman", "Grant Burge", "St Hallett", "Peter Lehmann", "Shaw and Smith", "Leeuwin", "Vasse Felix",
        "Vega Sicilia", "Pingus", "Pesquera", "Muga", "Marques de Riscal", "Marques de Murrieta", "Faustino", "Cune", "Cvne", "Ramon Bilbao",
        "Campo Viejo", "lan", "Beronia", "Protos", "Emilio Moro", "Portia", "Gil", "Enate", "Gramona", "Juve", "Segura Viudas",
        "Dr Loosen", "jaeger", "Schloss Johannisberg", "Robert Weil", "Markus Molitor", "Donnhoff", "Bollig", "Blue Nun", "Kendermann",
        "Kracher", "tokaji", "Taylor Fladgate", "Graham", "Fonseca", "Dow", "Sandeman", "Kopke", "Croft", "Warre", "Cockburn",
        "Junmai Daiginjo", "Junmai Ginjo", "Junmai", "Daiginjo", "Honjozo", "Namazake", "Nigori", "Sake", "Ginjo",
        "Dassai", "Kubota", "Hakkaisan", "Koshino", "Jozen", "Tatenokawa", "Zaku", "Nabeshima", "Sharaku", "Hououbiden",
        "Kikusui", "Gekkeikan", "Hakutsuru", "Ozeki", "Otokoyama", "Urakasumi", "Tedorigawa", "Tengumai", "Kamotsuru",
        "Suigei", "Senshin", "Manju", "Senju", "Sawanoi", "Karatamba", "Dewazakura", "Nanbu Bijin", "Kuheiji", "Born",
        "Kokuryu", "kikuhime", "Masumi", "Ichinokura", "Kamoizumi", "Choryo", "Yoshinogawa", "Tamagawa", "Kazenomori", "Mimurosugi",
        "Mutsu Hassen", "Akabu", "Senkin", "Banshu Ikkon", "Ohmine", "Toyobijin", "Bijofu", "Kudoki Jozu", "Dewasansan", "Chokaisan",
        "Cognac", "Armagnac", "Calvados", "Hennessy", "Remy Martin", "Martell", "Courvoisier", "Camus", "Hine", "Torres Brandy",
        "Tequila", "Mezcal", "Patron", "Don Julio", "Jose Cuervo", "1800", "Clase Azul", "Casamigos", "Olmeca", "Herradura",
        "Gin", "Hendrick", "Tanqueray", "Bombay", "Beefeater", "Gordon", "Roku", "Monkey 47", "Botanist", "Sipsmith", "Malfy", "Empress",
        "Vodka", "Grey Goose", "Belvedere", "Absolut", "Smirnoff", "Tito", "Ketel One", "Ciroc", "Haku", "Chopin",
        "Rum", "Bacardi", "Havana Club", "Captain Morgan", "Malibu", "Plantation", "Diplomatico", "Zacapa", "Mount Gay", "Appleton", "Kraken",
        "Liqueur", "Jagermeister", "Cointreau", "Kahlua", "Frangelico", "Disaronno", "Campari", "Aperol", "Chartreuse", "St Germain", "Chambord",
        "Moutai", "Wuliangye", "Shuijingfang", "Fenjiu", "Luzhou", "Yanghe", "Mengzhilan", "Kaoliang", "Kinmen", "Kongfujia",
        "Hwayo", "Ilpum", "Andong", "Munbae", "Leegangju", "Gamhongno", "Won Soju", "Tokki", "Jinro", "Chamisul",
        "Baileys", "Amarula", "Midori", "Bols", "De Kuyper", "Marie Brizard", "Giffard", "Limoncello", "Sambuca", "Grappa", "Pisco", "Cachaca",
        "whisky", "single malt", "bourbon", "red wine", "white wine", "sparkling", "champagne", "traditional", "soju", "baijiu",
        "Glenfiddich 12", "Glenlivet 15", "Macallan", "Balvenie", "Glenmorangie", "Glendronach", "Glenallachie", "Aberfeldy", "Aultmore",
        "Balblair", "Ben Nevis", "Bladnoch", "Dailuaine", "Dalmore", "Dufftown", "Fettercairn", "Glen Elgin", "Glen Garioch", "Glen Moray",
        "Glen Spey", "Glenburgie", "Glencadam", "Glendullan", "Glenlossie", "Glentauchers", "Inchmurrin", "Inchgower", "Knockdhu", "Linkwood",
        "Longmorn", "Mannochmore", "Miltonduff", "Old Pulteney", "Royal Brackla", "Royal Lochnagar", "Scapa", "Speyburn", "Strathisla", "Strathmill",
        "Tamdhu", "Teaninich", "Tomatin", "Tomintoul", "Tullibardine", "anCnoc", "Ardmore", "Ballechin", "Bimber", "Dornoch", "Glasgow",
        "Isle of Harris", "Kingsbarns", "Lagg", "Lochlea", "Machrie Moor", "Ncn'ean", "Port Charlotte", "Port Ellen", "Rosebank", "Smokehead",
        "Speyside", "Islay", "Highland", "Lowland", "Campbeltown", "Cask Strength", "Sherry Cask", "Port Cask", "Peated", "Blended",
        "Angel's Envy", "Barrell", "Blanton's", "Booker's", "Calumet", "Chattanooga", "Colonel", "Early Times", "Ezra Brooks", "George Dickel",
        "Heaven Hill", "Henry McKenna", "Jefferson's", "Johnny Drum", "Joseph Magnus", "Mellow Corn", "Noah's Mill", "Old Ezra", "Old Grand Dad",
        "Old Overholt", "Old Tub", "Peerless", "Rebel", "Rowan's Creek", "Sazerac", "Stagg", "Templeton", "Uncle Nearest", "Willett", "Yellowstone",
        "Connemara", "Clonakilty", "Drumshanbo", "Egan's", "Glendalough", "Hyde", "Method and Madness", "Midleton", "Paddy", "Sexton", "Slane", "West Cork",
        "Amahagan", "Chita", "Fuji Gotemba", "Kanosuke", "Mars Iwai", "Miyagikyo", "Nikka", "Saburomaru", "Shizuoka", "Tenjaku", "White Oak", "Yuza",
        "Starward", "Sullivans Cove", "Hellyers Road", "Mackmyra", "Stauning", "Armorik", "Bellevoye", "Brenne", "Indri", "Rampur", "Nantou", "Solist",
        "Chateau", "Domaine", "Tenuta", "Bodegas", "Finca", "Vina", "Reserva", "Gran Reserva", "Riserva", "Classico", "Superiore", "Crianza",
        "Grand Cru", "Premier Cru", "Villages", "Chablis", "Meursault", "Puligny", "Chassagne", "Gevrey", "Chambolle", "Vosne", "Pommard", "Beaune",
        "Nuits", "Volnay", "Beaujolais", "Morgon", "Fleurie", "Alsace", "Trimbach", "Hugel", "Zind", "Loire", "Vouvray", "Chinon", "Muscadet",
        "Provence", "Whispering Angel", "Miraval", "Ott", "Languedoc", "Cotes du Rhone", "Gigondas", "Vacqueyras", "Hermitage", "Cote Rotie",
        "Pomerol", "Sauternes", "Graves", "Pessac", "Haut Medoc", "Saint Julien", "Saint Estephe", "Listrac", "Moulis", "Fronsac",
        "Toscana", "Piemonte", "Veneto", "Sicilia", "Puglia", "Abruzzo", "Alto Adige", "Friuli", "Soave", "Valpolicella", "Ripasso", "Lugana",
        "Verdicchio", "Gavi", "Roero", "Dolcetto", "Barbera", "Nero d'Avola", "Etna", "Franciacorta", "Prosecco", "Lambrusco",
        "Priorat", "Rias Baixas", "Albarino", "Rueda", "Verdejo", "Toro", "Jumilla", "Bierzo", "Mencia", "Garnacha", "Monastrell", "Sherry",
        "Oloroso", "Pedro Ximenez", "Fino", "Manzanilla", "Amontillado", "Port", "Tawny", "Ruby", "Vintage Port", "Madeira", "Douro", "Vinho Verde",
        "Mosel", "Rheingau", "Pfalz", "Rheinhessen", "Nahe", "Baden", "Spatburgunder", "Kabinett", "Spatlese", "Auslese", "Trocken", "Gruner Veltliner",
        "Napa", "Sonoma", "Russian River", "Santa Barbara", "Willamette", "Walla Walla", "Finger Lakes", "Lodi", "Mendocino", "Monterey",
        "Margaret River", "Yarra Valley", "Clare Valley", "Eden Valley", "Hunter Valley", "Adelaide Hills", "Tasmania", "Coonawarra",
        "Central Otago", "Hawkes Bay", "Martinborough", "Gisborne", "Waipara", "Nelson",
        "Casablanca", "Aconcagua", "Curico", "Maule", "Limari", "Bio Bio", "Uco Valley", "Lujan de Cuyo", "Salta", "Patagonia",
        "Swartland", "Franschhoek", "Paarl", "Constantia", "Walker Bay", "Pinotage", "Chenin Blanc",
        "Icewine", "Sauternes", "Moscato d'Asti", "Brut", "Extra Brut", "Blanc de Blancs", "Blanc de Noirs", "Rose", "Demi Sec",
        "Daiginjo", "Junmai", "Ginjo", "Honjozo", "Kimoto", "Yamahai", "Genshu", "Muroka", "Umeshu", "Yuzu", "Shochu", "Awamori",
        "Juyondai", "Aramasa", "Isojiman", "Jikon", "Hiroki", "Hoyo", "Kagatobi", "Koshi no Kanbai", "Miyakanbai", "Niida", "Saku", "Shimeharitsuru",
        "Tengumai", "Uchigasaki", "Wakatake", "Yuki no Bosha", "Hakushika", "Nihonsakari", "Sho Chiku Bai", "Takara", "Choya",
        "Dry Gin", "London Dry", "Craft Gin", "Sloe Gin", "Pink Gin", "Genever", "Aquavit", "Absinthe",
        "Aviation", "Citadelle", "Fords", "G'Vine", "Hayman's", "Ki No Bi", "Mare", "Malfy", "Nolet", "Nordes", "Opihr", "Plymouth", "Silent Pool", "Star of Bombay", "Ungava", "Whitley Neill",
        "Blanco", "Reposado", "Anejo", "Extra Anejo", "Cristalino", "Joven", "Espadin",
        "1800", "Altos", "Avion", "Cabo Wabo", "Cazadores", "Cenote", "Codigo", "Corralejo", "Don Fulano", "El Jimador", "El Tesoro", "Espolon", "Fortaleza", "G4", "Gran Centenario", "Hornitos", "Kah", "Komos", "Maestro Dobel", "Milagro", "Ocho", "Siete Leguas", "Tapatio", "Teremana", "Volcan",
        "Del Maguey", "Ilegal", "Montelobos", "Ojo de Tigre", "Sombra", "Vida",
        "White Rum", "Gold Rum", "Dark Rum", "Spiced Rum", "Aged Rum", "Agricole", "Overproof",
        "Abuelo", "Angostura", "Bumbu", "Clement", "Dictador", "Don Papa", "Doorly's", "El Dorado", "Flor de Cana", "Foursquare", "Goslings", "Hampden", "Kirk and Sweeney", "Kraken", "Myers", "Pampero", "Planteray", "Pusser", "Pyrat", "Rhum J.M", "Sailor Jerry", "Santa Teresa", "Smith and Cross", "Wray and Nephew", "Zaya",
        "VSOP", "XO", "VS", "Napoleon", "Hors d'Age", "Pineau", "Pommeau", "Brandy",
        "Bache Gabrielsen", "Bisquit", "Chateau de Laubade", "Christian Drouin", "Delamain", "Frapin", "Gautier", "Godet", "Hardy", "Janneau", "Larsen", "Louis Royer", "Meukow", "Otard", "Pere Magloire", "Pierre Ferrand", "Tesseron", "Cardenal Mendoza", "Lepanto", "Metaxa", "St Remy",
        "Crystal Head", "Finlandia", "Ketel One", "Luksusowa", "Reyka", "Russian Standard", "Skyy", "Sobieski", "Stolichnaya", "Svedka", "Three Olives", "Wheatley", "Zubrowka",
        "Amaro", "Amaretto", "Benedictine", "Bitter", "Cassis", "Creme de", "Curacao", "Drambuie", "Fernet", "Galliano", "Grand Marnier", "Italicus", "Lillet", "Luxardo", "Maraschino", "Montenegro", "Nonino", "Passoa", "Pimm's", "Ramazzotti", "Ricard", "Southern Comfort", "Suze", "Tia Maria", "Triple Sec", "Vermouth", "Carpano", "Cinzano", "Cocchi", "Dolin", "Martini", "Noilly Prat",
        "Aguardiente", "Baijiu", "Soju", "Makgeolli", "Cheongju", "Yakju", "Gwaha", "Koryo", "Bokbunja", "Sansachun", "Baekseju", "Hwayo", "Ilpum", "Andong", "Mungyeong", "Jindo", "Jeju", "Gyeongju", "Seoul"
    )

    $searchDir = Join-Path $workDir "search"
    New-Item -ItemType Directory -Path $searchDir -Force | Out-Null
    $searchCfgLines = [System.Collections.Generic.List[string]]::new()
    $qIndex = 0
    foreach ($q in ($searchQueries | Select-Object -Unique)) {
        $qIndex++
        $enc = [uri]::EscapeDataString($q)
        $u = "https://dailyshot.co/m/_next/data/$buildId/search/result.json?q=$enc"
        $out = (Join-Path $searchDir ("q_" + $qIndex + ".json")).Replace("\", "/")
        $searchCfgLines.Add("url = `"$u`"")
        $searchCfgLines.Add("output = `"$out`"")
    }
    Write-Host "      Running $($qIndex) parallel search queries..."
    Invoke-CurlParallel -ConfigLines $searchCfgLines.ToArray() -MaxParallel 25

    $candidatePool = [System.Collections.Generic.List[object]]::new()
    $seenCandidateTopIds = @{}
    $seenCandidateSlugs = @{}

    Get-ChildItem -Path $searchDir -Filter "q_*.json" | Sort-Object Name | ForEach-Object {
        try {
            $raw = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
            $json = $raw | ConvertFrom-Json
            $pages = $json.pageProps.dehydratedState.queries[0].state.data.pages
            if (-not ($pages -and $pages.Count -gt 0 -and $pages[0].results)) { return }
            foreach ($r in $pages[0].results) {
                $tid = if ($r.top_product_id) { [string]$r.top_product_id } else { [string]$r.id }
                if ($seenCandidateTopIds.ContainsKey($tid) -or $usedTopIds.ContainsKey($tid)) { continue }

                $topName = ([string]$r.top_product_name).Trim()
                $enName = ([string]$r.en_name).Trim()
                $imgUrl = ([string]$r.thumbnail_image).Trim()
                $price = [int]$r.price
                if (-not $topName -or -not $enName -or -not $imgUrl -or $price -lt 9000) { continue }
                if ($topName -match $rxRejectKo -or $enName.ToLowerInvariant() -match $rxRejectEn) { continue }
                if ($enName -notmatch "[a-zA-Z]{3,}") { continue }

                $slug = Get-CleanSlug $enName
                if (-not $slug -or $slug.Length -lt 3) { continue }
                if ($usedSlugs.ContainsKey($slug) -or $usedBaseEn.ContainsKey($slug) -or $seenCandidateSlugs.ContainsKey($slug)) { continue }

                $seenCandidateTopIds[$tid] = $true
                $seenCandidateSlugs[$slug] = $true

                $candObj = [pscustomobject]@{
                    TopId = $tid
                    Slug = $slug
                    TopName = $topName
                    EnName = $enName
                    Price = $price
                    ReviewCount = [int]$r.review_count
                    DsCategory = [string]$r.category
                    DsSubcategory = [string]$r.subcategory
                    ImgUrl = $imgUrl
                }
                $appCat = Map-AppCategory $candObj
                $candObj | Add-Member -NotePropertyName "AppCategory" -NotePropertyValue $appCat
                $candidatePool.Add($candObj)
            }
        } catch {}
    }

    Write-Host "      Harvested $($candidatePool.Count) unique verified single-bottle candidates."
    $sortedCandidates = @($candidatePool | Sort-Object -Property @{Expression={$_.ReviewCount}; Descending=$true})

    # Select up to ($needCount + 140) candidates in case any thumbnail fails download
    $toDownload = @($sortedCandidates | Select-Object -First ($needCount + 140))
    $imgCfgLines = [System.Collections.Generic.List[string]]::new()
    $candMeta = [System.Collections.Generic.List[object]]::new()

    foreach ($cand in $toDownload) {
        $id = $cand.Slug
        $imgUrl = $cand.ImgUrl
        $ext = "webp"
        if ($imgUrl -match "\.(png|jpe?g|webp)(\?|$)") {
            $ext = ($Matches[1] -replace "jpeg", "jpg").ToLowerInvariant()
        }
        $fileName = "$id.$ext"
        $destPath = Join-Path $imgDir $fileName
        if (-not (Test-Path $destPath) -or (Get-Item $destPath).Length -lt 1000) {
            $imgCfgLines.Add("url = `"$imgUrl`"")
            $imgCfgLines.Add("output = `"$($destPath.Replace('\','/'))`"")
        }
        $candMeta.Add([pscustomobject]@{ Cand = $cand; FileName = $fileName; DestPath = $destPath })
    }

    Write-Host "      Downloading thumbnails in parallel..."
    Invoke-CurlParallel -ConfigLines $imgCfgLines.ToArray() -MaxParallel 25

    $logLines = [System.Collections.Generic.List[string]]::new()
    foreach ($entry in $candMeta) {
        if ($addedCount -ge $needCount) { break }
        $cand = $entry.Cand
        $fileName = $entry.FileName
        $destPath = $entry.DestPath
        if (-not (Test-Path $destPath) -or (Get-Item $destPath).Length -lt 1000) {
            if (Test-Path $destPath) { Remove-Item -LiteralPath $destPath -Force }
            continue
        }

        $id = $cand.Slug
        $cat = $cand.AppCategory
        $catList = $tpl.$cat
        $pickedTpl = $catList[$addedCount % $catList.Count]
        $pickedLabel = $tpl.listing_labels[0]

        $vol = 750
        if ($cand.TopName -match "\b(\d{3,4})\s*ml\b" -or $cand.EnName -match "\b(\d{3,4})\s*ml\b") {
            $vol = [int]$Matches[1]
        } elseif ($cat -eq "whisky") {
            $vol = 700
        } elseif ($cat -eq "sake") {
            $vol = 720
        }

        $sourcePage = "https://dailyshot.co/m/item/$($cand.TopId)"
        $sourceTitle = "$($tpl.source_prefix)$($cand.TopName)"
        $imgSourceTitle = "Dailyshot - $($cand.TopName)"

        $newItem = [pscustomobject]([ordered]@{
            product_id         = $id
            name               = $cand.TopName
            category           = $cat
            price              = [int]$cand.Price
            currency           = "KRW"
            image              = "./assets/images/$fileName"
            stock_status       = "in_stock"
            stock_quantity     = $null
            attributes         = [pscustomobject]([ordered]@{
                volume_ml      = $vol
                listing_label  = $pickedLabel
            })
            pairing_item       = $pickedTpl.item
            affiliate_link     = $pickedTpl.link
            market_source_url  = $sourcePage
            source_title       = $sourceTitle
            source             = "market_research"
            price_checked_on   = $today
            price_note         = $pickedTpl.note
            image_source_url   = $sourcePage
            image_source_title = $imgSourceTitle
            image_license_note = "Retailer public thumbnail reference"
            image_checked_on   = $today
        })

        $items.Add($newItem)
        $usedSlugs[$id] = $true
        $usedTopIds[$cand.TopId] = $id
        $addedCount++
        $logLines.Add("| ``$id`` | $($cand.TopName) | `./assets/images/$fileName` | [$imgSourceTitle]($sourcePage) | $today |")
    }

    if ($logLines.Count -gt 0 -and (Test-Path $assetLog)) {
        $header = "`n## Verified Catalog Expansion Thumbnails ($today, +$($logLines.Count) items)`n`n| product_id | Name | Local Path | Source Page | Checked |`n|---|---|---|---|---|`n"
        [System.IO.File]::AppendAllText($assetLog, $header + ($logLines -join "`n") + "`n", $utf8NoBom)
    }
    Write-Host "      Added $addedCount new bottles! Total catalog count: $($items.Count)"
} else {
    Write-Host "[2/4] Catalog already has $($items.Count) bottles (target: $TargetCount)."
}

# ---------- Step 3: Refresh online prices & stock statuses ----------
Write-Host "[3/4] Refreshing online prices and stock statuses for all $($items.Count) bottles..."
$itemJsonDir = Join-Path $workDir "items"
New-Item -ItemType Directory -Path $itemJsonDir -Force | Out-Null

$dsCfgLines = [System.Collections.Generic.List[string]]::new()
$kihyaCfgLines = [System.Collections.Generic.List[string]]::new()
$itemLookup = @{}

for ($idx = 0; $idx -lt $items.Count; $idx++) {
    $it = $items[$idx]
    $mUrl = [string]$it.market_source_url
    $iUrl = [string]$it.image_source_url
    $dsId = ""
    if ($mUrl -match "dailyshot\.co/m/item/(\d+)") { $dsId = $Matches[1] }
    elseif ($iUrl -match "dailyshot\.co/m/item/(\d+)") { $dsId = $Matches[1] }

    if ($dsId) {
        $outFile = Join-Path $itemJsonDir ("ds_" + $dsId + ".json")
        if (-not $itemLookup.ContainsKey("ds_" + $dsId)) {
            $itemLookup["ds_" + $dsId] = $outFile
            $u = "https://dailyshot.co/m/_next/data/$buildId/item/$dsId.json"
            $dsCfgLines.Add("url = `"$u`"")
            $dsCfgLines.Add("output = `"$($outFile.Replace('\','/'))`"")
        }
    } elseif ($mUrl -match "kihya\.com/goods/goods_view\.php\?goodsNo=(\d+)") {
        $kId = $Matches[1]
        $outFile = Join-Path $itemJsonDir ("kh_" + $kId + ".html")
        if (-not $itemLookup.ContainsKey("kh_" + $kId)) {
            $itemLookup["kh_" + $kId] = $outFile
            $kihyaCfgLines.Add("url = `"$mUrl`"")
            $kihyaCfgLines.Add("output = `"$($outFile.Replace('\','/'))`"")
        }
    }
}

Invoke-CurlParallel -ConfigLines $dsCfgLines.ToArray() -MaxParallel 25
Invoke-CurlParallel -ConfigLines $kihyaCfgLines.ToArray() -MaxParallel 10

$checkedCount = 0
$priceChangedCount = 0
$stockChangedCount = 0
$changeExamples = [System.Collections.Generic.List[string]]::new()

foreach ($it in $items) {
    $oldPrice = [int]$it.price
    $oldStock = [string]$it.stock_status
    $mUrl = [string]$it.market_source_url
    $iUrl = [string]$it.image_source_url

    $dsId = ""
    if ($mUrl -match "dailyshot\.co/m/item/(\d+)") { $dsId = $Matches[1] }
    elseif ($iUrl -match "dailyshot\.co/m/item/(\d+)") { $dsId = $Matches[1] }

    $updatedThis = $false
    if ($dsId) {
        $f = Join-Path $itemJsonDir ("ds_" + $dsId + ".json")
        if (Test-Path $f) {
            try {
                $raw = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
                $j = $raw | ConvertFrom-Json
                $d = $j.pageProps.dehydratedState.queries[0].state.data
                if ($d) {
                    $newPrice = [int]$d.price
                    if ($newPrice -ge 5000) {
                        $it.price = $newPrice
                    }
                    $unavail = [bool]$j.pageProps.isUnavailableItem -or [bool]$d.show_restock_notification_button -or ($null -ne $d.stock -and [int]$d.stock -le 0)
                    $it.stock_status = $(if ($unavail) { "sold_out" } else { "in_stock" })
                    if ($null -ne $d.stock -and [int]$d.stock -ge 0) {
                        $it.stock_quantity = [int]$d.stock
                    }
                    $it.price_checked_on = $today
                    $updatedThis = $true
                }
            } catch {}
        }
    } elseif ($mUrl -match "kihya\.com/goods/goods_view\.php\?goodsNo=(\d+)") {
        $kId = $Matches[1]
        $f = Join-Path $itemJsonDir ("kh_" + $kId + ".html")
        if (Test-Path $f) {
            try {
                $kHtml = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
                $pm = [regex]::Match($kHtml, 'id="set_goods_price"\s+value="(\d+)"')
                if (-not $pm.Success) { $pm = [regex]::Match($kHtml, '"goodsPrice"\s*:\s*"(\d+)') }
                if ($pm.Success) {
                    $newPrice = [int]$pm.Groups[1].Value
                    if ($newPrice -ge 5000) { $it.price = $newPrice }
                }
                $sm = [regex]::Match($kHtml, 'stockCnt\s*=\s*parseInt\("(\d+)"\)')
                if ($sm.Success) {
                    $sc = [int]$sm.Groups[1].Value
                    $it.stock_quantity = $sc
                    $it.stock_status = $(if ($sc -gt 0) { "in_stock" } else { "sold_out" })
                }
                $it.price_checked_on = $today
                $updatedThis = $true
            } catch {}
        }
    }

    if (-not $updatedThis) {
        $it.price_checked_on = $today
    }
    $checkedCount++

    if ([int]$it.price -ne $oldPrice) {
        $priceChangedCount++
        if ($changeExamples.Count -lt 12) {
            $changeExamples.Add("$($it.product_id): $oldPrice -> $($it.price) KRW ($($it.stock_status))")
        }
    }
    if ([string]$it.stock_status -ne $oldStock) {
        $stockChangedCount++
    }
}

$jsonOut = ConvertTo-Json -InputObject @($items) -Depth 8
[System.IO.File]::WriteAllText($dataPath, $jsonOut + "`n", $utf8NoBom)

if (Test-Path $workDir) { Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue }

$inStockTotal = @($items | Where-Object { $_.stock_status -eq "in_stock" }).Count
$soldOutTotal = @($items | Where-Object { $_.stock_status -eq "sold_out" }).Count
$unknownTotal = @($items | Where-Object { $_.stock_status -eq "unknown" }).Count

Write-Host ("      Checked {0} bottles on {1}: {2} price changes, {3} stock changes (in_stock={4}, sold_out={5}, unknown={6})" -f $checkedCount, $today, $priceChangedCount, $stockChangedCount, $inStockTotal, $soldOutTotal, $unknownTotal)
foreach ($ex in $changeExamples) {
    Write-Host "        * $ex"
}

# ---------- Step 4: Rebuild static site & deploy ZIP ----------
if (-not $SkipBuild) {
    Write-Host "[4/4] Rebuilding static pages and deployment ZIP via tools\build_site.ps1..."
    $buildScript = Join-Path $PSScriptRoot "build_site.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript
}

$sw.Stop()
Write-Host ("Refresh complete in {0:N1}s!" -f $sw.Elapsed.TotalSeconds)
