const STORAGE_KEY = 'theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장할 수 없어도 현재 화면에서는 전환이 동작해야 한다
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') ||
    (darkQuery.matches ? 'dark' : 'light');
}

function syncButton(button) {
  const isDark = currentTheme() === 'dark';
  button.setAttribute('aria-pressed', String(isDark));
  button.title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
}

export function initTheme() {
  const button = document.querySelector('.theme-toggle');
  if (!button) return;

  syncButton(button);

  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    storeTheme(next);
    syncButton(button);
  });

  // 사용자가 직접 고르지 않았다면 시스템 설정 변경을 따라간다
  darkQuery.addEventListener('change', () => {
    if (!readStoredTheme()) {
      document.documentElement.removeAttribute('data-theme');
    }
    syncButton(button);
  });
}
