const FILE_NAME_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 맨 위 `---`로 감싼 `키: 값` 줄만 읽는다. YAML 전체 문법은 지원하지 않는다.
export function parseFrontmatter(text) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) return { data: {}, body: normalized };

  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!kv) continue;
    let value = kv[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    data[kv[1].toLowerCase()] = value;
  }
  return { data, body: normalized.slice(match[0].length) };
}

export function isValidFileName(fileName) {
  return /^[a-z0-9-]+\.md$/.test(fileName);
}

export function buildPost(fileName, text) {
  const { data, body } = parseFrontmatter(text);
  const slug = fileName.replace(/\.md$/, '');
  const fileMatch = fileName.match(FILE_NAME_RE);

  const date = DATE_RE.test(data.date || '') ? data.date : (fileMatch ? fileMatch[1] : '');
  const fallbackTitle = (fileMatch ? fileMatch[2] : slug).replace(/-/g, ' ');
  const tags = (data.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    slug,
    title: data.title || fallbackTitle,
    date,
    description: data.description || '',
    tags,
    body,
  };
}

export function formatDate(date) {
  const match = (date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}
