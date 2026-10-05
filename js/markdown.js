// 지원 범위는 CLAUDE.md의 "마크다운 변환기" 항목을 따른다.
// 입력 전체를 먼저 이스케이프하므로 원문 HTML은 그대로 글자로 보인다.

const FENCE_RE = /^ {0,3}```\s*([\w+#.-]*)\s*$/;
const FENCE_END_RE = /^ {0,3}```\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^ {0,3}&gt;\s?/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const BLANK_RE = /^\s*$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_SCHEME_RE = /^(?:https?|mailto):/i;
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;
const HAS_PLACEHOLDER_RE = /\u0000\d+\u0000/;
// 주소 안의 괄호는 한 겹까지 허용한다 (예: 위키백과의 `Mercury_(planet)`)
const URL_PATTERN = String.raw`((?:[^()\s]|\([^()\s]*\))+)`;
const TITLE_PATTERN = String.raw`(?:\s+&quot;(.*?)&quot;)?`;

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseMarkdown(text) {
  const source = String(text).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  const lines = escapeHtml(source).split('\n');
  return parseBlocks(lines, new Map()).join('\n');
}

// URL은 이미 이스케이프된 상태로 들어온다. 허용하지 않는 스킴이면 null.
function safeUrl(url) {
  const cleaned = url.replace(/[\u0000- \u007f]/g, '');
  if (SCHEME_RE.test(cleaned) && !ALLOWED_SCHEME_RE.test(cleaned)) return null;
  return cleaned;
}

function slugify(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/gi, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function isBlockStart(line) {
  return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) ||
    QUOTE_RE.test(line) || LIST_RE.test(line);
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) &&
    lines[i + 1].includes('-');
}

function parseBlocks(lines, slugCounts) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (BLANK_RE.test(line)) {
      i++;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !FENCE_END_RE.test(lines[i])) code.push(lines[i++]);
      i++; // 닫는 펜스
      const lang = fence[1] ? ` class="language-${fence[1]}"` : '';
      out.push(`<pre><code${lang}>${code.join('\n')}</code></pre>`);
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      const base = slugify(content) || 'section';
      const count = slugCounts.get(base) || 0;
      slugCounts.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      out.push(`<h${level} id="${id}">${content}</h${level}>`);
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      i = parseTable(lines, i, out);
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        inner.push(lines[i].replace(QUOTE_RE, ''));
        i++;
      }
      out.push(`<blockquote>\n${parseBlocks(inner, slugCounts).join('\n')}\n</blockquote>`);
      continue;
    }

    if (LIST_RE.test(line)) {
      i = parseList(lines, i, out);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && !BLANK_RE.test(lines[i]) && !isBlockStart(lines[i]) &&
      !isTableStart(lines, i)) {
      paragraph.push(lines[i++]);
    }
    // 줄 끝 공백 두 칸은 줄바꿈으로 처리한다
    const content = paragraph
      .map((l, idx) => (idx < paragraph.length - 1 && / {2,}$/.test(l) ? `${l.trim()}<br>` : l.trim()))
      .join('\n');
    out.push(`<p>${renderInline(content)}</p>`);
  }

  return out;
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function parseTable(lines, i, out) {
  const headers = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });
  i += 2;

  const alignAttr = (col) => (aligns[col] ? ` style="text-align: ${aligns[col]}"` : '');
  const head = headers.map((cell, col) => `<th${alignAttr(col)}>${renderInline(cell)}</th>`).join('');
  const rows = [];
  while (i < lines.length && !BLANK_RE.test(lines[i]) && lines[i].includes('|')) {
    const cells = splitRow(lines[i]);
    const tds = headers.map((_, col) => `<td${alignAttr(col)}>${renderInline(cells[col] || '')}</td>`);
    rows.push(`<tr>${tds.join('')}</tr>`);
    i++;
  }

  out.push(
    '<div class="table-wrap"><table>' +
    `<thead><tr>${head}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody>` +
    '</table></div>'
  );
  return i;
}

function parseList(lines, i, out) {
  const first = lines[i].match(LIST_RE);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];

  while (i < lines.length) {
    const line = lines[i];

    if (BLANK_RE.test(line)) {
      // 빈 줄 다음에 같은 목록이 이어지면 계속한다
      const next = lines[i + 1];
      const nextItem = next !== undefined && next.match(LIST_RE);
      if (nextItem && nextItem[1].length >= baseIndent && /\d/.test(nextItem[2]) === ordered) {
        i++;
        continue;
      }
      break;
    }

    const item = line.match(LIST_RE);
    if (item && item[1].length <= baseIndent) {
      if (/\d/.test(item[2]) !== ordered) break;
      items.push({ text: item[3], children: [] });
      i++;
      continue;
    }

    if (!items.length) break;
    const current = items[items.length - 1];

    if (item) {
      current.children.push(line);
      i++;
      continue;
    }

    if (isBlockStart(line)) break;

    // 이어지는 줄: 하위 목록이 있으면 그 마지막 항목에, 없으면 현재 항목에 붙인다
    if (current.children.length) {
      current.children[current.children.length - 1] += ` ${line.trim()}`;
    } else {
      current.text += ` ${line.trim()}`;
    }
    i++;
  }

  const lis = items.map(({ text, children }) => {
    let nested = '';
    if (children.length) {
      const indent = Math.min(...children.map((l) => l.match(/^\s*/)[0].length));
      const subOut = [];
      parseList(children.map((l) => l.slice(indent)), 0, subOut);
      nested = `\n${subOut.join('\n')}\n`;
    }
    return `<li>${renderInline(text)}${nested}</li>`;
  });

  const tag = ordered ? 'ol' : 'ul';
  const start = ordered ? parseInt(first[2], 10) : 1;
  const startAttr = start !== 1 ? ` start="${start}"` : '';
  out.push(`<${tag}${startAttr}>\n${lis.join('\n')}\n</${tag}>`);
  return i;
}

function renderInline(text) {
  const stash = [];
  const hold = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  // 코드 안의 내용은 다른 인라인 변환에서 제외한다
  let result = text.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${code}</code>`));

  result = result.replace(
    new RegExp(`!\\[([^\\]]*)\\]\\(${URL_PATTERN}${TITLE_PATTERN}\\)`, 'g'),
    (whole, alt, url, title) => {
      const src = safeUrl(url);
      if (!src) return alt;
      const titleAttr = title ? ` title="${title}"` : '';
      return hold(`<img src="${src}" alt="${alt}"${titleAttr} loading="lazy">`);
    }
  );

  result = result.replace(
    new RegExp(`\\[([^\\]]+)\\]\\(${URL_PATTERN}${TITLE_PATTERN}\\)`, 'g'),
    (whole, label, url, title) => {
      const href = safeUrl(url);
      const content = renderEmphasis(label);
      if (!href) return content;
      const titleAttr = title ? ` title="${title}"` : '';
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return hold(`<a href="${href}"${titleAttr}${external}>${content}</a>`);
    }
  );

  result = renderEmphasis(result);

  // 링크 안에 이미지가 있는 경우처럼 중첩된 자리 표시자까지 모두 되돌린다
  while (HAS_PLACEHOLDER_RE.test(result)) {
    result = result.replace(PLACEHOLDER_RE, (_, index) => stash[Number(index)]);
  }
  return result;
}

function renderEmphasis(text) {
  return text
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>');
}
