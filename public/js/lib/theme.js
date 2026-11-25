// Light / dark / follow-the-phone theme. The CSS uses light-dark() and
// color-scheme, so switching is just one attribute on <html>.
const KEY = 'csb.theme';
export const currentTheme = () => localStorage.getItem(KEY) || 'system';

export function applyTheme(theme = currentTheme()) {
  localStorage.setItem(KEY, theme);
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1f1c' : '#f4f6f3');
}
