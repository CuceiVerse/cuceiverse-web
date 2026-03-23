import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Flag, MapPin } from 'lucide-react';

import { useAuth } from '../../../context/useAuth';
import { fetchModularMapLayout } from '../api/mapaAdmin';
import campusModularSeed from '../data/campusModularSeed.json';
import { cellKey, expandBlockCells } from '../editor/buildingAdjacency';
import { gridAStarPath, snapToPathTile } from '../lib/gridAStar';
import { loadRuntimeSeed } from '../lib/runtimeSeed';
import { useAvatarWalk } from '../hooks/useAvatarWalk';
import { getMyProfile } from '../../../features/auth/api/auth';
import { ModularMapCanvas } from './ModularMapCanvas';
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
  kind: 'poi-prop' | 'building' | 'access';
};
type VisibilityFilters = {
  buildings: boolean;
  services: boolean;
  infrastructure: boolean;
  decoration: boolean;
};

const SERVICE_PROP_KINDS = new Set<PropKind>(['poi', 'bathroom', 'trash']);
const INFRA_PROP_KINDS = new Set<PropKind>(['asphalt', 'access-vehicular', 'access-pedestrian', 'car', 'motorcycle']);
const DECOR_PROP_KINDS = new Set<PropKind>(['tree', 'shrub', 'bench', 'park', 'track']);
const ACCESS_PROP_KINDS = new Set<PropKind>(['access-pedestrian', 'access-vehicular']);

function ensureWaypointIncluded(
  candidates: MapWaypoint[],
  selectedId: string,
  fallback: MapWaypoint[],
): MapWaypoint[] {
  if (!selectedId) return candidates;
  if (candidates.some((w) => w.id === selectedId)) return candidates;
  const selected = fallback.find((w) => w.id === selectedId);
  return selected ? [selected, ...candidates] : candidates;
}

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
  return kind === 'poi-prop';
}

function getWaypointTarget(waypoint: MapWaypoint): { targetKind: 'building' | 'prop'; targetId: string } | null {
  if (waypoint.kind === 'building' && waypoint.id.startsWith('building::')) {
    return { targetKind: 'building', targetId: waypoint.id.slice('building::'.length) };
  }
  if (waypoint.kind === 'poi-prop' && waypoint.id.startsWith('prop::')) {
    return { targetKind: 'prop', targetId: waypoint.id.slice('prop::'.length) };
  }
  return null;
}

function pickBestAccessCellForWaypoint(waypoint: MapWaypoint, layout: ModularMapSeed): GridCell | null {
  const target = getWaypointTarget(waypoint);
  if (!target) return null;

  const candidates = layout.props.filter((prop) => {
    const kind = normalizePropKind(String(prop.kind));
    if (!ACCESS_PROP_KINDS.has(kind)) return false;
    const meta = prop.metadata ?? {};
    return meta.accessTargetKind === target.targetKind && meta.accessTargetId === target.targetId;
  });

  if (candidates.length === 0) return null;

  const originCell = waypoint.cell;
  const score = (prop: MapProp): number => {
    const dx = Math.abs(prop.cell.x - originCell.x);
    const dy = Math.abs(prop.cell.y - originCell.y);
    const base = dx + dy;
    // Prioriza peatonal sobre vehicular cuando empatan por distancia.
    const bias = prop.kind === 'access-pedestrian' ? -0.25 : 0;
    return base + bias;
  };

  let best = candidates[0];
  let bestScore = score(best);
  for (let i = 1; i < candidates.length; i += 1) {
    const next = candidates[i];
    const nextScore = score(next);
    if (nextScore < bestScore) {
      best = next;
      bestScore = nextScore;
    }
  }

  return best.cell;
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
  const [isSyncing, setIsSyncing] = useState(true);
  const [viewMode, setViewMode] = useState<'isometric' | '2d'>(getInitialViewMode);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilters>({
    buildings: true,
    services: true,
    infrastructure: true,
    decoration: true,
  });
  /** Ruta visual (puede incluir puntos fraccionales para centro de POI). */
  const [routePath, setRoutePath] = useState<Array<{ x: number; y: number }>>([]);
  const [routeTileCount, setRouteTileCount] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeNetwork, setRouteNetwork] = useState<'pasillos' | 'mixta'>('pasillos');
  const [navOpen, setNavOpen] = useState(true);

  const statusLabel = useMemo(() => {
    const normalized = status.toLowerCase();
    if (normalized.includes('cargando')) return 'Sincronizando mapa...';
    if (normalized.includes('seed local')) return 'Modo local activo';
    if (normalized.includes('mapa actualizado')) return status;
    return 'Mapa listo';
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setStatus('Cargando mapa modular...');
    setIsSyncing(true);

    fetchModularMapLayout(token, fallbackSeed.mapId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setLayout(response.data);
        const updatedLabel = formatMapUpdatedLabel(response.meta.savedAt);
        if (response.meta.source === 'filesystem') {
          setStatus(`${updatedLabel} (cargado desde filesystem)`);
        } else {
          setStatus(updatedLabel);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLayout(fallbackSeed);
        setStatus('No se pudo cargar layout remoto, usando seed local.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, fallbackSeed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // Load user avatar from profile
  useEffect(() => {
    if (!token) { setUserAvatarUrl(null); return; }
    let cancelled = false;
    getMyProfile(token)
      .then((me) => { if (!cancelled) setUserAvatarUrl(me.avatarUrl ?? null); })
      .catch(() => { if (!cancelled) setUserAvatarUrl(null); });
    return () => { cancelled = true; };
  }, [token]);

  const viewerState = useMemo(() => toViewerState(layout), [layout]);

  // ── Waypoints unificados: POI props del mapa + edificios + POIs de BD ───────
  const waypoints = useMemo<MapWaypoint[]>(() => {
    const result: MapWaypoint[] = [];

    // 1) POI props colocados en el editor (kind === 'poi' con etiqueta)
    if (visibility.services) {
      for (const prop of layout.props) {
        if (prop.kind !== 'poi') continue;
        const label = prop.metadata?.label?.trim();
        if (!label) continue;
        result.push({ id: `prop::${prop.id}`, label, cell: prop.cell, kind: 'poi-prop' });
      }
    }

    // 2) Edificios creados en el editor (con nombre)
    if (visibility.buildings) {
      for (const building of layout.buildings) {
        if (!building.name.trim()) continue;
        // Calcular celda centroide del primer bloque
        const anchor = building.blocks[0]?.anchor ?? { x: 0, y: 0 };
        result.push({
          id: `building::${building.id}`,
          label: building.name,
          cell: anchor,
          kind: 'building',
        });
      }
    }

    // 3) Puntos de acceso (props access-*)
    if (visibility.infrastructure) {
      for (const prop of layout.props) {
        const kind = normalizePropKind(String(prop.kind));
        if (kind !== 'access-pedestrian' && kind !== 'access-vehicular') continue;
        const label = kind === 'access-pedestrian' ? 'Acceso peatonal' : 'Acceso vehicular';
        result.push({
          id: `access::${prop.id}`,
          label,
          cell: prop.cell,
          kind: 'access',
        });
      }
    }

    return result;
  }, [layout.props, layout.buildings, visibility.buildings, visibility.services, visibility.infrastructure]);

  const filteredWaypoints = useMemo(() => {
    return {
      forOrigin: ensureWaypointIncluded(waypoints, originId, waypoints),
      forDestination: ensureWaypointIncluded(waypoints, destinationId, waypoints),
    };
  }, [waypoints, originId, destinationId]);

  const canvasViewerState = useMemo(() => {
    const nextBuildingsById = visibility.buildings ? viewerState.buildingsById : {};
    const nextBlocksById = visibility.buildings ? viewerState.blocksById : {};

    const nextPropsById: Record<string, MapProp> = {};
    for (const [id, prop] of Object.entries(viewerState.propsById)) {
      const kind = prop.kind as PropKind;

      if (SERVICE_PROP_KINDS.has(kind)) {
        if (visibility.services) nextPropsById[id] = prop;
        continue;
      }

      if (INFRA_PROP_KINDS.has(kind)) {
        if (visibility.infrastructure) nextPropsById[id] = prop;
        continue;
      }

      if (DECOR_PROP_KINDS.has(kind)) {
        if (visibility.decoration) nextPropsById[id] = prop;
        continue;
      }

      // Por defecto, tratamos props desconocidos como decoración.
      if (visibility.decoration) nextPropsById[id] = prop;
    }

    return {
      ...viewerState,
      buildingsById: nextBuildingsById,
      blocksById: nextBlocksById,
      propsById: nextPropsById,
    };
  }, [viewerState, visibility]);

  // Celdas ocupadas por edificios (colisión)
  const buildingOccupiedCellsSet = useMemo(() => {
    const set = new Set<string>();
    for (const building of Object.values(viewerState.buildingsById)) {
      for (const cell of building.occupiedCells) {
        set.add(cellKey(cell));
      }
    }
    return set;
  }, [viewerState.buildingsById]);

  // Set de celdas de pasillo para el A* (excluye edificios)
  const pathCellsSet = useMemo(() => {
    const set = new Set(Object.keys(viewerState.pathsByCell));
    for (const blocked of buildingOccupiedCellsSet) {
      set.delete(blocked);
    }
    return set;
  }, [viewerState.pathsByCell, buildingOccupiedCellsSet]);

  // ── Avatar on map (needs pathCellsSet) ──────────────────────────────
  const { position: avatarGridPos, walk: walkAvatar, habboDirection, walkFrame, isMoving: avatarIsMoving } = useAvatarWalk(pathCellsSet);

  // Build a direction-aware Habbo sprite URL
  const habboAvatarUrl = useMemo(() => {
    if (!userAvatarUrl) return undefined;
    const trimmed = userAvatarUrl.trim();
    // Only figure strings (e.g. "hd-180-1.ch-215-62") are valid — skip plain URLs
    if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('/')) return undefined;
    if (!trimmed.includes('.') || !trimmed.includes('-')) return undefined;

    // Use GIF while walking to avoid swapping PNG frames every ~120ms.
    // This prevents visible flicker (accessories blinking) when the renderer/cache
    // can’t keep up with many rapid per-frame requests.
    const isGif = avatarIsMoving;

    const params = new URLSearchParams({
      figure: trimmed,
      size: 'n',                                        // normal size sprite
      direction: String(habboDirection),                // 0-7 Habbo direction
      head_direction: String(habboDirection),
      action: avatarIsMoving ? 'wlk' : 'std',          // walking or idle pose
      gesture: 'std',
      ...(isGif ? {} : { frame_num: String(walkFrame) }),
      img_format: isGif ? 'gif' : 'png',
    });
    return `/habbo-api/render?${params.toString()}`;
  }, [userAvatarUrl, habboDirection, walkFrame, avatarIsMoving]);

  // Pre-load all avatar variations for the current user to avoid lag during walking
  useEffect(() => {
    if (!userAvatarUrl) return;
    const trimmed = userAvatarUrl.trim();
    if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('/') || !trimmed.includes('.') || !trimmed.includes('-')) return;

    const directions = [0, 1, 2, 3, 4, 5, 6, 7];

    // Pre-load each direction and action
    directions.forEach(dir => {
      // 1. Idle frame
      const idleParams = new URLSearchParams({
        figure: trimmed,
        size: 'n',
        direction: String(dir),
        head_direction: String(dir),
        action: 'std',
        gesture: 'std',
        frame_num: '0',
        img_format: 'png',
      });
      new Image().src = `/habbo-api/render?${idleParams.toString()}`;

      // 2. Walking animation (GIF)
      const walkParams = new URLSearchParams({
        figure: trimmed,
        size: 'n',
        direction: String(dir),
        head_direction: String(dir),
        action: 'wlk',
        gesture: 'std',
        img_format: 'gif',
      });
      new Image().src = `/habbo-api/render?${walkParams.toString()}`;
    });
    console.log(`[AvatarPreloader] Batch pre-loading initiated for: ${trimmed}`);
  }, [userAvatarUrl]);

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
    // Los edificios bloquean tránsito incluso sobre asfalto/pasillos
    for (const blocked of buildingOccupiedCellsSet) {
      merged.delete(blocked);
    }
    return merged;
  }, [pathCellsSet, asphaltCellsSet, buildingOccupiedCellsSet]);

  const canRoute = originId !== '' && destinationId !== '' && originId !== destinationId;

  function computeRouteForWaypoints(origin: MapWaypoint, dest: MapWaypoint) {
    setRouteError(null);
    setRoutePath([]);
    setRouteTileCount(0);
    setRouteNetwork('pasillos');

    setRouteLoading(true);

    const resolvedOriginCell = pickBestAccessCellForWaypoint(origin, layout) ?? origin.cell;
    const resolvedDestCell = pickBestAccessCellForWaypoint(dest, layout) ?? dest.cell;
    const resolvedOrigin = { ...origin, cell: resolvedOriginCell };
    const resolvedDest = { ...dest, cell: resolvedDestCell };

    // 1) Intento principal: solo pasillos
    const snappedOriginPath = snapToPathTile(resolvedOrigin.cell, pathCellsSet);
    const snappedDestPath = snapToPathTile(resolvedDest.cell, pathCellsSet);
    const pathOnly =
      snappedOriginPath && snappedDestPath
        ? gridAStarPath(snappedOriginPath, snappedDestPath, pathCellsSet)
        : [];

    if (pathOnly.length > 0) {
      const centeredPath = pathOnly.map(centerOfCell);
      const withPoiCenters = dedupePolyline([
        ...(isPoiWaypoint(resolvedOrigin.kind) ? [centerOfCell(resolvedOrigin.cell)] : []),
        ...centeredPath,
        ...(isPoiWaypoint(resolvedDest.kind) ? [centerOfCell(resolvedDest.cell)] : []),
      ]);
      setRoutePath(withPoiCenters);
      setRouteTileCount(pathOnly.length);
      setRouteNetwork('pasillos');
      setRouteLoading(false);
      return;
    }

    // 2) Fallback: pasillos + asfalto
    const snappedOriginMixed = snapToPathTile(resolvedOrigin.cell, traversableWithAsphaltSet);
    const snappedDestMixed = snapToPathTile(resolvedDest.cell, traversableWithAsphaltSet);

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
      ...(isPoiWaypoint(resolvedOrigin.kind) ? [centerOfCell(resolvedOrigin.cell)] : []),
      ...centeredPath,
      ...(isPoiWaypoint(resolvedDest.kind) ? [centerOfCell(resolvedDest.cell)] : []),
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

  const originLabel = waypoints.find((w) => w.id === originId)?.label ?? originId;
  const destinationLabel = waypoints.find((w) => w.id === destinationId)?.label ?? destinationId;

  useEffect(() => {
    const onAssistantRoute = (event: Event) => {
      const customEvent = event as CustomEvent<AssistantRouteEventDetail>;
      const detail = customEvent.detail;
      if (!detail || detail.type !== 'highlight-route') return;

      const normalizedDestination = normalizeQuery(detail.destinationLabel ?? '');
      const normalizedOrigin = normalizeQuery(detail.originLabel ?? '');

      const destinationWaypoint =
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
        waypoints.find((item) => {
          if (!normalizedOrigin) return false;
          const label = normalizeQuery(item.label);
          return label.includes(normalizedOrigin) || normalizedOrigin.includes(label);
        }) ?? waypoints.find((item) => item.id === originId);

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
    <section className="modular-read-shell h-full flex flex-col p-3 sm:p-6 gap-4 overflow-hidden">
      {/* --- ENCABEZADO Y PANEL DE NAVEGACIÓN COMBINADOS --- */}
      <section className="glass-panel relative flex flex-col rounded-[28px] border border-slate-700/50 bg-[#070E23]/95 shadow-[0_20px_45px_rgba(2,6,23,0.45)] overflow-hidden">
        {/* Decorative background blur */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-[50px]" />
        </div>

        {/* --- ALWAYS VISIBLE HEADER --- */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6 px-4 py-4 sm:px-8 sm:py-5">
          {/* Clickable Title Area to toggle Navigation */}
          <button
            type="button"
            onClick={() => setNavOpen((prev) => !prev)}
            className="group flex flex-col gap-1 text-left transition-opacity hover:opacity-90"
            title="Desplegar/Ocultar controles de navegación"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400/90 flex items-center gap-2">
              CUCEIverse
              <span className="text-[10px] lowercase tracking-normal text-slate-500 font-normal">
                {navOpen ? '(Ocultar navegación)' : '(Mostrar navegación)'}
              </span>
            </p>
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl flex items-center gap-3">
              Mapa modular del campus
              <span
                className="flex-none text-slate-400 transition-transform duration-300 group-hover:text-cyan-400"
                style={{ transform: navOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <ChevronDown size={22} />
              </span>
            </h1>
          </button>

          {/* Controls Area (Status & View Toggle) */}
          <div className="flex flex-wrap items-center gap-4">
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
                className={`min-w-[100px] rounded-full px-3 py-2 text-xs font-bold transition-all ${viewMode === 'isometric'
                    ? 'bg-cyan-500 text-cyan-950 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                onClick={() => setViewMode('isometric')}
              >
                Isométrica
              </button>
              <button
                type="button"
                className={`min-w-[72px] rounded-full px-3 py-2 text-xs font-bold transition-all ${viewMode === '2d'
                    ? 'bg-emerald-500 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                onClick={() => setViewMode('2d')}
              >
                2D
              </button>
            </div>
          </div>
        </div>

        {/* --- COLLAPSIBLE NAVIGATION BODY --- */}
        <div
          style={{
            maxHeight: navOpen ? 'min(70vh, 640px)' : '0px',
            transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
          className="relative z-10"
        >
          {/* Inner padding for formatting the dropdown content */}
          <div className="border-t border-slate-700/50 px-4 py-4 sm:px-8 sm:py-5 space-y-4">
            {!navOpen ? null : (
              <p className="text-[13px] text-slate-400">
                Selecciona origen y destino para trazar una ruta caminable.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 items-end md:grid-cols-[1fr_1fr_1fr_auto]">
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
                    <option value="">Selecciona...</option>
                    {filteredWaypoints.forOrigin.map((wp) => (
                      <option key={wp.id} value={wp.id}>
                        {wp.label}
                      </option>
                    ))}
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
                    <option value="">Selecciona...</option>
                    {filteredWaypoints.forDestination.map((wp) => (
                      <option key={wp.id} value={wp.id}>
                        {wp.label}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <div className="flex flex-col gap-1.5 text-[13px] font-medium text-slate-300">
                Mostrar
                <div className="rounded-xl border border-slate-600/50 bg-[#0c1631] px-4 py-2.5 text-sm text-slate-200">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={visibility.buildings}
                      onChange={(event) => {
                        setVisibility((current) => ({ ...current, buildings: event.target.checked }));
                        setRoutePath([]);
                        setRouteTileCount(0);
                        setRouteError(null);
                      }}
                    />
                    <span>Edificios</span>
                  </label>
                  <label className="mt-1.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={visibility.services}
                      onChange={(event) => {
                        setVisibility((current) => ({ ...current, services: event.target.checked }));
                        setRoutePath([]);
                        setRouteTileCount(0);
                        setRouteError(null);
                      }}
                    />
                    <span>Servicios (POIs)</span>
                  </label>
                  <label className="mt-1.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={visibility.infrastructure}
                      onChange={(event) => {
                        setVisibility((current) => ({ ...current, infrastructure: event.target.checked }));
                      }}
                    />
                    <span>Infraestructura</span>
                  </label>
                  <label className="mt-1.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={visibility.decoration}
                      onChange={(event) => {
                        setVisibility((current) => ({ ...current, decoration: event.target.checked }));
                      }}
                    />
                    <span>Decoración</span>
                  </label>
                </div>
              </div>
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
              <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4 space-y-1 text-sm mt-4">
                <p className="font-semibold text-emerald-300">
                  Ruta trazada — {routeTileCount} celdas ({routeNetwork === 'pasillos' ? 'solo pasillos' : 'pasillos + asfalto'})
                </p>
                <p className="text-slate-400 text-xs">
                  {originLabel}
                  {' → '}
                  {destinationLabel}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>


      {/* --- CONTENEDOR DEL MAPA ESTILIZADO CON VIÑETA MÁS SUAVE --- */}
      <div
        className="relative flex-1 overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#030610] shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      >

        {/* Viñeta reducida: Menos spread y blur para que no invada los edificios */}
        <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_40px_15px_#030610]" />

        <div className="relative z-0 h-full w-full">
          {isSyncing ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#030610]/80 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
                <p className="text-sm font-bold tracking-widest text-cyan-400 uppercase">Sincronizando satélite...</p>
              </div>
            </div>
          ) : null}
          <ModularMapCanvas
            editorState={canvasViewerState}
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
            onCellClick={walkAvatar}
            avatarPosition={avatarGridPos}
            avatarImageUrl={habboAvatarUrl}
          />
        </div>
      </div>
    </section>
  );
}