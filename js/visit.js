/* Visit logger for sumiger.me — v2 (no heatmap / no screen recording).
   Sends one collect call per page view, plus one engagement call on leave.
   Safe no-op if the API is unreachable. Do not add a stats token here.
   NOTE: the Azure /api/collect backend currently only stores
   IP + time + path. The extra fields below are sent, but will only
   appear on the stats page after the backend is updated to store them. */
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

  try {
    document.addEventListener("click", function () { clicks++; }, true);
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
