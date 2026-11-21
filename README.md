# foolish-fish777.github.io

sumiger.me 的静态站点，由 GitHub Pages 从本仓库发布。这里是个人独立开发者孙明威（Sumiger）的应用介绍和隐私政策。页面是纯静态 HTML 和一份共享 CSS，没有统计、Cookie 横幅或第三方追踪。

## 发布方式

- 仓库：用户站点 `foolish-fish777.github.io`
- 分支：`main`
- 目录：仓库根目录 `/`。不是 `/docs`，也不是项目站点。
- 自定义域名：根目录 `CNAME` 的内容只有 `sumiger.me`。不要修改、追加或删除这个文件。

GitHub Pages 按目录里的 `index.html` 提供页面，因此带末尾斜杠的地址可以打开。根目录的空文件 `.nojekyll` 让 Pages 直接发布这些静态文件，不经过 Jekyll。

`404.html` 里的链接使用以 `/` 开头的路径。GitHub Pages 会在任意不存在的地址返回这个文件，相对路径会相对于访客输入的地址计算，从而找不到样式和首页。

## 页面

- `/` 首页
- `/privacy/` 隐私政策索引
- `/privacy/max-timetable/` MAX课程表隐私政策
- `/privacy/max-timetable/children/` 儿童个人信息保护说明
- `/apps/max-timetable/` 应用介绍
- `/404.html` 未找到页面

## 以后添加新应用

沿用现有应用的做法：`max-timetable` 对应 `/privacy/max-timetable/` 和 `/apps/max-timetable/`。新应用使用小写、用连字符分隔的 slug，不要发明子域名。

1. 新增 `/privacy/<slug>/index.html`。应用商店需要单独的儿童说明时，再增加 `/privacy/<slug>/children/index.html`。
2. 需要介绍页时，新增 `/apps/<slug>/index.html`。
3. 在首页 `index.html` 的「应用」列表，以及 `/privacy/index.html`，加上相对链接。
4. 隐私政策只写该应用实际的做法，不要编造收集项。
5. 不要加入统计、广告脚本、Cookie 横幅、付费外链服务或第三方追踪。不要改动 `CNAME`。

## 本地预览

在仓库根目录执行：

```bash
python3 -m http.server 8000
```

然后打开 `http://127.0.0.1:8000/`。
