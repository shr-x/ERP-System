const KEY_PREFIX = 'shrx_admin_unlock_v1';

function key(userId: string) {
  return `${KEY_PREFIX}:${userId}`;
}

export function isAdminUnlocked(userId: string) {
  const raw = sessionStorage.getItem(key(userId));
  if (!raw) return false;
  const exp = Number(raw);
  if (!Number.isFinite(exp)) return false;
  if (Date.now() > exp) return false;
  return true;
}

export function setAdminUnlocked(userId: string, ttlMs: number) {
  sessionStorage.setItem(key(userId), String(Date.now() + ttlMs));
}

export function clearAdminUnlocked(userId: string) {
  sessionStorage.removeItem(key(userId));
}
