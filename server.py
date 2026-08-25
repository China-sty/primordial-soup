"""原始汤团队站后端：文章模块（CRUD + 后台管理）。"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

load_dotenv()

ROOT = Path(__file__).resolve().parent
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

app = FastAPI(title="Primordial Soup Team Site")

# —— SQLite ——
_db = ROOT / "articles.db"
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db)
    c.row_factory = sqlite3.Row
    return c


def _init() -> None:
    with _lock:
        c = _conn()
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT
            )
            """
        )
        c.commit()
        c.close()


_init()

# —— 静态页面 ——

def _read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return _read("index.html")


@app.get("/admin", response_class=HTMLResponse)
def admin_page() -> str:
    return _read("admin.html")


@app.get("/articles", response_class=HTMLResponse)
def articles_page() -> str:
    return _read("articles.html")


@app.get("/style.css")
def css() -> FileResponse:
    return FileResponse(ROOT / "style.css", media_type="text/css")


@app.get("/projects.js")
def projects_js() -> FileResponse:
    return FileResponse(ROOT / "projects.js", media_type="application/javascript")


@app.get("/md.js")
def md_js() -> FileResponse:
    return FileResponse(ROOT / "md.js", media_type="application/javascript")


# —— 登录 ——

_tokens: set[str] = set()


class LoginIn(BaseModel):
    password: str


@app.post("/api/login")
def login(body: LoginIn, response: Response) -> dict:
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="密码错误")
    token = os.urandom(16).hex()
    _tokens.add(token)
    response.set_cookie("admin_token", token, httponly=True, samesite="lax")
    return {"ok": True}


def _require_admin(request: Request) -> None:
    t = request.cookies.get("admin_token")
    if not t or t not in _tokens:
        raise HTTPException(status_code=401, detail="未登录")


# —— 文章 API ——

class ArticleIn(BaseModel):
    title: str
    content: str


@app.get("/api/articles")
def list_articles() -> list:
    with _lock:
        c = _conn()
        rows = c.execute("SELECT id, title, created_at FROM articles ORDER BY id DESC").fetchall()
        c.close()
    return [dict(r) for r in rows]


@app.get("/api/articles/{aid}")
def get_article(aid: int) -> dict:
    with _lock:
        c = _conn()
        r = c.execute("SELECT * FROM articles WHERE id = ?", (aid,)).fetchone()
        c.close()
    if r is None:
        raise HTTPException(status_code=404, detail="文章不存在")
    return dict(r)


@app.post("/api/articles")
def create_article(body: ArticleIn, request: Request) -> dict:
    _require_admin(request)
    with _lock:
        c = _conn()
        cur = c.execute(
            "INSERT INTO articles (title, content, created_at, updated_at) "
            "VALUES (?,?,datetime('now','localtime'),datetime('now','localtime'))",
            (body.title, body.content),
        )
        c.commit()
        aid = cur.lastrowid
        c.close()
    return {"id": aid}


@app.put("/api/articles/{aid}")
def update_article(aid: int, body: ArticleIn, request: Request) -> dict:
    _require_admin(request)
    with _lock:
        c = _conn()
        c.execute(
            "UPDATE articles SET title=?, content=?, updated_at=datetime('now','localtime') WHERE id=?",
            (body.title, body.content, aid),
        )
        c.commit()
        c.close()
    return {"ok": True}


@app.delete("/api/articles/{aid}")
def delete_article(aid: int, request: Request) -> dict:
    _require_admin(request)
    with _lock:
        c = _conn()
        c.execute("DELETE FROM articles WHERE id=?", (aid,))
        c.commit()
        c.close()
    return {"ok": True}
