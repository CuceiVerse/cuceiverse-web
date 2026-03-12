import type {
  BuildingFootprint,
  CampusAreaLabel,
  CampusPathNode,
  GridPoint,
  GridRect,
} from './types';

export const campusGridSize = { width: 50, height: 48 };

export const campusWalkways: GridRect[] = [
  { x: 31, y: 2, width: 3, height: 42 },
  { x: 8, y: 37, width: 26, height: 3 },
  { x: 16, y: 12, width: 20, height: 2 },
  { x: 11, y: 20, width: 22, height: 2 },
  { x: 14, y: 26, width: 18, height: 2 },
  { x: 17, y: 7, width: 3, height: 33 },
  { x: 24, y: 7, width: 3, height: 23 },
  { x: 7, y: 14, width: 11, height: 2 },
  { x: 6, y: 9, width: 10, height: 2 },
];

export const campusBoundary: GridPoint[] = [
  { x: 5, y: 40 },
  { x: 3, y: 31 },
  { x: 6, y: 23 },
  { x: 4, y: 15 },
  { x: 5, y: 10 },
  { x: 8, y: 6 },
  { x: 16, y: 4 },
  { x: 30, y: 2 },
  { x: 38, y: 4 },
  { x: 45, y: 10 },
  { x: 48, y: 20 },
  { x: 46, y: 30 },
  { x: 41, y: 39 },
  { x: 33, y: 45 },
  { x: 18, y: 47 },
  { x: 9, y: 45 },
  { x: 5, y: 40 },
];

export const campusBuildings: BuildingFootprint[] = [
  { id: 'A', segments: [{ x: 10, y: 39, width: 6, height: 8 }], labelGrid: { x: 13, y: 43 }, roofText: 'Enrique Diaz de Leon', roofTextGrid: { x: 13, y: 44 } },
  { id: 'B', segments: [{ x: 31, y: 42, width: 3, height: 1.5 }], labelGrid: { x: 32.5, y: 42.7 } },
  { id: 'C', segments: [{ x: 30.5, y: 40, width: 3, height: 1.5 }], labelGrid: { x: 32, y: 40.7 } },
  { id: 'D', segments: [{ x: 27.5, y: 38, width: 4, height: 2 }], labelGrid: { x: 29.5, y: 39 } },
  { id: 'E', segments: [{ x: 14, y: 31, width: 16, height: 2 }], labelGrid: { x: 22, y: 32 } },
  { id: 'F', segments: [{ x: 20, y: 25, width: 2.4, height: 8.2 }, { x: 18.5, y: 24, width: 7, height: 2.3 }, { x: 22.6, y: 26.2, width: 6.8, height: 2.1 }], labelGrid: { x: 22.4, y: 28.5 } },
  { id: 'G', segments: [{ x: 11, y: 27, width: 4, height: 3 }], labelGrid: { x: 13, y: 28.5 } },
  { id: 'H', segments: [{ x: 17, y: 26.5, width: 2.2, height: 1.8 }], labelGrid: { x: 18.1, y: 27.4 } },
  { id: 'I', segments: [{ x: 25.2, y: 28.2, width: 4.4, height: 1.6 }], labelGrid: { x: 27.3, y: 29 } },
  { id: 'J', segments: [{ x: 21, y: 21.6, width: 3.2, height: 1 }], labelGrid: { x: 22.6, y: 22.1 } },
  { id: 'K', segments: [{ x: 20.5, y: 20, width: 4.2, height: 1 }], labelGrid: { x: 22.6, y: 20.6 } },
  { id: 'L', segments: [{ x: 27.5, y: 17.5, width: 4.4, height: 4.8 }], labelGrid: { x: 29.7, y: 19.7 } },
  { id: 'M', segments: [{ x: 19.3, y: 16.8, width: 2.2, height: 1.8 }], labelGrid: { x: 20.4, y: 17.7 } },
  { id: 'N', segments: [{ x: 18.6, y: 14.8, width: 2.8, height: 1.6 }], labelGrid: { x: 20, y: 15.6 } },
  { id: 'O', segments: [{ x: 16.8, y: 11.8, width: 4.4, height: 3.6 }], labelGrid: { x: 19, y: 13.6 } },
  { id: 'P', segments: [{ x: 25.2, y: 12.2, width: 7, height: 1.8 }], labelGrid: { x: 28.7, y: 13.2 } },
  { id: 'Q', segments: [{ x: 27.8, y: 9.6, width: 8, height: 1.8 }], labelGrid: { x: 31.8, y: 10.6 } },
  { id: 'R', segments: [{ x: 24.1, y: 10.6, width: 3.2, height: 1.8 }], labelGrid: { x: 25.7, y: 11.5 } },
  { id: 'S', segments: [{ x: 19.4, y: 9.8, width: 3.5, height: 1.8 }], labelGrid: { x: 21.1, y: 10.7 } },
  { id: 'T', segments: [{ x: 26.3, y: 7.8, width: 4.4, height: 1.5 }], labelGrid: { x: 28.5, y: 8.5 } },
  { id: 'U', segments: [{ x: 26.1, y: 5.9, width: 6.8, height: 1.5 }], labelGrid: { x: 29.5, y: 6.7 } },
  { id: 'V', segments: [{ x: 19.4, y: 4.2, width: 4.3, height: 1.3 }], labelGrid: { x: 21.5, y: 4.8 } },
  { id: 'V2', segments: [{ x: 21.1, y: 5.9, width: 3.8, height: 1.2 }], labelGrid: { x: 23, y: 6.5 } },
  { id: 'W', segments: [{ x: 17.2, y: 5.8, width: 3.6, height: 1.2 }], labelGrid: { x: 19, y: 6.3 } },
  { id: 'X', segments: [{ x: 16.8, y: 3.9, width: 7.4, height: 1.2 }], labelGrid: { x: 20.5, y: 4.5 } },
  { id: 'Y', segments: [{ x: 8.6, y: 12.4, width: 4.8, height: 3 }], labelGrid: { x: 11, y: 13.8 } },
  { id: 'Z', segments: [{ x: 6.3, y: 13.2, width: 1.7, height: 2.4 }], labelGrid: { x: 7.2, y: 14.3 } },
  { id: 'Z1', segments: [{ x: 5.2, y: 12.4, width: 1.6, height: 2 }], labelGrid: { x: 6, y: 13.3 } },
  { id: 'Z2', segments: [{ x: 6.8, y: 10.6, width: 2.2, height: 1.5 }], labelGrid: { x: 7.9, y: 11.3 } },
];

export const campusAreaLabels: CampusAreaLabel[] = [
  { id: 'cta', label: 'CTA', grid: { x: 31.4, y: 18.4 }, accent: 0x8a67ff },
  { id: 'cid', label: 'CID', grid: { x: 26.6, y: 35.6 }, accent: 0xb863ff },
  { id: 'cafeteria', label: 'CAFETERIA', grid: { x: 30.5, y: 17.2 }, accent: 0xff7f73 },
];

export const cidBlock = {
  grid: { x: 24.8, y: 34.6 },
  size: { width: 3.8, height: 3.4 },
  accent: 0xba63ff,
};

export const athleticTrack = {
  center: { x: 42.4, y: 28.2 },
  radiusX: 4.8,
  radiusY: 10.2,
};

export const avatarSpawnPoint: GridPoint = { x: 13.5, y: 41.5 };
export const initialFocusPoint: GridPoint = { x: 24, y: 23 };

export const campusPathGraph: CampusPathNode[] = [
  { id: 'south-gate', point: { x: 13.5, y: 41.5 }, neighbors: ['south-spine'] },
  { id: 'south-spine', point: { x: 18, y: 37.5 }, neighbors: ['south-gate', 'central-cross', 'east-south'] },
  { id: 'east-south', point: { x: 30.5, y: 38 }, neighbors: ['south-spine', 'east-track'] },
  { id: 'east-track', point: { x: 34, y: 28.2 }, neighbors: ['east-south', 'north-east', 'central-cross'] },
  { id: 'central-cross', point: { x: 23.8, y: 27 }, neighbors: ['south-spine', 'east-track', 'mid-cross', 'west-cross'] },
  { id: 'mid-cross', point: { x: 23.8, y: 20.5 }, neighbors: ['central-cross', 'north-mid', 'east-mid'] },
  { id: 'west-cross', point: { x: 14, y: 20.5 }, neighbors: ['central-cross', 'west-upper', 'west-lonaria'] },
  { id: 'east-mid', point: { x: 31, y: 20 }, neighbors: ['mid-cross', 'north-east'] },
  { id: 'north-mid', point: { x: 22.5, y: 12.5 }, neighbors: ['mid-cross', 'north-west', 'north-east'] },
  { id: 'north-east', point: { x: 31.5, y: 8.5 }, neighbors: ['north-mid', 'east-mid', 'north-gate'] },
  { id: 'north-gate', point: { x: 33, y: 4.5 }, neighbors: ['north-east'] },
  { id: 'north-west', point: { x: 18.5, y: 8.5 }, neighbors: ['north-mid', 'west-upper'] },
  { id: 'west-upper', point: { x: 11.2, y: 11.5 }, neighbors: ['north-west', 'west-cross'] },
  { id: 'west-lonaria', point: { x: 8.5, y: 14.2 }, neighbors: ['west-cross'] },
];