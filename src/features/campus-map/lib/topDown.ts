import type { GridPoint, GridRect } from '../types';

export const TILE_SIZE = 18;
export const MAP_ORIGIN = { x: 150, y: 108 };

export type ScreenPoint = {
  x: number;
  y: number;
};

export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function gridToScreen(point: GridPoint): ScreenPoint {
  return {
    x: MAP_ORIGIN.x + point.x * TILE_SIZE,
    y: MAP_ORIGIN.y + point.y * TILE_SIZE,
  };
}

export function gridCenterToScreen(point: GridPoint): ScreenPoint {
  return {
    x: MAP_ORIGIN.x + point.x * TILE_SIZE + TILE_SIZE / 2,
    y: MAP_ORIGIN.y + point.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function gridRectToScreen(rect: GridRect): ScreenRect {
  return {
    x: MAP_ORIGIN.x + rect.x * TILE_SIZE,
    y: MAP_ORIGIN.y + rect.y * TILE_SIZE,
    width: rect.width * TILE_SIZE,
    height: rect.height * TILE_SIZE,
  };
}

export function flattenPoints(points: ScreenPoint[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}