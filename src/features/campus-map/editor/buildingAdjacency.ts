import {
  BUILDING_BLOCK_SIZE,
  type BlockFootprint,
  type BuildingBlock,
  type GridBounds,
  type GridCell,
  type ModularBuilding,
} from './modularMapTypes';

export function cellKey(cell: GridCell): string {
  return `${cell.x}:${cell.y}`;
}

export function expandBlockCells(anchor: GridCell, size: BlockFootprint = { width: 2, height: 2 }): GridCell[] {
  const cells: GridCell[] = [];
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      cells.push({ x: anchor.x + x, y: anchor.y + y });
    }
  }
  return cells;
}

export function isCellInsideGrid(cell: GridCell, bounds: GridBounds): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < bounds.columns && cell.y < bounds.rows;
}

export function canPlaceBlock(
  anchor: GridCell,
  size: BlockFootprint,
  bounds: GridBounds,
  occupiedCells: ReadonlySet<string>,
): boolean {
  const cells = expandBlockCells(anchor, size);
  return cells.every((cell) => isCellInsideGrid(cell, bounds) && !occupiedCells.has(cellKey(cell)));
}

export function blocksOverlap(a: BuildingBlock, b: BuildingBlock): boolean {
  const occupied = new Set(expandBlockCells(a.anchor, a.size).map(cellKey));
  return expandBlockCells(b.anchor, b.size).some((cell) => occupied.has(cellKey(cell)));
}

export function blocksAreEdgeAdjacent(a: BuildingBlock, b: BuildingBlock): boolean {
  const aCells = expandBlockCells(a.anchor, a.size);
  const bCells = new Set(expandBlockCells(b.anchor, b.size).map(cellKey));
  const deltas = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const cell of aCells) {
    for (const delta of deltas) {
      const neighbor = { x: cell.x + delta.x, y: cell.y + delta.y };
      if (bCells.has(cellKey(neighbor))) {
        return true;
      }
    }
  }

  return false;
}

type ComponentResult = {
  blockIds: string[];
  occupiedCells: GridCell[];
  centroid: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

function computeComponent(blocks: BuildingBlock[]): ComponentResult {
  const occupiedMap = new Map<string, GridCell>();
  for (const block of blocks) {
    for (const cell of expandBlockCells(block.anchor, block.size)) {
      occupiedMap.set(cellKey(cell), cell);
    }
  }

  const occupiedCells = Array.from(occupiedMap.values()).sort(
    (left, right) => left.y - right.y || left.x - right.x,
  );
  const count = occupiedCells.length || 1;
  const centroid = occupiedCells.reduce(
    (accumulator, cell) => ({
      x: accumulator.x + cell.x + 0.5,
      y: accumulator.y + cell.y + 0.5,
    }),
    { x: 0, y: 0 },
  );

  return {
    blockIds: blocks.map((block) => block.id).sort(),
    occupiedCells,
    centroid: {
      x: centroid.x / count,
      y: centroid.y / count,
    },
    bounds: occupiedCells.reduce(
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
    ),
  };
}

function pickStableBuildingId(
  component: BuildingBlock[],
  previousBuildings: Readonly<Record<string, ModularBuilding>>,
  nextBuildingId: () => string,
): string {
  const idWeights = new Map<string, number>();

  for (const block of component) {
    if (!block.buildingId) continue;
    idWeights.set(block.buildingId, (idWeights.get(block.buildingId) ?? 0) + 1);
  }

  const candidates = Array.from(idWeights.entries())
    .filter(([id]) => previousBuildings[id])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  if (candidates.length > 0) {
    return candidates[0][0];
  }

  return nextBuildingId();
}

export function recomputeBuildings(
  blocksById: Readonly<Record<string, BuildingBlock>>,
  previousBuildings: Readonly<Record<string, ModularBuilding>>,
  nextBuildingId: () => string,
): {
  blocksById: Record<string, BuildingBlock>;
  buildingsById: Record<string, ModularBuilding>;
} {
  const blocks = Object.values(blocksById);
  const adjacency = new Map<string, string[]>();

  for (const block of blocks) {
    adjacency.set(block.id, []);
  }

  for (let index = 0; index < blocks.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < blocks.length; compareIndex += 1) {
      const left = blocks[index];
      const right = blocks[compareIndex];

      if (!blocksAreEdgeAdjacent(left, right)) {
        continue;
      }

      adjacency.get(left.id)?.push(right.id);
      adjacency.get(right.id)?.push(left.id);
    }
  }

  const visited = new Set<string>();
  const nextBlocksById: Record<string, BuildingBlock> = {};
  const buildingsById: Record<string, ModularBuilding> = {};

  for (const block of blocks) {
    if (visited.has(block.id)) {
      continue;
    }

    const queue = [block.id];
    const componentIds: string[] = [];
    visited.add(block.id);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }

      componentIds.push(currentId);
      for (const neighbor of adjacency.get(currentId) ?? []) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    const component = componentIds
      .map((componentId) => blocksById[componentId])
      .filter((candidate): candidate is BuildingBlock => Boolean(candidate));
    const buildingId = pickStableBuildingId(component, previousBuildings, nextBuildingId);
    const previous = previousBuildings[buildingId];
    const footprint = computeComponent(component);

    buildingsById[buildingId] = {
      id: buildingId,
      name: previous?.name ?? '',
      type: previous?.type ?? 'mixed',
      blockIds: footprint.blockIds,
      occupiedCells: footprint.occupiedCells,
      centroid: footprint.centroid,
      bounds: footprint.bounds,
    };

    for (const componentBlock of component) {
      nextBlocksById[componentBlock.id] = {
        ...componentBlock,
        buildingId,
      };
    }
  }

  return {
    blocksById: nextBlocksById,
    buildingsById,
  };
}

export function getBuildingIdAtCell(
  cell: GridCell,
  blocksById: Readonly<Record<string, BuildingBlock>>,
): string | null {
  const target = cellKey(cell);
  for (const block of Object.values(blocksById)) {
    if (expandBlockCells(block.anchor, block.size).some((occupiedCell) => cellKey(occupiedCell) === target)) {
      return block.buildingId;
    }
  }

  return null;
}

export function get2x2FootprintAtCell(cell: GridCell): GridCell[] {
  return expandBlockCells({
    x: Math.floor(cell.x / BUILDING_BLOCK_SIZE) * BUILDING_BLOCK_SIZE,
    y: Math.floor(cell.y / BUILDING_BLOCK_SIZE) * BUILDING_BLOCK_SIZE,
  });
}
