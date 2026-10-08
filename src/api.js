const nativeRuntime = () => Boolean(globalThis.Capacitor?.Plugins?.OpinaRuntime);

export function isNativeRuntime() {
  return nativeRuntime();
}

export function apiBaseUrl() {
  const configured = globalThis.__OPINA_API_BASE_URL__ || import.meta.env.VITE_OPINA_API_BASE_URL;
  const base = configured || (nativeRuntime() ? 'http://127.0.0.1:4000' : '');
  return String(base).replace(/\/$/, '');
}

export function apiUrl(path) {
  return `${apiBaseUrl()}${path}`;
}
