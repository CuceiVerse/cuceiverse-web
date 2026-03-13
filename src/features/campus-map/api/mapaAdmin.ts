import type {
  ModularMapSavePayload,
  ModularMapSeed,
} from '../editor/modularMapTypes';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export type MapGraphNode = {
  id: string;
  x: number;
  y: number;
};

export type MapGraphEdge = {
  id: string;
  nodeAId: string;
  nodeBId: string;
  peso: number;
};

export type MapGraphPayload = {
  nodes: MapGraphNode[];
  edges: MapGraphEdge[];
};

export type CampusBuilding = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  zona: string;
  boundingBox: Array<{ x: number; y: number }>;
  centroidX: number | null;
  centroidY: number | null;
};

export type CampusArea = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  boundingBox: Array<{ x: number; y: number }>;
  centroidX: number | null;
  centroidY: number | null;
};

export type CampusAsset = {
  id: string;
  tipo: 'ARBOL' | 'ARBUSTO' | 'BANCA' | 'LUMINARIA' | 'BASURERO';
  nombre: string | null;
  coordX: number;
  coordY: number;
  orientacionDeg: number | null;
  areaId: string | null;
  nearestPathNodeId: string | null;
};

export type ModularLayoutResponse = {
  ok: true;
  data: ModularMapSeed;
  meta: {
    source: 'filesystem';
    savedAt: string;
    path: string;
  };
};

export async function fetchMapGraph(token: string): Promise<MapGraphPayload> {
  const response = await fetch(`${API_BASE_URL}/mapa/grafo`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar el grafo (${response.status})`);
  }

  return response.json() as Promise<MapGraphPayload>;
}

export async function fetchMapBuildings(token: string): Promise<CampusBuilding[]> {
  const response = await fetch(`${API_BASE_URL}/mapa/edificios`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudieron cargar edificios (${response.status})`);
  }

  const payload = (await response.json()) as {
    data: CampusBuilding[];
    meta: { total: number };
  };

  return payload.data;
}

export async function fetchMapAreas(token: string): Promise<CampusArea[]> {
  const response = await fetch(`${API_BASE_URL}/mapa/areas`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudieron cargar areas (${response.status})`);
  }

  const payload = (await response.json()) as {
    data: CampusArea[];
    meta: { total: number };
  };

  return payload.data;
}

export async function fetchMapAssets(token: string): Promise<CampusAsset[]> {
  const response = await fetch(`${API_BASE_URL}/mapa/mobiliario`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar mobiliario (${response.status})`);
  }

  const payload = (await response.json()) as {
    data: CampusAsset[];
    meta: { total: number };
  };

  return payload.data;
}

export async function fetchNearestPathNode(
  token: string,
  x: number,
  y: number,
): Promise<{ node: MapGraphNode; distancia: number }> {
  const query = new URLSearchParams({ x: String(x), y: String(y) });
  const response = await fetch(`${API_BASE_URL}/mapa/nodo-mas-cercano?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudo calcular snap-to-node (${response.status})`);
  }

  const payload = (await response.json()) as {
    node: MapGraphNode;
    distancia: number;
  };

  return payload;
}

export async function recalculateNearestPathNodes(
  token: string,
  poiIds?: string[],
): Promise<{ ok: boolean; stats: { processed: number; updated: number } }> {
  const response = await fetch(`${API_BASE_URL}/mapa/recalcular-nearest-nodos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(poiIds?.length ? { poiIds } : {}),
  });

  if (!response.ok) {
    throw new Error(`No se pudo recalcular nearest nodes (${response.status})`);
  }

  return response.json() as Promise<{
    ok: boolean;
    stats: { processed: number; updated: number };
  }>;
}

export async function fetchModularMapLayout(
  token: string,
  mapId: string,
): Promise<ModularLayoutResponse> {
  const response = await fetch(`${API_BASE_URL}/mapa/layout-modular/${mapId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar layout modular (${response.status})`);
  }

  return response.json() as Promise<ModularLayoutResponse>;
}

export async function saveModularMapLayout(
  token: string,
  payload: ModularMapSavePayload,
): Promise<ModularLayoutResponse> {
  const response = await fetch(
    `${API_BASE_URL}/mapa/layout-modular/${payload.mapId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`No se pudo guardar layout modular (${response.status}): ${text}`);
  }

  return response.json() as Promise<ModularLayoutResponse>;
}
