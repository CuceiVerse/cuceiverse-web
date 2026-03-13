import { useCallback, useMemo, useRef, useState } from 'react';
import type { GridPoint, PuntoInteres, PoiType } from '../types';

export type EditorTool =
  | 'select'
  | 'building'
  | 'area'
  | 'poi'
  | 'asset'
  | 'walkway'
  | 'edge'
  | 'erase';

/**
 * PendingPoi extiende PuntoInteres para incluir metadatos del editor.
 * `_clientId` es único por sesión: igual a `id` para registros existentes,
 * o un id temporal (`_tmp_N`) para los creados en el editor.
 * `_op` registra la operación pendiente.
 */
export type PendingPoi = PuntoInteres & {
  _clientId: string;
  _op: 'keep' | 'create' | 'update' | 'delete';
};

export type PendingNode = {
  _clientId: string;
  id?: string;
  op: 'create' | 'delete';
  xGrid: number;
  yGrid: number;
};

type NewPoiMeta = {
  nombre: string;
  tipo: PoiType;
  descripcion?: string;
  edificioReferencia?: string;
  nearestPathNodeId?: string;
};

type PoiSyncOp =
  | { op: 'create'; nombre: string; tipo: string; coordenadaXGrid: number; coordenadaYGrid: number; descripcion?: string; edificioReferencia?: string; nearestPathNodeId?: string }
  | { op: 'update'; id: string; nombre?: string; tipo?: string; coordenadaXGrid?: number; coordenadaYGrid?: number; descripcion?: string; edificioReferencia?: string; nearestPathNodeId?: string }
  | { op: 'delete'; id: string };

type NodeSyncOp =
  | { op: 'create'; xGrid: number; yGrid: number }
  | { op: 'delete'; id: string };

type EdgeSyncOp =
  | { op: 'create'; nodeAId: string; nodeBId: string; peso?: number }
  | { op: 'delete'; id: string };

export type MapaSyncPayload = {
  pois: PoiSyncOp[];
  nodos: NodeSyncOp[];
  aristas?: EdgeSyncOp[];
  elementos?: Array<{
    op: 'create' | 'update' | 'delete';
    id?: string;
    tipo?: 'ARBOL' | 'ARBUSTO' | 'BANCA' | 'LUMINARIA' | 'BASURERO';
    nombre?: string;
    coordX?: number;
    coordY?: number;
    orientacionDeg?: number;
    areaId?: string;
    nearestPathNodeId?: string;
  }>;
};

let _counter = 0;
const tmpId = () => `_tmp_${++_counter}`;

export function useMapEditor(initialPois: PuntoInteres[]) {
  const initialRef = useRef(initialPois);

  const [activeTool, setActiveTool] = useState<EditorTool>('select');

  const [pendingPois, setPendingPois] = useState<PendingPoi[]>(() =>
    initialPois.map((p) => ({ ...p, _clientId: p.id, _op: 'keep' as const })),
  );

  const [pendingNodes, setPendingNodes] = useState<PendingNode[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  /** POIs que deben mostrarse en el mapa (excluye los marcados para borrar). */
  const activePois = useMemo(
    () => pendingPois.filter((p) => p._op !== 'delete'),
    [pendingPois],
  );

  /** Nodos de pasillo activos (no marcados para borrar). */
  const activeNodes = useMemo(
    () => pendingNodes.filter((n) => n.op !== 'delete'),
    [pendingNodes],
  );

  /** Coloca un nuevo POI en la posición de cuadrícula indicada. */
  const placePoi = useCallback((point: GridPoint, meta: NewPoiMeta) => {
    const clientId = tmpId();
    setPendingPois((prev) => [
      ...prev,
      {
        id: clientId,
        _clientId: clientId,
        _op: 'create',
        nombre: meta.nombre,
        tipo: meta.tipo,
        coordenadaXGrid: point.x,
        coordenadaYGrid: point.y,
        descripcion: meta.descripcion ?? null,
        activo: true,
        edificioReferencia: meta.edificioReferencia ?? null,
        nearestPathNodeId: meta.nearestPathNodeId ?? null,
        prioridadVisual: 0,
      },
    ]);
    setIsDirty(true);
  }, []);

  /** Marca un POI como eliminado por su clientId. */
  const markPoiDeleted = useCallback((clientId: string) => {
    setPendingPois((prev) =>
      prev.map((p) => (p._clientId === clientId ? { ...p, _op: 'delete' as const } : p)),
    );
    setIsDirty(true);
  }, []);

  /** Mueve un POI existente o nuevo (usado por drag-and-drop). */
  const movePoi = useCallback((clientId: string, point: GridPoint) => {
    setPendingPois((prev) =>
      prev.map((p) => {
        if (p._clientId !== clientId) return p;
        const nextOp = p._op === 'create' ? 'create' : p._op === 'delete' ? 'delete' : 'update';
        return {
          ...p,
          coordenadaXGrid: point.x,
          coordenadaYGrid: point.y,
          _op: nextOp,
        };
      }),
    );
    setIsDirty(true);
  }, []);

  /** Agrega un nodo de pasillo en la posición de cuadrícula. */
  const placeNode = useCallback((point: GridPoint) => {
    setPendingNodes((prev) => {
      const alreadyExists = prev.some(
        (n) => n.xGrid === point.x && n.yGrid === point.y && n.op !== 'delete',
      );
      if (alreadyExists) return prev;
      return [
        ...prev,
        { _clientId: tmpId(), op: 'create', xGrid: point.x, yGrid: point.y },
      ];
    });
    setIsDirty(true);
  }, []);

  /** Descarta todos los cambios y restaura el estado inicial. */
  const discard = useCallback(() => {
    setPendingPois(
      initialRef.current.map((p) => ({
        ...p,
        _clientId: p.id,
        _op: 'keep' as const,
      })),
    );
    setPendingNodes([]);
    setIsDirty(false);
  }, []);

  /** Construye el payload para POST /mapa/sync. */
  const buildPayload = useCallback((): MapaSyncPayload => {
    const pois: PoiSyncOp[] = pendingPois
      .filter((p) => p._op !== 'keep')
      .map((p) => {
        if (p._op === 'delete') {
          return { op: 'delete', id: p.id };
        }
        if (p._op === 'update') {
          return {
            op: 'update',
            id: p.id,
            coordenadaXGrid: p.coordenadaXGrid,
            coordenadaYGrid: p.coordenadaYGrid,
            ...(p.nombre ? { nombre: p.nombre } : {}),
            ...(p.tipo ? { tipo: p.tipo } : {}),
            ...(p.descripcion ? { descripcion: p.descripcion } : {}),
            ...(p.edificioReferencia
              ? { edificioReferencia: p.edificioReferencia }
              : {}),
            ...(p.nearestPathNodeId
              ? { nearestPathNodeId: p.nearestPathNodeId }
              : {}),
          };
        }
        return {
          op: 'create',
          nombre: p.nombre,
          tipo: p.tipo,
          coordenadaXGrid: p.coordenadaXGrid,
          coordenadaYGrid: p.coordenadaYGrid,
          ...(p.descripcion ? { descripcion: p.descripcion } : {}),
          ...(p.edificioReferencia
            ? { edificioReferencia: p.edificioReferencia }
            : {}),
          ...(p.nearestPathNodeId
            ? { nearestPathNodeId: p.nearestPathNodeId }
            : {}),
        };
      });

    const nodos: NodeSyncOp[] = pendingNodes.map((n) => {
      if (n.op === 'delete') {
        return { op: 'delete', id: n.id! };
      }
      return { op: 'create', xGrid: n.xGrid, yGrid: n.yGrid };
    });

    return { pois, nodos };
  }, [pendingPois, pendingNodes]);

  const replaceFromServer = useCallback((nextPois: PuntoInteres[]) => {
    initialRef.current = nextPois;
    setPendingPois(
      nextPois.map((p) => ({
        ...p,
        _clientId: p.id,
        _op: 'keep' as const,
      })),
    );
    setPendingNodes([]);
    setIsDirty(false);
  }, []);

  return {
    activeTool,
    setActiveTool,
    activePois,
    activeNodes,
    isDirty,
    placePoi,
    movePoi,
    markPoiDeleted,
    placeNode,
    discard,
    buildPayload,
    replaceFromServer,
  };
}
