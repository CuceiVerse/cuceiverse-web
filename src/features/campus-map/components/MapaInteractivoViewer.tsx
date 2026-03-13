import { Application, extend } from '@pixi/react';
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import { fetchPuntosInteres } from '../api/puntosInteres';
import {
  athleticTrack,
  avatarSpawnPoint,
  campusAreaLabels,
  campusBoundary,
  campusBuildings,
  campusGridSize,
  campusWalkways,
  cidBlock,
  initialFocusPoint,
} from '../campusMapConfig';
import { useFakeUserPosition } from '../hooks/useFakeUserPosition';
import type { EditorTool } from '../hooks/useMapEditor';
import { screenToGrid } from '../lib/snapGrid';
import {
  flattenPoints,
  gridCenterToScreen,
  gridRectToScreen,
  gridToScreen,
  TILE_SIZE,
} from '../lib/topDown';
import { POIDetailModal } from './POIDetailModal';
import { POIMarker } from './POIMarker';
import {
  poiTypeLabels,
  type BuildingFootprint,
  type GridPoint,
  type GridRect,
  type PoiFilters,
  type PuntoInteres,
} from '../types';
import '../campus-map.css';

extend({ Container, Graphics, Sprite, Text });

type CameraState = {
  x: number;
  y: number;
  scale: number;
  followAvatar: boolean;
};

/** Contrato que el modo edición expone al viewer. */
type EditorInterface = {
  activeTool: EditorTool;
  /** Lista de POIs a mostrar (reemplaza los obtenidos de la API). */
  pois: PuntoInteres[];
  /** Nodos de pasillo pendientes. */
  nodes: ReadonlyArray<{ xGrid: number; yGrid: number }>;
  /** Aristas visibles en modo edición (coordenadas ya resueltas). */
  edges: ReadonlyArray<{
    from: GridPoint;
    to: GridPoint;
    status?: 'existing' | 'pending-create' | 'pending-delete';
  }>;
  /** Elementos de mobiliario / vegetación en edición. */
  assets?: ReadonlyArray<{
    id: string;
    tipo: 'ARBOL' | 'ARBUSTO' | 'BANCA' | 'LUMINARIA' | 'BASURERO';
    coordX: number;
    coordY: number;
    status?: 'existing' | 'pending-create' | 'pending-update' | 'pending-delete';
  }>;
  /** Nodo inicial seleccionado para crear una arista. */
  edgeAnchor?: GridPoint | null;
  /** Llamado cuando el usuario hace clic en una celda de la cuadrícula. */
  onTileClick: (p: GridPoint) => void;
  /** Inicia drag de un elemento editable. Retorna true si tomó el control del drag. */
  onDragStart?: (p: GridPoint) => boolean;
  /** Actualiza posición durante drag. */
  onDragMove?: (p: GridPoint) => void;
  /** Finaliza drag. */
  onDragEnd?: (p: GridPoint) => void;
};

type TreeKind = 'palm' | 'cypress' | 'bush';
type CrowdVariant = 'student-blue' | 'student-red' | 'student-green';

const campusTrees: Array<{ point: GridPoint; kind: TreeKind }> = [
  { point: { x: 7.4, y: 8.4 }, kind: 'palm' },
  { point: { x: 8.6, y: 16.1 }, kind: 'cypress' },
  { point: { x: 10.5, y: 36.2 }, kind: 'bush' },
  { point: { x: 16.5, y: 41.4 }, kind: 'palm' },
  { point: { x: 24.4, y: 41.2 }, kind: 'cypress' },
  { point: { x: 36.5, y: 12.6 }, kind: 'palm' },
  { point: { x: 40.3, y: 21.4 }, kind: 'cypress' },
  { point: { x: 39.2, y: 34.8 }, kind: 'bush' },
  { point: { x: 32.2, y: 40.3 }, kind: 'palm' },
  { point: { x: 5.6, y: 27.8 }, kind: 'cypress' },
];

const campusCrowd: Array<{ point: GridPoint; variant: CrowdVariant }> = [
  { point: { x: 12.3, y: 41.3 }, variant: 'student-blue' },
  { point: { x: 15.1, y: 38.2 }, variant: 'student-red' },
  { point: { x: 21.8, y: 26.7 }, variant: 'student-green' },
  { point: { x: 29.7, y: 18.5 }, variant: 'student-blue' },
  { point: { x: 31.1, y: 17.6 }, variant: 'student-red' },
  { point: { x: 8.9, y: 13.5 }, variant: 'student-green' },
  { point: { x: 26.1, y: 34.5 }, variant: 'student-blue' },
];

const campusSigns = [
  {
    id: 'registro-facial',
    label: 'REGISTRO FACIAL',
    point: { x: 14.4, y: 44.8 },
    accent: 0x55ddff,
    icon: 'face' as const,
  },
  {
    id: 'acceso',
    label: 'ACCESO',
    point: { x: 19.8, y: 43.9 },
    accent: 0xffd84d,
    icon: 'gate' as const,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointInRect(point: GridPoint, rect: GridRect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function createTexture(
  width: number,
  height: number,
  painter: (context: CanvasRenderingContext2D) => void,
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    return Texture.EMPTY;
  }

  painter(context);
  return Texture.from(canvas);
}

function drawPixelRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

const avatarTexture = createTexture(20, 26, (context) => {
  drawPixelRect(context, 6, 1, 8, 5, '#f3ce9b');
  drawPixelRect(context, 5, 6, 10, 8, '#3e7ec7');
  drawPixelRect(context, 7, 8, 6, 4, '#95d9ff');
  drawPixelRect(context, 7, 14, 2, 7, '#23364a');
  drawPixelRect(context, 11, 14, 2, 7, '#23364a');
  drawPixelRect(context, 4, 5, 2, 6, '#f8e06b');
  drawPixelRect(context, 14, 5, 2, 6, '#f8e06b');
});

const crowdTextures: Record<CrowdVariant, Texture> = {
  'student-blue': createTexture(18, 22, (context) => {
    drawPixelRect(context, 5, 1, 8, 5, '#efc793');
    drawPixelRect(context, 4, 6, 10, 7, '#4a87d4');
    drawPixelRect(context, 6, 13, 2, 7, '#26384f');
    drawPixelRect(context, 10, 13, 2, 7, '#26384f');
  }),
  'student-red': createTexture(18, 22, (context) => {
    drawPixelRect(context, 5, 1, 8, 5, '#f2cfad');
    drawPixelRect(context, 4, 6, 10, 7, '#d85f71');
    drawPixelRect(context, 6, 13, 2, 7, '#2d3147');
    drawPixelRect(context, 10, 13, 2, 7, '#2d3147');
  }),
  'student-green': createTexture(18, 22, (context) => {
    drawPixelRect(context, 5, 1, 8, 5, '#f1ca98');
    drawPixelRect(context, 4, 6, 10, 7, '#4db07d');
    drawPixelRect(context, 6, 13, 2, 7, '#25384a');
    drawPixelRect(context, 10, 13, 2, 7, '#25384a');
  }),
};

const treeTextures: Record<TreeKind, Texture> = {
  palm: createTexture(30, 36, (context) => {
    drawPixelRect(context, 13, 16, 4, 16, '#8f6034');
    drawPixelRect(context, 5, 8, 20, 4, '#3f8b4a');
    drawPixelRect(context, 2, 12, 10, 4, '#58b768');
    drawPixelRect(context, 18, 12, 10, 4, '#58b768');
    drawPixelRect(context, 7, 2, 16, 4, '#6dc877');
  }),
  cypress: createTexture(22, 34, (context) => {
    drawPixelRect(context, 9, 20, 4, 12, '#7b5530');
    drawPixelRect(context, 5, 4, 12, 18, '#447f3c');
    drawPixelRect(context, 7, 0, 8, 4, '#61aa58');
  }),
  bush: createTexture(24, 20, (context) => {
    drawPixelRect(context, 2, 8, 20, 8, '#4a9344');
    drawPixelRect(context, 6, 4, 12, 4, '#68b662');
    drawPixelRect(context, 10, 16, 4, 2, '#3f6b31');
  }),
};

function drawHabboTile(graphics: Graphics, x: number, y: number, walkway: boolean) {
  const tile = gridRectToScreen({ x, y, width: 1, height: 1 });
  const base = walkway
    ? (x + y) % 2 === 0
      ? 0xbcc6cd
      : 0xa8b4bc
    : (x + y) % 2 === 0
      ? 0x63ae53
      : 0x5ca549;
  const shadow = walkway ? 0x89949d : 0x3d7d2f;
  const highlight = walkway ? 0xdce3e8 : 0x84d872;

  graphics.setFillStyle({ color: base, alpha: 1 });
  graphics.rect(tile.x, tile.y, tile.width, tile.height);
  graphics.fill();

  graphics.setStrokeStyle({ color: shadow, width: 1, alpha: 0.55 });
  graphics.rect(tile.x + 0.5, tile.y + 0.5, tile.width - 1, tile.height - 1);
  graphics.stroke();

  graphics.setStrokeStyle({ color: highlight, width: 1, alpha: 0.45 });
  graphics.moveTo(tile.x + 1, tile.y + 1);
  graphics.lineTo(tile.x + tile.width - 2, tile.y + 1);
  graphics.lineTo(tile.x + tile.width - 2, tile.y + 5);
  graphics.stroke();
}

function drawBuildingSegment(
  graphics: Graphics,
  building: BuildingFootprint,
  segment: GridRect,
) {
  const rect = gridRectToScreen(segment);
  const outer = 0xea8d9d;
  const border = 0x934d5a;
  const stripe = 0xf1a7b3;
  const windowBase = 0x7f4050;
  const windowGlow = 0xd7f0ff;

  graphics.setFillStyle({ color: outer, alpha: 1 });
  graphics.rect(rect.x, rect.y, rect.width, rect.height);
  graphics.fill();

  for (let y = rect.y + 3; y < rect.y + rect.height - 2; y += 6) {
    graphics.setFillStyle({ color: stripe, alpha: 0.38 });
    graphics.rect(rect.x + 1, y, rect.width - 2, 2);
    graphics.fill();
  }

  for (let x = rect.x + 5; x < rect.x + rect.width - 7; x += 9) {
    for (let y = rect.y + 5; y < rect.y + rect.height - 8; y += 9) {
      graphics.setFillStyle({ color: windowBase, alpha: 0.94 });
      graphics.rect(x, y, 5, 4);
      graphics.fill();
      graphics.setFillStyle({ color: windowGlow, alpha: 0.82 });
      graphics.rect(x + 1, y + 1, 2, 2);
      graphics.fill();
    }
  }

  graphics.setStrokeStyle({ color: border, width: 2, alpha: 1 });
  graphics.rect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  graphics.stroke();

  graphics.setStrokeStyle({ color: 0xffd5df, width: 1, alpha: 0.6 });
  graphics.moveTo(rect.x + 2, rect.y + 2);
  graphics.lineTo(rect.x + rect.width - 3, rect.y + 2);
  graphics.lineTo(rect.x + rect.width - 3, rect.y + 6);
  graphics.stroke();

  if (rect.width > 42 && rect.height > 24) {
    graphics.setFillStyle({ color: 0xb56778, alpha: 0.95 });
    graphics.rect(rect.x + rect.width - 18, rect.y + 4, 8, 5);
    graphics.rect(rect.x + rect.width - 28, rect.y + 11, 12, 6);
    graphics.fill();

    graphics.setFillStyle({ color: 0xe8cad1, alpha: 1 });
    graphics.rect(rect.x + rect.width - 26, rect.y + 13, 3, 2);
    graphics.rect(rect.x + rect.width - 21, rect.y + 13, 3, 2);
    graphics.fill();
  }

  if (building.id === 'L' || building.id === 'O') {
    graphics.setFillStyle({ color: 0xf7eee6, alpha: 0.95 });
    graphics.rect(rect.x + 6, rect.y + 6, 8, 5);
    graphics.rect(rect.x + 18, rect.y + 6, 8, 5);
    graphics.fill();

    graphics.setFillStyle({ color: 0x6c5a4b, alpha: 1 });
    graphics.rect(rect.x + 9, rect.y + 11, 2, 3);
    graphics.rect(rect.x + 21, rect.y + 11, 2, 3);
    graphics.fill();

    graphics.setFillStyle({ color: 0xffd46c, alpha: 1 });
    graphics.rect(rect.x + 12, rect.y + 15, 5, 5);
    graphics.fill();
  }
}

function drawCanal(graphics: Graphics) {
  const topLeft = gridToScreen({ x: -2, y: -6 });
  const width = (campusGridSize.width + 8) * TILE_SIZE;

  graphics.setFillStyle({ color: 0x7fd0ff, alpha: 0.98 });
  graphics.rect(topLeft.x, topLeft.y, width, 70);
  graphics.fill();

  graphics.setFillStyle({ color: 0x9ee6ff, alpha: 0.55 });
  for (let x = topLeft.x + 8; x < topLeft.x + width - 12; x += 34) {
    graphics.rect(x, topLeft.y + 10, 18, 3);
    graphics.rect(x + 10, topLeft.y + 30, 20, 3);
    graphics.fill();
  }

  graphics.setFillStyle({ color: 0xb58c63, alpha: 1 });
  graphics.rect(topLeft.x + 120, topLeft.y + 16, 28, 38);
  graphics.rect(topLeft.x + 344, topLeft.y + 12, 32, 42);
  graphics.rect(topLeft.x + 590, topLeft.y + 18, 26, 36);
  graphics.fill();

  graphics.setFillStyle({ color: 0xead2b3, alpha: 1 });
  graphics.rect(topLeft.x + 122, topLeft.y + 20, 24, 6);
  graphics.rect(topLeft.x + 346, topLeft.y + 16, 28, 6);
  graphics.rect(topLeft.x + 592, topLeft.y + 22, 22, 6);
  graphics.fill();
}

function drawLifeSign(
  graphics: Graphics,
  center: { x: number; y: number },
  accent: number,
  icon: 'face' | 'gate',
) {
  graphics.setFillStyle({ color: 0x1e2b35, alpha: 0.96 });
  graphics.roundRect(center.x - 16, center.y - 16, 32, 24, 4);
  graphics.fill();

  graphics.setFillStyle({ color: accent, alpha: 1 });
  graphics.roundRect(center.x - 13, center.y - 13, 26, 18, 3);
  graphics.fill();

  graphics.setFillStyle({ color: 0x102029, alpha: 0.95 });
  if (icon === 'face') {
    graphics.rect(center.x - 5, center.y - 9, 3, 3);
    graphics.rect(center.x + 2, center.y - 9, 3, 3);
    graphics.rect(center.x - 4, center.y - 3, 8, 2);
  } else {
    graphics.rect(center.x - 7, center.y - 10, 2, 14);
    graphics.rect(center.x + 5, center.y - 10, 2, 14);
    graphics.rect(center.x - 7, center.y - 10, 14, 2);
    graphics.rect(center.x - 3, center.y - 5, 6, 2);
  }
  graphics.fill();
}

function focusCameraOnPoint(
  point: GridPoint,
  viewport: { width: number; height: number },
  scale: number,
): Pick<CameraState, 'x' | 'y'> {
  const screen = gridCenterToScreen(point);
  return {
    x: viewport.width / 2 - screen.x * scale,
    y: viewport.height / 2 - screen.y * scale,
  };
}

export function MapaInteractivoViewer({ editor }: { editor?: EditorInterface } = {}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const elementDragRef = useRef<{ active: boolean } | null>(null);

  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const [camera, setCamera] = useState<CameraState>(() => ({
    ...focusCameraOnPoint(initialFocusPoint, { width: 1280, height: 720 }, 1),
    scale: 1,
    followAvatar: true,
  }));
  const [filters, setFilters] = useState<PoiFilters>({
    tipo: 'all',
    edificio: '',
    soloActivos: true,
  });
  const [pois, setPois] = useState<PuntoInteres[]>([]);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeStart, setRouteStart] = useState<GridPoint>(avatarSpawnPoint);
  const [routeEnd, setRouteEnd] = useState<GridPoint | null>(null);
  /** Celda de cuadrícula bajo el cursor (solo activa en modo edición). */
  const [editorGhost, setEditorGhost] = useState<GridPoint | null>(null);

  const {
    position: avatarPosition,
    route: avatarRoute,
    isMoving,
  } = useFakeUserPosition(routeStart, routeEnd);

  /** En modo edición usa los POIs provistos por el editor; si no, los del fetch. */
  const displayPois = editor?.pois ?? pois;

  const selectedPoi = useMemo(
    () => displayPois.find((poi) => poi.id === selectedPoiId) ?? null,
    [displayPois, selectedPoiId],
  );

  const visibleCamera = useMemo(() => {
    if (!camera.followAvatar) {
      return camera;
    }

    return {
      ...camera,
      ...focusCameraOnPoint(avatarPosition, viewport, camera.scale),
    };
  }, [avatarPosition, camera, viewport]);

  const updateFilters = (updater: (current: PoiFilters) => PoiFilters) => {
    setLoading(true);
    setError(null);
    setFilters(updater);
  };

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewport({
        width: Math.max(720, Math.round(entry.contentRect.width)),
        height: Math.max(520, Math.round(entry.contentRect.height)),
      });
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchPuntosInteres(filters, controller.signal)
      .then((data) => setPois(data))
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setPois([]);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Error desconocido',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    setCamera((current) => {
      const nextScale = clamp(current.scale - event.deltaY * 0.0012, 0.6, 2.4);
      const worldX = (localX - visibleCamera.x) / visibleCamera.scale;
      const worldY = (localY - visibleCamera.y) / visibleCamera.scale;

      return {
        x: localX - worldX * nextScale,
        y: localY - worldY * nextScale,
        scale: nextScale,
        followAvatar: false,
      };
    });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    // En herramientas de creación, priorizamos colocar elementos con clic izquierdo.
    // El paneo queda disponible con botón medio/derecho o con herramienta select.
    const allowPanWithThisClick =
      event.button !== 0 || !editor || editor.activeTool === 'select';

    if (editor?.onDragStart && editor.activeTool === 'select') {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = screenToGrid(
        event.clientX - rect.left,
        event.clientY - rect.top,
        visibleCamera,
      );
      if (editor.onDragStart(point)) {
        elementDragRef.current = { active: true };
        dragStartRef.current = null;
        return;
      }
    }

    if (!allowPanWithThisClick) {
      dragStartRef.current = null;
      return;
    }

    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      cameraX: visibleCamera.x,
      cameraY: visibleCamera.y,
    };
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const snapped = screenToGrid(
      event.clientX - rect.left,
      event.clientY - rect.top,
      visibleCamera,
    );

    if (editor) {
      setEditorGhost(snapped);
    }

    if (elementDragRef.current?.active && editor?.onDragMove) {
      editor.onDragMove(snapped);
      return;
    }

    const drag = dragStartRef.current;
    if (!drag) return;

    setCamera((current) => ({
      ...current,
      x: drag.cameraX + (event.clientX - drag.pointerX),
      y: drag.cameraY + (event.clientY - drag.pointerY),
      followAvatar: false,
    }));
  };

  const handleMouseUp = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const snapped = screenToGrid(
      event.clientX - rect.left,
      event.clientY - rect.top,
      visibleCamera,
    );

    if (elementDragRef.current?.active) {
      editor?.onDragEnd?.(snapped);
      elementDragRef.current = null;
      return;
    }

    const drag = dragStartRef.current;

    if (drag && editor) {
      const dx = event.clientX - drag.pointerX;
      const dy = event.clientY - drag.pointerY;
      const isDragGesture = Math.abs(dx) > 4 || Math.abs(dy) > 4;

      if (!isDragGesture) {
        editor.onTileClick(snapped);
      }
    }

    dragStartRef.current = null;
  };

  const handleMouseLeave = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (editor) setEditorGhost(null);
    handleMouseUp(event);
  };

  const handleSimulateRoute = (poi: PuntoInteres) => {
    setRouteStart(avatarPosition);
    setRouteEnd({ x: poi.coordenadaXGrid, y: poi.coordenadaYGrid });
    setCamera((current) => ({ ...current, followAvatar: true }));
  };

  return (
    <section className="campus-map-shell">
      <header className="campus-toolbar glass-panel">
        <div>
          <p className="toolbar-eyebrow">CUCEIverse pixel campus</p>
          <h1>Vista cenital Habbo del campus</h1>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              setCamera((current) => ({
                ...current,
                ...focusCameraOnPoint(initialFocusPoint, viewport, current.scale),
                followAvatar: false,
              }))
            }
          >
            Recentrar campus
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              setCamera((current) => ({
                ...current,
                followAvatar: true,
              }))
            }
          >
            Seguir avatar
          </button>
        </div>
      </header>

      <div className="campus-content-grid">
        <aside className="campus-filters glass-panel">
          <div className="filter-group">
            <label htmlFor="edificio-filter">Edificio</label>
            <input
              id="edificio-filter"
              value={filters.edificio}
              onChange={(event) =>
                updateFilters((current) => ({
                  ...current,
                  edificio: event.target.value,
                }))
              }
              placeholder="Ej. F"
              maxLength={4}
            />
          </div>

          <div className="filter-group">
            <label>Tipo</label>
            <div className="filter-chip-grid">
              <button
                type="button"
                className={filters.tipo === 'all' ? 'chip active' : 'chip'}
                onClick={() =>
                  updateFilters((current) => ({ ...current, tipo: 'all' }))
                }
              >
                Todos
              </button>
              {Object.entries(poiTypeLabels).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  className={filters.tipo === type ? 'chip active' : 'chip'}
                  onClick={() =>
                    updateFilters((current) => ({
                      ...current,
                      tipo: type as PoiFilters['tipo'],
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={filters.soloActivos}
              onChange={(event) =>
                updateFilters((current) => ({
                  ...current,
                  soloActivos: event.target.checked,
                }))
              }
            />
            Solo activos
          </label>

          <div className="status-card">
            <span>{loading ? 'Cargando POIs...' : `${pois.length} POIs visibles`}</span>
            <span>{isMoving ? 'Avatar en ruta' : 'Avatar en espera'}</span>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}
        </aside>

        <div
          ref={viewportRef}
          className="campus-canvas-shell glass-panel"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <Application
            resizeTo={viewportRef}
            antialias={false}
            backgroundColor={0xaadcf3}
            resolution={1}
            autoDensity
          >
            <pixiContainer
              x={visibleCamera.x}
              y={visibleCamera.y}
              scale={visibleCamera.scale}
              sortableChildren
            >
              <pixiGraphics
                zIndex={-30}
                draw={(graphics) => {
                  graphics.clear();

                  drawCanal(graphics);

                  const campusBackground = gridRectToScreen({
                    x: -1,
                    y: -1,
                    width: campusGridSize.width + 2,
                    height: campusGridSize.height + 2,
                  });
                  graphics.setFillStyle({ color: 0x7bc85d, alpha: 1 });
                  graphics.rect(
                    campusBackground.x,
                    campusBackground.y,
                    campusBackground.width,
                    campusBackground.height,
                  );
                  graphics.fill();

                  for (let y = 0; y < campusGridSize.height; y += 1) {
                    for (let x = 0; x < campusGridSize.width; x += 1) {
                      const walkway = campusWalkways.some((rect) =>
                        pointInRect({ x: x + 0.5, y: y + 0.5 }, rect),
                      );
                      drawHabboTile(graphics, x, y, walkway);
                    }
                  }

                  const trackCenter = gridCenterToScreen(athleticTrack.center);
                  graphics.setFillStyle({ color: 0xc77a43, alpha: 0.95 });
                  graphics.ellipse(
                    trackCenter.x,
                    trackCenter.y,
                    athleticTrack.radiusX * TILE_SIZE,
                    athleticTrack.radiusY * TILE_SIZE,
                  );
                  graphics.fill();
                  graphics.setFillStyle({ color: 0x58a947, alpha: 1 });
                  graphics.ellipse(
                    trackCenter.x,
                    trackCenter.y,
                    athleticTrack.radiusX * TILE_SIZE - 24,
                    athleticTrack.radiusY * TILE_SIZE - 24,
                  );
                  graphics.fill();
                  graphics.setStrokeStyle({ color: 0xffef95, width: 3, alpha: 1 });
                  graphics.ellipse(
                    trackCenter.x,
                    trackCenter.y,
                    athleticTrack.radiusX * TILE_SIZE - 10,
                    athleticTrack.radiusY * TILE_SIZE - 10,
                  );
                  graphics.stroke();

                  graphics.setStrokeStyle({ color: 0xf7de3a, width: 3, alpha: 1 });
                  graphics.poly(
                    flattenPoints(campusBoundary.map((point) => gridCenterToScreen(point))),
                  );
                  graphics.stroke();

                  for (const building of campusBuildings) {
                    for (const segment of building.segments) {
                      drawBuildingSegment(graphics, building, segment);
                    }
                  }

                  const cidRect = gridRectToScreen({
                    x: cidBlock.grid.x,
                    y: cidBlock.grid.y,
                    width: cidBlock.size.width,
                    height: cidBlock.size.height,
                  });
                  graphics.setFillStyle({ color: cidBlock.accent, alpha: 1 });
                  graphics.roundRect(
                    cidRect.x,
                    cidRect.y,
                    cidRect.width,
                    cidRect.height,
                    5,
                  );
                  graphics.fill();
                  graphics.setFillStyle({ color: 0xf6e4ff, alpha: 1 });
                  graphics.rect(cidRect.x + 8, cidRect.y + 8, 12, 8);
                  graphics.rect(cidRect.x + 24, cidRect.y + 8, 5, 20);
                  graphics.fill();

                  const cafetRect = gridRectToScreen({
                    x: 31.1,
                    y: 16.7,
                    width: 4.3,
                    height: 1.8,
                  });
                  graphics.setFillStyle({ color: 0xff9468, alpha: 1 });
                  graphics.roundRect(
                    cafetRect.x,
                    cafetRect.y,
                    cafetRect.width,
                    cafetRect.height,
                    4,
                  );
                  graphics.fill();
                  graphics.setFillStyle({ color: 0xfff3d6, alpha: 1 });
                  graphics.circle(cafetRect.x + 10, cafetRect.y + 10, 5);
                  graphics.rect(cafetRect.x + 18, cafetRect.y + 7, 10, 6);
                  graphics.fill();

                  for (const sign of campusSigns) {
                    drawLifeSign(
                      graphics,
                      gridCenterToScreen(sign.point),
                      sign.accent,
                      sign.icon,
                    );
                  }
                }}
              />

              <pixiGraphics
                zIndex={-5}
                draw={(graphics) => {
                  graphics.clear();
                  if (avatarRoute.length <= 1) {
                    return;
                  }

                  graphics.setStrokeStyle({ color: 0x89f3ff, width: 4, alpha: 0.9 });
                  graphics.poly(
                    flattenPoints(avatarRoute.map((point) => gridCenterToScreen(point))),
                  );
                  graphics.stroke();
                }}
              />

              {campusBuildings.map((building) => {
                const labelPoint = gridCenterToScreen(building.labelGrid);
                const roofTextPoint = gridCenterToScreen(
                  building.roofTextGrid ?? building.labelGrid,
                );

                return (
                  <pixiContainer key={building.id} zIndex={25}>
                    <pixiText
                      text={building.id}
                      x={labelPoint.x}
                      y={labelPoint.y - 4}
                      anchor={0.5}
                      roundPixels
                      style={{
                        fill: '#fff6f2',
                        fontFamily: 'monospace',
                        fontSize: 14,
                        fontWeight: '700',
                        stroke: { color: '#6d3040', width: 3 },
                      }}
                    />
                    {building.id === 'A' ? (
                      <pixiText
                        text={'ENRIQUE DÍAZ DE LEÓN'}
                        x={roofTextPoint.x}
                        y={roofTextPoint.y + 18}
                        anchor={0.5}
                        roundPixels
                        style={{
                          fill: '#5c2333',
                          fontFamily: 'monospace',
                          fontSize: 8,
                          fontWeight: '700',
                          letterSpacing: -0.3,
                        }}
                      />
                    ) : null}
                  </pixiContainer>
                );
              })}

              {campusAreaLabels.map((area) => {
                const point = gridCenterToScreen(area.grid);
                const text = area.id === 'cafeteria' ? 'CAFET...' : area.label;

                return (
                  <pixiText
                    key={area.id}
                    text={text}
                    x={point.x}
                    y={point.y - 6}
                    anchor={0.5}
                    roundPixels
                    zIndex={35}
                    style={{
                      fill: `#${area.accent.toString(16).padStart(6, '0')}`,
                      fontFamily: 'monospace',
                      fontSize: 11,
                      fontWeight: '700',
                      stroke: { color: '#ffffff', width: 2 },
                    }}
                  />
                );
              })}

              {campusSigns.map((sign) => {
                const point = gridCenterToScreen(sign.point);
                return (
                  <pixiText
                    key={sign.id}
                    text={sign.label}
                    x={point.x}
                    y={point.y + 18}
                    anchor={0.5}
                    roundPixels
                    zIndex={36}
                    style={{
                      fill: '#fffef0',
                      fontFamily: 'monospace',
                      fontSize: 8,
                      fontWeight: '700',
                      stroke: { color: '#20303a', width: 2 },
                    }}
                  />
                );
              })}

              {campusTrees.map((tree, index) => {
                const point = gridCenterToScreen(tree.point);
                return (
                  <pixiSprite
                    key={`${tree.kind}-${index}`}
                    texture={treeTextures[tree.kind]}
                    x={point.x}
                    y={point.y}
                    anchor={{ x: 0.5, y: 0.82 }}
                    roundPixels
                    zIndex={40 + index}
                  />
                );
              })}

              {campusCrowd.map((avatar, index) => {
                const point = gridCenterToScreen(avatar.point);
                return (
                  <pixiSprite
                    key={`${avatar.variant}-${index}`}
                    texture={crowdTextures[avatar.variant]}
                    x={point.x}
                    y={point.y}
                    anchor={{ x: 0.5, y: 0.9 }}
                    roundPixels
                    zIndex={55 + index}
                  />
                );
              })}

              {displayPois.map((poi) => (
                <POIMarker
                  key={poi.id}
                  poi={poi}
                  selected={selectedPoi?.id === poi.id}
                  onSelect={(nextPoi) => setSelectedPoiId(nextPoi.id)}
                />
              ))}

              <pixiContainer zIndex={120}>
                <pixiGraphics
                  draw={(graphics) => {
                    graphics.clear();
                    const shadow = gridCenterToScreen(avatarPosition);
                    graphics.setFillStyle({ color: 0x163046, alpha: 0.24 });
                    graphics.ellipse(shadow.x, shadow.y + 8, 10, 5);
                    graphics.fill();
                  }}
                />
                <pixiSprite
                  texture={avatarTexture}
                  x={gridCenterToScreen(avatarPosition).x}
                  y={gridCenterToScreen(avatarPosition).y + 2}
                  anchor={{ x: 0.5, y: 0.9 }}
                  roundPixels
                />
              </pixiContainer>

              {/* Capa del editor: ghost cursor + nodos de pasillo */}
              {editor && (
                <pixiGraphics
                  zIndex={200}
                  draw={(graphics) => {
                    graphics.clear();

                    for (const edge of editor.edges) {
                      const edgeColor =
                        edge.status === 'pending-create'
                          ? 0x00e6a8
                          : edge.status === 'pending-delete'
                            ? 0xff5a5a
                            : 0x4cd6ff;
                      const edgeAlpha = edge.status === 'pending-delete' ? 0.7 : 0.95;
                      const edgeWidth = edge.status === 'pending-delete' ? 3 : 2;
                      graphics.setStrokeStyle({ color: edgeColor, width: edgeWidth, alpha: edgeAlpha });
                      const from = gridCenterToScreen(edge.from);
                      const to = gridCenterToScreen(edge.to);
                      graphics.moveTo(from.x, from.y);
                      graphics.lineTo(to.x, to.y);
                      graphics.stroke();
                    }

                    for (const node of editor.nodes) {
                      const center = gridCenterToScreen({ x: node.xGrid, y: node.yGrid });
                      graphics.setFillStyle({ color: 0x7affea, alpha: 0.9 });
                      graphics.circle(center.x, center.y, 5);
                      graphics.fill();
                      graphics.setStrokeStyle({ color: 0x00c8a8, width: 2, alpha: 1 });
                      graphics.circle(center.x, center.y, 5);
                      graphics.stroke();
                    }

                    if (editor.edgeAnchor) {
                      const anchor = gridCenterToScreen(editor.edgeAnchor);
                      graphics.setStrokeStyle({ color: 0xffe46d, width: 3, alpha: 1 });
                      graphics.circle(anchor.x, anchor.y, 8);
                      graphics.stroke();
                    }

                    if (!editorGhost) return;

                    const tile = gridRectToScreen({
                      x: editorGhost.x,
                      y: editorGhost.y,
                      width: 1,
                      height: 1,
                    });
                    const ghostColor =
                      editor.activeTool === 'asset'
                        ? 0x64f0a4
                        : editor.activeTool === 'building' || editor.activeTool === 'area'
                          ? 0x6ea2ff
                          :
                      editor.activeTool === 'poi'
                        ? 0xffd84d
                        : editor.activeTool === 'walkway'
                          ? 0x7affea
                          : editor.activeTool === 'erase'
                            ? 0xff4444
                            : 0xffffff;

                    graphics.setFillStyle({ color: ghostColor, alpha: 0.38 });
                    graphics.rect(tile.x, tile.y, tile.width, tile.height);
                    graphics.fill();
                    graphics.setStrokeStyle({ color: ghostColor, width: 2, alpha: 0.9 });
                    graphics.rect(tile.x, tile.y, tile.width, tile.height);
                    graphics.stroke();

                    for (const asset of editor.assets ?? []) {
                      const center = gridCenterToScreen({ x: asset.coordX, y: asset.coordY });
                      const color =
                        asset.tipo === 'ARBOL'
                          ? 0x2dbb62
                          : asset.tipo === 'ARBUSTO'
                            ? 0x5ac96f
                            : asset.tipo === 'BANCA'
                              ? 0xd7a66e
                              : asset.tipo === 'LUMINARIA'
                                ? 0xffef95
                                : 0x7a8ca0;
                      const alpha = asset.status === 'pending-delete' ? 0.45 : 0.92;
                      graphics.setFillStyle({ color, alpha });
                      graphics.circle(center.x, center.y, 4);
                      graphics.fill();
                    }
                  }}
                />
              )}
            </pixiContainer>
          </Application>
        </div>

        <POIDetailModal
          poi={selectedPoi}
          onClose={() => setSelectedPoiId(null)}
          onSimulateRoute={handleSimulateRoute}
        />
      </div>
    </section>
  );
}