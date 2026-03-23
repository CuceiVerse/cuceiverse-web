import { create } from 'zustand';

import campusModularSeed from '../data/campusModularSeed.json';
import {
  canPlaceBlock,
  cellKey,
  expandBlockCells,
  getBuildingIdAtCell,
  recomputeBuildings,
} from './buildingAdjacency';
import {
  type BlockFootprint,
  type BuildingBlock,
  type BuildingLabelDraft,
  type BuildingType,
  type GridCell,
  type MapProp,
  type ModularMapSavePayload,
  type ModularMapSeed,
  type ModularMapStoreState,
  type PathTile,
  type PropKind,
} from './modularMapTypes';

const DEFAULT_BUILDING_PRESET = {
  paletteId: 'building-2x2',
  footprint: { width: 2, height: 2 } as BlockFootprint,
};

const DEFAULT_AREA_PRESET = {
  paletteId: 'area-2x2',
  footprint: { width: 2, height: 2 } as BlockFootprint,
};

const BUILDING_PRESETS: Record<string, BlockFootprint> = {
  'building-1x1': { width: 1, height: 1 },
  'building-2x2': { width: 2, height: 2 },
  'building-3x2': { width: 3, height: 2 },
  'building-4x2': { width: 4, height: 2 },
  'building-3x3': { width: 3, height: 3 },
};

const AREA_PRESETS: Record<string, BlockFootprint> = {
  'area-1x1': { width: 1, height: 1 },
  'area-2x2': { width: 2, height: 2 },
  'area-4x4': { width: 4, height: 4 },
  'area-8x8': { width: 8, height: 8 },
};

function resolveBlockFootprint(
  paletteId?: string,
  explicit?: BlockFootprint,
  fallback: BlockFootprint = DEFAULT_BUILDING_PRESET.footprint,
): BlockFootprint {
  if (explicit && explicit.width > 0 && explicit.height > 0) {
    return explicit;
  }

  if (paletteId && BUILDING_PRESETS[paletteId]) {
    return BUILDING_PRESETS[paletteId];
  }

  return fallback;
}

type ModularMapStore = ModularMapStoreState & {
  hydrateFromSeed: (seed: ModularMapSeed) => void;
  setActiveTool: (tool: ModularMapStoreState['activeTool']) => void;
  setActivePropKind: (kind: PropKind) => void;
  setActiveAreaPreset: (paletteId: string, footprint?: BlockFootprint) => void;
  setActiveBuildingPreset: (paletteId: string, footprint?: BlockFootprint) => void;
  expandArea: (anchor: GridCell, paletteId?: string, footprint?: BlockFootprint) => { ok: boolean; reason?: string };
  placeBuildingBlock: (anchor: GridCell, paletteId?: string, footprint?: BlockFootprint) => {
    ok: boolean;
    reason?: string;
    buildingId?: string;
    createdNewBuilding?: boolean;
  };
  paintPathCell: (cell: GridCell, material?: PathTile['material']) => { ok: boolean; reason?: string };
  paintPathStroke: (cells: GridCell[], material?: PathTile['material']) => void;
  clearBrushStroke: () => void;
  placeProp: (cell: GridCell, kind?: PropKind, overrides?: Partial<MapProp>) => { ok: boolean; reason?: string; propId?: string };
  moveProp: (id: string, cell: GridCell) => { ok: boolean; reason?: string };
  updatePropMetadata: (id: string, metadata: Record<string, string>) => { ok: boolean; reason?: string };
  eraseAt: (cell: GridCell) => void;
  openBuildingLabelModal: (buildingId: string | null) => void;
  selectAt: (cell: GridCell) => void;
  clearSelection: () => void;
  updateBuildingLabel: (draft: BuildingLabelDraft) => void;
  serializeForSave: () => ModularMapSavePayload;
};

function createInitialCounters(seed: ModularMapSeed): ModularMapStoreState['lastGeneratedIds'] {
  const getMaxNumericSuffix = (ids: string[], prefix: string): number => {
    let max = 0;
    for (const id of ids) {
      const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (!match) {
        continue;
      }
      const numeric = Number.parseInt(match[1], 10);
      if (Number.isFinite(numeric) && numeric > max) {
        max = numeric;
      }
    }
    return max;
  };

  const blockIds = seed.buildings.flatMap((building) => building.blocks.map((block) => block.id));
  const buildingIds = seed.buildings.map((building) => building.id);
  const propIds = seed.props.map((prop) => prop.id);

  const blockCount = seed.buildings.reduce((sum, building) => sum + building.blocks.length, 0);
  const blockMax = getMaxNumericSuffix(blockIds, 'block');
  const buildingMax = getMaxNumericSuffix(buildingIds, 'building');
  const propMax = getMaxNumericSuffix(propIds, 'prop');

  return {
    block: Math.max(blockCount, blockMax),
    building: Math.max(seed.buildings.length, buildingMax),
    prop: Math.max(seed.props.length, propMax),
  };
}

function seedToBlocks(seed: ModularMapSeed): Record<string, BuildingBlock> {
  const blocksById: Record<string, BuildingBlock> = {};

  for (const building of seed.buildings) {
    for (const block of building.blocks) {
      blocksById[block.id] = {
        id: block.id,
        anchor: block.anchor,
        size: resolveBlockFootprint(undefined, block.size),
        sourcePaletteId: 'building-2x2',
        buildingId: building.id,
      };
    }
  }

  return blocksById;
}

function seedToPaths(seed: ModularMapSeed): Record<string, PathTile> {
  return Object.fromEntries(seed.paths.map((tile) => [cellKey(tile.cell), tile]));
}

function normalizeSeedPropKind(raw: string): PropKind {
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

function seedToProps(seed: ModularMapSeed): Record<string, MapProp> {
  return Object.fromEntries(
    seed.props.map((prop) => [
      prop.id,
      {
        ...prop,
        kind: normalizeSeedPropKind(prop.kind),
      },
    ]),
  );
}

function seedToAreaCells(seed: ModularMapSeed): Record<string, true> {
  if (seed.areaCells && seed.areaCells.length > 0) {
    return Object.fromEntries(seed.areaCells.map((cell) => [cellKey(cell), true]));
  }

  const entries: Array<[string, true]> = [];
  for (let row = 0; row < seed.grid.rows; row += 1) {
    for (let column = 0; column < seed.grid.columns; column += 1) {
      entries.push([cellKey({ x: column, y: row }), true]);
    }
  }
  return Object.fromEntries(entries);
}

function bootstrapState(seed: ModularMapSeed): ModularMapStoreState {
  const baseBlocks = seedToBlocks(seed);
  let buildingCounter = seed.buildings.length;
  const nextBuildingId = () => {
    buildingCounter += 1;
    return `building-${buildingCounter.toString().padStart(3, '0')}`;
  };
  const indexed = recomputeBuildings(
    baseBlocks,
    Object.fromEntries(
      seed.buildings.map((building) => [
        building.id,
        {
          id: building.id,
          name: building.name,
          type: building.type,
          blockIds: building.blocks.map((block) => block.id),
          occupiedCells: [],
          centroid: { x: 0, y: 0 },
          bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
      ]),
    ),
    nextBuildingId,
  );

  return {
    mapId: seed.mapId,
    grid: seed.grid,
    activeTool: 'select',
    activePropKind: 'tree',
    activeAreaPaletteId: DEFAULT_AREA_PRESET.paletteId,
    activeAreaFootprint: DEFAULT_AREA_PRESET.footprint,
    activeBuildingPaletteId: DEFAULT_BUILDING_PRESET.paletteId,
    activeBuildingFootprint: DEFAULT_BUILDING_PRESET.footprint,
    areaCellsByKey: seedToAreaCells(seed),
    blocksById: indexed.blocksById,
    buildingsById: indexed.buildingsById,
    pathsByCell: seedToPaths(seed),
    propsById: seedToProps(seed),
    selection: null,
    buildingModalTargetId: null,
    brushStroke: [],
    lastGeneratedIds: createInitialCounters(seed),
  };
}

function getPropLayerPriority(kind: PropKind): number {
  if (kind === 'car') return 100;
  if (kind === 'motorcycle') return 95;
  if (kind === 'access-vehicular' || kind === 'access-pedestrian') return 80;
  if (kind === 'asphalt') return 10;
  return 50;
}

function getTopPropAtCell(
  propsById: Record<string, MapProp>,
  cell: GridCell,
): MapProp | null {
  const propsAtCell = Object.values(propsById).filter((item) => cellKey(item.cell) === cellKey(cell));
  if (propsAtCell.length === 0) {
    return null;
  }
  propsAtCell.sort((left, right) => getPropLayerPriority(right.kind) - getPropLayerPriority(left.kind));
  return propsAtCell[0] ?? null;
}

function isCellWithinGrid(cell: GridCell, grid: ModularMapStoreState['grid']): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < grid.columns && cell.y < grid.rows;
}

const initialSeed = campusModularSeed as ModularMapSeed;

export const useModularMapStore = create<ModularMapStore>((set, get) => ({
  ...bootstrapState(initialSeed),

  hydrateFromSeed: (seed) => {
    set(bootstrapState(seed));
  },

  setActiveTool: (tool) => {
    set({ activeTool: tool });
  },

  setActivePropKind: (kind) => {
    set({ activePropKind: kind });
  },

  setActiveAreaPreset: (paletteId, footprint) => {
    set((state) => ({
      activeAreaPaletteId: paletteId,
      activeAreaFootprint: footprint ?? AREA_PRESETS[paletteId] ?? state.activeAreaFootprint,
      activeTool: 'area-block',
    }));
  },

  setActiveBuildingPreset: (paletteId, footprint) => {
    set((state) => ({
      activeBuildingPaletteId: paletteId,
      activeBuildingFootprint: resolveBlockFootprint(
        paletteId,
        footprint,
        state.activeBuildingFootprint,
      ),
      activeTool: 'building-block',
    }));
  },

  expandArea: (anchor, paletteId, footprint) => {
    const state = get();
    const resolvedPaletteId = paletteId ?? state.activeAreaPaletteId;
    const resolvedFootprint = footprint ?? AREA_PRESETS[resolvedPaletteId] ?? state.activeAreaFootprint;

    if (anchor.x < 0 || anchor.y < 0) {
      return { ok: false, reason: 'Solo se puede expandir hacia la derecha o hacia abajo del origen.' };
    }

    const nextAreaCellsByKey = { ...state.areaCellsByKey };
    for (const cell of expandBlockCells(anchor, resolvedFootprint)) {
      nextAreaCellsByKey[cellKey(cell)] = true;
    }

    const areaCells = Object.keys(nextAreaCellsByKey)
      .map((key) => {
        const [x, y] = key.split(':').map(Number);
        return { x, y };
      })
      .filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y));

    const requiredColumns = Math.max(0, ...areaCells.map((cell) => cell.x + 1));
    const requiredRows = Math.max(0, ...areaCells.map((cell) => cell.y + 1));

    set({
      grid: {
        ...state.grid,
        columns: requiredColumns,
        rows: requiredRows,
      },
      activeAreaPaletteId: resolvedPaletteId,
      activeAreaFootprint: resolvedFootprint,
      areaCellsByKey: nextAreaCellsByKey,
      selection: null,
      buildingModalTargetId: null,
    });

    return { ok: true };
  },

  placeBuildingBlock: (anchor, paletteId, footprint) => {
    const state = get();
    const resolvedPaletteId = paletteId ?? state.activeBuildingPaletteId;
    const resolvedFootprint = resolveBlockFootprint(
      resolvedPaletteId,
      footprint,
      state.activeBuildingFootprint,
    );

    if (anchor.x < 0 || anchor.y < 0) {
      return { ok: false, reason: 'Solo se puede expandir hacia la derecha o hacia abajo del origen.' };
    }

    const requiredColumns = anchor.x + resolvedFootprint.width;
    const requiredRows = anchor.y + resolvedFootprint.height;
    const nextGrid = {
      ...state.grid,
      columns: Math.max(state.grid.columns, requiredColumns),
      rows: Math.max(state.grid.rows, requiredRows),
    };

    const allCellsInArea = expandBlockCells(anchor, resolvedFootprint).every(
      (cell) => state.areaCellsByKey[cellKey(cell)],
    );
    if (!allCellsInArea) {
      return {
        ok: false,
        reason: 'El constructor solo puede construir dentro de area verde habilitada.',
      };
    }

    const occupiedBuildingCells = new Set(
      Object.values(state.blocksById).flatMap((block) =>
        expandBlockCells(block.anchor, block.size).map(cellKey),
      ),
    );

    if (!canPlaceBlock(anchor, resolvedFootprint, nextGrid, occupiedBuildingCells)) {
      return {
        ok: false,
        reason: `El bloque ${resolvedFootprint.width}x${resolvedFootprint.height} colisiona con otro edificio.`,
      };
    }

    const overlapsPath = expandBlockCells(anchor, resolvedFootprint).some(
      (cell) => state.pathsByCell[cellKey(cell)],
    );
    if (overlapsPath) {
      return { ok: false, reason: 'No se puede construir sobre una celda de pasillo.' };
    }

    const overlapsProp = Object.values(state.propsById).some((prop) =>
      expandBlockCells(anchor, resolvedFootprint).some((cell) => cellKey(cell) === cellKey(prop.cell)),
    );
    if (overlapsProp) {
      return { ok: false, reason: 'No se puede construir sobre un prop existente.' };
    }

    const blockId = `block-${(state.lastGeneratedIds.block + 1).toString().padStart(4, '0')}`;
    let nextBuildingCounter = state.lastGeneratedIds.building;
    const nextBuildingId = () => {
      nextBuildingCounter += 1;
      return `building-${nextBuildingCounter.toString().padStart(3, '0')}`;
    };

    const indexed = recomputeBuildings(
      {
        ...state.blocksById,
        [blockId]: {
          id: blockId,
          anchor,
          size: resolvedFootprint,
          sourcePaletteId: resolvedPaletteId,
          buildingId: null,
        },
      },
      state.buildingsById,
      nextBuildingId,
    );

    const buildingId = indexed.blocksById[blockId]?.buildingId ?? null;
    const createdNewBuilding = Boolean(buildingId && !state.buildingsById[buildingId]);

    set({
      grid: nextGrid,
      activeBuildingPaletteId: resolvedPaletteId,
      activeBuildingFootprint: resolvedFootprint,
      blocksById: indexed.blocksById,
      buildingsById: indexed.buildingsById,
      buildingModalTargetId: createdNewBuilding ? buildingId : null,
      selection: buildingId ? { kind: 'building', id: buildingId } : null,
      lastGeneratedIds: {
        ...state.lastGeneratedIds,
        block: state.lastGeneratedIds.block + 1,
        building: nextBuildingCounter,
      },
    });

    return {
      ok: true,
      buildingId: buildingId ?? undefined,
      createdNewBuilding,
    };
  },

  paintPathCell: (cell, material = 'concrete') => {
    const state = get();
    if (!state.areaCellsByKey[cellKey(cell)]) {
      return { ok: false, reason: 'Primero habilita esta celda con bloques de area.' };
    }
    const buildingId = getBuildingIdAtCell(cell, state.blocksById);
    if (buildingId) {
      return { ok: false, reason: 'No se puede pintar pasillo debajo de un edificio.' };
    }

    const overlappingProp = Object.values(state.propsById).find(
      (prop) => cellKey(prop.cell) === cellKey(cell),
    );
    if (overlappingProp) {
      return { ok: false, reason: 'No se puede pintar pasillo sobre un prop.' };
    }

    set((current) => ({
      pathsByCell: {
        ...current.pathsByCell,
        [cellKey(cell)]: { cell, material },
      },
      brushStroke: current.brushStroke.some((step) => cellKey(step) === cellKey(cell))
        ? current.brushStroke
        : [...current.brushStroke, cell],
    }));

    return { ok: true };
  },

  paintPathStroke: (cells, material = 'concrete') => {
    for (const cell of cells) {
      get().paintPathCell(cell, material);
    }
  },

  clearBrushStroke: () => {
    set({ brushStroke: [] });
  },

  placeProp: (cell, kind, overrides) => {
    const state = get();
    const propKind = kind ?? state.activePropKind;

    if (propKind === 'poi') {
      if (!isCellWithinGrid(cell, state.grid)) {
        return { ok: false, reason: 'El POI debe colocarse dentro de los límites del mapa.' };
      }
    } else {
      if (!state.areaCellsByKey[cellKey(cell)]) {
        return { ok: false, reason: 'Primero habilita esta celda con bloques de area.' };
      }

      if (getBuildingIdAtCell(cell, state.blocksById)) {
        return { ok: false, reason: 'No se puede colocar un prop dentro de un edificio.' };
      }
      if (state.pathsByCell[cellKey(cell)]) {
        return { ok: false, reason: 'No se puede colocar un prop sobre un pasillo.' };
      }
    }
    const propsAtCell = Object.values(state.propsById).filter((prop) => cellKey(prop.cell) === cellKey(cell));
    if (propsAtCell.some((prop) => prop.kind === propKind)) {
      return { ok: false, reason: `Ya existe un prop ${propKind} en esa celda.` };
    }

    const nonPoiPropsAtCell = propsAtCell.filter((prop) => prop.kind !== 'poi');
    if (nonPoiPropsAtCell.length > 0) {
      const isVehicleOverAsphalt =
        (propKind === 'car' || propKind === 'motorcycle') &&
        nonPoiPropsAtCell.every((prop) => prop.kind === 'asphalt');
      const isAsphaltUnderVehicle =
        propKind === 'asphalt' &&
        nonPoiPropsAtCell.every((prop) => prop.kind === 'car' || prop.kind === 'motorcycle');
      const isPoiOverlay = propKind === 'poi';
      if (!isVehicleOverAsphalt && !isAsphaltUnderVehicle && !isPoiOverlay) {
        return {
          ok: false,
          reason: 'Solo se permite apilar auto o moto sobre asfalto en la misma celda.',
        };
      }
    }

    const propId = `prop-${(state.lastGeneratedIds.prop + 1).toString().padStart(4, '0')}`;
    set({
      propsById: {
        ...state.propsById,
        [propId]: {
          id: propId,
          kind: propKind,
          cell,
          rotationDeg: overrides?.rotationDeg,
          variant: overrides?.variant,
          metadata: overrides?.metadata,
        },
      },
      selection: { kind: 'prop', id: propId },
      lastGeneratedIds: {
        ...state.lastGeneratedIds,
        prop: state.lastGeneratedIds.prop + 1,
      },
    });

    return { ok: true, propId };
  },

  moveProp: (id, cell) => {
    const state = get();
    const prop = state.propsById[id];
    if (!prop) {
      return { ok: false, reason: 'El prop no existe.' };
    }
    if (prop.kind === 'poi') {
      if (!isCellWithinGrid(cell, state.grid)) {
        return { ok: false, reason: 'El POI debe permanecer dentro de los límites del mapa.' };
      }
    } else {
      if (!state.areaCellsByKey[cellKey(cell)]) {
        return { ok: false, reason: 'Solo puedes mover props dentro de area verde habilitada.' };
      }
      if (getBuildingIdAtCell(cell, state.blocksById) || state.pathsByCell[cellKey(cell)]) {
        return { ok: false, reason: 'La celda destino esta ocupada por un edificio o un pasillo.' };
      }
    }
    const propsAtDestination = Object.values(state.propsById).filter(
      (item) => item.id !== id && cellKey(item.cell) === cellKey(cell),
    );
    if (propsAtDestination.some((item) => item.kind === prop.kind)) {
      return { ok: false, reason: `La celda destino ya tiene un prop ${prop.kind}.` };
    }
    const nonPoiPropsAtDestination = propsAtDestination.filter((item) => item.kind !== 'poi');
    if (nonPoiPropsAtDestination.length > 0) {
      const isVehicleOverAsphalt =
        (prop.kind === 'car' || prop.kind === 'motorcycle') &&
        nonPoiPropsAtDestination.every((item) => item.kind === 'asphalt');
      const isAsphaltUnderVehicle =
        prop.kind === 'asphalt' &&
        nonPoiPropsAtDestination.every((item) => item.kind === 'car' || item.kind === 'motorcycle');
      const isPoiOverlay = prop.kind === 'poi';
      if (!isVehicleOverAsphalt && !isAsphaltUnderVehicle && !isPoiOverlay) {
        return {
          ok: false,
          reason: 'La celda destino no admite apilamiento para este prop.',
        };
      }
    }

    set({
      propsById: {
        ...state.propsById,
        [id]: { ...prop, cell },
      },
    });

    return { ok: true };
  },

  updatePropMetadata: (id, metadata) => {
    const state = get();
    const prop = state.propsById[id];
    if (!prop) {
      return { ok: false, reason: 'El prop no existe.' };
    }

    set({
      propsById: {
        ...state.propsById,
        [id]: {
          ...prop,
          metadata: {
            ...(prop.metadata ?? {}),
            ...metadata,
          },
        },
      },
      selection: { kind: 'prop', id },
    });

    return { ok: true };
  },

  eraseAt: (cell) => {
    const state = get();
    const pathId = cellKey(cell);

    if (state.pathsByCell[pathId]) {
      const nextPaths = { ...state.pathsByCell };
      delete nextPaths[pathId];
      set({ pathsByCell: nextPaths, selection: { kind: 'path', id: pathId } });
      return;
    }

    const prop = getTopPropAtCell(state.propsById, cell);
    if (prop) {
      const nextProps = { ...state.propsById };
      delete nextProps[prop.id];
      set({ propsById: nextProps, selection: null });
      return;
    }

    const block = Object.values(state.blocksById).find((item) =>
      expandBlockCells(item.anchor, item.size).some((occupiedCell) => cellKey(occupiedCell) === pathId),
    );
    if (!block) {
      return;
    }

    const nextBlocks = { ...state.blocksById };
    delete nextBlocks[block.id];
    let nextBuildingCounter = state.lastGeneratedIds.building;
    const nextBuildingId = () => {
      nextBuildingCounter += 1;
      return `building-${nextBuildingCounter.toString().padStart(3, '0')}`;
    };

    const indexed = recomputeBuildings(nextBlocks, state.buildingsById, nextBuildingId);
    set({
      blocksById: indexed.blocksById,
      buildingsById: indexed.buildingsById,
      selection: null,
      buildingModalTargetId: null,
      lastGeneratedIds: {
        ...state.lastGeneratedIds,
        building: nextBuildingCounter,
      },
    });
  },

  openBuildingLabelModal: (buildingId) => {
    set({
      buildingModalTargetId: buildingId,
      selection: buildingId ? { kind: 'building', id: buildingId } : null,
    });
  },

  clearSelection: () => {
    set({ selection: null, buildingModalTargetId: null });
  },

  selectAt: (cell) => {
    const state = get();
    const buildingId = getBuildingIdAtCell(cell, state.blocksById);
    if (buildingId) {
      set({
        selection: { kind: 'building', id: buildingId },
        buildingModalTargetId: buildingId,
      });
      return;
    }

    const prop = getTopPropAtCell(state.propsById, cell);
    if (prop) {
      set({
        selection: { kind: 'prop', id: prop.id },
        buildingModalTargetId: null,
      });
      return;
    }

    const pathId = cellKey(cell);
    if (state.pathsByCell[pathId]) {
      set({ selection: { kind: 'path', id: pathId }, buildingModalTargetId: null });
      return;
    }

    set({ selection: null, buildingModalTargetId: null });
  },

  updateBuildingLabel: (draft) => {
    const state = get();
    const building = state.buildingsById[draft.id];
    if (!building) {
      return;
    }

    set({
      buildingsById: {
        ...state.buildingsById,
        [draft.id]: {
          ...building,
          name: draft.name.trim() || building.name,
          type: draft.type,
        },
      },
      buildingModalTargetId: null,
      selection: { kind: 'building', id: draft.id },
    });
  },

  serializeForSave: () => {
    const state = get();
    return {
      schemaVersion: 'modular-map@1',
      mapId: state.mapId,
      grid: state.grid,
      areaCells: Object.keys(state.areaCellsByKey)
        .map((key) => {
          const [x, y] = key.split(':').map(Number);
          return { x, y };
        })
        .sort((left, right) => left.y - right.y || left.x - right.x),
      buildings: Object.values(state.buildingsById)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((building) => ({
          id: building.id,
          name: building.name,
          type: building.type,
          centroid: building.centroid,
          bounds: building.bounds,
          blocks: building.blockIds
            .map((blockId) => state.blocksById[blockId])
            .filter((block): block is BuildingBlock => Boolean(block))
            .sort((left, right) => left.anchor.y - right.anchor.y || left.anchor.x - right.anchor.x)
            .map((block) => ({
              id: block.id,
              anchor: block.anchor,
              size: block.size,
            })),
        })),
      paths: Object.values(state.pathsByCell).sort(
        (left, right) => left.cell.y - right.cell.y || left.cell.x - right.cell.x,
      ),
      props: Object.values(state.propsById).sort(
        (left, right) => left.cell.y - right.cell.y || left.cell.x - right.cell.x,
      ),
    };
  },
}));

export function selectBuildingDraft(state: ModularMapStore): BuildingLabelDraft | null {
  const buildingId = state.buildingModalTargetId;
  if (!buildingId) {
    return null;
  }

  const building = state.buildingsById[buildingId];
  if (!building) {
    return null;
  }

  return {
    id: building.id,
    name: building.name,
    type: building.type as BuildingType,
  };
}

export type PoiDraft = {
  id: string;
  label: string;
  interestRadius: number;
};

export type AccessPointDraft = {
  id: string;
  targetKind: '' | 'building' | 'prop';
  targetId: string;
};

export function selectPoiDraft(state: ModularMapStore): PoiDraft | null {
  if (state.selection?.kind !== 'prop') {
    return null;
  }

  const prop = state.propsById[state.selection.id];
  if (!prop || prop.kind !== 'poi') {
    return null;
  }

  const rawRadius = Number(prop.metadata?.interestRadius ?? '2');
  return {
    id: prop.id,
    label: prop.metadata?.label ?? '',
    interestRadius: Number.isFinite(rawRadius) ? Math.max(1, Math.min(12, Math.round(rawRadius))) : 2,
  };
}

export function selectAccessPointDraft(state: ModularMapStore): AccessPointDraft | null {
  if (state.selection?.kind !== 'prop') {
    return null;
  }

  const prop = state.propsById[state.selection.id];
  if (!prop) {
    return null;
  }

  if (prop.kind !== 'access-vehicular' && prop.kind !== 'access-pedestrian') {
    return null;
  }

  const rawTargetKind = (prop.metadata?.accessTargetKind ?? '') as AccessPointDraft['targetKind'];
  const targetKind = rawTargetKind === 'building' || rawTargetKind === 'prop' ? rawTargetKind : '';
  const targetId = (prop.metadata?.accessTargetId ?? '').trim();

  return {
    id: prop.id,
    targetKind,
    targetId: targetKind ? targetId : '',
  };
}
