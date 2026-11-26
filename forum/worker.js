/* sumiger.me anonymous forum — backend v1 (Cloudflare Worker + D1).
 *
 * Deploy (needs a free Cloudflare account; see forum/README.md):
 *   wrangler d1 create sumiger-forum
 *   wrangler secret put FORUM_ADMIN_TOKEN
 *   wrangler secret put FORUM_PEPPER
 *   wrangler deploy
 *
 * Env bindings (wrangler.toml):
 *   [[d1_databases]]
 *   binding = "DB"
 *   database_name = "sumiger-forum"
 *   database_id = "<from `wrangler d1 create`>"
 *
 * Secrets (never in this file, never in the repo):
 *   FORUM_ADMIN_TOKEN — Bearer token for DELETE /posts/:id.
 *   FORUM_PEPPER      — server-side pepper for the poster hash.
 *
 * Privacy: the client IP is never stored in plaintext and never
 * returned. Only SHA-256(pepper + ":" + ip) is stored, used for the
 * rate limit (1 post / 30s, 20 posts / day per hash). GET /posts
 * returns only id, name, content, created_at.
 *
 * Limits: content 1-1000 chars. v1 blocks links and a small list of
 * ad/scam/illegal phrases server-side; relax the list later if needed.
 * No CAPTCHA in v1. No Google reCAPTCHA (blocked in mainland China).
 */

const ALLOWED_ORIGINS = new Set([
  "https://sumiger.me",
  "https://www.sumiger.me",
  "https://foolish-fish777.github.io",
]);

const MAX_CONTENT_LEN = 1000;
const MAX_BODY_BYTES = 8192;
const NAME_RE = /^[\u4e00-\u9fffA-Za-z0-9 _\-.]{1,40}$/u;

// v1 blocklist: keep short and strict on purpose. Edit freely later.
const BLOCKLIST = [
  "贷款", "办证", "代开发票", "刷单", "套现", "博彩", "赌博",
  "六合彩", "时时彩", "日结", "兼职赚钱", "加微信", "加微",
  "http://", "https://", "www.",
];

function utcNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds())
  );
}

function corsHeaders(req) {
  const origin = (req.headers.get("Origin") || "").trim();
  const headers = { Vary: "Origin" };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(req, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function originOk(req) {
  const origin = (req.headers.get("Origin") || "").trim();
  return !origin || ALLOWED_ORIGINS.has(origin);
}

async function posterHash(req, env) {
  const pepper = env.FORUM_PEPPER || "";
  if (!pepper) return null;
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const data = new TextEncoder().encode(pepper + ":" + ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tokenOk(req, env) {
  const expected = env.FORUM_ADMIN_TOKEN || "";
  if (!expected) return false;
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return false;
  const provided = auth.slice(7).trim();
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

async function ensureSchema(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS posts (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "name TEXT NOT NULL, content TEXT NOT NULL, " +
    "poster_hash TEXT NOT NULL, created_at TEXT NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_posts_hash_time ON posts(poster_hash, created_at)"
  ).run();
}

export default {
  async fetch(request, env) {
    const req = request;
    if (!env.DB) return json(req, 500, { ok: false, error: "storage not configured" });
    if (req.method === "OPTIONS") {
      if (!originOk(req)) return json(req, 403, { ok: false, error: "origin not allowed" });
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (!originOk(req)) return json(req, 403, { ok: false, error: "origin not allowed" });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      await ensureSchema(env);
    } catch (e) {
      return json(req, 500, { ok: false, error: "storage error" });
    }

    if (req.method === "GET" && path === "/health") {
      return json(req, 200, { ok: true });
    }

    if (req.method === "GET" && path === "/geo") {
      // Cloudflare gives the visitor country as request.cf.country
      // ("CF-IPCountry"). The frontend tries this first; if it is
      // missing it falls back to the public trace endpoint.
      const cf = req.cf || null;
      return json(req, 200, { ok: true, country: (cf && cf.country) || null });
    }

    if (req.method === "GET" && path === "/posts") {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
      try {
        const res = await env.DB.prepare(
          "SELECT id, name, content, created_at FROM posts ORDER BY id DESC LIMIT ?"
        ).bind(limit).all();
        return json(req, 200, { ok: true, posts: res.results || [] });
      } catch (e) {
        return json(req, 500, { ok: false, error: "storage error" });
      }
    }

    if (req.method === "POST" && path === "/posts") {
      let data;
      try {
        const raw = await req.text();
        if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
          return json(req, 413, { ok: false, error: "payload too large" });
        }
        data = raw ? JSON.parse(raw) : {};
        if (!data || typeof data !== "object") throw new Error("bad json");
      } catch (e) {
        return json(req, 400, { ok: false, error: "invalid json" });
      }
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const content = typeof data.content === "string" ? data.content.trim() : "";
      if (!NAME_RE.test(name)) return json(req, 400, { ok: false, error: "invalid name" });
      if (content.length < 1 || content.length > MAX_CONTENT_LEN) {
        return json(req, 400, { ok: false, error: "invalid content" });
      }
      if (BLOCKLIST.some((w) => content.includes(w))) {
        return json(req, 400, { ok: false, error: "content rejected" });
      }
      const hash = await posterHash(req, env);
      if (hash === null) return json(req, 500, { ok: false, error: "server misconfigured" });
      try {
        const recent = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM posts WHERE poster_hash = ? AND created_at > datetime('now', '-30 seconds')"
        ).bind(hash).first();
        if (recent && Number(recent.c) >= 1) {
          return json(req, 429, { ok: false, error: "too fast" });
        }
        const daily = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM posts WHERE poster_hash = ? AND created_at > datetime('now', '-24 hours')"
        ).bind(hash).first();
        if (daily && Number(daily.c) >= 20) {
          return json(req, 429, { ok: false, error: "daily limit" });
        }
        const now = utcNow();
        const ins = await env.DB.prepare(
          "INSERT INTO posts (name, content, poster_hash, created_at) VALUES (?, ?, ?, ?)"
        ).bind(name, content, hash, now).run();
        const id = ins.meta && ins.meta.last_row_id;
        return json(req, 201, { ok: true, post: { id, name, content, created_at: now } });
      } catch (e) {
        return json(req, 500, { ok: false, error: "storage error" });
      }
    }

    if (req.method === "DELETE" && path.startsWith("/posts/")) {
      const id = Number(path.slice("/posts/".length));
      if (!Number.isInteger(id) || id < 1) return json(req, 400, { ok: false, error: "invalid id" });
      if (!tokenOk(req, env)) return json(req, 401, { ok: false, error: "unauthorized" });
      try {
        const res = await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
        const changed = res.meta ? Number(res.meta.changes || 0) : 0;
        if (changed < 1) return json(req, 404, { ok: false, error: "not found" });
        return json(req, 200, { ok: true, deleted: id });
      } catch (e) {
        return json(req, 500, { ok: false, error: "storage error" });
      }
    }

    return json(req, 404, { ok: false, error: "not found" });
  },
};
