"""Primordial Soup 站点后端：静态页面 + 博客内容 API。"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse

import blog

ROOT = Path(__file__).resolve().parent

# 线上不暴露 /docs、/redoc、/openapi.json
app = FastAPI(
    title="Primordial Soup",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def _read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


# —— 页面 ——

@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return _read("index.html")


@app.get("/blog", response_class=HTMLResponse)
def blog_index() -> str:
    return _read("blog.html")


@app.get("/blog/{slug}", response_class=HTMLResponse)
def blog_post(slug: str, response: Response) -> str:
    # 单页模板，slug 由前端从 location.pathname 解析；未知 slug 返回 404 状态
    if blog.get_post(slug) is None:
        response.status_code = 404
    return _read("blog.html")


# —— 静态资源 ——

@app.get("/style.css")
def css() -> FileResponse:
    return FileResponse(ROOT / "style.css", media_type="text/css")


@app.get("/blog.css")
def blog_css() -> FileResponse:
    return FileResponse(ROOT / "blog.css", media_type="text/css")


@app.get("/blog.js")
def blog_js() -> FileResponse:
    return FileResponse(ROOT / "blog.js", media_type="application/javascript")


@app.get("/projects.js")
def projects_js() -> FileResponse:
    return FileResponse(ROOT / "projects.js", media_type="application/javascript")


# —— 博客 API ——

@app.get("/api/blog")
def api_blog_list() -> dict:
    return {"posts": blog.list_posts()}


@app.get("/api/blog/{slug}")
def api_blog_post(slug: str) -> dict:
    post = blog.get_post(slug)
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")
    return post
