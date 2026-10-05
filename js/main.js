import { parseMarkdown } from './markdown.js';
import { buildPost, formatDate, isValidFileName } from './frontmatter.js';
import { initTheme } from './theme.js';

const SITE_TITLE = '투자 동호회';
const SITE_DESCRIPTION = '새로운 사고를 갖고 투자 접근을 하여 우리 모두 부자됩시다. ㅎㅎㅎ';

const app = document.getElementById('app');
let postsPromise = null;
let isFirstRender = true;

// ---------- 데이터 ----------

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
}

async function loadPosts() {
  const files = JSON.parse(await fetchText('posts/index.json'));
  const posts = await Promise.all(files.map(async (fileName, order) => {
    if (!isValidFileName(fileName)) {
      console.warn(`잘못된 파일명이라 건너뜀: ${fileName}`);
      return null;
    }
    try {
      return { ...buildPost(fileName, await fetchText(`posts/${fileName}`)), order };
    } catch (error) {
      console.warn(`글을 불러오지 못함: ${fileName}`, error);
      return null;
    }
  }));

  // 같은 날짜면 index.json에서 나중에 추가한 글이 위로 온다
  return posts
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
}

function getPosts() {
  postsPromise ??= loadPosts();
  return postsPromise;
}

// ---------- DOM 도우미 ----------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

function postHref(slug) {
  return `#/post/${encodeURIComponent(slug)}`;
}

function tagHref(tag) {
  return `#/tag/${encodeURIComponent(tag)}`;
}

function dateNode(date) {
  return date ? el('time', { datetime: date, text: formatDate(date) }) : null;
}

function tagList(tags) {
  if (!tags.length) return null;
  return el('ul', { className: 'tag-list', 'aria-label': '태그' },
    tags.map((tag) => el('li', {}, el('a', { className: 'tag', href: tagHref(tag), text: `#${tag}` }))));
}

function postCard(post) {
  return el('li', { className: 'post-card' }, el('article', {}, [
    el('h2', { className: 'post-card-title' }, el('a', { href: postHref(post.slug), text: post.title })),
    el('div', { className: 'post-meta' }, dateNode(post.date)),
    post.description ? el('p', { className: 'post-card-desc', text: post.description }) : null,
    tagList(post.tags),
  ]));
}

function postList(posts) {
  if (!posts.length) return el('p', { className: 'status', text: '아직 글이 없습니다.' });
  return el('ol', { className: 'post-list' }, posts.map(postCard));
}

function setMeta(title, description) {
  document.title = title ? `${title} | ${SITE_TITLE}` : SITE_TITLE;
  document.querySelector('meta[name="description"]')
    ?.setAttribute('content', description || SITE_DESCRIPTION);
}

// ---------- 화면 ----------

function renderHome(posts) {
  setMeta('', SITE_DESCRIPTION);
  return [
    el('section', { className: 'intro' }, [
      el('h1', { className: 'page-title', text: SITE_TITLE }),
      el('p', { className: 'intro-text', text: SITE_DESCRIPTION }),
    ]),
    el('h2', { className: 'section-label', text: `전체 글 ${posts.length}` }),
    postList(posts),
  ];
}

function renderTag(posts, tag) {
  const tagged = posts.filter((post) => post.tags.includes(tag));
  setMeta(`#${tag}`, `${tag} 태그가 붙은 글 목록`);
  return [
    el('nav', { className: 'back-nav' }, el('a', { href: '#/', text: '← 전체 글' })),
    el('h1', { className: 'page-title', text: `#${tag}` }),
    el('p', { className: 'section-label', text: `글 ${tagged.length}개` }),
    postList(tagged),
  ];
}

function renderPost(posts, slug) {
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return renderNotFound();

  const post = posts[index];
  setMeta(post.title, post.description);

  const body = el('div', { className: 'prose' });
  body.innerHTML = parseMarkdown(post.body);

  // 목록이 최신순이므로 index - 1이 더 최근 글이다
  const newer = posts[index - 1];
  const older = posts[index + 1];
  const pager = el('nav', { className: 'post-pager', 'aria-label': '이전 글과 다음 글' }, [
    older ? el('a', { className: 'pager-link pager-prev', href: postHref(older.slug) }, [
      el('span', { className: 'pager-label', text: '이전 글' }),
      el('span', { className: 'pager-title', text: older.title }),
    ]) : null,
    newer ? el('a', { className: 'pager-link pager-next', href: postHref(newer.slug) }, [
      el('span', { className: 'pager-label', text: '다음 글' }),
      el('span', { className: 'pager-title', text: newer.title }),
    ]) : null,
  ]);

  return [
    el('article', { className: 'post' }, [
      el('header', { className: 'post-header' }, [
        el('h1', { className: 'post-title', text: post.title }),
        el('div', { className: 'post-meta' }, dateNode(post.date)),
        tagList(post.tags),
      ]),
      body,
    ]),
    pager,
    el('nav', { className: 'back-nav back-nav-bottom' }, el('a', { href: '#/', text: '← 전체 글 보기' })),
  ];
}

function renderNotFound() {
  setMeta('글을 찾을 수 없습니다', '');
  return el('section', { className: 'message' }, [
    el('h1', { className: 'page-title', text: '글을 찾을 수 없습니다' }),
    el('p', { text: '주소가 바뀌었거나 삭제된 글일 수 있습니다.' }),
    el('p', {}, el('a', { href: '#/', text: '← 전체 글로 돌아가기' })),
  ]);
}

function renderError(error) {
  console.error(error);
  setMeta('불러오기 실패', '');
  const isFileProtocol = location.protocol === 'file:';
  return el('section', { className: 'message' }, [
    el('h1', { className: 'page-title', text: '글을 불러오지 못했습니다' }),
    el('p', {
      text: isFileProtocol
        ? '파일을 직접 열면 글을 읽을 수 없습니다. 프로젝트 폴더에서 로컬 서버를 실행한 뒤 http://localhost:8000 으로 접속하세요.'
        : '잠시 후 다시 시도해 주세요.',
    }),
    isFileProtocol ? el('pre', {}, el('code', { text: 'python -m http.server 8000' })) : null,
  ]);
}

// ---------- 라우팅 ----------

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseRoute(hash) {
  if (!hash || hash === '#' || hash === '#/') return { name: 'home' };
  const match = hash.match(/^#\/(post|tag)\/(.+)$/);
  if (match) return { name: match[1], param: safeDecode(match[2]) };
  return { name: 'notFound' };
}

async function render() {
  const route = parseRoute(location.hash);
  let view;
  try {
    const posts = await getPosts();
    if (route.name === 'home') view = renderHome(posts);
    else if (route.name === 'post') view = renderPost(posts, route.param);
    else if (route.name === 'tag') view = renderTag(posts, route.param);
    else view = renderNotFound();
  } catch (error) {
    postsPromise = null; // 다음 이동 때 다시 시도
    view = renderError(error);
  }

  app.replaceChildren(...[].concat(view));
  window.scrollTo(0, 0);

  // 화면이 바뀌었음을 스크린 리더에 알리기 위해 첫 로드가 아니면 제목으로 포커스를 옮긴다
  if (!isFirstRender) {
    const heading = app.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
  isFirstRender = false;
}

// `#제목`, `#app` 같은 문서 내 링크는 해시 라우팅과 충돌하므로 주소를 바꾸지 않고 스크롤만 한다
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href.startsWith('#/')) return;

  event.preventDefault();
  const target = document.getElementById(safeDecode(href.slice(1)));
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
});

window.addEventListener('hashchange', render);
initTheme();
render();
