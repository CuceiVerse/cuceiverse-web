import type { ModularMapSeed } from '../editor/modularMapTypes';

export const RUNTIME_SEED_STORAGE_KEY = 'cuceiverse.map.runtimeSeed.v1';

export function loadRuntimeSeed(): ModularMapSeed | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(RUNTIME_SEED_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ModularMapSeed;
    if (parsed?.schemaVersion !== 'modular-map@1' || !parsed?.mapId || !parsed?.grid) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRuntimeSeed(seed: ModularMapSeed): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(RUNTIME_SEED_STORAGE_KEY, JSON.stringify(seed));
}

export function clearRuntimeSeed(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(RUNTIME_SEED_STORAGE_KEY);
}
