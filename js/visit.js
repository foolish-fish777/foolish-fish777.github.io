/* Visit logger for sumiger.me — one collect call per page view.
   Safe no-op if the API is unreachable. Do not add a stats token here. */
(function () {
  var COLLECT_URL = "https://func-sumiger-analytics.azurewebsites.net/api/collect";
  try {
    var payload = JSON.stringify({
      path: (location.pathname || "/") + (location.search || ""),
      referrer: document.referrer || ""
    });
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(
          COLLECT_URL,
          new Blob([payload], { type: "text/plain" })
        );
      } catch (e) {
        sent = false;
      }
    }
    if (!sent && typeof fetch === "function") {
      fetch(COLLECT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: payload,
        keepalive: true,
        mode: "cors",
        credentials: "omit"
      }).catch(function () {});
    }
  } catch (e) {}
})();
