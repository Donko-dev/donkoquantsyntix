/* DONKO SYNTIX : site en lecture seule.
   - Seule fonction réseau : GET vers l'API du VPS, jeton dans l'en-tête Authorization.
   - Aucun bouton d'ordre, aucun réglage du robot n'est modifiable ici.
   - Les données de l'API sont insérées en texte brut (textContent) : jamais de HTML. */
(function () {
  "use strict";

  var T = window.SYNTIX_I18N;
  var LOCALE = { fr: "fr-FR", en: "en-GB", de: "de-DE" };
  var KEY = { lang: "syntix_lang", theme: "syntix_theme", ccy: "syntix_ccy", rate: "syntix_rate_eur",
              url: "syntix_api_url", token: "syntix_api_token", seen: "syntix_seen_events" };
  var POLL_MS = 30000;
  var DEFAULT_INDICES = ["FX Vol 20","FX Vol 40","FX Vol 60","FX Vol 80","FX Vol 99",
                         "SFX Vol 20","SFX Vol 40","SFX Vol 60","SFX Vol 80","SFX Vol 99"];
  var XOF_PER_EUR = 655.957; // parité fixe du FCFA (XOF et XAF) avec l'euro
  var ROBOT = "SYNTIX";

  /* ===== À RENSEIGNER AVANT MISE EN LIGNE ===== */
  // Adresse HTTPS officielle de l'API du VPS (origine seule, sans chemin). Ex. https://api.tondomaine.tld
  var ALLOWED_API_ORIGIN = "https://api.REMPLACER-PAR-TON-DOMAINE.tld";
  // Lien de parrainage Weltrade (Programme Partenaire). Vide = bouton masqué.
  var REFERRAL_URL = "https://track.gowt.me/visit/?bta=72795&brand=weltrade";


  var state = { lang: "fr", theme: "dark", ccy: "USD", rateEur: 0.92, timer: null, firstLoad: true };
  var deferredInstall = null;

  function $(id) { return document.getElementById(id); }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function t(key) { return (T[state.lang] && T[state.lang][key]) || (T.fr[key]) || key; }

  /* ---------- Traductions, thème, langue ---------- */
  function applyTranslations() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    $("btn-lang").textContent = state.lang.toUpperCase();
    $("sel-lang").value = state.lang;
    $("sel-theme").value = state.theme;
    $("sel-ccy").value = state.ccy;
    $("rate-eur").value = String(state.rateEur);
    renderKpisFromCache();
    renderIndices();
    if (cache) { renderCurve(cache.events); renderAgenda(cache.events); }
  }

  function setLang(lang) {
    if (!T[lang]) return;
    state.lang = lang; store(KEY.lang, lang);
    applyTranslations();
    refresh();
  }

  function setTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    store(KEY.theme, state.theme);
    $("sel-theme").value = state.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", state.theme === "light" ? "#fbf7ec" : "#07080b");
  }

  /* ---------- Devise d'affichage ---------- */
  function usdTo(amountUsd) {
    var eur = amountUsd * state.rateEur;
    switch (state.ccy) {
      case "EUR": return eur;
      case "XOF": return eur * XOF_PER_EUR;
      case "XAF": return eur * XOF_PER_EUR;
      default: return amountUsd;
    }
  }
  function money(amountUsd) {
    var value = usdTo(amountUsd || 0);
    var digits = (state.ccy === "XOF" || state.ccy === "XAF") ? 0 : 2;
    try {
      return new Intl.NumberFormat(LOCALE[state.lang], {
        style: "currency", currency: state.ccy, minimumFractionDigits: digits, maximumFractionDigits: digits,
      }).format(value);
    } catch (e) {
      return value.toFixed(digits) + " " + state.ccy;
    }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v, d) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return Number(v).toLocaleString(LOCALE[state.lang], { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }
  function dateStr(iso) {
    var d = new Date(iso);
    return isNaN(d) ? String(iso || "—") : d.toLocaleString(LOCALE[state.lang], { dateStyle: "short", timeStyle: "short" });
  }

  /* ---------- Réseau : GET uniquement ---------- */
  function originOf(u) {
    try { return new URL(u).origin; } catch (e) { return ""; }
  }
  function apiConfigured() {
    return ALLOWED_API_ORIGIN.indexOf("REMPLACER") === -1;
  }
  // Seule l'adresse officielle est utilisée : une adresse enregistrée autrement est ignorée.
  function cfg() {
    var stored = (load(KEY.url) || "").replace(/\/+$/, "");
    var ok = apiConfigured() && originOf(stored) === ALLOWED_API_ORIGIN;
    return { url: ok ? stored : "", token: load(KEY.token) || "" };
  }
  function apiGet(path) {
    var c = cfg();
    if (!c.url || !c.token) return Promise.reject(new Error("not_configured"));
    return fetch(c.url + path, {
      method: "GET",
      headers: { "Authorization": "Bearer " + c.token },
      cache: "no-store",
      credentials: "omit",
    }).then(function (r) {
      if (r.status === 401) throw new Error("unauthorized");
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }

  /* ---------- Rendu ---------- */
  var cache = null;

  function setConn(kind, text) {
    var pill = $("conn-pill");
    pill.className = "pill" + (kind === "ok" ? " ok" : kind === "bad" ? " bad" : "");
    pill.textContent = text;
  }

  function renderKpis(stats) {
    $("k-trades").textContent = num(stats.trades);
    $("k-net").textContent = stats.net_total == null ? "—" : money(stats.net_total);
    $("k-wr").textContent = stats.win_rate_pct == null ? "—" : num(stats.win_rate_pct, 1) + " %";
    $("k-pf").textContent = stats.profit_factor == null ? "—" : num(stats.profit_factor, 2);
    $("k-dd").textContent = stats.max_drawdown == null ? "—" : money(stats.max_drawdown);
  }

  function renderKpisFromCache() {
    if (cache && cache.stats) renderKpis(cache.stats);
  }

  function cell(text, cls) {
    var td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }
  function fillBody(bodyId, rows, colspan, emptyKey) {
    var body = $(bodyId);
    body.textContent = "";
    if (!rows.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = colspan; td.className = "muted"; td.textContent = t(emptyKey);
      tr.appendChild(td); body.appendChild(tr);
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      r.forEach(function (c) { tr.appendChild(c); });
      body.appendChild(tr);
    });
  }

  function renderOpen(list) {
    var rows = list.map(function (p) {
      return [cell(dateStr(p.time)), cell(p.market || "—"), cell(p.side || "—"),
              cell(num(p.volume, 2)), cell(p.sl == null ? "—" : num(p.sl, 5))];
    });
    fillBody("open-body", rows, 5, "open_none");
    $("k-open").textContent = num(list.length);
  }

  function renderJournal(events) {
    var rows = events.slice(0, 50).map(function (e) {
      var isClose = e.event === "CLOSE";
      var netTxt = isClose && e.net != null ? money(e.net) : "—";
      var netCls = isClose && e.net != null ? (e.net >= 0 ? "ok" : "bad") : "";
      return [cell(dateStr(e.time)), cell(t(isClose ? "ev_close" : "ev_open")),
              cell(e.market || "—"), cell(e.side || "—"), cell(num(e.volume, 2)), cell(netTxt, netCls)];
    });
    fillBody("journal-body", rows, 6, "journal_none");
  }

  function pushAlert(text) {
    var list = $("alerts-list");
    var li = document.createElement("li");
    li.textContent = text;
    var first = list.querySelector("li");
    if (first && first.classList.contains("muted")) list.textContent = "";
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 60) list.removeChild(list.lastChild);
  }

  /* Alertes : uniquement les événements nouveaux depuis le chargement de la page. */
  function detectNew(events) {
    var seen = {};
    try { seen = JSON.parse(load(KEY.seen) || "{}"); } catch (e) { seen = {}; }
    var fresh = [];
    events.forEach(function (e) {
      var key = (e.time || "") + "|" + (e.event || "") + "|" + (e.ticket || "");
      if (!seen[key]) { seen[key] = 1; fresh.push(e); }
    });
    var keys = Object.keys(seen);
    if (keys.length > 500) { keys.slice(0, keys.length - 500).forEach(function (k) { delete seen[k]; }); }
    store(KEY.seen, JSON.stringify(seen));
    if (state.firstLoad) return;
    fresh.forEach(function (e) {
      if (e.event === "CLOSE") {
        pushAlert(dateStr(e.time) + " · " + t("ev_close") + " · " + (e.market || "") + " · " + money(e.net || 0));
      } else {
        pushAlert(dateStr(e.time) + " · " + t("ev_open") + " · " + (e.side || "") + " " + (e.market || "") + " · " + num(e.volume, 2));
      }
    });
  }

  /* ---------- Courbe du résultat net cumulé (trades clôturés, ordre de clôture) ---------- */
  function renderCurve(events) {
    var box = $("curve");
    var closes = events.filter(function (e) { return e.event === "CLOSE" && e.net != null; })
      .sort(function (x, y) { return String(x.time).localeCompare(String(y.time)); });
    box.textContent = "";
    if (!closes.length) { box.textContent = t("curve_none"); return; }
    var pts = [0], acc = 0;
    closes.forEach(function (e) { acc += Number(e.net); pts.push(acc); });
    var W = 600, H = 220, P = 24;
    var lo = Math.min.apply(null, pts.concat([0])), hi = Math.max.apply(null, pts.concat([0]));
    var span = (hi - lo) || 1;
    function x(i) { return P + i * (W - 2 * P) / Math.max(pts.length - 1, 1); }
    function y(v) { return H - P - ((v - lo) / span) * (H - 2 * P); }
    var d = pts.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
    var zero = y(0).toFixed(1);
    var last = pts[pts.length - 1];
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("curve_title")) + '">' +
      '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + zero + '" y2="' + zero + '" stroke="currentColor" opacity=".25" stroke-dasharray="4 4"/>' +
      '<path d="' + d + '" fill="none" stroke="' + (last >= 0 ? "#2fb170" : "#e0574c") + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      "</svg>";
    box.innerHTML = svg;
    var val = document.createElement("div");
    val.className = "kpi-value " + (last >= 0 ? "ok" : "bad");
    val.textContent = money(last);
    box.appendChild(val);
  }

  /* ---------- Agenda : ouvertures et clôtures par jour UTC ---------- */
  function renderAgenda(events) {
    var box = $("agenda-list");
    box.textContent = "";
    if (!events.length) { box.textContent = t("agenda_none"); return; }
    var days = {};
    events.forEach(function (e) {
      var d = new Date(e.time);
      if (isNaN(d)) return;
      var key = d.toISOString().slice(0, 10);
      days[key] = days[key] || { opened: 0, closed: 0, net: 0 };
      if (e.event === "CLOSE") { days[key].closed += 1; days[key].net += Number(e.net || 0); }
      else { days[key].opened += 1; }
    });
    Object.keys(days).sort().reverse().forEach(function (key) {
      var row = days[key];
      var card = document.createElement("div");
      card.className = "agenda-day";
      var h = document.createElement("h3");
      h.textContent = key;
      var p = document.createElement("div");
      p.className = "small";
      p.textContent = num(row.opened) + " " + t("day_opened") + " · " + num(row.closed) + " " + t("day_closed") + " · " + money(row.net);
      card.appendChild(h); card.appendChild(p);
      box.appendChild(card);
    });
  }

  /* ---------- Indices : actifs par défaut et favoris (stockés dans le navigateur) ---------- */
  function favs() {
    try { var v = JSON.parse(load("syntix_favs") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function toggleFav(name) {
    var list = favs();
    var i = list.indexOf(name);
    if (i === -1) list.push(name); else list.splice(i, 1);
    store("syntix_favs", JSON.stringify(list));
    renderIndices();
  }
  function indexRow(name) {
    var on = favs().indexOf(name) !== -1;
    var row = document.createElement("div");
    row.className = "index-chip";
    var label = document.createElement("span");
    label.textContent = name;
    var star = document.createElement("button");
    star.type = "button";
    star.className = "star" + (on ? " on" : "");
    star.textContent = on ? "★" : "☆";
    star.setAttribute("aria-label", t(on ? "fav_remove" : "fav_add"));
    star.addEventListener("click", function () { toggleFav(name); });
    row.appendChild(label); row.appendChild(star);
    return row;
  }
  function renderIndices() {
    var d = $("defaults");
    if (!d) return;
    d.textContent = "";
    DEFAULT_INDICES.forEach(function (name) { d.appendChild(indexRow(name)); });
    var f = $("favs");
    f.textContent = "";
    var list = favs();
    if (!list.length) { f.textContent = t("favs_none"); return; }
    list.forEach(function (name) { f.appendChild(indexRow(name)); });
  }

  /* ---------- Cycle de rafraîchissement ---------- */
  function refresh() {
    var c = cfg();
    if (!c.url || !c.token) {
      setConn("", apiConfigured() ? t("status_unknown") : t("api_not_configured"));
      $("updated").textContent = t("never");
      return Promise.resolve();
    }
    return Promise.all([
      apiGet("/api/robots/" + ROBOT + "/stats"),
      apiGet("/api/robots/" + ROBOT + "/open"),
      apiGet("/api/robots/" + ROBOT + "/journal?limit=200"),
    ]).then(function (res) {
      cache = { stats: res[0].statistics, open: res[1].open || [], events: res[2].events || [] };
      setConn("ok", t("status_connected"));
      renderKpis(cache.stats);
      renderOpen(cache.open);
      renderJournal(cache.events);
      renderCurve(cache.events);
      renderAgenda(cache.events);
      detectNew(cache.events);
      state.firstLoad = false;
      $("updated").textContent = new Date().toLocaleTimeString(LOCALE[state.lang]);
    }).catch(function (err) {
      if (!/^(unauthorized|not_configured|http_|Failed to fetch|NetworkError)/.test(err.message || "")) {
        console.error("Rendu SYNTIX :", err);
      }
      var msg = { unauthorized: t("err_unauth"), not_configured: t("err_not_configured") }[err.message] || t("err_offline");
      setConn("bad", t("status_disconnected"));
      $("settings-msg").textContent = msg;
    });
  }

  function startPolling() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(refresh, POLL_MS);
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    var links = document.querySelectorAll("nav.main-nav a[data-nav]");
    var nav = $("main-nav");
    $("btn-nav").addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      $("btn-nav").setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        $("btn-nav").setAttribute("aria-expanded", "false");
      });
    });
    if ("IntersectionObserver" in window) {
      var map = {};
      links.forEach(function (a) { map[a.getAttribute("data-nav")] = a; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.classList.remove("active"); });
          var a = map[en.target.id];
          if (a) a.classList.add("active");
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      document.querySelectorAll("main section[id]").forEach(function (s) { io.observe(s); });
    }
  }

  /* ---------- Réglages ---------- */
  function initSettings() {
    $("btn-save").addEventListener("click", function () {
      var url = $("api-url").value.trim();
      var token = $("api-token").value.trim();
      if (!apiConfigured()) { $("settings-msg").textContent = t("api_not_configured"); return; }
      if (!/^https:\/\//.test(url)) { $("settings-msg").textContent = t("settings_https"); return; }
      if (originOf(url) !== ALLOWED_API_ORIGIN) { $("settings-msg").textContent = t("api_origin_refused"); return; }
      if (token.length < 32) { $("settings-msg").textContent = t("settings_token_short"); return; }
      store(KEY.url, url);
      store(KEY.token, token);
      $("api-token").value = "";
      $("settings-msg").textContent = t("settings_saved");
      refresh(); startPolling();
    });
    $("btn-forget").addEventListener("click", function () {
      try { localStorage.removeItem(KEY.url); localStorage.removeItem(KEY.token); } catch (e) { /* */ }
      $("api-url").value = ""; $("api-token").value = "";
      $("settings-msg").textContent = "";
      setConn("", t("status_unknown"));
    });
    $("api-url").value = load(KEY.url) || "";
    $("sel-theme").addEventListener("change", function (e) { setTheme(e.target.value); });
    $("sel-lang").addEventListener("change", function (e) { setLang(e.target.value); });
    $("sel-ccy").addEventListener("change", function (e) {
      state.ccy = e.target.value; store(KEY.ccy, state.ccy);
      renderKpisFromCache();
      if (cache) { renderOpen(cache.open); renderJournal(cache.events); }
    });
    $("rate-eur").addEventListener("change", function (e) {
      var v = parseFloat(e.target.value);
      if (!isFinite(v) || v <= 0) { e.target.value = String(state.rateEur); return; }
      state.rateEur = v; store(KEY.rate, String(v));
      renderKpisFromCache();
      if (cache) { renderOpen(cache.open); renderJournal(cache.events); }
    });
  }

  /* ---------- Boutons d'en-tête ---------- */
  function initHeader() {
    $("btn-theme").addEventListener("click", function () { setTheme(state.theme === "dark" ? "light" : "dark"); });
    $("btn-lang").addEventListener("click", function () {
      var order = ["fr", "en", "de"];
      setLang(order[(order.indexOf(state.lang) + 1) % order.length]);
    });
    var installBtn = $("btn-install");
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault(); deferredInstall = e; installBtn.style.display = "inline-flex";
    });
    installBtn.addEventListener("click", function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall = null; installBtn.style.display = "none";
    });
  }

  /* ---------- Connexion API : masquée sauf accès volontaire, et bouton de parrainage ---------- */
  function openConnectionIfRequested() {
    var box = $("connexion");
    if (window.location.hash === "#connexion") box.classList.add("open");
  }
  function initConnectionSection() {
    openConnectionIfRequested();
    window.addEventListener("hashchange", openConnectionIfRequested);
    if (REFERRAL_URL) {
      var a = $("referral-link");
      a.href = REFERRAL_URL;
      $("referral").classList.remove("hidden");
    }
  }

  /* ---------- Démarrage ---------- */
  function init() {
    // Français par défaut ; la langue du téléphone n'est pas utilisée pour éviter un affichage en anglais.
    state.lang = load(KEY.lang) || "fr";
    if (!T[state.lang]) state.lang = "fr";
    state.theme = load(KEY.theme) === "light" ? "light" : "dark";
    state.ccy = load(KEY.ccy) || "USD";
    var r = parseFloat(load(KEY.rate));
    if (isFinite(r) && r > 0) state.rateEur = r;

    setTheme(state.theme);
    applyTranslations();
    initConnectionSection();
    renderIndices();
    initHeader();
    initNav();
    initSettings();
    refresh(); startPolling();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* hors-ligne non disponible */ });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
