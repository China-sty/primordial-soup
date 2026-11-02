# 技术博客板块说明

站点的内容只有博客一套：`content/blog/` 下的静态 Markdown，走 `/blog`。

（之前的「团队文章」模块和 `/admin` 后台已经移除，不再有 SQLite 和在线编辑器。）

## 文件结构

```
primordial-soup/
├── blog.py              # 内容加载器：扫描 content/blog/*.md，解析 front matter
├── blog.html            # 博客页面模板（列表页 + 文章页共用）
├── blog.css             # 博客样式
├── blog.js              # Markdown 渲染 + 语法高亮 + 目录/进度条
└── content/blog/        # ★ 文章都在这里，一个 .md 一篇
    ├── agent-android-perception.md
    ├── agent-android-action.md
    └── agent-android-shizuku.md
```

## 加一篇新文章

在 `content/blog/` 下新建 `xxx.md`，文件开头写 front matter：

```markdown
---
title: 文章标题
subtitle: 一句话副标题（显示在标题下方）
tags: Android, Agent, 推理优化
series: Agent × Android Framework
order: 4
icon: doc
excerpt: 列表页展示的摘要，一到两句话。
---

正文用标准 Markdown，从二级标题开始（一级标题用 title 代替）。
```

字段说明：

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `title` | 是 | 文章标题；缺失的文件会被忽略 |
| `slug` | 否 | URL 片段，默认取文件名（`agent-android-perception.md` → `/blog/agent-android-perception`） |
| `date` | 否 | 保留字段，站点不展示日期；排序请用 `order` |
| `tags` | 否 | 英文逗号 / 中文逗号分隔，列表页最多显示 3 个 |
| `series` | 否 | 合集名。首页按它自动分组，封面和文末显示「合集 · xxx」 |
| `order` | 否 | 排序，数字大的排在合集前面，也用来标记「最新」 |
| `icon` | 否 | 封面图标：`eye` / `hand` / `key` / `doc` / `image` / `shield` / `graph` / `branch` / `pulse` / `route` / `radar` / `gauge`（对应 `blog.html` 里的 SVG symbol） |
| `author` | 否 | 默认为「邵天宇」 |
| `excerpt` | 否 | 缺省时自动取正文第一段 |

阅读时长按中文字数自动估算，不用手写。

## 可用的 Markdown 扩展

除常规标题 / 列表 / 表格 / 引用 / 代码块外，还支持：

**代码块**（带文件名和复制按钮）：

````markdown
```kotlin title="AgentService.kt"
class AgentService
```
````

**ASCII 架构图**（用 `text` 或 `diagram` 围栏，等宽字体 + 虚线框）：

````markdown
```text cap="图注"
[ App ] --> [ Binder ] --> [ system_server ]
```
````

**提示块**（`[!NOTE]` / `[!TIP]` / `[!WARN]` / `[!KEY]`）：

```markdown
> [!WARN] 注意
> 这里写正文。
```

## 本地预览 / 上线

```bash
.venv/Scripts/python -m uvicorn server:app --port 8000
# 打开 http://127.0.0.1:8000/blog
```

上线时把 `server.py`、`blog.py`、`blog.html`、`blog.css`、`blog.js`、`content/blog/` 传到
`/opt/primordial-soup/`，然后 `systemctl restart primordial-soup`。

只加文章的话，传完 md 就够了，**不需要重启**。站点没有数据库，也没有需要保护的 `.env`。
