import { useEffect, useMemo, useState } from 'react';
import { Flag, MapPin } from 'lucide-react';

import { useAuth } from '../../../context/useAuth';
import { fetchModularMapLayout } from '../api/mapaAdmin';
import { fetchPuntosInteres } from '../api/puntosInteres';
import campusModularSeed from '../data/campusModularSeed.json';
import { cellKey, expandBlockCells } from '../editor/buildingAdjacency';
import { gridAStarPath, snapToPathTile } from '../lib/gridAStar';
import { loadRuntimeSeed } from '../lib/runtimeSeed';
import { ModularMapCanvas } from './ModularMapCanvas';
import type { PuntoInteres } from '../types';
import type {
  BuildingBlock,
  GridCell,
  MapProp,
  ModularBuilding,
  ModularMapSeed,
  ModularMapStoreState,
  PathTile,
  PropKind,
} from '../editor/modularMapTypes';

/** Punto de origen/destino unificado: POI prop del mapa, edificio o POI de BD. */
type MapWaypoint = {
  id: string;
  label: string;
  cell: GridCell;
  kind: 'poi-prop' | 'building' | 'poi-db';
};

type AssistantRouteEventDetail = {
  type?: 'highlight-route';
  destinationPoiId?: string;
  destinationLabel?: string;
  originPoiId?: string;
  originLabel?: string;
};

function centerOfCell(cell: GridCell): { x: number; y: number } {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

function isPoiWaypoint(kind: MapWaypoint['kind']): boolean {
  return kind === 'poi-prop' || kind === 'poi-db';
}

function dedupePolyline(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 1) return points;
  const deduped: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const curr = points[i];
    if (prev.x !== curr.x || prev.y !== curr.y) {
      deduped.push(curr);
    }
  }
  return deduped;
}

function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const bundledSeed = campusModularSeed as ModularMapSeed;
const VIEW_MODE_STORAGE_KEY = 'cuceiverse.map.viewMode';

function getInitialViewMode(): 'isometric' | '2d' {
  if (typeof window === 'undefined') {
    return 'isometric';
  }
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === '2d' ? '2d' : 'isometric';
}

function computeGeometryFromCells(cells: GridCell[]) {
  const count = cells.length || 1;
  const centroid = cells.reduce(
    (accumulator, cell) => ({
      x: accumulator.x + cell.x + 0.5,
      y: accumulator.y + cell.y + 0.5,
    }),
    { x: 0, y: 0 },
  );

  const bounds = cells.reduce(
    (accumulator, cell) => ({
      minX: Math.min(accumulator.minX, cell.x),
      minY: Math.min(accumulator.minY, cell.y),
      maxX: Math.max(accumulator.maxX, cell.x),
      maxY: Math.max(accumulator.maxY, cell.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  return {
    centroid: {
      x: centroid.x / count,
      y: centroid.y / count,
    },
    bounds,
  };
}

function formatMapUpdatedLabel(rawSavedAt?: string): string {
  if (!rawSavedAt) return 'Mapa actualizado recientemente';
  const parsed = new Date(rawSavedAt);
  if (Number.isNaN(parsed.getTime())) return 'Mapa actualizado recientemente';

  const now = new Date();
  const isToday =
    now.getFullYear() === parsed.getFullYear() &&
    now.getMonth() === parsed.getMonth() &&
    now.getDate() === parsed.getDate();

  if (isToday) {
    return 'Mapa actualizado hoy';
  }

  return `Mapa actualizado el ${new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)}`;
}

function normalizePropKind(raw: string): PropKind {
  if (
    raw === 'tree' ||
    raw === 'access-vehicular' ||
    raw === 'access-pedestrian' ||
    raw === 'asphalt' ||
    raw === 'car' ||
    raw === 'motorcycle' ||
    raw === 'park' ||
    raw === 'bench' ||
    raw === 'bathroom' ||
    raw === 'poi' ||
    raw === 'track' ||
    raw === 'shrub' ||
    raw === 'trash'
  ) {
    return raw;
  }
  if (raw === 'lamp') {
    return 'shrub';
  }
  if (raw === 'access' || raw === 'pedestrian_access' || raw === 'access_pedestrian') {
    return 'access-pedestrian';
  }
  if (raw === 'vehicular_access' || raw === 'access_vehicle' || raw === 'access_vehicular') {
    return 'access-vehicular';
  }
  if (raw === 'street') {
    return 'asphalt';
  }
  if (raw === 'auto' || raw === 'vehicle') {
    return 'car';
  }
  if (raw === 'moto' || raw === 'motorbike' || raw === 'bike') {
    return 'motorcycle';
  }
  return 'poi';
}

function normalizeBuildingType(raw: string): ModularBuilding['type'] {
  if (
    raw === 'academic' ||
    raw === 'administrative' ||
    raw === 'services' ||
    raw === 'sports' ||
    raw === 'research' ||
    raw === 'mixed'
  ) {
    return raw;
  }
  return 'mixed';
}

function toViewerState(
  layout: ModularMapSeed,
): Pick<
  ModularMapStoreState,
  | 'grid'
  | 'activeTool'
  | 'activePropKind'
  | 'activeAreaPaletteId'
  | 'activeAreaFootprint'
  | 'activeBuildingPaletteId'
  | 'activeBuildingFootprint'
  | 'areaCellsByKey'
  | 'blocksById'
  | 'buildingsById'
  | 'pathsByCell'
  | 'propsById'
  | 'selection'
> {
  const blocksById: Record<string, BuildingBlock> = {};
  const buildingsById: Record<string, ModularBuilding> = {};
  const areaCellsByKey: Record<string, true> = Object.fromEntries(
    (layout.areaCells ?? []).map((cell) => [cellKey(cell), true]),
  );

  if (Object.keys(areaCellsByKey).length === 0) {
    for (let row = 0; row < layout.grid.rows; row += 1) {
      for (let column = 0; column < layout.grid.columns; column += 1) {
        areaCellsByKey[cellKey({ x: column, y: row })] = true;
      }
    }
  }

  for (const building of layout.buildings) {
    const occupiedMap = new Map<string, GridCell>();
    const blockIds: string[] = [];

    for (const block of building.blocks) {
      const footprint = block.size ?? { width: 2, height: 2 };
      blockIds.push(block.id);
      blocksById[block.id] = {
        id: block.id,
        anchor: block.anchor,
        size: footprint,
        sourcePaletteId: 'building-2x2',
        buildingId: building.id,
      };

      for (const cell of expandBlockCells(block.anchor, footprint)) {
        occupiedMap.set(cellKey(cell), cell);
      }
    }

    const occupiedCells = Array.from(occupiedMap.values()).sort(
      (left, right) => left.y - right.y || left.x - right.x,
    );
    const geometry = computeGeometryFromCells(occupiedCells);

    buildingsById[building.id] = {
      id: building.id,
      name: building.name,
      type: normalizeBuildingType(building.type),
      blockIds,
      occupiedCells,
      centroid: geometry.centroid,
      bounds: geometry.bounds,
    };
  }

  const pathsByCell: Record<string, PathTile> = Object.fromEntries(
    layout.paths.map((tile) => [cellKey(tile.cell), tile]),
  );

  const propsById: Record<string, MapProp> = Object.fromEntries(
    layout.props.map((prop) => [
      prop.id,
      {
        id: prop.id,
        kind: normalizePropKind(prop.kind),
        cell: prop.cell,
        rotationDeg: prop.rotationDeg,
        variant: prop.variant,
        metadata: prop.metadata,
      },
    ]),
  );

  return {
    grid: layout.grid,
    activeTool: 'pan',
    activePropKind: 'tree',
    activeAreaPaletteId: 'area-2x2',
    activeAreaFootprint: { width: 2, height: 2 },
    activeBuildingPaletteId: 'building-2x2',
    activeBuildingFootprint: { width: 2, height: 2 },
    areaCellsByKey,
    blocksById,
    buildingsById,
    pathsByCell,
    propsById,
    selection: null,
  };
}

export function ModularReadOnlyMap() {
  const fallbackSeed = useMemo(() => loadRuntimeSeed() ?? bundledSeed, []);
  const { token } = useAuth();
  const [layout, setLayout] = useState<ModularMapSeed>(fallbackSeed);
  const [status, setStatus] = useState('Cargando mapa modular...');
  const [viewMode, setViewMode] = useState<'isometric' | '2d'>(getInitialViewMode);
  const [dbPois, setDbPois] = useState<PuntoInteres[]>([]);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  /** Ruta visual (puede incluir puntos fraccionales para centro de POI). */
  const [routePath, setRoutePath] = useState<Array<{ x: number; y: number }>>([]);
  const [routeTileCount, setRouteTileCount] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeNetwork, setRouteNetwork] = useState<'pasillos' | 'mixta'>('pasillos');

  const statusLabel = useMemo(() => {
    const normalized = status.toLowerCase();
    if (normalized.includes('cargando')) return 'Sincronizando mapa...';
    if (normalized.includes('seed local')) return 'Modo local activo';
    if (normalized.includes('mapa actualizado')) return status;
    return 'Mapa listo';
  }, [status]);

  useEffect(() => {
    if (!token) {
      setStatus('Sin token, mostrando seed local.');
      setLayout(fallbackSeed);
      return;
    }

    let cancelled = false;
    setStatus('Cargando mapa modular...');

    fetchModularMapLayout(token, fallbackSeed.mapId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setLayout(response.data);
        setStatus(formatMapUpdatedLabel(response.meta.savedAt));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLayout(fallbackSeed);
        setStatus('No se pudo cargar layout remoto, usando seed local.');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;

    fetchPuntosInteres({ tipo: 'all', edificio: '', soloActivos: true })
      .then((items) => {
        if (cancelled) {
          return;
        }
          setDbPois(items);
      })
      .catch(() => {
        if (!cancelled) {
            setDbPois([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const viewerState = useMemo(() => toViewerState(layout), [layout]);

  // ── Waypoints unificados: POI props del mapa + edificios + POIs de BD ───────
  const waypoints = useMemo<MapWaypoint[]>(() => {
    const result: MapWaypoint[] = [];

    // 1) POI props colocados en el editor (kind === 'poi' con etiqueta)
    for (const prop of layout.props) {
      if (prop.kind !== 'poi') continue;
      const label = prop.metadata?.label?.trim() || prop.id;
      result.push({ id: `prop::${prop.id}`, label, cell: prop.cell, kind: 'poi-prop' });
    }

    // 2) Edificios creados en el editor (con nombre)
    for (const building of layout.buildings) {
      if (!building.name.trim()) continue;
      // Calcular celda centroide del primer bloque
      const anchor = building.blocks[0]?.anchor ?? { x: 0, y: 0 };
      result.push({
        id: `building::${building.id}`,
        label: `🏛 ${building.name}`,
        cell: anchor,
        kind: 'building',
      });
    }

    // 3) POIs de BD (con coordenadas de cuadrícula)
    for (const poi of dbPois) {
      if (poi.coordenadaXGrid == null || poi.coordenadaYGrid == null) continue;
      result.push({
        id: `db::${poi.id}`,
        label: `📍 ${poi.nombre}`,
        cell: { x: Math.round(poi.coordenadaXGrid), y: Math.round(poi.coordenadaYGrid) },
        kind: 'poi-db',
      });
    }

    return result;
  }, [layout.props, layout.buildings, dbPois]);

  // Selección automática de primeros dos waypoints al cargar
  useEffect(() => {
    if (waypoints.length > 0 && !originId) setOriginId(waypoints[0].id);
    if (waypoints.length > 1 && !destinationId) setDestinationId(waypoints[1].id);
  }, [waypoints, originId, destinationId]);

  // Set de celdas de pasillo para el A*
  const pathCellsSet = useMemo(
    () => new Set(Object.keys(viewerState.pathsByCell)),
    [viewerState.pathsByCell],
  );

  // El asfalto puede funcionar como fallback de tránsito cuando no hay conexión por pasillos.
  const asphaltCellsSet = useMemo(() => {
    const set = new Set<string>();
    for (const prop of Object.values(viewerState.propsById)) {
      if (prop.kind === 'asphalt') {
        set.add(cellKey(prop.cell));
      }
    }
    return set;
  }, [viewerState.propsById]);

  const traversableWithAsphaltSet = useMemo(() => {
    const merged = new Set<string>(pathCellsSet);
    for (const key of asphaltCellsSet) {
      merged.add(key);
    }
    return merged;
  }, [pathCellsSet, asphaltCellsSet]);

  const canRoute = originId !== '' && destinationId !== '' && originId !== destinationId;

  function computeRouteForWaypoints(origin: MapWaypoint, dest: MapWaypoint) {
    setRouteError(null);
    setRoutePath([]);
    setRouteTileCount(0);
    setRouteNetwork('pasillos');

    setRouteLoading(true);

    // 1) Intento principal: solo pasillos
    const snappedOriginPath = snapToPathTile(origin.cell, pathCellsSet);
    const snappedDestPath = snapToPathTile(dest.cell, pathCellsSet);
    const pathOnly =
      snappedOriginPath && snappedDestPath
        ? gridAStarPath(snappedOriginPath, snappedDestPath, pathCellsSet)
        : [];

    if (pathOnly.length > 0) {
      const centeredPath = pathOnly.map(centerOfCell);
      const withPoiCenters = dedupePolyline([
        ...(isPoiWaypoint(origin.kind) ? [centerOfCell(origin.cell)] : []),
        ...centeredPath,
        ...(isPoiWaypoint(dest.kind) ? [centerOfCell(dest.cell)] : []),
      ]);
      setRoutePath(withPoiCenters);
      setRouteTileCount(pathOnly.length);
      setRouteNetwork('pasillos');
      setRouteLoading(false);
      return;
    }

    // 2) Fallback: pasillos + asfalto
    const snappedOriginMixed = snapToPathTile(origin.cell, traversableWithAsphaltSet);
    const snappedDestMixed = snapToPathTile(dest.cell, traversableWithAsphaltSet);

    if (!snappedOriginMixed) {
      setRouteError(`No hay pasillos ni asfalto cerca del origen "${origin.label}".`);
      setRouteLoading(false);
      return;
    }
    if (!snappedDestMixed) {
      setRouteError(`No hay pasillos ni asfalto cerca del destino "${dest.label}".`);
      setRouteLoading(false);
      return;
    }

    const path = gridAStarPath(snappedOriginMixed, snappedDestMixed, traversableWithAsphaltSet);
    setRouteLoading(false);

    if (path.length === 0) {
      setRouteError('No se encontró ruta ni por pasillos ni por asfalto. Verifica conectividad.');
      return;
    }

    const centeredPath = path.map(centerOfCell);
    const withPoiCenters = dedupePolyline([
      ...(isPoiWaypoint(origin.kind) ? [centerOfCell(origin.cell)] : []),
      ...centeredPath,
      ...(isPoiWaypoint(dest.kind) ? [centerOfCell(dest.cell)] : []),
    ]);

    setRouteNetwork('mixta');
    setRoutePath(withPoiCenters);
    setRouteTileCount(path.length);
  }

  function handleComputeRoute() {
    const origin = waypoints.find((w) => w.id === originId);
    const dest = waypoints.find((w) => w.id === destinationId);
    if (!origin || !dest) {
      setRouteError('Selecciona origen y destino.');
      return;
    }
    computeRouteForWaypoints(origin, dest);
  }

  useEffect(() => {
    const onAssistantRoute = (event: Event) => {
      const customEvent = event as CustomEvent<AssistantRouteEventDetail>;
      const detail = customEvent.detail;
      if (!detail || detail.type !== 'highlight-route') return;

      const normalizedDestination = normalizeQuery(detail.destinationLabel ?? '');
      const normalizedOrigin = normalizeQuery(detail.originLabel ?? '');

      const destinationWaypoint =
        (detail.destinationPoiId
          ? waypoints.find((item) => item.id === `db::${detail.destinationPoiId}`)
          : null) ??
        waypoints.find((item) => {
          if (!normalizedDestination) return false;
          const label = normalizeQuery(item.label);
          return label.includes(normalizedDestination) || normalizedDestination.includes(label);
        });

      if (!destinationWaypoint) {
        setRouteError('No pude ubicar ese destino en el mapa actual.');
        return;
      }

      const originWaypoint =
        (detail.originPoiId
          ? waypoints.find((item) => item.id === `db::${detail.originPoiId}`)
          : null) ??
        waypoints.find((item) => {
          if (!normalizedOrigin) return false;
          const label = normalizeQuery(item.label);
          return label.includes(normalizedOrigin) || normalizedOrigin.includes(label);
        }) ??
        waypoints.find((item) => item.id === originId) ??
        waypoints[0];

      if (!originWaypoint || originWaypoint.id === destinationWaypoint.id) {
        setDestinationId(destinationWaypoint.id);
        setRouteError('Selecciona un origen distinto para trazar la ruta.');
        return;
      }

      setOriginId(originWaypoint.id);
      setDestinationId(destinationWaypoint.id);
      computeRouteForWaypoints(originWaypoint, destinationWaypoint);
    };

    window.addEventListener('cuceiverse.assistant.route', onAssistantRoute);
    return () => {
      window.removeEventListener('cuceiverse.assistant.route', onAssistantRoute);
    };
  }, [waypoints, originId, pathCellsSet, traversableWithAsphaltSet]);

  return (
    <section className="modular-read-shell flex flex-col gap-4">
      {/* --- ENCABEZADO --- */}
      <header 
        className="relative flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-slate-700/50 bg-[#070E23]/95 shadow-[0_20px_45px_rgba(2,6,23,0.45)] overflow-hidden"
        style={{ padding: '1rem 2rem' }} 
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-[50px]" />
        </div>

        <div className="relative z-10 flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400/90">
            CUCEIverse
          </p>
          <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
            Mapa modular del campus
          </h1>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <span 
            className="flex items-center gap-2.5 rounded-full border border-slate-700/60 bg-[#0c1631] px-4 py-2 text-[12px] font-medium text-slate-300 shadow-sm" 
            title={statusLabel}
          >
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            {statusLabel}
          </span>

          <div className="inline-flex items-center rounded-full border border-slate-600/50 bg-slate-900/80 p-1 shadow-inner">
            <button
              type="button"
              className={`min-w-[100px] rounded-full px-3 py-2 text-xs font-bold transition-all ${
                viewMode === 'isometric' 
                  ? 'bg-cyan-500 text-cyan-950 shadow-[0_0_15px_rgba(34,211,238,0.4)]' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              onClick={() => setViewMode('isometric')}
            >
              Isométrica
            </button>
            <button
              type="button"
              className={`min-w-[72px] rounded-full px-3 py-2 text-xs font-bold transition-all ${
                viewMode === '2d' 
                  ? 'bg-emerald-500 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              onClick={() => setViewMode('2d')}
            >
              2D
            </button>
          </div>
        </div>
      </header>

      {/* --- PANEL DE NAVEGACIÓN --- */}
      <section 
        className="glass-panel space-y-3 rounded-[28px] border border-slate-700/50 bg-[#070E23]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.45)]"
        style={{ padding: '1rem 2rem' }} 
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-wide bg-gradient-to-r from-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              Navegación del Campus
            </h2>
            <p className="text-[13px] text-slate-400">
              Selecciona origen y destino para trazar una ruta caminable.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 items-end md:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-slate-300 group">
            Origen
            <div className="relative">
              <MapPin size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500/80 transition-colors group-focus-within:text-cyan-400" />
              <select
                className="h-11 w-full rounded-xl border border-slate-600/50 bg-[#0c1631] py-2 pr-4 text-sm text-slate-200 outline-none transition-all hover:border-cyan-500/50 hover:bg-[#0e1a3a] focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                style={{ paddingLeft: '2.75rem' }}
                value={originId}
                onChange={(event) => { setOriginId(event.target.value); setRoutePath([]); setRouteTileCount(0); setRouteError(null); }}
              >
                {waypoints.length === 0 ? (
                  <option value="">Sin puntos en el mapa</option>
                ) : (
                  waypoints.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-slate-300 group">
            Destino
            <div className="relative">
              <Flag size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/80 transition-colors group-focus-within:text-emerald-400" />
              <select
                className="h-11 w-full rounded-xl border border-slate-600/50 bg-[#0c1631] py-2 pr-4 text-sm text-slate-200 outline-none transition-all hover:border-emerald-500/50 hover:bg-[#0e1a3a] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                style={{ paddingLeft: '2.75rem' }}
                value={destinationId}
                onChange={(event) => { setDestinationId(event.target.value); setRoutePath([]); setRouteTileCount(0); setRouteError(null); }}
              >
                {waypoints.length === 0 ? (
                  <option value="">Sin puntos en el mapa</option>
                ) : (
                  waypoints.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="h-11 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-[1.02] hover:from-emerald-400 hover:to-cyan-400 hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none md:min-w-[170px]"
              disabled={!canRoute || routeLoading}
              onClick={handleComputeRoute}
            >
              {routeLoading ? 'Calculando...' : 'Trazar ruta'}
            </button>
          </div>
        </div>
        
        {routeError ? <p className="text-xs text-rose-400">{routeError}</p> : null}
        {routePath.length > 0 ? (
          <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4 space-y-1 text-sm">
            <p className="font-semibold text-emerald-300">
              Ruta trazada — {routeTileCount} celdas ({routeNetwork === 'pasillos' ? 'solo pasillos' : 'pasillos + asfalto'})
            </p>
            <p className="text-slate-400 text-xs">
              {waypoints.find((w) => w.id === originId)?.label ?? originId}
              {' → '}
              {waypoints.find((w) => w.id === destinationId)?.label ?? destinationId}
            </p>
          </div>
        ) : null}
      </section>

      {/* --- CONTENEDOR DEL MAPA ESTILIZADO CON VIÑETA MÁS SUAVE --- */}
      <div 
        className="relative mt-1 mb-12 overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#030610] shadow-[0_20px_50px_rgba(0,0,0,0.6)]" 
        style={{ height: '500px' }} 
      >
        
        {/* Viñeta reducida: Menos spread y blur para que no invada los edificios */}
        <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_40px_15px_#030610]" />
        
        <div className="relative z-0 h-full w-full">
          <ModularMapCanvas
            editorState={viewerState}
            onDropPaletteItem={() => undefined}
            onPathBrushStart={() => undefined}
            onPathBrushMove={() => undefined}
            onPathBrushEnd={() => undefined}
            onErase={() => undefined}
            onEraseEnd={() => undefined}
            onSelect={() => undefined}
            onMoveProp={() => undefined}
            onPlaceBuildingBlock={() => undefined}
            onPlaceProp={() => undefined}
            viewMode={viewMode}
            routePolyline={routePath}
          />
        </div>
      </div>
    </section>
  );
}