import { clearAuth, getAuth } from './auth';

export type ApiError = { status: number; message: string; details?: unknown };

export function apiBaseUrl() {
  return (import.meta as any).env?.VITE_API_BASE_URL?.toString() || 'http://localhost:4000';
}

function coerceErrorMessage(body: unknown, status: number) {
  if (body && typeof body === 'object' && 'message' in body) {
    const m: any = (body as any).message;
    if (typeof m === 'string' && m.trim()) return m;
    if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
    if (m !== undefined && m !== null) return typeof m === 'string' ? m : JSON.stringify(m);
  }
  if (typeof body === 'string' && body.trim()) return body;
  return `HTTP ${status}`;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getAuth();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers ? (init.headers as any) : {})
  };

  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  if (init?.body && !headers['Content-Type']) {
    const body: any = init.body as any;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData) headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  } catch (e: unknown) {
    const err: ApiError = { status: 0, message: `Cannot connect to API (${apiBaseUrl()})`, details: e };
    throw err;
  }
  if (res.ok) return (await parseJsonSafe(res)) as T;

  const body = await parseJsonSafe(res);
  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
      window.location.href = '/login';
    }
  }
  const err: ApiError = { status: res.status, message: coerceErrorMessage(body, res.status), details: body };
  throw err;
}

export async function downloadWithAuth(path: string) {
  const auth = getAuth();
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : undefined
    });
  } catch (e: unknown) {
    const err: ApiError = { status: 0, message: `Cannot connect to API (${apiBaseUrl()})`, details: e };
    throw err;
  }
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    if (res.status === 401) {
      clearAuth();
      if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const err: ApiError = { status: res.status, message: coerceErrorMessage(body, res.status), details: body };
    throw err;
  }
  const blob = await res.blob();
  return { blob, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}
