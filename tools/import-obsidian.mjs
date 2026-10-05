// Obsidian 볼트의 블로그 폴더에서 draft가 체크되지 않은 글을 posts/로 가져오고,
// 가져온 노트는 draft: true로 바꿔 "업로드 완료"를 표시한다.
//
// 사용법 (my-blog 폴더에서):
//   node tools/import-obsidian.mjs            가져오기
//   node tools/import-obsidian.mjs --dry-run  무엇을 할지 보여주기만 함
//   --vault <경로>  --blog <경로>               기본 경로 바꾸기

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const DRY_RUN = args.includes('--dry-run');
const VAULT = option('--vault', join(homedir(), 'Documents', 'Obsidian Vault'));
const BLOG = option('--blog', resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const SOURCE_DIR = join(VAULT, '40_Blog');
const POSTS_DIR = join(BLOG, 'posts');
const INDEX_PATH = join(POSTS_DIR, 'index.json');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Obsidian 프론트매터 (간단한 YAML: 한 줄 값과 `- 항목` 목록만) ----------

function splitFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { raw: '', data: {}, body: text };
  return { raw: match[0], data: parseYamlLite(match[1]), body: text.slice(match[0].length) };
}

function unquote(value) {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function parseYamlLite(yaml) {
  const data = {};
  let listKey = null;
  for (const line of yaml.split(/\r?\n/)) {
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && listKey) {
      const value = unquote(item[1].trim());
      if (value) data[listKey].push(value);
      continue;
    }
    const kv = line.match(/^([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!kv) continue;
    const [, key, value] = kv;
    listKey = null;
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else if (/^\[.*\]$/.test(value)) {
      data[key] = value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return data;
}

function asText(value) {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '').trim();
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

// ---------- 본문 변환: Obsidian 전용 문법을 블로그가 지원하는 마크다운으로 ----------

function convertBody(body, title, warnings) {
  let text = body.replace(/\r\n?/g, '\n');

  // 본문 첫 `# 제목`은 블로그가 제목을 따로 보여주므로 뺀다
  text = text.replace(/^\s*#\s+(.+)\n/, (whole, heading) => (heading.trim() === title ? '' : whole));

  // 주석
  text = text.replace(/%%[\s\S]*?%%/g, '');

  // 임베드(![[...]])는 블로그에서 보여줄 수 없다
  text = text.replace(/!\[\[([^\]]+)\]\]/g, (_, target) => {
    warnings.push(`임베드 제거: ![[${target}]] (이미지는 posts/images/에 넣고 ![설명](posts/images/파일) 형식으로 써 주세요)`);
    return '';
  });

  // 위키링크는 블로그에 해당 페이지가 없으므로 글자만 남긴다
  text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target);

  // 콜아웃 머리줄: > [!note] 제목 → > **제목**
  text = text.replace(/^(>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_, prefix, type, label) => `${prefix}**${label || type}**`);

  // 하이라이트는 굵게로
  text = text.replace(/==([^=\n]+)==/g, '**$1**');

  return `${text.trim()}\n`;
}

// ---------- 볼트 노트에 draft: true 표시 ----------

function markUploaded(text) {
  const { raw } = splitFrontmatter(text);
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  if (!raw) return `---${newline}draft: true${newline}---${newline}${text}`;

  let updated;
  if (/^draft\s*:.*$/m.test(raw)) {
    updated = raw.replace(/^draft\s*:.*$/m, 'draft: true');
  } else {
    updated = raw.replace(/\r?\n---[ \t]*(\r?\n|$)/, `${newline}draft: true${newline}---$1`);
  }
  return updated + text.slice(raw.length);
}

// ---------- 실행 ----------

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`블로그 폴더가 없습니다: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const notes = readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .sort();

  const result = { added: [], updated: [], skipped: [], failed: [] };

  for (const name of notes) {
    const notePath = join(SOURCE_DIR, name);
    const original = readFileSync(notePath, 'utf8');
    const { data, body } = splitFrontmatter(original);

    if (asText(data.draft).toLowerCase() === 'true') {
      result.skipped.push(name);
      continue;
    }

    const headingMatch = body.match(/^\s*#\s+(.+)$/m);
    const title = asText(data.title) || (headingMatch ? headingMatch[1].trim() : basename(name, '.md'));
    const slug = asText(data.slug);
    const date = DATE_RE.test(asText(data.date)) ? asText(data.date) : today();

    if (!SLUG_RE.test(slug)) {
      result.failed.push(`${name}: slug가 비어 있거나 형식이 틀립니다 (영문 소문자, 숫자, 하이픈만. 예: my-first-post)`);
      continue;
    }

    const warnings = [];
    const tags = asList(data.blog_tags);
    const description = asText(data.description);
    const post = [
      '---',
      `title: ${title}`,
      `date: ${date}`,
      description ? `description: ${description}` : null,
      tags.length ? `tags: ${tags.join(', ')}` : null,
      '---',
      '',
      convertBody(body, title, warnings),
    ].filter((line) => line !== null).join('\n');

    const fileName = `${date}-${slug}.md`;
    const isUpdate = existsSync(join(POSTS_DIR, fileName));
    const label = `${name} → posts/${fileName}${warnings.length ? `\n      ⚠ ${warnings.join('\n      ⚠ ')}` : ''}`;

    if (!DRY_RUN) {
      writeFileSync(join(POSTS_DIR, fileName), post, 'utf8');
      if (!index.includes(fileName)) index.push(fileName);
      writeFileSync(notePath, markUploaded(original), 'utf8');
    }
    (isUpdate ? result.updated : result.added).push(label);
  }

  if (!DRY_RUN && (result.added.length || result.updated.length)) {
    writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }

  const section = (heading, items) => {
    if (items.length) console.log(`${heading} (${items.length})\n${items.map((i) => `  - ${i}`).join('\n')}`);
  };
  console.log(DRY_RUN ? '[미리보기: 아무것도 바꾸지 않았습니다]' : '[가져오기 완료]');
  section('새로 올림', result.added);
  section('다시 올림(기존 글 덮어씀)', result.updated);
  section('이미 올린 글(draft 체크됨)', result.skipped);
  section('건너뜀(수정 필요)', result.failed);
  if (!notes.length) console.log(`가져올 노트가 없습니다: ${SOURCE_DIR}`);
}

main();
