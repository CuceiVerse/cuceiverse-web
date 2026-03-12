import type { BuildingSegment, GridPoint } from '../types';

export const TILE_WIDTH = 48;
export const TILE_HEIGHT = 24;
export const BUILDING_ELEVATION = 28;
export const ISO_ORIGIN = { x: 760, y: 92 };

export type ScreenPoint = {
  x: number;
  y: number;
};

export function gridToScreen(point: GridPoint): ScreenPoint {
  return {
    x: ISO_ORIGIN.x + (point.x - point.y) * (TILE_WIDTH / 2),
    y: ISO_ORIGIN.y + (point.x + point.y) * (TILE_HEIGHT / 2),
  };
}

export function getTilePolygon(x: number, y: number): ScreenPoint[] {
  const top = gridToScreen({ x, y });
  const right = gridToScreen({ x: x + 1, y });
  const bottom = gridToScreen({ x: x + 1, y: y + 1 });
  const left = gridToScreen({ x, y: y + 1 });

  return [top, right, bottom, left];
}

export function getSegmentTopPolygon(
  segment: BuildingSegment,
  elevation = BUILDING_ELEVATION,
): ScreenPoint[] {
  const topLeft = gridToScreen({ x: segment.x, y: segment.y });
  const topRight = gridToScreen({ x: segment.x + segment.width, y: segment.y });
  const bottomRight = gridToScreen({
    x: segment.x + segment.width,
    y: segment.y + segment.height,
  });
  const bottomLeft = gridToScreen({ x: segment.x, y: segment.y + segment.height });

  return [topLeft, topRight, bottomRight, bottomLeft].map((point) => ({
    x: point.x,
    y: point.y - elevation,
  }));
}

export function getSegmentLeftPolygon(
  segment: BuildingSegment,
  elevation = BUILDING_ELEVATION,
): ScreenPoint[] {
  const topLeft = gridToScreen({ x: segment.x, y: segment.y });
  const bottomLeft = gridToScreen({ x: segment.x, y: segment.y + segment.height });

  return [
    { x: bottomLeft.x, y: bottomLeft.y - elevation },
    { x: topLeft.x, y: topLeft.y - elevation },
    topLeft,
    bottomLeft,
  ];
}

export function getSegmentRightPolygon(
  segment: BuildingSegment,
  elevation = BUILDING_ELEVATION,
): ScreenPoint[] {
  const topRight = gridToScreen({ x: segment.x + segment.width, y: segment.y });
  const bottomRight = gridToScreen({
    x: segment.x + segment.width,
    y: segment.y + segment.height,
  });

  return [
    { x: bottomRight.x, y: bottomRight.y - elevation },
    { x: topRight.x, y: topRight.y - elevation },
    topRight,
    bottomRight,
  ];
}

export function flattenPoints(points: ScreenPoint[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

export function getSegmentCenter(segment: BuildingSegment): GridPoint {
  return {
    x: segment.x + segment.width / 2,
    y: segment.y + segment.height / 2,
  };
}

export function mixColor(base: number, shift: number): number {
  return Math.max(0, Math.min(0xffffff, base + shift));
}