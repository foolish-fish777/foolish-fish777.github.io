(function () {
  var ENDPOINT = "https://func-sumiger-analytics.azurewebsites.net/api/collect";
  var startTime = Date.now();
  var clicks = 0;
  var maxScroll = 0;
  var sent = false;
  function getId() {
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
  function post(payload) {
    try {
      var body = JSON.stringify(payload);
      var ok = false;
      if (navigator.sendBeacon) {
        try {
          ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
        } catch (e) {
          ok = false;
        }
      }
      if (!ok && typeof fetch === "function") {
        fetch(ENDPOINT, {
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
  function fields() {
    var tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}
    return {
      path: (location.pathname || "/") + (location.search || ""),
      referrer: document.referrer || "",
      visitor_id: getId(),
      user_agent: navigator.userAgent || "",
      language: navigator.language || "",
      timezone: tz,
      screen: (window.screen ? screen.width + "x" + screen.height : ""),
      viewport: (window.innerWidth + "x" + window.innerHeight)
    };
  }
  function isFileLink(a) {
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
      if (isFileLink(a)) {
        try {
          var file = new URL(a.href, location.href).pathname;
          var f = fields();
          f.type = "download";
          f.file = file;
          post(f);
        } catch (e) {}
      }
    }, true);
    window.addEventListener("scroll", function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 100;
      if (pct > maxScroll) maxScroll = pct;
    }, { passive: true });
    post(fields());
    var sendLeave = function () {
      if (sent) return;
      sent = true;
      var f = fields();
      f.type = "engagement";
      f.duration_ms = Date.now() - startTime;
      f.max_scroll_pct = maxScroll;
      f.clicks = clicks;
      post(f);
    };
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") sendLeave();
    });
    window.addEventListener("pagehide", sendLeave);
  } catch (e) {}
})();
