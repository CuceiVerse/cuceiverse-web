import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Flag, Layers, MapPin, Plus, Minus } from 'lucide-react';

import { useAuth } from '../../../context/useAuth';
import { fetchModularMapLayout } from '../api/mapaAdmin';
import { cellKey, expandBlockCells } from '../editor/buildingAdjacency';
import { gridAStarPath, snapToPathTile } from '../lib/gridAStar';
import { loadRuntimeSeed } from '../lib/runtimeSeed';
import { useAvatarWalk } from '../hooks/useAvatarWalk';
import { getMyProfile } from '../../../features/auth/api/auth';
import {
  extractFigureFromAvatarValue,
  resolveAvatarImage,
} from "../../../lib/avatarImage";
import { ModularMapCanvas } from './ModularMapCanvas';
import { usePerfViewLoadEnd } from '../../../lib/usePerfViewLoadEnd';
import type {
  BuildingBlock,
  GridCell,
  MapProp,
  ModularBuilding,
  ModularMapSeed,
  ModularMapStoreState,
  PathTile,
  PropKind,
} from "../editor/modularMapTypes";

/** Punto de origen/destino unificado: POI prop del mapa, edificio o POI de BD. */
type MapWaypoint = {
  id: string;
  label: string;
  cell: GridCell;
  kind: "poi-prop" | "building" | "access";
};

type WalkNetwork = "pasillos" | "mixta";
type VisibilityFilters = {
  buildings: boolean;
  services: boolean;
  infrastructure: boolean;
  decoration: boolean;
};

type WaypointCategoryId =
  | 'buildings'
  | 'bathrooms'
  | 'food'
  | 'parking'
  | 'pois';

type WaypointSelectOption = {
  id: string;
  label: string;
  sortKey: string;
};

type WaypointSelectGroup = {
  id: WaypointCategoryId;
  label: string;
  options: WaypointSelectOption[];
};

const EMPTY_BASE_SEED: ModularMapSeed = {
  schemaVersion: 'modular-map@1',
  mapId: 'cucei-main-campus',
  grid: {
    columns: 1,
    rows: 1,
    tileWidth: 1,
    tileHeight: 1,
    origin: { x: 0, y: 0 },
  },
  areaCells: [{ x: 0, y: 0 }],
  buildings: [],
  paths: [],
  props: [],
};

const SERVICE_PROP_KINDS = new Set<PropKind>(["poi", "bathroom", "trash"]);
const INFRA_PROP_KINDS = new Set<PropKind>([
  "asphalt",
  "access-vehicular",
  "access-pedestrian",
  "car",
  "motorcycle",
]);
const DECOR_PROP_KINDS = new Set<PropKind>([
  "tree",
  "shrub",
  "bench",
  "park",
  "track",
]);
const ACCESS_PROP_KINDS = new Set<PropKind>([
  "access-pedestrian",
  "access-vehicular",
]);

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
  type?: "highlight-route";
  destinationPoiId?: string;
  destinationLabel?: string;
  originPoiId?: string;
  originLabel?: string;
};

function centerOfCell(cell: GridCell): { x: number; y: number } {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

function isPoiWaypoint(kind: MapWaypoint["kind"]): boolean {
  return kind === "poi-prop";
}

function getWaypointTarget(
  waypoint: MapWaypoint,
): { targetKind: "building" | "prop"; targetId: string } | null {
  if (waypoint.kind === "building" && waypoint.id.startsWith("building::")) {
    return {
      targetKind: "building",
      targetId: waypoint.id.slice("building::".length),
    };
  }
  if (waypoint.kind === "poi-prop" && waypoint.id.startsWith("prop::")) {
    return { targetKind: "prop", targetId: waypoint.id.slice("prop::".length) };
  }
  return null;
}

function pickBestAccessCellForWaypoint(
  waypoint: MapWaypoint,
  layout: ModularMapSeed,
): GridCell | null {
  const target = getWaypointTarget(waypoint);
  if (!target) return null;

  const candidates = layout.props.filter((prop) => {
    const kind = normalizePropKind(String(prop.kind));
    if (!ACCESS_PROP_KINDS.has(kind)) return false;
    const meta = prop.metadata ?? {};
    return (
      meta.accessTargetKind === target.targetKind &&
      meta.accessTargetId === target.targetId
    );
  });

  if (candidates.length === 0) return null;

  const originCell = waypoint.cell;
  const score = (prop: MapProp): number => {
    const dx = Math.abs(prop.cell.x - originCell.x);
    const dy = Math.abs(prop.cell.y - originCell.y);
    const base = dx + dy;
    // Prioriza peatonal sobre vehicular cuando empatan por distancia.
    const bias = prop.kind === "access-pedestrian" ? -0.25 : 0;
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

function dedupePolyline(
  points: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatWaypointLabel(label: string): string {
  return label
    .replace(/Móduo O/g, 'Módulo O')
    .replace(/Módluo Y/g, 'Módulo Y')
    .replace(/biciletas/g, 'bicicletas');
}

function getWaypointCategory(waypoint: MapWaypoint): WaypointCategoryId {
  const normalizedLabel = normalizeQuery(waypoint.label);

  if (waypoint.kind === 'building') {
    return 'buildings';
  }

  if (
    normalizedLabel.includes('banos') ||
    normalizedLabel.includes('baños') ||
    normalizedLabel.includes('bathroom')
  ) {
    return 'bathrooms';
  }

  if (
    normalizedLabel.includes('cafeter') ||
    normalizedLabel.includes('comida') ||
    normalizedLabel.includes('cta')
  ) {
    return 'food';
  }

  if (
    normalizedLabel.includes('estacionamiento') ||
    normalizedLabel.includes('bicicleta') ||
    normalizedLabel.includes('parking')
  ) {
    return 'parking';
  }

  return 'pois';
}

function buildWaypointSelectGroups(
  waypoints: MapWaypoint[],
): WaypointSelectGroup[] {
  const categories: Record<WaypointCategoryId, WaypointSelectGroup> = {
    buildings: { id: 'buildings', label: 'Edificios y Módulos', options: [] },
    bathrooms: { id: 'bathrooms', label: 'Baños', options: [] },
    food: { id: 'food', label: 'Comida y Cafeterías', options: [] },
    parking: { id: 'parking', label: 'Estacionamientos', options: [] },
    pois: {
      id: 'pois',
      label: 'Puntos de Interés / Auditorios',
      options: [],
    },
  };

  for (const waypoint of waypoints) {
    const label = formatWaypointLabel(waypoint.label);
    const category = getWaypointCategory(waypoint);
    categories[category].options.push({
      id: waypoint.id,
      label,
      sortKey: normalizeQuery(label),
    });
  }

  return [
    categories.buildings,
    categories.bathrooms,
    categories.food,
    categories.parking,
    categories.pois,
  ]
    .map((group) => ({
      ...group,
      options: group.options.sort((left, right) => {
        const bySortKey = left.sortKey.localeCompare(right.sortKey, 'es');
        return bySortKey !== 0 ? bySortKey : left.label.localeCompare(right.label, 'es');
      }),
    }))
    .filter((group) => group.options.length > 0);
}

const VIEW_MODE_STORAGE_KEY = 'cuceiverse.map.viewMode';

function routeLabelAliases(value: string): string[] {
  const normalized = normalizeQuery(value);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  const moduleMatch = normalized.match(/^modulo\s+([a-z0-9]+)$/);
  if (moduleMatch?.[1]) {
    aliases.add(moduleMatch[1]);
  }
  if (normalized === "cta cafeteria") {
    aliases.add("cafeteria");
    aliases.add("cta");
  }
  return [...aliases];
}

function findWaypointForAssistantRoute(
  waypoints: MapWaypoint[],
  label?: string,
): MapWaypoint | null {
  const aliases = routeLabelAliases(label ?? "");
  if (aliases.length === 0) return null;
  const normalizedLabel = normalizeQuery(label ?? "");
  const isModuleReference = /^modulo\s+[a-z0-9]+$/.test(normalizedLabel);

  const exact = waypoints.find((item) => {
    const waypointLabel = normalizeQuery(item.label);
    if (isModuleReference && item.kind !== "building") return false;
    return aliases.includes(waypointLabel);
  });
  if (exact) return exact;

  return (
    waypoints.find((item) => {
      const waypointLabel = normalizeQuery(item.label);
      if (isModuleReference && /banos?\s+modulo/.test(waypointLabel)) {
        return false;
      }
      return aliases.some(
        (alias) =>
          waypointLabel.includes(alias) || alias.includes(waypointLabel),
      );
    }) ?? null
  );
}

function getInitialViewMode(): "isometric" | "2d" {
  if (typeof window === "undefined") {
    return "isometric";
  }
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "2d" ? "2d" : "isometric";
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
  if (!rawSavedAt) return "Mapa actualizado recientemente";
  const parsed = new Date(rawSavedAt);
  if (Number.isNaN(parsed.getTime())) return "Mapa actualizado recientemente";

  const now = new Date();
  const isToday =
    now.getFullYear() === parsed.getFullYear() &&
    now.getMonth() === parsed.getMonth() &&
    now.getDate() === parsed.getDate();

  if (isToday) {
    return "Mapa actualizado hoy";
  }

  return `Mapa actualizado el ${new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed)}`;
}

function normalizePropKind(raw: string): PropKind {
  if (
    raw === "tree" ||
    raw === "access-vehicular" ||
    raw === "access-pedestrian" ||
    raw === "asphalt" ||
    raw === "car" ||
    raw === "motorcycle" ||
    raw === "park" ||
    raw === "bench" ||
    raw === "bathroom" ||
    raw === "poi" ||
    raw === "track" ||
    raw === "shrub" ||
    raw === "trash"
  ) {
    return raw;
  }
  if (raw === "lamp") {
    return "shrub";
  }
  if (
    raw === "access" ||
    raw === "pedestrian_access" ||
    raw === "access_pedestrian"
  ) {
    return "access-pedestrian";
  }
  if (
    raw === "vehicular_access" ||
    raw === "access_vehicle" ||
    raw === "access_vehicular"
  ) {
    return "access-vehicular";
  }
  if (raw === "street") {
    return "asphalt";
  }
  if (raw === "auto" || raw === "vehicle") {
    return "car";
  }
  if (raw === "moto" || raw === "motorbike" || raw === "bike") {
    return "motorcycle";
  }
  return "poi";
}

function normalizeBuildingType(raw: string): ModularBuilding["type"] {
  if (
    raw === "academic" ||
    raw === "administrative" ||
    raw === "services" ||
    raw === "sports" ||
    raw === "research" ||
    raw === "mixed"
  ) {
    return raw;
  }
  return "mixed";
}

function toViewerState(
  layout: ModularMapSeed,
): Pick<
  ModularMapStoreState,
  | "grid"
  | "activeTool"
  | "activePropKind"
  | "activePathMaterial"
  | "activeAreaPaletteId"
  | "activeAreaFootprint"
  | "activeBuildingPaletteId"
  | "activeBuildingFootprint"
  | "activeEraseFootprint"
  | "areaCellsByKey"
  | "blocksById"
  | "buildingsById"
  | "pathsByCell"
  | "propsById"
  | "selection"
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
        sourcePaletteId: "building-2x2",
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
    activeTool: "pan",
    activePropKind: "tree",
    activePathMaterial: "concrete",
    activeAreaPaletteId: "area-2x2",
    activeAreaFootprint: { width: 2, height: 2 },
    activeBuildingPaletteId: "building-2x2",
    activeBuildingFootprint: { width: 2, height: 2 },
    activeEraseFootprint: { width: 1, height: 1 },
    areaCellsByKey,
    blocksById,
    buildingsById,
    pathsByCell,
    propsById,
    selection: null,
  };
}

export function ModularReadOnlyMap() {
  const zoomControllerRef = useRef<{ zoomIn: () => void; zoomOut: () => void; reset: () => void } | null>(null);
  const [baseSeed, setBaseSeed] = useState<ModularMapSeed>(() => loadRuntimeSeed() ?? EMPTY_BASE_SEED);
  const [seedReady, setSeedReady] = useState(() => loadRuntimeSeed() != null);
  const { token } = useAuth();
  const [layout, setLayout] = useState<ModularMapSeed>(baseSeed);
  const [status, setStatus] = useState('Cargando mapa modular...');
  const [isSyncing, setIsSyncing] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [viewMode, setViewMode] = useState<"isometric" | "2d">(
    getInitialViewMode,
  );
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilters>({
    buildings: true,
    services: true,
    infrastructure: true,
    decoration: true,
  });
  /** Ruta visual (puede incluir puntos fraccionales para centro de POI). */
  const [routePath, setRoutePath] = useState<Array<{ x: number; y: number }>>(
    [],
  );
  /** Ruta visual cuando el usuario mueve el avatar manualmente (línea azul). */
  const [manualRoutePath, setManualRoutePath] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [routeTileCount, setRouteTileCount] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeNetwork, setRouteNetwork] = useState<"pasillos" | "mixta">(
    "pasillos",
  );
  const [navOpen, setNavOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [activeTrip, setActiveTrip] = useState<"navigation" | "manual" | null>(
    null,
  );

  usePerfViewLoadEnd({
    path: '/home',
    label: 'Mapa',
    isLoading: !seedReady || isSyncing || !canvasReady,
  });

  useEffect(() => {
    if (seedReady) {
      return;
    }

    let cancelled = false;
    void import('../data/campusModularSeed.json').then((module) => {
      if (cancelled) {
        return;
      }

      const nextSeed = module.default as ModularMapSeed;
      setBaseSeed(nextSeed);
      setLayout(nextSeed);
      setSeedReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [seedReady]);

  const statusLabel = useMemo(() => {
    const normalized = status.toLowerCase();
    if (normalized.includes('cargando')) return 'Sincronizando...';
    if (normalized.includes('seed local')) return 'Modo local';
    if (normalized.includes('mapa actualizado') || normalized.includes('cargado desde filesystem')) return 'Actualizado';
    return 'Listo';
  }, [status]);

  useEffect(() => {
    if (!seedReady) {
      return;
    }

    let cancelled = false;
    setStatus("Cargando mapa modular...");
    setIsSyncing(true);

    fetchModularMapLayout(token, baseSeed.mapId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setLayout(response.data);
        const updatedLabel = formatMapUpdatedLabel(response.meta.savedAt);
        if (response.meta.source === "filesystem") {
          setStatus(`${updatedLabel} (cargado desde filesystem)`);
        } else {
          setStatus(updatedLabel);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLayout(baseSeed);
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
  }, [token, baseSeed, seedReady]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!token) {
      setUserAvatarUrl(null);
      return;
    }
    let cancelled = false;
    getMyProfile(token)
      .then((me) => {
        if (!cancelled) setUserAvatarUrl(me.avatarUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setUserAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const viewerState = useMemo(() => toViewerState(layout), [layout]);
  const layoutVersionKey = useMemo(
    () =>
      [
        layout.mapId,
        layout.grid.columns,
        layout.grid.rows,
        layout.grid.origin.x,
        layout.grid.origin.y,
        layout.areaCells?.length ?? 0,
        layout.buildings.length,
        layout.paths.length,
        layout.props.length,
      ].join(':'),
    [layout],
  );

  const waypoints = useMemo<MapWaypoint[]>(() => {
    const result: MapWaypoint[] = [];
    if (visibility.services) {
      for (const prop of layout.props) {
        if (!SERVICE_PROP_KINDS.has(prop.kind as PropKind)) continue;
        const label = prop.metadata?.label?.trim();
        if (!label) continue;
        result.push({
          id: `prop::${prop.id}`,
          label,
          cell: prop.cell,
          kind: "poi-prop",
        });
      }
    }
    if (visibility.buildings) {
      for (const building of layout.buildings) {
        const label = building.name.trim();
        if (!label) continue;
        const anchor = building.blocks[0]?.anchor ?? { x: 0, y: 0 };
        result.push({
          id: `building::${building.id}`,
          label,
          cell: anchor,
          kind: "building",
        });
      }
    }
    return result;
  }, [
    layout.props,
    layout.buildings,
    visibility.buildings,
    visibility.services,
  ]);

  const validWaypointIds = useMemo(() => {
    const areaKeys = new Set(Object.keys(viewerState.areaCellsByKey));
    return new Set(
      waypoints
        .filter((wp) => areaKeys.has(cellKey(wp.cell)))
        .map((wp) => wp.id),
    );
  }, [viewerState.areaCellsByKey, waypoints]);

  const configuredWaypoints = useMemo(() => {
    return waypoints.filter((wp) => validWaypointIds.has(wp.id));
  }, [validWaypointIds, waypoints]);

  useEffect(() => {
    if (!originId && !destinationId) {
      return;
    }
    const ids = new Set(configuredWaypoints.map((wp) => wp.id));
    if (originId && !ids.has(originId)) {
      setOriginId("");
    }
    if (destinationId && !ids.has(destinationId)) {
      setDestinationId("");
    }
  }, [configuredWaypoints, originId, destinationId]);

  const filteredWaypoints = useMemo(() => {
    return {
      forOrigin: ensureWaypointIncluded(
        configuredWaypoints,
        originId,
        configuredWaypoints,
      ),
      forDestination: ensureWaypointIncluded(
        configuredWaypoints,
        destinationId,
        configuredWaypoints,
      ),
    };
  }, [configuredWaypoints, originId, destinationId]);

  const originWaypointGroups = useMemo(
    () => buildWaypointSelectGroups(filteredWaypoints.forOrigin),
    [filteredWaypoints.forOrigin],
  );

  const destinationWaypointGroups = useMemo(
    () => buildWaypointSelectGroups(filteredWaypoints.forDestination),
    [filteredWaypoints.forDestination],
  );

  const canvasViewerState = useMemo(() => {
    const nextBuildingsById = visibility.buildings
      ? viewerState.buildingsById
      : {};
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
      if (visibility.decoration) nextPropsById[id] = prop;
    }
    return {
      ...viewerState,
      buildingsById: nextBuildingsById,
      blocksById: nextBlocksById,
      propsById: nextPropsById,
    };
  }, [viewerState, visibility]);

  const buildingOccupiedCellsSet = useMemo(() => {
    const set = new Set<string>();
    for (const building of Object.values(viewerState.buildingsById)) {
      for (const cell of building.occupiedCells) {
        set.add(cellKey(cell));
      }
    }
    return set;
  }, [viewerState.buildingsById]);

  const pathCellsSet = useMemo(() => {
    const set = new Set(Object.keys(viewerState.pathsByCell));
    for (const blocked of buildingOccupiedCellsSet) {
      set.delete(blocked);
    }
    return set;
  }, [viewerState.pathsByCell, buildingOccupiedCellsSet]);

  const {
    position: avatarGridPos,
    positionRef: avatarPositionRef,
    walkPath: walkAvatarPath,
    cancel: cancelAvatarWalk,
    habboDirection,
    isMoving: avatarIsMoving,
  } = useAvatarWalk(pathCellsSet, viewMode);

  function computeWalkPathBetweenCells(
    originCell: GridCell,
    destinationCell: GridCell,
  ): { path: GridCell[]; network: WalkNetwork } | null {
    const snappedOrigin = snapToPathTile(originCell, pathCellsSet);
    const snappedDest = snapToPathTile(destinationCell, pathCellsSet);
    const pathOnly =
      snappedOrigin && snappedDest
        ? gridAStarPath(snappedOrigin, snappedDest, pathCellsSet)
        : [];
    if (pathOnly.length >= 2) {
      return { path: pathOnly, network: "pasillos" };
    }
    const snappedOriginMixed = snapToPathTile(
      originCell,
      traversableWithAsphaltSet,
    );
    const snappedDestMixed = snapToPathTile(
      destinationCell,
      traversableWithAsphaltSet,
    );
    if (!snappedOriginMixed || !snappedDestMixed) {
      return null;
    }
    const mixed = gridAStarPath(
      snappedOriginMixed,
      snappedDestMixed,
      traversableWithAsphaltSet,
    );
    if (mixed.length < 2) {
      return null;
    }
    return { path: mixed, network: "mixta" };
  }

  const avatarFigure = useMemo(
    () => extractFigureFromAvatarValue(userAvatarUrl),
    [userAvatarUrl],
  );

  const avatarIdleDirection = viewMode === "isometric" ? 3 : 2;
  const habboAvatarUrl = useMemo(() => {
    const resolved = resolveAvatarImage(userAvatarUrl, {
      size: "n",
      direction: avatarIdleDirection,
      headDirection: avatarIdleDirection,
      action: "std",
      gesture: "std",
      format: "png",
      frame: 0,
    });
    return resolved ?? undefined;
  }, [avatarIdleDirection, userAvatarUrl]);

  useEffect(() => {
    const figure = avatarFigure;
    if (!figure) return;
    const stableDirections = [1, 2, 3];
    stableDirections.forEach((dir) => {
      const idleParams = new URLSearchParams({
        figure,
        size: "s",
        direction: String(dir),
        head_direction: String(dir),
        action: "std",
        gesture: "std",
        frame_num: "0",
        img_format: "png",
      });
      new Image().src = `/habbo-api/render?${idleParams.toString()}`;

      const walkParams = new URLSearchParams({
        figure,
        size: "n",
        direction: String(dir),
        head_direction: String(dir),
        action: "wlk",
        gesture: "std",
        img_format: "gif",
      });
      new Image().src = `/habbo-api/render?${walkParams.toString()}`;
    });
  }, [avatarFigure]);

  const asphaltCellsSet = useMemo(() => {
    const set = new Set<string>();
    for (const prop of Object.values(viewerState.propsById)) {
      if (prop.kind === "asphalt") {
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
    for (const blocked of buildingOccupiedCellsSet) {
      merged.delete(blocked);
    }
    return merged;
  }, [pathCellsSet, asphaltCellsSet, buildingOccupiedCellsSet]);

  const canRoute =
    originId !== "" && destinationId !== "" && originId !== destinationId;

  function computeRouteForWaypoints(origin: MapWaypoint, dest: MapWaypoint) {
    setRouteError(null);
    setRoutePath([]);
    setManualRoutePath([]);
    setRouteTileCount(0);
    setRouteNetwork("pasillos");
    setRouteLoading(true);

    const resolvedOriginCell =
      pickBestAccessCellForWaypoint(origin, layout) ?? origin.cell;
    const resolvedDestCell =
      pickBestAccessCellForWaypoint(dest, layout) ?? dest.cell;
    const resolvedOrigin = { ...origin, cell: resolvedOriginCell };
    const resolvedDest = { ...dest, cell: resolvedDestCell };

    const resolved = computeWalkPathBetweenCells(
      resolvedOrigin.cell,
      resolvedDest.cell,
    );
    if (!resolved) {
      setRouteLoading(false);
      setRouteError(
        "No se encontró ruta caminable. Verifica conectividad.",
      );
      return;
    }

    const { path, network } = resolved;
    const centeredPath = path.map(centerOfCell);
    const withPoiCenters = dedupePolyline([
      ...(isPoiWaypoint(resolvedOrigin.kind)
        ? [centerOfCell(resolvedOrigin.cell)]
        : []),
      ...centeredPath,
      ...(isPoiWaypoint(resolvedDest.kind)
        ? [centerOfCell(resolvedDest.cell)]
        : []),
    ]);

    setRouteNetwork(network);
    setRoutePath(withPoiCenters);
    setRouteTileCount(path.length);
    setRouteLoading(false);
    setActiveTrip("navigation");
    walkAvatarPath(path);
  }

  function handleAvatarCellClick(targetCell: GridCell) {
    setRouteError(null);
    setManualRoutePath([]);

    const currentCell: GridCell = {
      x: Math.round((avatarPositionRef.current?.x ?? avatarGridPos.x) - 0.5),
      y: Math.round((avatarPositionRef.current?.y ?? avatarGridPos.y) - 0.5),
    };

    const resolved = computeWalkPathBetweenCells(currentCell, targetCell);
    if (!resolved) {
      return;
    }

    const centered = resolved.path.map(centerOfCell);
    setManualRoutePath(dedupePolyline(centered));
    setActiveTrip("manual");
    walkAvatarPath(resolved.path);
  }

  function handleCancelTrip() {
    cancelAvatarWalk();
    setActiveTrip(null);
    if (activeTrip === "manual") {
      setManualRoutePath([]);
    }
  }

  function handleComputeRoute() {
    const origin = waypoints.find((w) => w.id === originId);
    const dest = waypoints.find((w) => w.id === destinationId);
    if (!origin || !dest) {
      setRouteError("Selecciona origen y destino.");
      return;
    }
    computeRouteForWaypoints(origin, dest);
  }

  const originLabel =
    waypoints.find((w) => w.id === originId)?.label ?? originId;
  const destinationLabel =
    waypoints.find((w) => w.id === destinationId)?.label ?? destinationId;

  useEffect(() => {
    const onAssistantRoute = (event: Event) => {
      const customEvent = event as CustomEvent<AssistantRouteEventDetail>;
      const detail = customEvent.detail;
      if (!detail || detail.type !== "highlight-route") return;

      const destinationWaypoint = findWaypointForAssistantRoute(
        waypoints,
        detail.destinationLabel,
      );

      if (!destinationWaypoint) {
        setRouteError("No pude ubicar ese destino en el mapa actual.");
        return;
      }

      const originWaypoint =
        findWaypointForAssistantRoute(waypoints, detail.originLabel) ??
        waypoints.find((item) => item.id === originId);

      if (!originWaypoint || originWaypoint.id === destinationWaypoint.id) {
        setDestinationId(destinationWaypoint.id);
        setRouteError("Selecciona un origen distinto para trazar la ruta.");
        return;
      }

      setOriginId(originWaypoint.id);
      setDestinationId(destinationWaypoint.id);
      computeRouteForWaypoints(originWaypoint, destinationWaypoint);
    };

    window.addEventListener("cuceiverse.assistant.route", onAssistantRoute);
    return () => {
      window.removeEventListener(
        "cuceiverse.assistant.route",
        onAssistantRoute,
      );
    };
  }, [waypoints, originId, pathCellsSet, traversableWithAsphaltSet]);

  return (
    <section className="h-full flex flex-col p-4 sm:p-6 lg:p-8 gap-6">
      {/* --- NUEVO DISEÑO DEL HEADER (Espaciado Holgado) --- */}
      <section className="relative flex flex-col rounded-[24px] border border-slate-700/60 bg-[#070E23]/80 backdrop-blur-xl shadow-2xl z-20">
        
        {/* HEADER TOP BAR */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6 border-b border-slate-700/40">
          
          {/* Logo & Title minimalista */}
          <div className="flex items-center">
            <div className="flex flex-col">
              <span className="flex items-center text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400 leading-none mb-1.5">
                <MapPin size={12} style={{ marginRight: '6px' }} />
                CUCEIVERSE
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none">
                Mapa Modular
              </h1>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {avatarIsMoving && (
              <button
                type="button"
                onClick={handleCancelTrip}
                className="flex h-9 items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 transition-colors hover:bg-rose-500/20 hover:border-rose-500/50"
                title="Detener avatar"
              >
                <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse" />
                <span className="text-xs font-bold text-rose-200 uppercase tracking-wide">Detener</span>
              </button>
            )}

            <div
              className="hidden sm:flex h-9 items-center gap-2 rounded-full border border-slate-700/50 bg-slate-800/60 px-4"
              title={statusLabel}
            >
              <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
              <span className="text-xs font-medium text-slate-300">{statusLabel}</span>
            </div>

            <div className="flex h-9 items-center rounded-full border border-slate-700/50 bg-slate-800/60 p-0.5">
              <button
                type="button"
                className={`h-full min-w-[80px] rounded-full px-3 text-xs font-bold transition-all ${
                  viewMode === "isometric"
                    ? "bg-cyan-500 text-cyan-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setViewMode("isometric")}
              >
                Isométrica
              </button>
              <button
                type="button"
                className={`h-full min-w-[60px] rounded-full px-3 text-xs font-bold transition-all ${
                  viewMode === "2d"
                    ? "bg-emerald-500 text-emerald-950 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                    : "text-slate-400 hover:text-white"
                }`}
                onClick={() => setViewMode("2d")}
              >
                2D
              </button>
            </div>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/50 bg-slate-800/60 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              onClick={() => setNavOpen(!navOpen)}
              title={navOpen ? "Ocultar controles" : "Mostrar controles"}
            >
              {navOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE FORM BODY */}
        <div
          style={{
            maxHeight: navOpen ? "800px" : "0px",
            opacity: navOpen ? 1 : 0,
            transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            overflow: "visible", 
          }}
        >
          <div className="px-6 py-6 sm:px-8 sm:py-7 flex flex-col space-y-6">

            <div 
              className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-8 items-end" 
              style={{ gap: '2rem' }} 
            >
              
              {/* Origen */}
              <label className="flex flex-col gap-3 text-[13px] font-medium text-slate-300 group" style={{ minWidth: '200px' }}>
                Punto de partida
                <div className="relative">
                  <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500/80 group-focus-within:text-cyan-400" />
                  <select
                    className="h-12 w-full rounded-xl border border-slate-600/50 bg-[#0c1631] text-sm text-slate-200 outline-none transition-all hover:border-cyan-500/50 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 appearance-none"
                    style={{ paddingLeft: '3rem', paddingRight: '2rem' }}
                    value={originId}
                    onChange={(e) => {
                      setOriginId(e.target.value);
                      setRoutePath([]);
                      setRouteTileCount(0);
                      setRouteError(null);
                    }}
                  >
                    <option value="">Seleccionar origen...</option>
                    {originWaypointGroups.map((group) => (
                      <optgroup key={group.id} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </label>

              {/* Destino */}
              <label className="flex flex-col gap-3 text-[13px] font-medium text-slate-300 group" style={{ minWidth: '200px' }}>
                Destino
                <div className="relative">
                  <Flag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/80 group-focus-within:text-emerald-400" />
                  <select
                    className="h-12 w-full rounded-xl border border-slate-600/50 bg-[#0c1631] text-sm text-slate-200 outline-none transition-all hover:border-emerald-500/50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 appearance-none"
                    style={{ paddingLeft: '3rem', paddingRight: '2rem' }}
                    value={destinationId}
                    onChange={(e) => {
                      setDestinationId(e.target.value);
                      setRoutePath([]);
                      setRouteTileCount(0);
                      setRouteError(null);
                    }}
                  >
                    <option value="">Seleccionar destino...</option>
                    {destinationWaypointGroups.map((group) => (
                      <optgroup key={group.id} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </label>

              {/* Filtros Dropdown */}
              <div className="relative flex flex-col gap-3">
                <span className="text-[13px] font-medium text-slate-300">Vista del mapa</span>
                <button
                  type="button"
                  className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-600/50 bg-[#0c1631] px-5 text-sm text-slate-200 hover:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
                  onClick={() => setLayersOpen(!layersOpen)}
                >
                  <span className="flex items-center">
                    <Layers size={16} className="text-slate-400 mr-2" />
                    Capas activas
                  </span>
                  <span className="text-xs font-bold text-cyan-400 ml-2">
                    {Object.values(visibility).filter(Boolean).length}/4
                  </span>
                </button>

                {/* Dropdown flotante */}
                {layersOpen && (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-[100] w-[min(18rem,100vw)] rounded-xl border border-slate-600 bg-[#070E23] p-5 shadow-2xl shadow-black/80">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Elementos visibles</p>
                    <div className="flex flex-col gap-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 accent-cyan-500 bg-slate-800 border-slate-600 rounded" checked={visibility.buildings} onChange={(e) => { setVisibility((c) => ({ ...c, buildings: e.target.checked })); setRoutePath([]); }} />
                        <span className="text-sm text-slate-200">Edificios y Módulos</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 accent-cyan-500 bg-slate-800 border-slate-600 rounded" checked={visibility.services} onChange={(e) => { setVisibility((c) => ({ ...c, services: e.target.checked })); setRoutePath([]); }} />
                        <span className="text-sm text-slate-200">Servicios (POIs)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 accent-cyan-500 bg-slate-800 border-slate-600 rounded" checked={visibility.infrastructure} onChange={(e) => setVisibility((c) => ({ ...c, infrastructure: e.target.checked }))} />
                        <span className="text-sm text-slate-200">Infraestructura y Vías</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 accent-cyan-500 bg-slate-800 border-slate-600 rounded" checked={visibility.decoration} onChange={(e) => setVisibility((c) => ({ ...c, decoration: e.target.checked }))} />
                        <span className="text-sm text-slate-200">Vegetación y Decoración</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-[1.02] hover:from-emerald-400 hover:to-cyan-400 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none lg:min-w-[140px]"
                disabled={!canRoute || routeLoading}
                onClick={handleComputeRoute}
              >
                {routeLoading ? "Calculando..." : "Trazar ruta"}
              </button>
            </div>

            {routeError && <p className="text-xs font-medium text-rose-400">{routeError}</p>}
            
            {routePath.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 mt-2">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Ruta establecida</p>
                  <p className="text-sm text-slate-300">{originLabel} → {destinationLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 mb-1">Distancia aprox.</p>
                  <p className="text-sm font-semibold text-emerald-300">{routeTileCount} celdas ({routeNetwork === "pasillos" ? "solo pasillos" : "mixta"})</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --- CONTENEDOR DEL MAPA --- */}
      <div className="relative flex-1 rounded-[24px] border border-slate-700/50 bg-[#030610] shadow-2xl overflow-hidden z-0">
        <div className="relative z-0 h-full w-full">
          {isSyncing && (
            <div className="absolute inset-0 z-[80] flex items-center justify-center bg-[#030610]/80 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
                <p className="text-sm font-bold tracking-widest text-cyan-400 uppercase">
                  Sincronizando...
                </p>
              </div>
            </div>
          )}
          
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
            manualRoutePolyline={manualRoutePath}
            onCellClick={handleAvatarCellClick}
            avatarPosition={avatarGridPos}
            avatarPositionRef={avatarPositionRef}
            avatarFigure={avatarFigure ?? undefined}
            avatarDirection={habboDirection}
            avatarIsMoving={avatarIsMoving}
            avatarImageUrl={habboAvatarUrl}
            onFirstFrameRendered={() => setCanvasReady(true)}
            controllerRef={zoomControllerRef}
            layoutVersionKey={layoutVersionKey}
            autoRefitOnViewportResize
          />

          {/* Floating zoom controls (top-right) */}
          <div className="absolute top-4 right-4 z-[90] flex flex-col gap-2">
            <button
              type="button"
              onClick={() => zoomControllerRef.current?.zoomIn()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/80 border border-slate-700 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              onClick={() => zoomControllerRef.current?.zoomOut()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/80 border border-slate-700 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800"
            >
              <Minus size={18} />
            </button>
          </div>

          {/* Sombra de viñeta forzada AL FINAL del DOM */}
          <div className="pointer-events-none absolute inset-0 z-[100] rounded-[24px] shadow-[inset_0_20px_40px_rgba(0,0,0,0.5)]" />
        </div>
      </div>
    </section>
  );
}