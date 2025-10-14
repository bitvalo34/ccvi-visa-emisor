// web/src/lib/axios.ts
import axios, { AxiosHeaders, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// En Vite, las env del cliente deben empezar con VITE_
// Se leen con import.meta.env (no process.env)
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/';
const API_KEY = (import.meta.env.VITE_API_KEY as string) ?? '';

// Instancia única de Axios para toda la app
const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  // withCredentials: false, // habilítalo si tu backend usa cookies/sesión
});

// --- Interceptor de REQUEST ---
// - Inyecta x-api-key si existe
// - Fuerza Content-Type/Accept por defecto a JSON (puedes sobrescribir por request)
// - Si el caller pasa { headers: { 'Idempotency-Key': 'auto' } }, genera un UUID
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // helper para setear header soportando AxiosHeaders o plain object
  type HeaderBag = AxiosHeaders | Record<string, string>;
  const getHeaders = (): HeaderBag => (config.headers as HeaderBag) || {};

  const isAxiosHeadersLike = (obj: HeaderBag): obj is AxiosHeaders => {
    return (
      obj instanceof AxiosHeaders ||
      (typeof obj === 'object' &&
        obj !== null &&
        typeof (obj as AxiosHeaders).set === 'function' &&
        typeof (obj as AxiosHeaders).get === 'function')
    );
  };

  const setHeader = (name: string, value?: string) => {
    if (!value) return;
    const h = getHeaders();
    if (isAxiosHeadersLike(h)) {
      h.set(name, value);
    } else {
      (h as Record<string, string>)[name] = value;
    }
    config.headers = h as unknown as typeof config.headers;
  };

  // x-api-key (si configuraste VITE_API_KEY)
  // no sobrescribas si ya viene definida por el caller
  const hasApiKey = (() => {
    const h = getHeaders();
    if (!h) return false;
    if (isAxiosHeadersLike(h)) return Boolean(h.get('x-api-key'));
    return Boolean((h as Record<string, string>)['x-api-key']);
  })();
  if (API_KEY && !hasApiKey) {
    setHeader('x-api-key', API_KEY);
  }

  // Defaults sensatos para JSON; permiten override por request
  const method = (config.method || 'get').toLowerCase();
  const hasAccept = (() => {
    const h = getHeaders();
    if (!h) return false;
    if (isAxiosHeadersLike(h)) return Boolean(h.get('Accept'));
    return Boolean((h as Record<string, string>)['Accept']);
  })();
  if (!hasAccept) setHeader('Accept', 'application/json');

  const hasContentType = (() => {
    const h = getHeaders();
    if (!h) return false;
    if (isAxiosHeadersLike(h)) return Boolean(h.get('Content-Type'));
    return Boolean((h as Record<string, string>)['Content-Type']);
  })();
  if (method !== 'get' && !hasContentType) setHeader('Content-Type', 'application/json');

  // Idempotency-Key opcional (útil para pagos/autorizar)
  const isAutoIdem = (() => {
    const h = getHeaders();
    if (!h) return false;
    const v = isAxiosHeadersLike(h)
      ? h.get('Idempotency-Key')
      : (h as Record<string, string>)['Idempotency-Key'];
    return v === 'auto';
  })();
  if (isAutoIdem) {
    const v =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setHeader('Idempotency-Key', v);
  }

  return config;
});

export { http };

// Helpers opcionales para cambiar API key/base en runtime si lo necesitas:
export function setApiKey(key: string) {
  (http.defaults.headers as Record<string, string>)['x-api-key'] = key;
}
export function setApiBase(url: string) {
  http.defaults.baseURL = url;
}
