export const poiTypeLabels = {
  food: 'Comida',
  medical: 'Medico',
  bathroom: 'Banos',
  cafeteria: 'Cafeteria',
  general_services: 'Servicios',
  auditorium: 'Auditorio',
  bank: 'Banco',
  library: 'Biblioteca',
  info: 'Informacion',
  admin: 'Administracion',
} as const;

export type PoiType = keyof typeof poiTypeLabels;

export type GridPoint = {
  x: number;
  y: number;
};

export type GridRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BuildingSegment = GridRect;

export type BuildingFootprint = {
  id: string;
  segments: BuildingSegment[];
  colorTop?: number;
  colorLeft?: number;
  colorRight?: number;
  labelGrid: GridPoint;
  roofText?: string;
  roofTextGrid?: GridPoint;
};

export type CampusAreaLabel = {
  id: string;
  label: string;
  grid: GridPoint;
  accent: number;
};

export type CampusPathNode = {
  id: string;
  point: GridPoint;
  neighbors: string[];
};

export type PuntoInteres = {
  id: string;
  nombre: string;
  tipo: PoiType;
  coordenadaXGrid: number;
  coordenadaYGrid: number;
  descripcion: string | null;
  activo: boolean;
  edificioReferencia: string | null;
  prioridadVisual: number;
};

export type PoiFilters = {
  tipo: PoiType | 'all';
  edificio: string;
  soloActivos: boolean;
};