/* Booze Base v2 — site.js (search, list filter, reviews, share) */
(function () {
  "use strict";
  // Legacy v1 query parameter redirect (?bottle=..., ?preset=..., ?category=...)
  if (location.pathname === "/" || location.pathname === "/index.html") {
    var sp = new URLSearchParams(location.search);
    var bParam = sp.get("bottle");
    if (bParam && /^[a-z0-9-]+$/i.test(bParam)) {
      location.replace("/bottle/" + bParam.toLowerCase() + "/");
      return;
    }
    var pMap = { under_50k: "under-50k", gift_100k: "gift-100k", luxury_200k: "luxury-200k", highball: "highball", meat_pairing: "meat", seafood_pairing: "seafood" };
    var pParam = sp.get("preset");
    if (pParam && pMap[pParam]) {
      location.replace("/picks/" + pMap[pParam] + "/");
      return;
    }
    var cMap = { whisky: "whisky", red_wine: "red-wine", white_wine: "white-wine", sake: "sake", other: "spirits" };
    var cParam = sp.get("category");
    if (cParam && cMap[cParam]) {
      location.replace("/category/" + cMap[cParam] + "/");
      return;
    }
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var safeUrl = function (u, fallback) {
    var fb = fallback || "#";
    var s = String(u || "").trim();
    if (!s) return fb;
    if (/^https:\/\//i.test(s)) {
      try {
        var parsed = new URL(s);
        return parsed.protocol === "https:" ? parsed.href : fb;
      } catch (e) {
        return fb;
      }
    }
    if (/^\/(?!\/)[^\s"'<>`\\]*$/.test(s)) return s;
    return fb;
  };
  var won = function (n) { return "₩" + Number(n || 0).toLocaleString("ko-KR"); };
  var CAT = { whisky: "위스키", red_wine: "레드 와인", white_wine: "화이트·스파클링", sake: "사케", other: "스피릿·전통주" };
  var BUILD = (document.currentScript && document.currentScript.src.split("v=")[1]) || "1";

  function toast(msg) {
    var t = $("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("is-on"); }, 2600);
  }
  window.TPI = { toast: toast, esc: esc, safeUrl: safeUrl, won: won, CAT: CAT };

  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- shared index loader ---------- */
  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch("/assets/data/index.json?v=" + BUILD).then(function (r) { return r.json(); });
    }
    return indexPromise;
  }
  window.TPI.loadIndex = loadIndex;

  /* ---------- search overlay ---------- */
  var ov = $("#search-ov"), q = $("#search-q"), out = $("#search-results");
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }
  function openSearch() {
    if (!ov) return;
    ov.hidden = false; document.body.style.overflow = "hidden";
    setTimeout(function () { q.focus(); }, 30);
    loadIndex();
  }
  function closeSearch() { if (!ov) return; ov.hidden = true; document.body.style.overflow = ""; }
  $$("[data-search-open]").forEach(function (b) { b.addEventListener("click", openSearch); });
  $$("[data-search-close]").forEach(function (b) { b.addEventListener("click", closeSearch); });
  if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closeSearch(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSearch();
    if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault(); openSearch();
    }
  });
  var searchTimer;
  if (q) q.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var term = norm(q.value);
      if (!term) { out.innerHTML = '<p class="search-empty">검색어를 입력하세요.</p>'; return; }
      loadIndex().then(function (items) {
        var hits = items.filter(function (it) { return it.s.indexOf(term) !== -1; }).slice(0, 30);
        if (!hits.length) { out.innerHTML = '<p class="search-empty">"' + esc(q.value) + '"에 맞는 보틀이 없어요.</p>'; return; }
        out.innerHTML = hits.map(function (it) {
          return '<a href="/bottle/' + esc(encodeURIComponent(String(it.id || ""))) + '/"><img src="' + esc(safeUrl(it.i, "")) + '" alt="" width="48" height="48" loading="lazy"><span><b>' + esc(it.n) + '</b><small>' + esc(CAT[it.c] || "") + " · " + esc(it.v) + 'ml</small></span><span class="p">' + won(it.p) + "</span></a>";
        }).join("");
      });
    }, 120);
  });

  /* ---------- list page filter / sort / paging ---------- */
  var list = $("[data-list]");
  if (list) {
    var PAGE = 24, limit = PAGE;
    var cards = $$(".card", list);
    var orderedCards = cards.slice();
    var inp = $("[data-list-q]"), sel = $("[data-list-sort]"), more = $("[data-list-more]");
    var cnt = $("[data-list-count]"), empty = $("[data-list-empty]");
    var flavor = "";
    var lastMode = sel ? sel.value : "";
    var listTimer;
    function apply() {
      var term = norm(inp && inp.value);
      var mode = sel ? sel.value : "";
      if (mode !== lastMode) {
        orderedCards = cards.slice().sort(function (a, b) {
          if (mode === "price-asc") return a.dataset.price - b.dataset.price;
          if (mode === "price-desc") return b.dataset.price - a.dataset.price;
          return a.dataset.order - b.dataset.order;
        });
        var frag = document.createDocumentFragment();
        orderedCards.forEach(function (c) { frag.appendChild(c); });
        list.appendChild(frag);
        lastMode = mode;
      }
      var shown = 0, matched = 0;
      orderedCards.forEach(function (c) {
        var ok = (!term || c.dataset.name.indexOf(term) !== -1) && (!flavor || (" " + c.dataset.tags + " ").indexOf(" " + flavor + " ") !== -1);
        if (ok) matched++;
        var vis = ok && shown < limit;
        if (vis) shown++;
        c.classList.toggle("is-hidden", !vis);
      });
      if (cnt) cnt.textContent = matched + "개 보틀";
      if (empty) empty.hidden = matched !== 0;
      if (more) { more.hidden = matched <= shown; more.textContent = "더 보기 (" + (matched - shown) + "개 남음)"; }
    }
    if (inp) inp.addEventListener("input", function () {
      clearTimeout(listTimer);
      listTimer = setTimeout(function () { limit = PAGE; apply(); }, 120);
    });
    if (sel) sel.addEventListener("change", function () { clearTimeout(listTimer); limit = PAGE; apply(); });
    if (more) more.addEventListener("click", function () { limit += PAGE; apply(); });
    $$(".flavor-filter button").forEach(function (b) {
      b.addEventListener("click", function () {
        clearTimeout(listTimer);
        flavor = b.dataset.f || "";
        $$(".flavor-filter button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        limit = PAGE; apply();
      });
    });
    apply();
  }

  /* ---------- guide category filter ---------- */
  var gFilter = $("[data-guide-filter]");
  if (gFilter) {
    var gCards = $$(".guide-card", $("[data-guide-list]") || document);
    $$("button", gFilter).forEach(function (b) {
      b.addEventListener("click", function () {
        var cat = b.dataset.gcat || "";
        $$("button", gFilter).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        gCards.forEach(function (c) { c.classList.toggle("is-hidden", Boolean(cat && c.dataset.cat !== cat)); });
      });
    });
  }

  /* ---------- share ---------- */
  $$("[data-share]").forEach(function (b) {
    b.addEventListener("click", function () {
      var url = location.origin + location.pathname;
      if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("링크가 복사되었어요"); });
      else window.prompt("링크를 복사하세요", url);
    });
  });

  /* ---------- reviews (bottle page) ---------- */
  var box = $("[data-reviews]");
  if (box) {
    var LS = "bb_user_reviews_v1";
    var ENDPOINT = document.body.getAttribute("data-endpoint") || "";
    var pid = box.dataset.product, pname = box.dataset.productName, pcat = box.dataset.category;
    var seed = [];
    try { seed = JSON.parse(($("#seed-reviews") || {}).textContent || "[]"); } catch (e) { seed = []; }
    var local = [];
    try { local = JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { local = []; }
    var all = local.concat(seed).filter(function (r) { return r.product_id === pid; });
    var stars = function (n) { n = Math.max(1, Math.min(5, Math.round(+n || 5))); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); };
    function render() {
      if (!all.length) return;
      box.innerHTML = all.slice(0, 12).map(function (r) {
        return '<article class="review"><div class="review-top"><b>' + esc(r.nickname || "익명 애호가") + '</b><span class="stars">' + stars(r.rating) + '</span></div><p>“' + esc(r.comment) + '”</p><div class="review-foot"><span class="review-snack">🍴 ' + esc(r.pairing_snack) + "</span><span>" + esc(r.submitted_at || "") + "</span></div></article>";
      }).join("");
    }
    render();
    if (ENDPOINT) {
      fetch(ENDPOINT + (ENDPOINT.indexOf("?") > -1 ? "&" : "?") + "action=reviews").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !Array.isArray(d.reviews)) return;
        var seen = {};
        all.forEach(function (r) { seen[r.nickname + "|" + r.comment] = 1; });
        d.reviews.forEach(function (r) { if (r.product_id === pid && !seen[r.nickname + "|" + r.comment]) { all.push(r); seen[r.nickname + "|" + r.comment] = 1; } });
        render();
      }).catch(function () {});
    }
    var form = $("[data-review-form]");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hp = form.website_hp ? form.website_hp.value : "";
      var snack = form.pairing_snack.value.trim(), comment = form.comment.value.trim();
      if (!snack || !comment) { toast("안주와 한줄평을 입력해 주세요"); return; }
      if (hp) { form.reset(); toast("페어링 노트가 등록되었어요. 감사합니다!"); return; }
      var rv = { submitted_at: new Date().toISOString().slice(0, 10), product_id: pid, product_name: pname, category: pcat, nickname: form.nickname.value.trim() || "익명 애호가", rating: +form.rating.value || 5, pairing_snack: snack, comment: comment };
      all.unshift(rv);
      try { var arr = JSON.parse(localStorage.getItem(LS) || "[]"); arr.unshift(rv); localStorage.setItem(LS, JSON.stringify(arr.slice(0, 50))); } catch (err) {}
      render(); form.reset(); toast("페어링 노트가 등록되었어요. 감사합니다!");
      if (ENDPOINT) {
        var payload = { action: "submit_review", website_hp: hp };
        for (var k in rv) payload[k] = rv[k];
        fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(payload) }).catch(function () {});
      }
    });
  }
})();
