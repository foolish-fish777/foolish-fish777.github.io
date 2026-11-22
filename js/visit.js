/* Visit logger for sumiger.me — v3 (no heatmap / no screen recording).
   Sends one collect call per page view, plus one engagement call on leave,
   plus one type=download call when a download link is clicked.
   Safe no-op if the API is unreachable. Do not add a stats token here.
   NOTE: only clicks on the site's own pages are tracked. A download opened
   by pasting the file URL directly (or by curl) never runs this script,
   so it is not counted. */
(function () {
  var COLLECT_URL = "https://func-sumiger-analytics.azurewebsites.net/api/collect";
  var startTime = Date.now();
  var clicks = 0;
  var maxScroll = 0;
  var engagementSent = false;

  function getVisitorId() {
    try {
      var id = localStorage.getItem("sumiger-vid");
      if (!id) {
        if (window.crypto && crypto.randomUUID) {
          id = crypto.randomUUID();
        } else {
          id = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        }
        localStorage.setItem("sumiger-vid", id);
      }
      return id;
    } catch (e) {
      return "";
    }
  }

  function send(payload) {
    try {
      var body = JSON.stringify(payload);
      var sent = false;
      if (navigator.sendBeacon) {
        try {
          sent = navigator.sendBeacon(COLLECT_URL, new Blob([body], { type: "text/plain" }));
        } catch (e) {
          sent = false;
        }
      }
      if (!sent && typeof fetch === "function") {
        fetch(COLLECT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: body,
          keepalive: true,
          mode: "cors",
          credentials: "omit"
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function baseFields() {
    var tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}
    return {
      path: (location.pathname || "/") + (location.search || ""),
      referrer: document.referrer || "",
      visitor_id: getVisitorId(),
      user_agent: navigator.userAgent || "",
      language: navigator.language || "",
      timezone: tz,
      screen: (window.screen ? screen.width + "x" + screen.height : ""),
      viewport: (window.innerWidth + "x" + window.innerHeight)
    };
  }

  // Download tracking: a click on a file link (.app / .apk / .hap, or any
  // link with a download attribute) sends one type=download event with the
  // file name, before the browser starts the download. sendBeacon keeps
  // working even as the page unloads for the download.
  function isDownloadLink(a) {
    if (!a || !a.href) return false;
    if (a.hasAttribute && a.hasAttribute("download")) return true;
    try {
      var p = new URL(a.href, location.href).pathname.toLowerCase();
      return p.endsWith(".app") || p.endsWith(".apk") || p.endsWith(".hap")
        || p.endsWith(".zip") || p.endsWith(".dmg") || p.endsWith(".exe");
    } catch (e) {
      return false;
    }
  }

  try {
    document.addEventListener("click", function (ev) {
      clicks++;
      var t = ev && ev.target;
      var a = null;
      if (t) {
        if (t.closest) a = t.closest("a");
        else if (t.tagName === "A") a = t;
      }
      if (isDownloadLink(a)) {
        try {
          var file = new URL(a.href, location.href).pathname;
          var f = baseFields();
          f.type = "download";
          f.file = file;
          send(f);
        } catch (e) {}
      }
    }, true);
    window.addEventListener("scroll", function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 100;
      if (pct > maxScroll) maxScroll = pct;
    }, { passive: true });

    send(baseFields());

    var sendEngagement = function () {
      if (engagementSent) return;
      engagementSent = true;
      var f = baseFields();
      f.type = "engagement";
      f.duration_ms = Date.now() - startTime;
      f.max_scroll_pct = maxScroll;
      f.clicks = clicks;
      send(f);
    };
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") sendEngagement();
    });
    window.addEventListener("pagehide", sendEngagement);
  } catch (e) {}
})();
