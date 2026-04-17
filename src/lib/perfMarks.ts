const STORAGE_PREFIX = 'cuceiverse.perf.';

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function safeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function setPerfMark(key: string, epochMs: number = Date.now()): void {
  const storage = safeSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey(key), String(epochMs));
  } catch {
    // ignore
  }
}

export function clearPerfMark(key: string): void {
  const storage = safeSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

export function getPerfMark(key: string): number | null {
  const storage = safeSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(storageKey(key));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function popPerfMark(key: string): number | null {
  const storage = safeSessionStorage();
  if (!storage) return null;

  const fullKey = storageKey(key);
  try {
    const raw = storage.getItem(fullKey);
    if (!raw) return null;
    storage.removeItem(fullKey);

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
