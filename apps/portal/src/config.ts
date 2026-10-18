// Public API origin or path prefix. Empty preserves same-origin requests.
const apiBase = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${apiBase}/${path.replace(/^\/+/, '')}`;
}
