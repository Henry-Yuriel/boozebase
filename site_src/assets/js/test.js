/* Booze Base v2 — 2분 취향 테스트 */
(function () {
  "use strict";
  var root = document.getElementById("quiz");
  if (!root || !window.TPI) return;
  var T = window.TPI, esc = T.esc, safeUrl = T.safeUrl, won = T.won, CAT = T.CAT;
  var $ = function (s) { return root.querySelector(s); };

  var FLAVOR = {
    sweet: "달콤·바닐라", fruity: "과일·꽃향", smoky: "스모키·피트", sherry: "셰리·건과일",
    rich: "진하고 묵직한", clean: "깔끔·드라이", sparkling: "톡 쏘는 탄산", highball: "하이볼 추천"
  };
  var TYPES = {
    sweet: { e: "🍯", n: "달콤한 바닐라 러버", d: "부드럽고 달콤한 캐러멜·바닐라 풍미를 좋아하는 타입이에요. 버번과 셰리 숙성 위스키, 달콤한 리큐르가 잘 맞아요." },
    fruity: { e: "🍑", n: "과일향 산책자", d: "사과·서양배·멜론처럼 화사한 과일과 꽃향을 즐기는 타입이에요. 스페이사이드 싱글몰트, 긴죠 사케, 산뜻한 화이트 와인이 잘 맞아요." },
    smoky: { e: "🔥", n: "스모키 탐험가", d: "모닥불·바다 내음 같은 강렬한 피트 향에 끌리는 타입이에요. 아일라 싱글몰트가 당신의 세계예요." },
    sherry: { e: "🍫", n: "셰리 캐스크 애호가", d: "건포도·초콜릿·견과류처럼 깊고 진한 숙성 향을 좋아하는 타입이에요. 셰리 캐스크 위스키와 다크 초콜릿 조합을 꼭 경험해 보세요." },
    rich: { e: "🍷", n: "묵직한 클래식파", d: "입안을 꽉 채우는 풀바디와 긴 여운을 좋아하는 타입이에요. 카베르네 소비뇽·쉬라즈, 캐스크 스트렝스 위스키가 잘 맞아요." },
    clean: { e: "💧", n: "깔끔한 미니멀리스트", d: "군더더기 없이 깔끔하게 떨어지는 맛을 좋아하는 타입이에요. 준마이 사케, 증류식 소주, 드라이한 화이트 와인이 잘 맞아요." },
    sparkling: { e: "🥂", n: "버블 셀러브레이터", d: "톡 쏘는 기포와 산뜻함을 즐기는 타입이에요. 샴페인·까바·모스카토로 기분 좋은 시작을 해보세요." },
    highball: { e: "🍋", n: "청량한 하이볼러", d: "시원하고 가볍게 즐기는 걸 좋아하는 타입이에요. 탄산수와 섞어도 향이 살아있는 하이볼용 위스키가 잘 맞아요." }
  };

  var Q = [
    { k: "type", q: "어떤 술이 궁금하세요?", h: "가장 끌리는 종류 하나를 골라주세요.", o: [
      ["whisky", "🥃", "위스키", "싱글몰트·버번·블렌디드"], ["wine", "🍷", "와인", "레드·화이트·스파클링"],
      ["sake", "🍶", "사케", "회·초밥과 함께"], ["other", "🍸", "스피릿·전통주", "소주·백주·진·꼬냑"],
      ["any", "🎲", "아무거나 좋아요", "취향에 맞으면 OK"]] },
    { k: "budget", q: "한 병에 얼마까지 생각하세요?", h: "예산에 맞는 보틀을 우선 추천해요.", o: [
      ["b1", "🪙", "3만 원 이하", "가볍게 시작"], ["b2", "💵", "3~7만 원", "데일리 가성비"],
      ["b3", "💳", "7~15만 원", "제대로 된 한 병"], ["b4", "💎", "15만 원 이상", "특별한 날"],
      ["any", "🤷", "상관없어요", "맛이 우선"]] },
    { k: "flavor", multi: 2, q: "끌리는 맛을 골라주세요", h: "최대 2개까지 선택할 수 있어요.", o: [
      ["sweet", "🍯", "달콤·부드러운", "바닐라·꿀·캐러멜"], ["fruity", "🍑", "과일·꽃향", "사과·멜론·시트러스"],
      ["smoky", "🔥", "스모키·피트", "훈연·바다 내음"], ["sherry", "🍫", "진한 건과일", "건포도·초콜릿"],
      ["rich", "🪵", "묵직하고 진한", "풀바디·긴 여운"], ["clean", "💧", "깔끔·드라이", "산뜻한 끝맛"],
      ["sparkling", "🫧", "톡 쏘는 탄산", "샴페인·스파클링"]] },
    { k: "how", q: "주로 어떻게 마실 계획이에요?", h: "마시는 방법에 따라 맞는 술이 달라요.", o: [
      ["neat", "🥃", "천천히 음미", "니트·온더락"], ["highball", "🍋", "하이볼·칵테일", "시원하고 가볍게"],
      ["meal", "🍽️", "식사와 함께", "반주로 곁들이기"], ["gift", "🎁", "선물할 거예요", "받는 사람이 기뻐할 술"]] },
    { k: "food", q: "함께 먹을 안주는요?", h: "안주와 잘 어울리는 술에 가산점을 줘요.", o: [
      ["meat", "🥩", "고기 요리", "스테이크·바비큐·꼬치"], ["seafood", "🍣", "회·해산물", "사시미·굴·새우"],
      ["dessert", "🧀", "치즈·디저트", "초콜릿·견과·크래커"], ["none", "🙅", "안주 없이", "술 자체로 충분"]] },
    { k: "exp", q: "술 경험은 어느 정도예요?", h: "입문자에겐 부담 없는 술부터 추천해요.", o: [
      ["beginner", "🌱", "이제 막 입문", "어려운 맛은 부담돼요"], ["middle", "🌿", "가끔 즐겨요", "몇 가지 마셔봤어요"],
      ["expert", "🌳", "꽤 마셔봤어요", "새로운 경험을 원해요"]] }
  ];

  var ans = {}, step = 0;
  var intro = $("[data-quiz-intro]"), body = $("[data-quiz-body]"), result = $("[data-quiz-result]");
  var bar = $("[data-quiz-bar]"), label = $("[data-quiz-label]"), qEl = $("[data-quiz-q]"), hEl = $("[data-quiz-hint]");
  var opts = $("[data-quiz-opts]"), prev = $("[data-quiz-prev]"), next = $("[data-quiz-next]");

  function current() { return Q[step]; }
  function picked(k) { var v = ans[k]; return v == null ? [] : [].concat(v); }

  function renderStep() {
    var s = current();
    bar.style.width = ((step) / Q.length * 100) + "%";
    label.textContent = "질문 " + (step + 1) + " / " + Q.length;
    qEl.textContent = s.q; hEl.textContent = s.h;
    var sel = picked(s.k);
    opts.innerHTML = s.o.map(function (o) {
      return '<button type="button" class="opt" data-v="' + o[0] + '" aria-pressed="' + (sel.indexOf(o[0]) > -1) + '"><span class="opt-emoji" aria-hidden="true">' + o[1] + '</span><span><b>' + esc(o[2]) + '</b><small>' + esc(o[3]) + "</small></span></button>";
    }).join("");
    prev.style.visibility = step === 0 ? "hidden" : "visible";
    next.disabled = sel.length === 0;
    next.textContent = step === Q.length - 1 ? "결과 보기 →" : "다음 →";
    T.loadIndex();
  }

  opts.addEventListener("click", function (e) {
    var b = e.target.closest(".opt"); if (!b) return;
    var s = current(), v = b.dataset.v;
    if (s.multi) {
      var cur = picked(s.k), i = cur.indexOf(v);
      if (i > -1) cur.splice(i, 1); else { cur.push(v); if (cur.length > s.multi) cur.shift(); }
      ans[s.k] = cur;
      renderStep();
    } else {
      ans[s.k] = v;
      renderStep();
      setTimeout(goNext, 180);
    }
  });
  function goNext() {
    if (!picked(current().k).length) return;
    if (step < Q.length - 1) { step++; renderStep(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else finish();
  }
  next.addEventListener("click", goNext);
  prev.addEventListener("click", function () { if (step > 0) { step--; renderStep(); } });
  $("[data-quiz-start]").addEventListener("click", function () {
    intro.hidden = true; body.hidden = false; result.hidden = true; step = 0; renderStep();
  });

  var BUD = { b1: [0, 30000], b2: [30000, 70000], b3: [70000, 150000], b4: [150000, 1e9] };

  function score(it, a) {
    var s = 0, tags = it.t || [], groups = it.g || [];
    var has = function (t) { return tags.indexOf(t) > -1; };
    // type gate
    if (a.type === "whisky" && it.c !== "whisky") return -999;
    if (a.type === "wine" && it.c !== "red_wine" && it.c !== "white_wine") return -999;
    if (a.type === "sake" && it.c !== "sake") return -999;
    if (a.type === "other" && it.c !== "other") return -999;
    // budget
    if (a.budget && a.budget !== "any") {
      var r = BUD[a.budget];
      if (it.p >= r[0] && it.p < r[1]) s += 4;
      else if (it.p >= r[0] * 0.8 && it.p < r[1] * 1.2) s += 1;
      else s -= 5;
    }
    // flavor
    [].concat(a.flavor || []).forEach(function (f) { if (has(f)) s += 4; });
    // how
    if (a.how === "highball") { if (has("highball")) s += 4; else if (it.c === "red_wine" || it.c === "sake") s -= 2; }
    if (a.how === "neat") { if (it.c === "whisky" || it.c === "other") s += 1; if (has("rich") || has("sherry") || has("smoky")) s += 1; if (has("highball") && it.p < 40000) s -= 1; }
    if (a.how === "meal") { if (groups.length) s += 1; if (it.c !== "whisky") s += 1; }
    if (a.how === "gift") { if (it.p >= 70000) s += 2; if (it.f) s += 2; if (it.p < 30000) s -= 2; }
    // food
    if (a.food && a.food !== "none") { if (groups.indexOf(a.food) > -1) s += 3; }
    // experience
    if (a.exp === "beginner") { if (has("smoky")) s -= 3; if (has("sweet") || has("fruity")) s += 1; if (it.p <= 70000) s += 1; if (/cask-strength|batch|-cs$/.test(it.id)) s -= 2; }
    if (a.exp === "expert") { if (has("smoky") || has("sherry") || has("rich")) s += 1; if (it.p >= 100000) s += 1; }
    if (it.f) s += 0.5;
    return s;
  }

  function finish() {
    bar.style.width = "100%";
    T.loadIndex().then(function (items) {
      var ranked = items.map(function (it) { return { it: it, s: score(it, ans) }; })
        .filter(function (x) { return x.s > -100; })
        .sort(function (a, b) { return b.s - a.s || a.it.p - b.it.p; });
      var top = ranked.slice(0, 6);
      var max = top.length ? top[0].s : 1;
      var fav = [].concat(ans.flavor || []);
      var typeKey = ans.how === "highball" ? "highball" : (fav[0] || "sweet");
      var ty = TYPES[typeKey] || TYPES.sweet;
      var chips = fav.map(function (f) { return '<span class="chip" data-f="' + f + '">' + esc(FLAVOR[f]) + "</span>"; }).join("");
      var list = top.map(function (x, i) {
        var pct = Math.max(62, Math.min(98, Math.round(70 + (x.s / (max || 1)) * 28) - i));
        var it = x.it;
        return '<div class="result-item"><img src="' + esc(safeUrl(it.i, "")) + '" alt="" width="88" height="88" loading="lazy"><div><b><a href="/bottle/' + esc(encodeURIComponent(String(it.id || ""))) + '/">' + esc(it.n) + "</a></b><small>" + esc(CAT[it.c]) + " · " + won(it.p) + " · 🍴 " + esc(it.a) + '</small></div><span class="match">' + pct + "% 일치</span></div>";
      }).join("");
      var top1Html = "";
      if (top.length) {
        var b1 = top[0].it;
        var snackFallback = "https://www.coupang.com/np/search?q=" + encodeURIComponent(b1.a || "");
        var snackHref = safeUrl(b1.u, snackFallback);
        var glassHref = safeUrl(b1.bu, "https://link.coupang.com/a/imWxSqsElU");
        var glassLabel = b1.bl || "추천 전용 테이스팅 잔";
        var b1Url = "/bottle/" + esc(encodeURIComponent(String(b1.id || ""))) + "/";
        top1Html =
          '<div class="result-top-card">' +
            '<div class="result-top-head"><span class="chip chip-accent">🥇 1위 맞춤 보틀 & 페어링</span><a class="more" href="' + b1Url + '">상세 정보 보기 →</a></div>' +
            '<div class="result-top-body">' +
              '<img src="' + esc(safeUrl(b1.i, "")) + '" alt="" width="110" height="110">' +
              '<div class="result-top-info">' +
                '<h3><a href="' + b1Url + '">' + esc(b1.n) + '</a></h3>' +
                '<p class="result-top-meta">' + esc(CAT[b1.c]) + ' · ' + esc(b1.v) + 'ml · 확인가 <b>' + won(b1.p) + '</b></p>' +
                '<p class="result-top-pair">🍴 어울리는 안주: <b>' + esc(b1.a) + '</b> · 🥃 ' + esc(glassLabel) + '</p>' +
                '<div class="result-top-ctas">' +
                  '<a class="btn btn-primary btn-sm" href="' + esc(snackHref) + '" target="_blank" rel="sponsored nofollow noopener">🍴 추천 안주 보러가기 ↗</a>' +
                  '<a class="btn btn-ghost btn-sm" href="' + esc(glassHref) + '" target="_blank" rel="sponsored nofollow noopener">🥃 전용잔 보러가기 ↗</a>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<p class="disclosure" style="margin-top:10px">이 영역은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다. (비주류 식품·식기류 링크)</p>' +
          '</div>';
      }
      var adClient = document.body.getAttribute("data-ad-client") || "";
      var adSlot = document.body.getAttribute("data-ad-test-slot") || "";
      var adHtml = "";
      if (adClient && adSlot) {
        adHtml = '<aside class="ad-slot" aria-label="광고"><span class="ad-badge">AD · SPONSORED</span><ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(adClient) + '" data-ad-slot="' + esc(adSlot) + '" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>';
      }
      result.innerHTML =
        '<div class="result-type"><div class="emoji" aria-hidden="true">' + ty.e + '</div><p style="margin:6px 0 0;color:#e8c89a;font-weight:700">당신의 술 취향은</p><h2>' + esc(ty.n) + "</h2><p>" + esc(ty.d) + '</p><div class="bottle-tags">' + chips + "</div></div>" +
        top1Html +
        adHtml +
        '<h2 style="margin-top:32px;font-size:22px">취향에 맞는 추천 보틀 ' + top.length + "선</h2>" +
        (top.length ? '<div class="result-list">' + list + "</div>" : '<p class="empty">조건에 맞는 보틀이 없어요. 예산을 넓혀 다시 해보세요.</p>') +
        '<div class="result-actions"><button type="button" class="btn btn-dark" data-copy-result>🔗 결과 링크 복사</button><button type="button" class="btn btn-ghost" data-retry>다시 하기</button></div>';
      if (adClient && adSlot) {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
      body.hidden = true; intro.hidden = true; result.hidden = false;
      var qs = Object.keys(ans).map(function (k) { return k + "=" + [].concat(ans[k]).join(","); }).join("&");
      history.replaceState(null, "", "/test/?" + qs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      result.querySelector("[data-retry]").addEventListener("click", function () {
        ans = {}; step = 0; history.replaceState(null, "", "/test/");
        result.hidden = true; body.hidden = false; renderStep();
      });
      result.querySelector("[data-copy-result]").addEventListener("click", function () {
        var url = location.href;
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { T.toast("결과 링크가 복사되었어요"); });
        else window.prompt("링크를 복사하세요", url);
      });
    });
  }

  // restore shared result
  var params = new URLSearchParams(location.search);
  if (params.get("type")) {
    Q.forEach(function (s) {
      var v = params.get(s.k); if (!v) return;
      var valid = s.o.map(function (o) { return o[0]; });
      var vals = v.split(",").filter(function (x) { return valid.indexOf(x) > -1; });
      if (vals.length) ans[s.k] = s.multi ? vals.slice(0, s.multi) : vals[0];
    });
    if (ans.type) { intro.hidden = true; finish(); }
  }
})();
