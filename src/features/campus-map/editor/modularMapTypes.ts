export const BUILDING_BLOCK_SIZE = 2;

export type BlockFootprint = {
  width: number;
  height: number;
};

export type GridCell = {
  x: number;
  y: number;
};

export type GridBounds = {
  columns: number;
  rows: number;
};

export type IsoGridConfig = GridBounds & {
  tileWidth: number;
  tileHeight: number;
  origin: {
    x: number;
    y: number;
  };
};

export type EditorTool =
  | 'pan'
  | 'select'
  | 'area-block'
  | 'building-block'
  | 'path-brush'
  | 'prop'
  | 'erase';

export type BuildingType =
  | 'academic'
  | 'administrative'
  | 'services'
  | 'sports'
  | 'research'
  | 'mixed';

export type PropKind =
  | 'tree'
  | 'access-vehicular'
  | 'access-pedestrian'
  | 'asphalt'
  | 'car'
  | 'motorcycle'
  | 'bench'
  | 'bathroom'
  | 'poi'
  | 'park'
  | 'track'
  | 'shrub'
  | 'trash';

export type BuildingBlock = {
  id: string;
  anchor: GridCell;
  size: BlockFootprint;
  sourcePaletteId: string;
  buildingId: string | null;
};

export type PathTile = {
  cell: GridCell;
  material: 'concrete' | 'pavers' | 'grass-transition';
};

export type MapProp = {
  id: string;
  kind: PropKind;
  cell: GridCell;
  rotationDeg?: number;
  variant?: string;
  metadata?: Record<string, string>;
};

export type ModularBuilding = {
  id: string;
  name: string;
  type: BuildingType;
  blockIds: string[];
  occupiedCells: GridCell[];
  centroid: {
    x: number;
    y: number;
  };
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

export type SelectionState =
  | { kind: 'building'; id: string }
  | { kind: 'prop'; id: string }
  | { kind: 'path'; id: string }
  | null;

export type BuildingLabelDraft = {
  id: string;
  name: string;
  type: BuildingType;
};

export type ModularMapSeedBuilding = {
  id: string;
  name: string;
  type: BuildingType;
  blocks: Array<{
    id: string;
    anchor: GridCell;
    size?: BlockFootprint;
  }>;
};

export type ModularMapSeed = {
  schemaVersion: 'modular-map@1';
  mapId: string;
  grid: IsoGridConfig;
  areaCells?: GridCell[];
  buildings: ModularMapSeedBuilding[];
  paths: PathTile[];
  props: MapProp[];
};

export type ModularMapSavePayload = {
  schemaVersion: 'modular-map@1';
  mapId: string;
  grid: IsoGridConfig;
  areaCells: GridCell[];
  buildings: Array<{
    id: string;
    name: string;
    type: BuildingType;
    centroid: {
      x: number;
      y: number;
    };
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
    blocks: Array<{
      id: string;
      anchor: GridCell;
      size: BlockFootprint;
    }>;
  }>;
  paths: PathTile[];
  props: MapProp[];
};

export type ModularMapStoreState = {
  mapId: string;
  grid: IsoGridConfig;
  activeTool: EditorTool;
  activePropKind: PropKind;
  activeAreaPaletteId: string;
  activeAreaFootprint: BlockFootprint;
  activeBuildingPaletteId: string;
  activeBuildingFootprint: BlockFootprint;
  areaCellsByKey: Record<string, true>;
  blocksById: Record<string, BuildingBlock>;
  buildingsById: Record<string, ModularBuilding>;
  pathsByCell: Record<string, PathTile>;
  propsById: Record<string, MapProp>;
  selection: SelectionState;
  buildingModalTargetId: string | null;
  brushStroke: GridCell[];
  lastGeneratedIds: {
    block: number;
    building: number;
    prop: number;
  };
};
