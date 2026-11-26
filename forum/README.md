# 匿名讨论区 — 后端部署说明（v1）

前端已上线：`https://sumiger.me/forum/`。发帖功能要等后端接通才可用。
后端用 Cloudflare Workers + D1，都是免费档，不用绑卡。

## 1. 准备（只需要一个免费 Cloudflare 账号）

1. 注册 / 登录 https://dash.cloudflare.com（免费账号即可，不用绑卡）。
2. 安装 Wrangler：`npm install -g wrangler`，然后 `wrangler login`。

## 2. 建数据库

```bash
wrangler d1 create sumiger-forum
```

记下输出里的 `database_id`。

## 3. 写配置文件

在放 `worker.js` 的目录新建 `wrangler.toml`：

```toml
name = "sumiger-forum"
main = "worker.js"
compatibility_date = "2026-11-26"

[[d1_databases]]
binding = "DB"
database_name = "sumiger-forum"
database_id = "<第 2 步输出的 database_id>"
```

## 4. 设两个密钥（不要写进任何文件、不要发给别人）

```bash
wrangler secret put FORUM_ADMIN_TOKEN
wrangler secret put FORUM_PEPPER
```

- `FORUM_ADMIN_TOKEN`：删帖口令，删帖时在帖子旁点“删除”后输入。丢了就重新 `wrangler secret put` 一个新的。
- `FORUM_PEPPER`：给发帖者 IP 加盐用的，随便填一串长的随机字符即可。

## 5. 部署

```bash
wrangler deploy
```

部署成功后会给一个地址，例如 `https://sumiger-forum.<子域名>.workers.dev`。
先打开 `https://<那个地址>/health`，看到 `{"ok":true}` 就是通了。

## 6. 接到网站上

把 `forum/forum.js` 开头的 `FORUM_API_BASE` 改成第 5 步的地址（不要带末尾的 `/`），
推到网站仓库，等 GitHub Pages 发布后，打开 `https://sumiger.me/forum/` 发一条测试帖，
确认出现在列表里，再用管理员口令删掉它。

## 后端规则（v1，写在 worker.js 里）

- 不用登录；发帖自动用浏览器里存的匿名编号，如“匿名用户123”。
- IP 不存明文，只存 SHA-256 加盐哈希，且绝不返回给前端。
- 限流：同一哈希 30 秒内最多 1 条，每天最多 20 条。
- 内容 1–1000 字；链接和一小批广告/诈骗/违法关键词会被直接拒绝。
- 没有验证码。以后被刷了再加。
