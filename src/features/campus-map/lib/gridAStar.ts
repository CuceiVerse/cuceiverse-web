import type { GridCell } from '../editor/modularMapTypes';

function ck(c: GridCell): string {
  return `${c.x}:${c.y}`;
}

function manhattan(a: GridCell, b: GridCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

const NEIGHBORS_4: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Finds the nearest path tile to `from` via BFS.
 * Returns null if none is found within `maxRadius` steps.
 */
export function snapToPathTile(
  from: GridCell,
  pathCells: ReadonlySet<string>,
  maxRadius = 30,
): GridCell | null {
  if (pathCells.has(ck(from))) return { ...from };

  const queue: Array<{ cell: GridCell; dist: number }> = [{ cell: from, dist: 0 }];
  const visited = new Set<string>([ck(from)]);

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.dist >= maxRadius) continue;

    for (const [dx, dy] of NEIGHBORS_4) {
      const next: GridCell = { x: item.cell.x + dx, y: item.cell.y + dy };
      const key = ck(next);
      if (visited.has(key)) continue;
      visited.add(key);
      if (pathCells.has(key)) return next;
      queue.push({ cell: next, dist: item.dist + 1 });
    }
  }

  return null;
}

type AStarNode = {
  cell: GridCell;
  g: number;
  f: number;
  parentKey: string | null;
};

/**
 * A* through path tiles.
 * `start` and `end` must already be path tile cells.
 * Returns ordered GridCell[] (path), or [] if unreachable.
 */
export function gridAStarPath(
  start: GridCell,
  end: GridCell,
  pathCells: ReadonlySet<string>,
): GridCell[] {
  if (!pathCells.has(ck(start)) || !pathCells.has(ck(end))) return [];
  if (ck(start) === ck(end)) return [start];

  const open = new Map<string, AStarNode>();
  const closed = new Set<string>();
  const nodes = new Map<string, AStarNode>();

  const startNode: AStarNode = { cell: start, g: 0, f: manhattan(start, end), parentKey: null };
  open.set(ck(start), startNode);
  nodes.set(ck(start), startNode);

  while (open.size > 0) {
    // Pick node with smallest f (linear scan — campus maps are small enough)
    let bestKey = '';
    let bestF = Infinity;
    for (const [key, node] of open) {
      if (node.f < bestF) {
        bestF = node.f;
        bestKey = key;
      }
    }

    const current = open.get(bestKey)!;
    open.delete(bestKey);
    closed.add(bestKey);

    if (ck(current.cell) === ck(end)) {
      const path: GridCell[] = [];
      let cursor: AStarNode | undefined = current;
      while (cursor) {
        path.unshift(cursor.cell);
        cursor = cursor.parentKey ? nodes.get(cursor.parentKey) : undefined;
      }
      return path;
    }

    for (const [dx, dy] of NEIGHBORS_4) {
      const next: GridCell = { x: current.cell.x + dx, y: current.cell.y + dy };
      const key = ck(next);
      if (closed.has(key) || !pathCells.has(key)) continue;

      const g = current.g + 1;
      const existing = open.get(key);
      if (!existing || g < existing.g) {
        const node: AStarNode = { cell: next, g, f: g + manhattan(next, end), parentKey: bestKey };
        open.set(key, node);
        nodes.set(key, node);
      }
    }
  }

  return [];
}
