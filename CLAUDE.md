# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 따라야 할 지침입니다.

## 프로젝트 개요

마크다운(`.md`) 파일로 작성한 글을 읽어서 블로그 웹사이트로 보여주는 프로젝트입니다.

- **프레임워크 없음**: 순수 HTML, CSS, JavaScript(ES 모듈)만 사용합니다.
- **빌드 단계 없음**: 번들러, 트랜스파일러, `npm install`이 필요 없어야 합니다.
- **외부 의존성 없음**: 마크다운 파서도 직접 구현합니다. 라이브러리를 추가해야 할 것 같으면 먼저 사용자에게 물어보세요.
- 디자인 목표: 깔끔하고 읽기 좋게, 다크 모드 지원, 모바일 대응.

## 디렉터리 구조

```
my-blog/
├── index.html          # 단일 진입점 (글 목록 + 글 상세를 해시 라우팅으로 전환)
├── css/
│   └── style.css       # 모든 스타일 (CSS 변수로 테마 관리)
├── js/
│   ├── main.js         # 앱 시작, 라우팅, 화면 렌더링
│   ├── markdown.js     # 마크다운 → HTML 변환기
│   ├── frontmatter.js  # 글 상단 메타데이터 파싱
│   └── theme.js        # 다크/라이트 모드 전환
├── posts/
│   ├── index.json      # 글 목록 (파일명 배열)
│   └── *.md            # 블로그 글
└── tools/
    └── import-obsidian.mjs  # Obsidian 볼트에서 글 가져오기 (Node, 사이트 실행과는 무관)
```

새 파일을 만들 때는 이 구조를 따르고, 구조를 바꿔야 하면 이 문서도 함께 갱신하세요.

## 실행 방법

브라우저는 `file://`에서 `fetch()`로 로컬 파일을 읽을 수 없으므로 반드시 로컬 서버로 엽니다.

```bash
python -m http.server 8000
```

그다음 `http://localhost:8000`을 엽니다. (Node가 있다면 `npx serve`도 가능)

## 글 작성 규칙

### 파일

- 위치: `posts/` 폴더
- 파일명: `YYYY-MM-DD-slug.md` (예: `2026-10-05-hello-world.md`). 영문 소문자, 숫자, 하이픈만 사용합니다.
- 새 글을 추가하면 `posts/index.json`에 파일명을 추가해야 목록에 나타납니다.
- 글의 slug는 파일명에서 `.md`를 뺀 것입니다(예: `#/post/2026-10-05-hello-world`).
- 이미지는 `posts/images/`에 두고, 사이트 최상위 기준 경로로 씁니다: `![설명](posts/images/chart.png)`
- 글 안의 `#제목` 링크는 주소를 바꾸지 않고 해당 위치로 스크롤만 합니다(해시 라우팅과 충돌 방지).

```json
["2026-10-05-hello-world.md"]
```

### 프론트매터

모든 글은 맨 위에 `---`로 감싼 메타데이터를 둡니다. 값은 단순 `키: 값` 형식만 지원합니다(YAML 전체 문법을 구현하지 않음).

```markdown
---
title: 첫 번째 글
date: 2026-10-05
description: 목록과 meta 태그에 쓰이는 한 줄 요약
tags: 일상, 개발
---

본문은 여기부터...
```

- `title`, `date`는 필수. 없으면 파일명에서 추론합니다.
- `tags`는 쉼표로 구분합니다.
- 목록은 `date` 기준 최신순으로 정렬합니다. 날짜가 같으면 `index.json`에서 나중에 추가한 글이 위로 옵니다. 그래서 새 글은 항상 배열 **끝에** 추가합니다.

## Obsidian에서 글 가져오기 (`tools/import-obsidian.mjs`)

- 원본: `C:\Users\UserK\Documents\Obsidian Vault\40_Blog\` (템플릿: 볼트의 `90_Templates/블로그 글.md`)
- `draft`는 **"업로드 완료" 표시**입니다(일반적인 "초안" 의미가 아님). 체크가 꺼진(`draft: false` 또는 없음) 노트만 가져오고, 가져온 뒤 볼트 노트를 `draft: true`로 바꿉니다.
- 실행: `node tools/import-obsidian.mjs` (`--dry-run`으로 미리보기)
- 노트 속성 → 블로그: `slug`(필수) + `date` → 파일명, 첫 `# 제목` → `title`, `description` → `description`, `blog_tags` 목록 → `tags`
- 이미 같은 파일명이 있으면 덮어쓰고 `index.json`에는 중복 추가하지 않습니다(고친 글 다시 올리기).
- 위키링크는 글자만 남기고, 임베드와 `%%주석%%`은 지우며, 콜아웃과 `==하이라이트==`는 지원 문법으로 바꿉니다.
- 볼트 노트는 `draft` 줄만 바꾸고 나머지는 그대로 둡니다. `_`로 시작하는 노트는 무시합니다.

## 마크다운 변환기 (`js/markdown.js`)

지원 범위를 아래로 한정합니다. 범위를 넓힐 때는 이 목록을 갱신하세요.

- 블록: 제목(`#`~`######`), 문단, 순서/비순서 목록(한 단계 중첩), 인용(`>`), 코드 블록(```` ``` ````, 언어 표시는 `class="language-xxx"`로만 출력), 수평선(`---`), 표(GFM 파이프 형식)
- 인라인: 굵게, 기울임, 인라인 코드, 링크, 이미지, 취소선, 줄 끝 공백 두 칸 줄바꿈. 링크 주소 안의 괄호는 한 겹까지 허용합니다.
- 구현 원칙:
  - 줄 단위로 블록을 먼저 나누고, 그 다음 인라인을 처리합니다.
  - **보안**: 마크다운 원문의 `<`, `>`, `&`, `"`는 먼저 이스케이프합니다. 원시 HTML 삽입은 지원하지 않습니다. 링크·이미지 URL은 `http:`, `https:`, `mailto:`, 상대 경로만 허용하고 `javascript:` 등은 제거합니다.
  - 코드 블록 안의 내용에는 인라인 변환을 적용하지 않습니다.
  - 순수 함수 `parseMarkdown(text) → htmlString`으로 export해서 DOM 없이 테스트할 수 있게 합니다.
- 제목에는 자동으로 `id`를 붙여 앵커 링크가 되도록 합니다.

## 라우팅 (`js/main.js`)

해시 기반 라우팅을 사용합니다(서버 설정 없이 동작하도록).

- `#/` → 글 목록
- `#/post/<slug>` → 글 상세
- `#/tag/<태그>` → 태그별 목록
- 없는 글이면 "글을 찾을 수 없습니다" 화면과 목록으로 돌아가는 링크를 보여줍니다.
- 화면 전환 시 `document.title`을 갱신하고 스크롤을 맨 위로 올립니다.

## 디자인 가이드

### 읽기 좋은 본문

- 본문 폭: 약 70ch에 해당하는 `--content-width: 44rem`, 가운데 정렬. `ch`는 요소의 글자 크기를 따라가서 헤더·본문·푸터 폭이 달라지므로 쓰지 않습니다.
- 글자: 시스템 폰트 스택 우선. 한글 가독성을 위해 `"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` 순서를 사용합니다. 웹폰트를 쓴다면 Pretendard 하나만, CDN으로 불러옵니다.
- 본문 크기 `1.0625rem`~`1.125rem`, 줄간격 `1.75`, `word-break: keep-all`(한글 단어 단위 줄바꿈)
- 코드는 고정폭 폰트, 코드 블록은 가로 스크롤(`overflow-x: auto`)로 처리하고 페이지 전체가 가로로 넘치지 않게 합니다.
- 이미지는 `max-width: 100%; height: auto`.
- 장식은 최소화: 그림자·그라데이션 대신 여백과 얇은 구분선으로 위계를 표현합니다.

### 색상과 다크 모드

- 모든 색은 `:root`의 CSS 변수로만 정의합니다. 컴포넌트 CSS에 색상 값을 직접 쓰지 않습니다.
  - 예: `--bg`, `--text`, `--text-muted`, `--accent`, `--border`, `--code-bg`
- 테마 결정 순서:
  1. `localStorage`에 저장된 사용자 선택(`light` / `dark`)
  2. 없으면 시스템 설정 `prefers-color-scheme`
- 적용 방식: `<html data-theme="dark">` 속성. CSS는 다음 두 곳에서 다크 값을 정의합니다.
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
  - `:root[data-theme="dark"] { ... }`
- **깜빡임 방지**: 테마 결정 코드는 `<head>` 안의 작은 인라인 스크립트로 넣어 CSS 적용 전에 실행합니다.
- 헤더에 테마 전환 버튼을 둡니다. `aria-label`은 "다크 모드"로 고정하고, 켜짐 여부는 `aria-pressed`로 알립니다(라벨까지 바꾸면 스크린 리더가 상태를 이중으로 읽음).
- `localStorage` 접근은 `try/catch`로 감쌉니다(사생활 보호 모드 대비).
- 두 테마 모두 본문 대비가 WCAG AA(4.5:1) 이상이어야 합니다.

### 모바일 대응

- 모바일 우선(mobile-first)으로 작성하고, 넓은 화면은 `min-width` 미디어 쿼리로 확장합니다.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수
- 좌우 여백은 최소 `16px`. 어떤 화면 폭에서도 가로 스크롤이 생기면 안 됩니다(긴 URL은 `overflow-wrap: anywhere`).
- 터치 대상(버튼, 링크 영역)은 최소 `44px × 44px`
- 표는 감싸는 요소에 `overflow-x: auto`를 줘서 표만 가로 스크롤되게 합니다.

## 코드 스타일

- JavaScript: ES 모듈(`<script type="module">`), `const`/`let`, 세미콜론 사용, 들여쓰기 2칸
- 함수와 변수명은 camelCase, CSS 클래스는 kebab-case
- DOM에 사용자 데이터(프론트매터 값 등)를 넣을 때는 `textContent`를 사용합니다. `innerHTML`은 `parseMarkdown`의 결과에만 사용합니다.
- 주석은 "왜"가 필요한 곳에만 짧게 한국어로 씁니다.
- 접근성: 시맨틱 태그(`header`, `main`, `article`, `nav`, `time`)를 사용하고, 이미지 `alt`를 마크다운에서 그대로 옮깁니다.

## 변경 후 확인할 것

1. 로컬 서버에서 목록 → 글 상세 → 뒤로가기가 정상 동작하는지
2. 라이트/다크 전환, 새로고침 후 선택 유지, 시스템 설정 따름
3. 모바일 폭(375px)에서 가로 스크롤이 없는지, 코드 블록과 표가 깨지지 않는지
4. 브라우저 콘솔에 오류가 없는지
5. 마크다운 변환기를 수정했다면 제목·목록·코드·표·링크가 섞인 샘플 글로 결과 확인
