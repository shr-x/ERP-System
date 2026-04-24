import { getJson, remove, setJson } from './storage';

export type AuthState = {
  accessToken: string;
  user: { id: string; fullName: string; role: string; storeId?: string };
};

export type MultiAuthState = {
  activeId: string | null;
  sessions: AuthState[];
};

const KEY = 'shrx_pos_auth_v2';

export function getAuth(): AuthState | null {
  const multi = getJson<MultiAuthState>(KEY);
  if (!multi || !multi.activeId) return null;
  return multi.sessions.find((s) => s.user.id === multi.activeId) || null;
}

export function getAllSessions(): AuthState[] {
  const multi = getJson<MultiAuthState>(KEY);
  return multi?.sessions || [];
}

export function setAuth(auth: AuthState) {
  let multi = getJson<MultiAuthState>(KEY);
  if (!multi) {
    multi = { activeId: auth.user.id, sessions: [auth] };
  } else {
    const idx = multi.sessions.findIndex((s) => s.user.id === auth.user.id);
    if (idx >= 0) {
      multi.sessions[idx] = auth;
    } else {
      multi.sessions.push(auth);
    }
    multi.activeId = auth.user.id;
  }
  setJson(KEY, multi);
}

export function switchSession(userId: string) {
  const multi = getJson<MultiAuthState>(KEY);
  if (multi && multi.sessions.some((s) => s.user.id === userId)) {
    multi.activeId = userId;
    setJson(KEY, multi);
  }
}

export function clearAuth() {
  remove(KEY);
}

export function removeSession(userId: string) {
  const multi = getJson<MultiAuthState>(KEY);
  if (multi) {
    multi.sessions = multi.sessions.filter((s) => s.user.id !== userId);
    if (multi.activeId === userId) {
      multi.activeId = multi.sessions[0]?.user.id || null;
    }
    setJson(KEY, multi);
  }
}
