/* sumiger.me region gate — shared by the homepage and /forum/.
 *
 * Rule: the anonymous forum is open everywhere EXCEPT mainland China.
 * Mainland China (country code CN) sees "地区不适配" and cannot enter;
 * Macau, Hong Kong, Taiwan and overseas are allowed.
 *
 * How the country is decided (IP location only — never browser language
 * or timezone, which the user can change):
 *   1. If a forum API base is given, try its GET /geo first. On the
 *      deployed Worker that returns request.cf.country (CF-IPCountry).
 *   2. Otherwise (or if that fails), fetch Cloudflare's trace endpoint
 *      https://www.cloudflare.com/cdn-cgi/trace and read its loc= line.
 *      No account, no key, no payment needed for this endpoint.
 *   3. If both fail (endpoint down, timeout, no country code), return
 *      null and the caller must DEFAULT TO ALLOW — never lock out an
 *      overseas user because the check itself failed.
 *
 * The result is cached in sessionStorage for 10 minutes so the homepage
 * and the forum page do not re-check on every navigation.
 *
 * Exposes window.SumigerGeo = { checkCountry, isMainland, parseTrace }.
 * The homepage gate wires itself up automatically when #forum-link
 * exists; the forum page calls checkCountry() from forum.js.
 */
(function () {
  "use strict";

  var TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
  var CACHE_KEY = "sumiger-geo";
  var CACHE_TTL_MS = 10 * 60 * 1000;
  var TIMEOUT_MS = 3000;

  /* Dynamic strings for the homepage note. The forum page's blocked
     heading uses data-i18n="forum_blocked" from js/i18n.js instead. */
  var STR = {
    "zh-CN": { checking: "检测中…", blocked: "地区不适配" },
    "zh-TW": { checking: "檢測中…", blocked: "地區不適配" },
    "yue": { checking: "檢測緊…", blocked: "地區唔適配" },
    "en": { checking: "Checking…", blocked: "Not available in your region" },
    "ja": { checking: "確認中…", blocked: "お住まいの地域ではご利用いただけません" },
    "ko": { checking: "확인 중…", blocked: "해당 지역에서는 이용할 수 없습니다" }
  };

  function lang() {
    try {
      var v = localStorage.getItem("sumiger-lang");
      if (v && STR[v]) return v;
    } catch (e) {}
    return "zh-CN";
  }

  function s(key) {
    var d = STR[lang()] || STR["zh-CN"];
    return d[key] || STR["zh-CN"][key] || "";
  }

  function fetchTimeout(url, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl.signal }).then(
      function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  function parseTrace(text) {
    var m = /^loc=([A-Za-z]{2})$/m.exec(text || "");
    return m ? m[1].toUpperCase() : null;
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (d && d.country && Date.now() - d.ts < CACHE_TTL_MS) return d.country;
    } catch (e) {}
    return null;
  }

  function writeCache(country) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ country: country, ts: Date.now() }));
    } catch (e) {}
  }

  function checkCountry(apiBase) {
    var cached = readCache();
    if (cached) return Promise.resolve(cached);
    var chain = Promise.resolve(null);
    if (apiBase) {
      chain = chain.then(function () {
        return fetchTimeout(apiBase + "/geo", TIMEOUT_MS)
          .then(function (res) {
            if (!res.ok) return null;
            return res.json();
          })
          .then(function (data) {
            if (data && typeof data.country === "string" && data.country) {
              return data.country.toUpperCase();
            }
            return null;
          })
          .catch(function () { return null; });
      });
    }
    chain = chain.then(function (country) {
      if (country) return country;
      return fetchTimeout(TRACE_URL, TIMEOUT_MS)
        .then(function (res) {
          if (!res.ok) return null;
          return res.text();
        })
        .then(function (text) { return parseTrace(text); })
        .catch(function () { return null; });
    });
    return chain.then(function (country) {
      if (country) writeCache(country);
      return country; // null = unknown -> caller defaults to ALLOW
    });
  }

  function isMainland(country) {
    return country === "CN";
  }

  /* ---- homepage gate (only runs when #forum-link exists) ---- */

  /* The note's normal text ("匿名发帖" etc.) as i18n.js applied it.
     Captured once the page's own language pass has run, so the allowed
     branch can put it back after the "检测中…" state. */
  var originalNote = "";

  function renderHomepageGate(country) {
    var link = document.getElementById("forum-link");
    var note = document.getElementById("forum-note");
    var gateNote = document.getElementById("forum-gate-note");
    if (!link || !note) return;
    link.classList.remove("is-checking");
    if (country && isMainland(country)) {
      link.classList.add("locked");
      link.setAttribute("aria-disabled", "true");
      note.textContent = s("blocked");
      if (!link.dataset.gateBound) {
        link.dataset.gateBound = "1";
        link.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (gateNote) {
            gateNote.hidden = false;
            gateNote.textContent = s("blocked");
          }
        });
      }
    } else {
      link.classList.remove("locked");
      link.removeAttribute("aria-disabled");
      if (gateNote) gateNote.hidden = true;
      /* Back to the normal note text (whatever language is active). */
      if (originalNote) note.textContent = originalNote;
    }
  }

  function initHomepageGate() {
    var link = document.getElementById("forum-link");
    var note = document.getElementById("forum-note");
    if (!link) return;
    if (note) originalNote = note.textContent;
    link.classList.add("is-checking");
    if (note) note.textContent = s("checking");
    /* While checking, clicks go nowhere. */
    link.addEventListener("click", function (ev) {
      if (link.classList.contains("is-checking")) ev.preventDefault();
    });
    var sel = document.getElementById("lang-select");
    if (sel) {
      sel.addEventListener("change", function () {
        /* i18n.js re-applies the note text on language change; capture
           the new-language text, then put the gate state back. */
        setTimeout(function () {
          if (note) originalNote = note.textContent;
          renderHomepageGate(readCache());
        }, 50);
      });
    }
    checkCountry("").then(function (country) {
      renderHomepageGate(country);
    });
  }

  window.SumigerGeo = {
    checkCountry: checkCountry,
    isMainland: isMainland,
    parseTrace: parseTrace
  };

  /* Wait for DOMContentLoaded so i18n.js (loaded before this file) has
     already applied the page language before we capture originalNote.
     Only run at once if the document is already fully loaded. */
  if (document.readyState === "complete") {
    initHomepageGate();
  } else {
    document.addEventListener("DOMContentLoaded", initHomepageGate);
  }
})();
