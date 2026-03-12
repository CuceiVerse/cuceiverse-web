import type { PoiFilters, PuntoInteres } from '../types';

type PuntosInteresPayload = {
  data: PuntoInteres[];
  meta: {
    total: number;
    filtros: {
      tipo: string | null;
      edificio: string | null;
      activo: boolean | null;
      limit: number;
    };
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function fetchPuntosInteres(
  filters: PoiFilters,
  signal?: AbortSignal,
): Promise<PuntoInteres[]> {
  const params = new URLSearchParams();

  if (filters.tipo !== 'all') {
    params.set('tipo', filters.tipo);
  }

  const edificio = filters.edificio.trim().toUpperCase();
  if (edificio) {
    params.set('edificio', edificio);
  }

  params.set('activo', String(filters.soloActivos));

  const response = await fetch(
    `${API_BASE_URL}/puntos-interes?${params.toString()}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`No se pudieron cargar los puntos de interes (${response.status})`);
  }

  const payload = (await response.json()) as PuntosInteresPayload;
  return payload.data;
}