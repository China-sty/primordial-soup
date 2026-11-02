/* 技术博客前端：列表渲染 + Markdown 渲染 + 代码高亮 + 目录/进度条 */
(function () {
  "use strict";

  /* ============================================================
     基础工具
     ============================================================ */
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  var ICONS = { eye: "#i-eye", hand: "#i-hand", key: "#i-key", doc: "#i-doc", image: "#i-image", shield: "#i-shield", graph: "#i-graph", branch: "#i-branch", pulse: "#i-pulse", route: "#i-route", radar: "#i-radar", gauge: "#i-gauge" };
  var ACCENTS = { eye: "#6366f1", hand: "#0ea5e9", key: "#a855f7", doc: "#4f46e5", image: "#10b981", shield: "#f43f5e", graph: "#f59e0b", branch: "#06b6d4", pulse: "#dc2626", route: "#7c3aed", radar: "#0d9488", gauge: "#2563eb" };
  function accentOf(p) { return ACCENTS[p.icon] || ACCENTS.doc; }
  function iconOf(p) { return ICONS[p.icon] || ICONS.doc; }

  /* ============================================================
     语法高亮（够用就好的轻量实现）
     ============================================================ */
  var KEYWORDS = {
    kotlin: "abstract actual annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external false field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline null object open operator out override package param private property protected public receiver reified return sealed set setparam super suspend tailrec this throw true try typealias typeof val value var vararg when where while",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null record var",
    python: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case self",
    bash: "if then else elif fi for while do done case esac function in return export local echo cd source set unset exit sudo adb am pm",
    gradle: "apply plugin android dependencies implementation api compileOnly testImplementation id def ext configurations repositories buildscript allprojects",
    json: "true false null",
    yaml: "true false null",
  };
  var LANG_ALIAS = { kt: "kotlin", kts: "kotlin", py: "python", sh: "bash", shell: "bash", console: "bash", gvy: "gradle" };
  var LANG_LABEL = {
    kotlin: "Kotlin", kt: "Kotlin", java: "Java", python: "Python", py: "Python",
    bash: "Shell", sh: "Shell", console: "Console", json: "JSON", xml: "XML",
    gradle: "Gradle", kotlin_gradle: "Gradle", text: "TEXT", log: "LOG", yaml: "YAML",
  };

  function span(cls, text) { return '<span class="tk-' + cls + '">' + esc(text) + "</span>"; }

  // XML / 资源文件：标签名、属性名、属性值分别着色
  function highlightXml(code) {
    var out = "", i = 0, n = code.length;
    while (i < n) {
      if (code.substr(i, 4) === "<!--") {
        var ce = code.indexOf("-->", i + 4);
        ce = ce < 0 ? n : ce + 3;
        out += span("c", code.slice(i, ce)); i = ce; continue;
      }
      if (code[i] === "<") {
        var end = code.indexOf(">", i);
        end = end < 0 ? n : end + 1;
        var j = i + 1;
        out += '<span class="tk-p">&lt;</span>';
        if (code[j] === "/") { out += '<span class="tk-p">/</span>'; j++; }
        var ns = j;
        while (j < end && /[\w:.-]/.test(code[j])) { j++; }
        if (j > ns) { out += span("t", code.slice(ns, j)); }
        while (j < end) {
          var ch = code[j];
          if (/\s/.test(ch)) { out += esc(ch); j++; continue; }
          if (ch === ">" || ch === "/") { out += '<span class="tk-p">' + esc(ch) + "</span>"; j++; continue; }
          var as = j;
          while (j < end && /[\w:.-]/.test(code[j])) { j++; }
          if (j > as) {
            out += span("a", code.slice(as, j));
            if (code[j] === "=") {
              out += '<span class="tk-p">=</span>'; j++;
              if (code[j] === '"' || code[j] === "'") {
                var q = code[j], vs = j; j++;
                while (j < end && code[j] !== q) { j++; }
                j++;
                out += span("s", code.slice(vs, j));
              }
            }
            continue;
          }
          out += esc(ch); j++;
        }
        i = end; continue;
      }
      out += esc(code[i]); i++;
    }
    return out;
  }

  function highlight(code, lang) {
    var key = LANG_ALIAS[lang] || lang;
    if (key === "xml") { return highlightXml(code); }
    var words = KEYWORDS[key];
    if (!words) { return esc(code); }
    var kw = {};
    words.split(/\s+/).forEach(function (w) { if (w) { kw[w] = 1; } });
    var isIdStart = function (c) { return /[A-Za-z_$]/.test(c); };
    var isId = function (c) { return /[A-Za-z0-9_$]/.test(c); };
    var n = code.length, i = 0, out = "";

    while (i < n) {
      var c = code[i], two = code.substr(i, 2);

      // 注释
      if (two === "//" && key !== "python") {
        var j = code.indexOf("\n", i);
        var end = j < 0 ? n : j;
        out += span("c", code.slice(i, end)); i = end; continue;
      }
      if (two === "/*") {
        var k = code.indexOf("*/", i + 2);
        var e2 = k < 0 ? n : k + 2;
        out += span("c", code.slice(i, e2)); i = e2; continue;
      }
      if (key === "python" && c === "#") {
        var j2 = code.indexOf("\n", i);
        var e3 = j2 < 0 ? n : j2;
        out += span("c", code.slice(i, e3)); i = e3; continue;
      }
      if (key === "bash" && c === "#" && code[i - 1] !== "$") {
        var j3 = code.indexOf("\n", i);
        var e4 = j3 < 0 ? n : j3;
        out += span("c", code.slice(i, e4)); i = e4; continue;
      }

      // Kotlin 三引号字符串
      if (code.substr(i, 3) === '"""') {
        var k4 = code.indexOf('"""', i + 3);
        var e5 = k4 < 0 ? n : k4 + 3;
        out += span("s", code.slice(i, e5)); i = e5; continue;
      }

      // 字符串
      if (c === '"' || c === "'" || c === "`") {
        var q = c, p = i + 1, closed = false;
        while (p < n) {
          if (code[p] === "\\") { p += 2; continue; }
          if (code[p] === q) { closed = true; p++; break; }
          if (code[p] === "\n" && q !== "`") { break; }
          p++;
        }
        out += span("s", code.slice(i, closed ? p : Math.min(p, n)));
        i = closed ? p : Math.min(p, n);
        continue;
      }

      // 数字
      if (/[0-9]/.test(c) && !isId(code[i - 1] || "")) {
        var m = /^(0[xX][0-9a-fA-F_]+|[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?[fFdDlL]?)/.exec(code.slice(i));
        if (m) { out += span("n", m[0]); i += m[0].length; continue; }
      }

      // 注解
      if (c === "@" && isIdStart(code[i + 1] || "")) {
        var p2 = i + 1;
        while (p2 < n && isId(code[p2])) { p2++; }
        out += span("a", code.slice(i, p2)); i = p2; continue;
      }

      // 标识符
      if (isIdStart(c)) {
        var p3 = i + 1;
        while (p3 < n && isId(code[p3])) { p3++; }
        var w = code.slice(i, p3);
        var cls = null;
        if (kw[w]) { cls = "k"; }
        else if (/^[A-Z][A-Za-z0-9_]*$/.test(w)) { cls = "t"; }
        else if (code[p3] === "(") { cls = "f"; }
        out += cls ? span(cls, w) : esc(w);
        i = p3;
        continue;
      }

      // 标点
      if ("{}()[];,.:<>+-*/%=!&|^~?".indexOf(c) >= 0) {
        out += '<span class="tk-p">' + esc(c) + "</span>"; i++; continue;
      }

      out += esc(c);
      i++;
    }
    return out;
  }

  /* ============================================================
     Markdown 渲染
     ============================================================ */
  var codeStore = [];

  function inline(text) {
    var codes = [];
    var s = String(text || "");
    // 先抽出行内代码，避免其中的符号被当成格式
    s = s.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      var ext = /^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + u + '"' + ext + ">" + t + "</a>";
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return "<code>" + esc(codes[Number(i)]) + "</code>";
    });
    return s;
  }

  function renderCode(lang, meta, code) {
    var t = (lang || "").toLowerCase();
    var isDiagram = t === "text" || t === "diagram" || t === "ascii";
    if (isDiagram) {
      var cap = /cap(?:tion)?="([^"]*)"/.exec(meta || "");
      return '<div class="b-diagram"><pre>' + esc(code) + "</pre>" +
        (cap ? '<div class="b-diagram-cap">' + esc(cap[1]) + "</div>" : "") + "</div>";
    }
    var file = /(?:title|file)="([^"]*)"/.exec(meta || "");
    var idx = codeStore.push(code) - 1;
    var label = LANG_LABEL[t] || (t ? t.toUpperCase() : "CODE");
    return '<div class="b-code">' +
      '<div class="b-code-head"><span class="b-lang">' + esc(label) + "</span>" +
      (file ? '<span class="b-file">' + esc(file[1]) + "</span>" : "") +
      '<button class="b-copy" type="button" data-idx="' + idx + '">复制</button></div>' +
      "<pre><code>" + highlight(code, t) + "</code></pre></div>";
  }

  function renderTable(rows) {
    function cells(row) {
      var r = row.trim().replace(/^\|/, "").replace(/\|$/, "");
      return r.split("|").map(function (x) { return x.trim(); });
    }
    var head = cells(rows[0]);
    var body = rows.slice(1).map(cells);
    var html = '<div class="b-table-wrap"><table><thead><tr>';
    head.forEach(function (h) { html += "<th>" + inline(h) + "</th>"; });
    html += "</tr></thead><tbody>";
    body.forEach(function (r) {
      html += "<tr>";
      for (var i = 0; i < head.length; i++) { html += "<td>" + inline(r[i] == null ? "" : r[i]) + "</td>"; }
      html += "</tr>";
    });
    return html + "</tbody></table></div>";
  }

  var CALLOUTS = {
    note: { cls: "note", title: "说明", icon: "i" },
    tip: { cls: "tip", title: "实践提示", icon: "✦" },
    warn: { cls: "warn", title: "注意", icon: "!" },
    warning: { cls: "warn", title: "注意", icon: "!" },
    key: { cls: "key", title: "关键结论", icon: "★" },
    important: { cls: "key", title: "关键结论", icon: "★" },
  };

  function quoteToHtml(lines) {
    var first = (lines[0] || "").trim();
    var m = /^\[!(NOTE|TIP|WARN|WARNING|KEY|IMPORTANT|IMPORTANT)\]\s*(.*)$/i.exec(first);
    if (m) {
      var cfg = CALLOUTS[m[1].toLowerCase()] || CALLOUTS.note;
      var title = m[2].trim() || cfg.title;
      var rest = lines.slice(1);
      return '<div class="b-callout b-callout--' + cfg.cls + '">' +
        '<div class="b-callout-body">' +
        '<div class="b-callout-title"><span class="b-callout-icon">' + cfg.icon + "</span>" + inline(title) + "</div>" +
        paragraphs(rest) + "</div></div>";
    }
    return "<blockquote>" + paragraphs(lines) + "</blockquote>";
  }

  function paragraphs(lines) {
    var chunks = [], cur = [];
    lines.forEach(function (l) {
      if (!l.trim()) { if (cur.length) { chunks.push(cur); cur = []; } return; }
      cur.push(l.trim());
    });
    if (cur.length) { chunks.push(cur); }
    return chunks.map(function (c) { return "<p>" + inline(c.join(" ")) + "</p>"; }).join("");
  }

  function buildList(items) {
    var pos = 0;
    function build(indent) {
      var ordered = items[pos].ordered;
      var html = ordered ? "<ol>" : "<ul>";
      while (pos < items.length) {
        var it = items[pos];
        if (it.indent < indent || it.indent > indent) { break; }
        html += "<li>" + inline(it.text);
        pos++;
        if (pos < items.length && items[pos].indent > indent) {
          html += build(items[pos].indent);
        }
        html += "</li>";
      }
      return html + (ordered ? "</ol>" : "</ul>");
    }
    var out = "";
    while (pos < items.length) {
      var before = pos;
      out += build(items[pos].indent);
      if (pos === before) { pos++; }
    }
    return out;
  }

  var SEC = 0;

  function renderMarkdown(md) {
    SEC = 0;
    var lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0;

    function isBlockStart(l) {
      return /^\s*```/.test(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) ||
        /^\s*([-*+]|\d+\.)\s+/.test(l) || /^\s*\|/.test(l) ||
        /^\s*(?:-\s*){3,}$/.test(l) || /^\s*(?:\*\s*){3,}$/.test(l) || /^\s*(?:_\s*){3,}$/.test(l);
    }

    while (i < lines.length) {
      var line = lines[i];

      if (!line.trim()) { i++; continue; }

      // 代码围栏
      if (/^\s*```/.test(line)) {
        var fm = /^\s*```\s*([A-Za-z0-9_+-]*)\s*(.*)$/.exec(line);
        var lang = (fm[1] || "").toLowerCase();
        var meta = (fm[2] || "").trim();
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push(renderCode(lang, meta, buf.join("\n")));
        continue;
      }

      // 分隔线
      if (/^\s*(?:-\s*){3,}$/.test(line) || /^\s*(?:\*\s*){3,}$/.test(line) || /^\s*(?:_\s*){3,}$/.test(line)) {
        out.push("<hr>"); i++; continue;
      }

      // 标题
      var hm = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (hm) {
        var lv = Math.max(2, Math.min(4, hm[1].length));
        var text = hm[2];
        var id = "sec-" + (SEC + 1);
        var numHtml = "";
        if (lv === 2) { SEC++; id = "sec-" + SEC; numHtml = '<span class="b-secnum">' + pad2(SEC) + "</span>"; }
        out.push("<h" + lv + ' id="' + id + '" class="b-h' + lv + '">' + numHtml + inline(text) +
          '<a class="b-anchor" href="#' + id + '" aria-label="锚点">#</a></h' + lv + ">");
        i++;
        continue;
      }

      // 表格
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].indexOf("-") >= 0) {
        var rows = [line];
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        out.push(renderTable(rows));
        continue;
      }

      // 引用 / 提示块
      if (/^\s*>/.test(line)) {
        var qlines = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          qlines.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        out.push(quoteToHtml(qlines));
        continue;
      }

      // 列表
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        var items = [];
        while (i < lines.length) {
          var lm = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (lm) {
            items.push({
              indent: lm[1].replace(/\t/g, "  ").length,
              ordered: /\d/.test(lm[2]),
              text: lm[3],
            });
            i++;
            continue;
          }
          if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length && !isBlockStart(lines[i])) {
            items[items.length - 1].text += " " + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        out.push(buildList(items));
        continue;
      }

      // 段落
      var para = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
        para.push(lines[i].trim());
        i++;
      }
      if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); }
    }
    return out.join("\n");
  }

  /* ============================================================
     列表页
     ============================================================ */
  function coverHtml(p, big) {
    return '<div class="b-cover' + (big ? "" : " b-cover-thumb") + '" style="--accent:' + accentOf(p) + '">' +
      '<span class="b-cover-series">' + (p.series ? "合集 · " + esc(p.series) : "单篇") + "</span>" +
      '<span class="b-cover-index">' + pad2(p.order || 0) + "</span>" +
      '<span class="b-cover-icon"><svg aria-hidden="true"><use href="' + iconOf(p) + '"></use></svg></span>' +
      "</div>";
  }

  function metaRow(p) {
    return '<div class="b-meta-row"><span>' + (p.reading || 1) + " 分钟阅读</span>" +
      (p.author ? '<span class="sep">·</span><span>' + esc(p.author) + "</span>" : "") + "</div>";
  }

  function featureHtml(p, chip) {
    return '<a class="b-feature" href="/blog/' + encodeURIComponent(p.slug) + '">' +
      '<div class="b-feature-info">' +
      '<span class="b-chip" style="--accent:' + accentOf(p) + '">' + esc(chip || "最新发布") + "</span>" +
      "<h3>" + esc(p.title) + "</h3>" +
      '<p class="b-excerpt">' + esc(p.excerpt) + "</p>" +
      metaRow(p) +
      '<span class="b-readmore">阅读全文 <i>→</i></span>' +
      "</div>" +
      coverHtml(p, true) +
      "</a>";
  }

  function cardHtml(p, isNew) {
    return '<a class="b-card" href="/blog/' + encodeURIComponent(p.slug) + '">' +
      coverHtml(p, false) +
      (isNew ? '<span class="b-card-new">最新</span>' : "") +
      '<div class="b-card-body">' +
      "<h3>" + esc(p.title) + "</h3>" +
      "<p>" + esc(p.excerpt) + "</p>" +
      '<div class="b-tags">' + (p.tags || []).slice(0, 3).map(function (t) { return '<span class="b-tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
      metaRow(p) +
      "</div></a>";
  }

  async function renderIndex() {
    var box = document.getElementById("viewList");
    box.hidden = false;
    var slot = document.getElementById("sectionsSlot");
    var posts = [];
    try {
      var res = await fetch("/api/blog").then(function (r) { return r.json(); });
      posts = res.posts || [];
    } catch (e) {
      slot.innerHTML = '<p style="color:#8a919c">文章加载失败，请稍后重试。</p>';
      return;
    }

    if (!posts.length) {
      slot.innerHTML = '<p style="color:#8a919c">暂无文章。</p>';
      return;
    }

    // 按合集分组：series 为合集名；没有 series 的文章归到「单篇」
    var groupMap = {}, groups = [];
    posts.forEach(function (p) {
      var name = p.series || "单篇";
      if (!groupMap[name]) {
        groupMap[name] = { name: name, posts: [] };
        groups.push(groupMap[name]);
      }
      groupMap[name].posts.push(p);
    });
    groups.forEach(function (g) {
      // 新文章排在前面
      g.posts.sort(function (a, b) { return (b.order || 0) - (a.order || 0); });
      g.newest = g.posts[0].order || 0;
    });
    groups.sort(function (a, b) { return b.newest - a.newest; });

    var newestSlug = posts[posts.length - 1].slug;
    var totalMin = posts.reduce(function (s, p) { return s + (p.reading || 0); }, 0);
    document.getElementById("heroStats").innerHTML =
      '<div class="b-stat"><b>' + posts.length + "</b><span>篇文章</span></div>" +
      '<div class="b-stat"><b>' + totalMin + "</b><span>分钟阅读量</span></div>" +
      '<div class="b-stat"><b>' + groups.length + "</b><span>个合集</span></div>";

    slot.innerHTML = groups.map(function (g) {
      var n = g.posts.length;
      var body;
      if (n === 1) {
        // 只有一篇的合集用横向大卡，避免单卡栅格留白
        body = featureHtml(g.posts[0], g.posts[0].slug === newestSlug ? "最新发布" : "深度长文");
      } else {
        var gridCls = "b-grid" + (n === 2 ? " b-grid--two" : "");
        body = '<div class="' + gridCls + '">' +
          g.posts.map(function (p) { return cardHtml(p, p.slug === newestSlug); }).join("") +
          "</div>";
      }
      return '<section class="b-collection">' +
        '<div class="b-section-head">' +
        '<h2>合集 · ' + esc(g.name) + "</h2>" +
        '<span class="more">' + n + " 篇</span>" +
        "</div>" +
        body + "</section>";
    }).join("");
  }

  /* ============================================================
     文章页
     ============================================================ */
  function buildToc(content) {
    var heads = Array.prototype.slice.call(content.querySelectorAll("h2, h3"));
    var nav = document.getElementById("tocNav");
    if (!heads.length) { document.getElementById("toc").style.display = "none"; return heads; }

    function info(h) {
      var clone = h.cloneNode(true);
      var numEl = clone.querySelector(".b-secnum");
      var num = numEl ? numEl.textContent : "";
      if (numEl) { numEl.parentNode.removeChild(numEl); }
      var anchor = clone.querySelector(".b-anchor");
      if (anchor) { anchor.parentNode.removeChild(anchor); }
      return { num: num, label: clone.textContent.trim() };
    }

    nav.innerHTML = heads.map(function (h) {
      var meta = info(h);
      var lv = h.tagName === "H3" ? "lv3" : "";
      return '<a href="#' + h.id + '" class="' + lv + '">' +
        (meta.num ? '<span class="num">' + esc(meta.num) + "</span>" : "") + esc(meta.label) + "</a>";
    }).join("");

    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        document.getElementById("toc").classList.remove("open");
      }
    });
    return heads;
  }

  function setupTocToggle() {
    var toc = document.getElementById("toc");
    var btn = document.getElementById("tocToggle");
    if (!btn) { return; }
    btn.addEventListener("click", function () {
      toc.classList.toggle("open");
      btn.classList.toggle("open", toc.classList.contains("open"));
    });
  }

  function setupReading(heads) {
    var bar = document.getElementById("progressBar");
    var backTop = document.getElementById("backTop");
    var links = Array.prototype.slice.call(document.querySelectorAll(".b-toc-nav a"));
    var ticking = false;

    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      bar.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
      backTop.classList.toggle("show", window.scrollY > 600);

      var y = window.scrollY + 140;
      var active = heads[0];
      heads.forEach(function (h) {
        if (h.getBoundingClientRect().top + window.scrollY <= y) { active = h; }
      });
      links.forEach(function (a) {
        a.classList.toggle("active", active && a.getAttribute("href") === "#" + active.id);
      });
    }

    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener("resize", update);
    backTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    update();
  }

  function setupCopy() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".b-copy") : null;
      if (!btn) { return; }
      var text = codeStore[Number(btn.getAttribute("data-idx"))] || "";
      var done = function () {
        btn.textContent = "已复制";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = "复制"; btn.classList.remove("done"); }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); });
      } else { fallback(); }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-100px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (err) { /* 忽略 */ }
        document.body.removeChild(ta);
      }
    });
  }

  function setupLinks(content) {
    Array.prototype.forEach.call(content.querySelectorAll("a"), function (a) {
      var href = a.getAttribute("href") || "";
      if (/^https?:/i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    });
  }

  async function renderPost(slug) {
    document.getElementById("viewPost").hidden = false;
    document.body.classList.add("b-reading");

    var data, list = [];
    try {
      var both = await Promise.all([
        fetch("/api/blog/" + encodeURIComponent(slug)).then(function (r) {
          if (!r.ok) { throw new Error("404"); }
          return r.json();
        }),
        fetch("/api/blog").then(function (r) { return r.json(); }).catch(function () { return { posts: [] }; }),
      ]);
      data = both[0];
      list = (both[1] && both[1].posts) || [];
    } catch (e) {
      document.getElementById("viewPost").hidden = true;
      var fail = document.getElementById("viewNotFound");
      fail.hidden = false;
      return;
    }

    var p = data;
    document.title = p.title + " · Primordial Soup";

    var hero = document.querySelector(".b-post-hero");
    hero.style.setProperty("--accent", accentOf(p));
    document.getElementById("postIcon").innerHTML = '<svg aria-hidden="true"><use href="' + iconOf(p) + '"></use></svg>';

    document.getElementById("postTitle").textContent = p.title;
    var sub = document.getElementById("postSub");
    if (p.subtitle) { sub.textContent = p.subtitle; } else { sub.style.display = "none"; }

    var seriesNo = p.order || "";
    document.getElementById("postSeries").textContent =
      (p.series || "技术博客") + (seriesNo ? " · 第 " + seriesNo + " 篇" : "");

    document.getElementById("postMeta").innerHTML =
      '<span class="b-author"><span class="b-avatar">' + esc((p.author || "邵")[0]) + "</span>" + esc(p.author || "匿名") + "</span>" +
      '<span class="sep">|</span><span>约 ' + (p.reading || 1) + " 分钟</span>";

    document.getElementById("postTags").innerHTML = (p.tags || []).map(function (t) {
      return '<span class="b-tag">' + esc(t) + "</span>";
    }).join("");

    var content = document.getElementById("postBody");
    content.innerHTML = renderMarkdown(p.content);
    setupLinks(content);

    var heads = buildToc(content);
    setupTocToggle();
    setupReading(heads);
    setupCopy();

    // 分享链接里的锚点：内容渲染完成后再跳转
    if (location.hash.length > 1) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        window.requestAnimationFrame(function () { target.scrollIntoView(); });
      }
    }

    // 上一篇 / 下一篇：只在同一合集内前后跳转
    var siblings = list.filter(function (x) { return (x.series || "") === (p.series || ""); });
    var idx = siblings.findIndex(function (x) { return x.slug === p.slug; });
    var prev = idx > 0 ? siblings[idx - 1] : null;
    var next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    var foot = document.getElementById("postFoot");
    foot.innerHTML =
      '<div class="b-sign">本文属于「' + esc(p.series || "技术博客") + "」合集，由 " + esc(p.author || "邵天宇") +
      " 撰写。</div>" +
      '<div class="b-nextprev' + (prev && next ? "" : " b-nextprev--single") + '">' +
      (prev
        ? '<a class="b-np" href="/blog/' + encodeURIComponent(prev.slug) + '"><span>← 上一篇</span><b>' + esc(prev.title) + "</b></a>"
        : "") +
      (next
        ? '<a class="b-np next" href="/blog/' + encodeURIComponent(next.slug) + '"><span>下一篇 →</span><b>' + esc(next.title) + "</b></a>"
        : "") +
      "</div>";
  }

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    var path = location.pathname.replace(/\/+$/, "");
    var m = /^\/blog\/([^/]+)$/.exec(path);
    if (m) {
      renderPost(decodeURIComponent(m[1]));
    } else {
      renderIndex();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
