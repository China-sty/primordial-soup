// 极简 Markdown 渲染器（支持标题/粗体/斜体/代码/链接/列表/引用/代码块）
function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false, code = [];
  let list = [], listType = null;

  function flushList() {
    if (list.length) {
      out.push((listType === 'ol' ? '<ol>' : '<ul>') + list.join('') + (listType === 'ol' ? '</ol>' : '</ul>'));
      list = []; listType = null;
    }
  }
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(text) {
    text = escapeHtml(text);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        code = []; inCode = false;
      } else { flushList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if (line.trim() === '') { flushList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { flushList(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }

    const bq = line.match(/^>\s?(.*)/);
    if (bq) { flushList(); out.push(`<blockquote>${inline(bq[1])}</blockquote>`); continue; }

    const ul = line.match(/^\s*[-*+]\s+(.*)/);
    if (ul) { if (listType !== 'ul') { flushList(); listType = 'ul'; } list.push(`<li>${inline(ul[1])}</li>`); continue; }

    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (ol) { if (listType !== 'ol') { flushList(); listType = 'ol'; } list.push(`<li>${inline(ol[1])}</li>`); continue; }

    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  if (inCode) out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
  return out.join('\n');
}
