"""技术博客内容加载器。

文章放在 content/blog/*.md，文件开头是可选的 front matter：

    ---
    title: 标题
    subtitle: 副标题
    date: 2026-10-22
    tags: Android, Agent
    series: Agent × Android Framework
    order: 1
    icon: eye
    ---

正文标准 Markdown。新增文章 = 新增一个 .md 文件，无需改代码。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

CONTENT_DIR = Path(__file__).resolve().parent / "content" / "blog"

_FM_RE = re.compile(r"^---[ \t]*\n(.*?)\n---[ \t]*\n", re.S)
_CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_WORD_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_\-\.]*")
_FENCE_RE = re.compile(r"```.*?```", re.S)

# 缓存：路径 -> (mtime, post)
_cache: Dict[str, Any] = {"stamp": None, "posts": []}


def _parse_front_matter(raw: str):
    meta: Dict[str, str] = {}
    body = raw
    m = _FM_RE.match(raw)
    if m:
        for line in m.group(1).splitlines():
            if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
                continue
            key, val = line.split(":", 1)
            meta[key.strip()] = val.strip().strip('"').strip("'")
        body = raw[m.end():]
    return meta, body.lstrip("\n")


def _reading_minutes(body: str) -> int:
    """粗估阅读时长：中文 ~420 字/分，英文 ~200 词/分，代码 ~60 行/分。"""
    code_blocks = _FENCE_RE.findall(body)
    code_lines = sum(b.count("\n") for b in code_blocks)
    text = _FENCE_RE.sub("", body)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)  # 链接只算文字
    cjk = len(_CJK_RE.findall(text))
    words = len(_WORD_RE.findall(text))
    minutes = cjk / 420.0 + words / 200.0 + code_lines / 60.0
    return max(1, int(round(minutes)))


def _excerpt(body: str, limit: int = 120) -> str:
    text = re.sub(r"```.*?```", "", body, flags=re.S)
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para or para.startswith("#") or para.startswith(">") or para.startswith("|"):
            continue
        para = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", para)
        para = re.sub(r"[*_`#>]", "", para)
        para = re.sub(r"\s+", "", para)
        if para:
            return para[:limit] + ("…" if len(para) > limit else "")
    return ""


def _split_tags(meta: Dict[str, str]) -> List[str]:
    raw = meta.get("tags", "")
    return [t.strip() for t in re.split(r"[,，、]", raw) if t.strip()]


def _load_file(path: Path) -> Optional[Dict[str, Any]]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    meta, body = _parse_front_matter(raw)
    if not meta.get("title"):
        return None
    slug = meta.get("slug") or path.stem
    date = meta.get("date") or ""
    try:
        order = int(meta.get("order") or 999)
    except ValueError:
        order = 999
    return {
        "slug": slug,
        "title": meta.get("title", ""),
        "subtitle": meta.get("subtitle", ""),
        "date": date,
        "tags": _split_tags(meta),
        "series": meta.get("series", ""),
        "order": order,
        "icon": meta.get("icon", "doc"),
        "author": meta.get("author", "邵天宇"),
        "reading": _reading_minutes(body),
        "excerpt": meta.get("excerpt") or _excerpt(body),
        "content": body,
    }


def load_posts() -> List[Dict[str, Any]]:
    """读取全部文章；按文件 mtime 做一次轻量缓存。"""
    if not CONTENT_DIR.is_dir():
        return []
    files = sorted(CONTENT_DIR.glob("*.md"))
    stamp = tuple((f.name, f.stat().st_mtime) for f in files)
    if _cache["stamp"] == stamp:
        return _cache["posts"]
    posts = [p for p in (_load_file(f) for f in files) if p]
    posts.sort(key=lambda p: (p["order"], p["date"]))
    _cache["stamp"], _cache["posts"] = stamp, posts
    return posts


def list_posts() -> List[Dict[str, Any]]:
    """列表用：不带正文。"""
    return [{k: v for k, v in p.items() if k != "content"} for p in load_posts()]


def get_post(slug: str) -> Optional[Dict[str, Any]]:
    for p in load_posts():
        if p["slug"] == slug:
            return p
    return None
