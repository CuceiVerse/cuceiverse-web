import type { MapaSyncPayload } from '../hooks/useMapEditor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export type SyncMapaResult = {
  ok: boolean;
  stats: {
    pois: { created: number; updated: number; deleted: number };
    nodos: { created: number; deleted: number };
    aristas: { created: number; deleted: number };
    elementos: { created: number; updated: number; deleted: number };
  };
};

/**
 * Envía el payload del modo edición a POST /mapa/sync.
 * Requiere token JWT con rol de administrador.
 */
export async function syncMapa(
  token: string,
  payload: MapaSyncPayload,
): Promise<SyncMapaResult> {
  const response = await fetch(`${API_BASE_URL}/mapa/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Error al guardar cambios: ${response.status} — ${text}`);
  }

  return response.json() as Promise<SyncMapaResult>;
}
