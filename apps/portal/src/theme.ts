import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'ai4s-theme';

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'light';
  } catch { return 'light'; }
}

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) setPreference(readPreference()); };
    media.addEventListener('change', update);
    window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', storage); };
  }, []);

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = preference;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
      meta.content = resolved === 'dark' ? '#0d1420' : '#ffffff';
      meta.removeAttribute('media');
    });
  }, [preference, resolved]);

  const choose = (value: ThemePreference) => {
    try { localStorage.setItem(KEY, value); } catch { /* Keep this tab's choice when storage is unavailable. */ }
    setPreference(value);
  };
  return { preference, resolved, choose };
}
