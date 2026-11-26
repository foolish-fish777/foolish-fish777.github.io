/* sumiger.me anonymous forum — frontend v1.
   No login. The browser gets a stable anonymous number on first post
   (stored in localStorage only, never sent anywhere except as the
   display name of its own posts). Post content is rendered with
   textContent only, never innerHTML, so a post cannot inject markup.

   FORUM_API_BASE: set this to the deployed Worker URL once the backend
   is live, e.g. "https://sumiger-forum.<subdomain>.workers.dev"
   (no trailing slash). While it is empty the page shows the offline
   note and the form stays disabled — no fake posts are ever shown. */
(function () {
  "use strict";

  var FORUM_API_BASE = "";

  var ID_KEY = "sumiger-forum-id";
  var LANG_KEY = "sumiger-lang";

  /* Dynamic (JS-only) strings. Static text lives in js/i18n.js. */
  var STR = {
    "zh-CN": {
      posting: "发送中…", posted: "已发布。", tooFast: "发得太快了，等 30 秒再发。",
      blocked: "这条内容发不出去，换个写法再试。", failed: "发帖失败，请稍后再试。",
      loadFailed: "加载失败，请稍后再试。", del: "删除",
      confirmDel: "确定删除这条帖子吗？", tokenPrompt: "请输入管理员口令：",
      wrongToken: "口令不对。", deleted: "已删除。", delFailed: "删除失败，请稍后再试。"
    },
    "zh-TW": {
      posting: "傳送中…", posted: "已發佈。", tooFast: "發得太快了，等 30 秒再發。",
      blocked: "這條內容發不出去，換個寫法再試。", failed: "發帖失敗，請稍後再試。",
      loadFailed: "載入失敗，請稍後再試。", del: "刪除",
      confirmDel: "確定刪除這條帖子嗎？", tokenPrompt: "請輸入管理員口令：",
      wrongToken: "口令不對。", deleted: "已刪除。", delFailed: "刪除失敗，請稍後再試。"
    },
    "yue": {
      posting: "傳送緊…", posted: "已發佈。", tooFast: "發得太快喇，等 30 秒再發。",
      blocked: "呢條內容發唔出去，換個寫法再試。", failed: "發帖失敗，遲啲再試。",
      loadFailed: "載入失敗，遲啲再試。", del: "刪除",
      confirmDel: "確定刪除呢條帖子嗎？", tokenPrompt: "請輸入管理員口令：",
      wrongToken: "口令唔啱。", deleted: "已刪除。", delFailed: "刪除失敗，遲啲再試。"
    },
    "en": {
      posting: "Posting…", posted: "Posted.", tooFast: "Too fast — wait 30 seconds before posting again.",
      blocked: "This post was rejected. Try different wording.", failed: "Failed to post, please try again later.",
      loadFailed: "Failed to load, please try again later.", del: "Delete",
      confirmDel: "Delete this post?", tokenPrompt: "Admin token:",
      wrongToken: "Wrong token.", deleted: "Deleted.", delFailed: "Failed to delete, please try again later."
    },
    "ja": {
      posting: "送信中…", posted: "投稿しました。", tooFast: "投稿が早すぎます。30秒待ってからもう一度どうぞ。",
      blocked: "この内容は投稿できません。別の書き方でお試しください。", failed: "投稿に失敗しました。後でもう一度お試しください。",
      loadFailed: "読み込みに失敗しました。後でもう一度お試しください。", del: "削除",
      confirmDel: "この投稿を削除しますか？", tokenPrompt: "管理者パスワードを入力してください：",
      wrongToken: "パスワードが違います。", deleted: "削除しました。", delFailed: "削除に失敗しました。後でもう一度お試しください。"
    },
    "ko": {
      posting: "게시 중…", posted: "게시했습니다.", tooFast: "너무 빠릅니다. 30초 후에 다시 게시해 주세요.",
      blocked: "이 내용은 게시할 수 없습니다. 다르게 작성해 보세요.", failed: "게시하지 못했습니다. 나중에 다시 시도해 주세요.",
      loadFailed: "불러오기에 실패했습니다. 나중에 다시 시도해 주세요.", del: "삭제",
      confirmDel: "이 게시물을 삭제할까요?", tokenPrompt: "관리자 비밀번호를 입력하세요:",
      wrongToken: "비밀번호가 틀렸습니다.", deleted: "삭제했습니다.", delFailed: "삭제하지 못했습니다. 나중에 다시 시도해 주세요."
    }
  };

  function lang() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      if (v && STR[v]) return v;
    } catch (e) {}
    return "zh-CN";
  }

  function s(key) {
    var d = STR[lang()] || STR["zh-CN"];
    return d[key] || STR["zh-CN"][key] || "";
  }

  function anonPrefix() {
    return { "zh-CN": "匿名用户", "zh-TW": "匿名用戶", "yue": "匿名用戶", "en": "Anonymous user ", "ja": "匿名ユーザー", "ko": "익명 사용자" }[lang()] || "匿名用户";
  }

  function getAnonName() {
    try {
      var saved = localStorage.getItem(ID_KEY);
      if (saved) return saved;
      var num = 100 + Math.floor(Math.random() * 900);
      var name = anonPrefix() + num;
      localStorage.setItem(ID_KEY, name);
      return name;
    } catch (e) {
      return anonPrefix() + (100 + Math.floor(Math.random() * 900));
    }
  }

  function fmtTime(iso) {
    try {
      var d = new Date(iso.replace(" ", "T") + "Z");
      return new Intl.DateTimeFormat(undefined, {
        timeZone: "Asia/Macau",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      }).format(d);
    } catch (e) {
      return iso;
    }
  }

  var listEl, statusEl, listStatusEl, emptyEl, formEl, textEl, btnEl, offlineEl;

  function api(path, opts) {
    return fetch(FORUM_API_BASE + path, opts);
  }

  function renderPost(post) {
    var li = document.createElement("li");
    li.className = "post-item";
    li.dataset.id = String(post.id);
    var meta = document.createElement("div");
    meta.className = "post-meta";
    var who = document.createElement("strong");
    who.textContent = post.name;
    var when = document.createElement("span");
    when.textContent = fmtTime(post.created_at);
    var del = document.createElement("button");
    del.type = "button";
    del.className = "post-del";
    del.textContent = s("del");
    del.addEventListener("click", function () { onDelete(post.id, li); });
    meta.appendChild(who);
    meta.appendChild(when);
    meta.appendChild(del);
    var body = document.createElement("p");
    body.textContent = post.content;
    li.appendChild(meta);
    li.appendChild(body);
    return li;
  }

  function loadPosts() {
    listStatusEl.hidden = false;
    listStatusEl.textContent = "";
    return api("/posts", { method: "GET" })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      })
      .then(function (data) {
        listStatusEl.hidden = true;
        listEl.textContent = "";
        var posts = (data && data.posts) || [];
        emptyEl.hidden = posts.length !== 0;
        posts.forEach(function (p) { listEl.appendChild(renderPost(p)); });
      })
      .catch(function () {
        listStatusEl.hidden = false;
        listStatusEl.textContent = s("loadFailed");
        emptyEl.hidden = true;
      });
  }

  function onPost(ev) {
    ev.preventDefault();
    var content = textEl.value.trim();
    if (!content) return;
    btnEl.disabled = true;
    statusEl.textContent = s("posting");
    api("/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: getAnonName(), content: content })
    })
      .then(function (res) {
        if (res.status === 429) throw new Error("tooFast");
        if (res.status === 400) throw new Error("blocked");
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(function () {
        textEl.value = "";
        statusEl.textContent = s("posted");
        return loadPosts();
      })
      .catch(function (err) {
        statusEl.textContent = s(err && err.message === "tooFast" ? "tooFast" : err && err.message === "blocked" ? "blocked" : "failed");
      })
      .then(function () { btnEl.disabled = false; });
  }

  function onDelete(id, li) {
    if (!window.confirm(s("confirmDel"))) return;
    var token = window.prompt(s("tokenPrompt"));
    if (token === null || token === "") return;
    api("/posts/" + encodeURIComponent(String(id)), {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    })
      .then(function (res) {
        if (res.status === 401) throw new Error("wrongToken");
        if (!res.ok) throw new Error("delFailed");
        li.remove();
        if (!listEl.children.length) emptyEl.hidden = false;
        statusEl.textContent = s("deleted");
      })
      .catch(function (err) {
        statusEl.textContent = s(err && err.message === "wrongToken" ? "wrongToken" : "delFailed");
      });
  }

  function init() {
    listEl = document.getElementById("post-list");
    statusEl = document.getElementById("post-status");
    listStatusEl = document.getElementById("list-status");
    emptyEl = document.getElementById("empty-note");
    formEl = document.getElementById("post-form");
    textEl = document.getElementById("post-text");
    btnEl = document.getElementById("post-btn");
    offlineEl = document.getElementById("offline-note");
    document.getElementById("anon-name").textContent = getAnonName();
    formEl.addEventListener("submit", onPost);
    if (!FORUM_API_BASE) {
      offlineEl.hidden = false;
      textEl.disabled = true;
      btnEl.disabled = true;
      listStatusEl.hidden = true;
      emptyEl.hidden = true;
      return;
    }
    loadPosts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
