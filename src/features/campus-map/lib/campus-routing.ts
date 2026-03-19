import { campusPathGraph } from '../campusMapConfig';
import type { CampusPathNode, GridPoint } from '../types';

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findNearestNode(point: GridPoint): CampusPathNode {
  return campusPathGraph.reduce((closest, candidate) => {
    return distance(candidate.point, point) < distance(closest.point, point)
      ? candidate
      : closest;
  });
}

function buildNodeMap(): Map<string, CampusPathNode> {
  return new Map(campusPathGraph.map((node) => [node.id, node]));
}

function bfsPath(startId: string, endId: string): string[] {
  const nodeMap = buildNodeMap();
  const queue: string[] = [startId];
  const visited = new Set([startId]);
  const previous = new Map<string, string | null>([[startId, null]]);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) break;
    if (currentId === endId) break;

    const current = nodeMap.get(currentId);
    if (!current) continue;

    for (const neighbor of current.neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      previous.set(neighbor, currentId);
      queue.push(neighbor);
    }
  }

  if (!previous.has(endId)) return [startId, endId];

  const path: string[] = [];
  let cursor: string | null = endId;

  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(cursor) ?? null;
  }

  return path;
}

function dedupePoints(points: GridPoint[]): GridPoint[] {
  return points.filter((point, index, list) => {
    const previous = list[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

export function buildCampusRoute(
  start: GridPoint,
  end: GridPoint,
): GridPoint[] {
  const startNode = findNearestNode(start);
  const endNode = findNearestNode(end);
  const nodeMap = buildNodeMap();

  const path = bfsPath(startNode.id, endNode.id)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is CampusPathNode => Boolean(node))
    .map((node) => node.point);

  return dedupePoints([start, startNode.point, ...path, endNode.point, end]);
}

export function interpolatePoint(
  from: GridPoint,
  to: GridPoint,
  progress: number,
): GridPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}