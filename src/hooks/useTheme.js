// ============================================================================
// PronoScope — Hook de thème sombre/clair
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../config';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* stockage indisponible */ }
    return 'dark'; // thème par défaut : sombre premium
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0e1a' : '#eef1f8');
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch { /* ignore */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}
