import type { ThemePref } from './prefs';

const META_LIGHT = '#f2f4f9';
const META_DARK = '#000000';

/**
 * Apply the Appearance preference. 'system' removes the override so CSS follows
 * prefers-color-scheme; 'light' / 'dark' pin the scheme via <html data-theme>.
 */
export function applyTheme(theme: ThemePref, doc: Document = document): void {
  const root = doc.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  const metas = doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const media = m.getAttribute('data-media') ?? m.getAttribute('media') ?? '';
    if (!m.hasAttribute('data-media')) m.setAttribute('data-media', media);
    if (theme === 'system') {
      m.setAttribute('media', media);
      m.content = media.includes('dark') ? META_DARK : META_LIGHT;
    } else {
      m.removeAttribute('media');
      m.content = theme === 'dark' ? META_DARK : META_LIGHT;
    }
  });
}
