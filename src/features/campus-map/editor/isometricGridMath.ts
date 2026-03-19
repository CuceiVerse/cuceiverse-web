import type { GridCell, IsoGridConfig } from './modularMapTypes';

export type EditorCamera = {
  x: number;
  y: number;
  scale: number;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export function isoGridToScreen(cell: { x: number; y: number }, grid: IsoGridConfig): ScreenPoint {
  return {
    x: grid.origin.x + (cell.x - cell.y) * (grid.tileWidth / 2),
    y: grid.origin.y + (cell.x + cell.y) * (grid.tileHeight / 2),
  };
}

export function screenToIsoGrid(
  canvasX: number,
  canvasY: number,
  camera: EditorCamera,
  grid: IsoGridConfig,
): GridCell {
  const worldX = (canvasX - camera.x) / camera.scale - grid.origin.x;
  const worldY = (canvasY - camera.y) / camera.scale - grid.origin.y;
  const halfWidth = grid.tileWidth / 2;
  const halfHeight = grid.tileHeight / 2;
  const gridX = (worldX / halfWidth + worldY / halfHeight) / 2;
  const gridY = (worldY / halfHeight - worldX / halfWidth) / 2;

  return {
    x: Math.floor(gridX),
    y: Math.floor(gridY),
  };
}

export function getIsoDiamond(cell: GridCell, grid: IsoGridConfig): ScreenPoint[] {
  const top = isoGridToScreen(cell, grid);
  const right = { x: top.x + grid.tileWidth / 2, y: top.y + grid.tileHeight / 2 };
  const bottom = { x: top.x, y: top.y + grid.tileHeight };
  const left = { x: top.x - grid.tileWidth / 2, y: top.y + grid.tileHeight / 2 };
  return [top, right, bottom, left];
}

export function flattenScreenPoints(points: ScreenPoint[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
