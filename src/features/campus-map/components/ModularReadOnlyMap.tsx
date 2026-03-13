import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../context/useAuth';
import { fetchModularMapLayout } from '../api/mapaAdmin';
import campusModularSeed from '../data/campusModularSeed.json';
import { cellKey, expandBlockCells } from '../editor/buildingAdjacency';
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

const fallbackSeed = campusModularSeed as ModularMapSeed;
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
  const { token } = useAuth();
  const [layout, setLayout] = useState<ModularMapSeed>(fallbackSeed);
  const [status, setStatus] = useState('Cargando mapa modular...');
  const [viewMode, setViewMode] = useState<'isometric' | '2d'>(getInitialViewMode);

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
        setStatus(`Mapa cargado (${response.meta.savedAt}).`);
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

  const viewerState = useMemo(() => toViewerState(layout), [layout]);

  return (
    <section className="modular-read-shell">
      <header className="modular-read-header glass-panel">
        <div>
          <p className="modular-read-eyebrow">CUCEIverse</p>
          <h1>Mapa modular del campus</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-600 overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1 text-xs font-semibold transition-colors ${viewMode === 'isometric' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              onClick={() => setViewMode('isometric')}
            >
              Isométrica
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-xs font-semibold transition-colors ${viewMode === '2d' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              onClick={() => setViewMode('2d')}
            >
              2D
            </button>
          </div>
          <span>{status}</span>
        </div>
      </header>

      <div className="modular-read-canvas glass-panel">
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
        />
      </div>
    </section>
  );
}
