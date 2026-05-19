import { Application, extend } from '@pixi/react';
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { ApplicationRef } from '@pixi/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { cellKey, expandBlockCells, getBuildingIdAtCell } from '../editor/buildingAdjacency';
import {
  clamp,
  flattenScreenPoints,
  getIsoDiamond,
  isoGridToScreen,
  screenToIsoGrid,
  type EditorCamera,
} from '../editor/isometricGridMath';
import { resolveAvatarImage } from '../../../lib/avatarImage';
import '../campus-map.css';
import type {
  BlockFootprint,
  GridCell,
  ModularBuilding,
  ModularMapStoreState,
  PropKind,
} from '../editor/modularMapTypes';

extend({ Container, Graphics, Sprite, Text });

type DragPalettePayload =
  | { kind: 'area-block'; paletteId: string; footprint: BlockFootprint }
  | { kind: 'building-block'; paletteId: string; footprint: BlockFootprint }
  | { kind: 'prop'; propKind: PropKind };

type Props = {
  editorState: Pick<
    ModularMapStoreState,
    | 'grid'
    | 'activeTool'
    | 'activePropKind'
    | 'activeAreaFootprint'
    | 'activeBuildingFootprint'
    | 'activeEraseFootprint'
    | 'areaCellsByKey'
    | 'blocksById'
    | 'buildingsById'
    | 'pathsByCell'
    | 'propsById'
    | 'selection'
  >;
  onDropPaletteItem: (payload: DragPalettePayload, cell: GridCell) => void;
  onPathBrushStart: (cell: GridCell) => void;
  onPathBrushMove: (cell: GridCell) => void;
  onPathBrushEnd: () => void;
  onErase: (cell: GridCell) => void;
  onEraseEnd: () => void;
  onSelect: (cell: GridCell) => void;
  onMoveProp: (id: string, cell: GridCell) => void;
  onPlaceBuildingBlock: (cell: GridCell) => void;
  onPlaceProp: (cell: GridCell) => void;
  viewMode?: 'isometric' | '2d';
  /** PolilÃ­nea de la ruta recomendada principal (coordenadas de grid). */
  routePolyline?: Array<{ x: number; y: number }>;
  /** PolilÃ­nea de ruta del avatar en movimiento manual (coordenadas de grid). */
  manualRoutePolyline?: Array<{ x: number; y: number }>;
  /** PolilÃ­neas de rutas alternativas (coordenadas de grid). */
  altPolylines?: Array<Array<{ x: number; y: number }>>;
  /** Callback when the user left-clicks a cell in pan/viewer mode. */
  onCellClick?: (cell: GridCell) => void;
  /** Avatar position in fractional grid coordinates (e.g. {x:24.5, y:20.5}). */
  avatarPosition?: { x: number; y: number };
  /** Mutable avatar position ref for smooth imperative movement. */
  avatarPositionRef?: MutableRefObject<{ x: number; y: number }>;
  /** Extracted Habbo figure string for safe motion rendering. */
  avatarFigure?: string;
  /** Current raw Habbo direction from movement logic. */
  avatarDirection?: number;
  /** Whether the avatar is actively walking. */
  avatarIsMoving?: boolean;
  /** Avatar Habbo image URL (optional, falls back to a colored circle). */
  avatarImageUrl?: string;

  /** Notifica cuando Pixi dibuja el primer frame (útil para métricas de carga). */
  onFirstFrameRendered?: () => void;

  /**
   * Dev-only: show an image behind the grid as a template for map construction.
   * Intended for the editor in 2D mode.
   */
  templateUnderlayEnabled?: boolean;
  /** Optional external controller ref to expose zoom/reset controls. */
  controllerRef?: MutableRefObject<{
    zoomIn: () => void;
    zoomOut: () => void;
    reset: () => void;
  } | null>;
  /**
   * Changes when the host replaces the backing map layout.
   * Used by read-only views to refit after async seed/layout loading.
   */
  layoutVersionKey?: string;
  /**
   * Forces the camera to refit when the viewport changes.
   * Useful for read-only mobile layouts where browser chrome can resize the canvas.
   */
  autoRefitOnViewportResize?: boolean;
};

const DROP_MIME = 'application/x-cuceiverse-map-item';
const BUILDING_ELEVATION = 16;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;

const DEVICE_PIXEL_RATIO =
  typeof window === 'undefined'
    ? 1
    : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
const TILE_2D_SIZE = 26;

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function getPropAtCell(
  cell: GridCell,
  propsById: Props['editorState']['propsById'],
): string | null {
  const propsAtCell = Object.values(propsById).filter(
    (prop) => prop.cell.x === cell.x && prop.cell.y === cell.y,
  );
  if (propsAtCell.length === 0) {
    return null;
  }
  const layerPriority = (kind: PropKind) => {
    if (kind === 'car') return 100;
    if (kind === 'motorcycle') return 95;
    if (kind === 'access-vehicular' || kind === 'access-pedestrian') return 80;
    if (kind === 'asphalt') return 10;
    return 50;
  };
  propsAtCell.sort((left, right) => layerPriority(right.kind) - layerPriority(left.kind));
  return propsAtCell[0]?.id ?? null;
}

function fitScaleToBounds(
  viewport: { width: number; height: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const padding = 48;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scaleByWidth = (viewport.width - padding * 2) / width;
  const scaleByHeight = (viewport.height - padding * 2) / height;
  const nextScale = Math.min(scaleByWidth, scaleByHeight);
  if (!Number.isFinite(nextScale) || nextScale <= 0) {
    return 1;
  }
  return clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
}

function getIsoCampusBounds(grid: Props['editorState']['grid']) {
  const maxColumn = Math.max(0, grid.columns - 1);
  const maxRow = Math.max(0, grid.rows - 1);
  const cornerCells: GridCell[] = [
    { x: 0, y: 0 },
    { x: maxColumn, y: 0 },
    { x: 0, y: maxRow },
    { x: maxColumn, y: maxRow },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const cell of cornerCells) {
    const diamond = getIsoDiamond(cell, grid);
    for (const point of diamond) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return { minX, minY, maxX, maxY };
}

function get2DCampusBounds(grid: Props['editorState']['grid']) {
  return {
    minX: 0,
    minY: 0,
    maxX: grid.columns * TILE_2D_SIZE,
    maxY: grid.rows * TILE_2D_SIZE,
  };
}

function fitCameraToBounds(
  viewport: { width: number; height: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): EditorCamera {
  const scale = fitScaleToBounds(viewport, bounds);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: viewport.width / 2 - centerX * scale,
    y: viewport.height / 2 - centerY * scale,
    scale,
  };
}

function gridToWorld(
  cell: GridCell,
  grid: Props['editorState']['grid'],
  viewMode: Props['viewMode'],
) {
  if (viewMode === '2d') {
    return {
      x: cell.x * TILE_2D_SIZE,
      y: cell.y * TILE_2D_SIZE,
    };
  }
  return isoGridToScreen(cell, grid);
}

function gridPositionToWorld(
  position: { x: number; y: number },
  grid: Props['editorState']['grid'],
  viewMode: Props['viewMode'],
) {
  if (viewMode === '2d') {
    return {
      x: position.x * TILE_2D_SIZE,
      y: position.y * TILE_2D_SIZE,
    };
  }

  return isoGridToScreen(position, grid);
}

function getAvatarIdleDirection(viewMode: Props['viewMode']): number {
  return viewMode === '2d' ? 2 : 3;
}

function getAvatarPose(
  viewMode: Props['viewMode'],
  rawDirection: number | undefined,
  isMoving: boolean,
  frame: number,
): { direction: number; mirror: boolean; action: 'std' | 'wlk'; frame: number } {
  const fallbackDirection = getAvatarIdleDirection(viewMode);

  if (!isMoving) {
    return {
      direction: fallbackDirection,
      mirror: false,
      action: 'std',
      frame: 0,
    };
  }

  if (viewMode === '2d') {
    switch (rawDirection) {
      case 6:
        return { direction: 2, mirror: true, action: 'wlk', frame };
      case 0:
        return { direction: 1, mirror: false, action: 'wlk', frame };
      case 4:
        return { direction: 3, mirror: false, action: 'wlk', frame };
      case 2:
      default:
        return { direction: 2, mirror: false, action: 'wlk', frame };
    }
  }

  switch (rawDirection) {
    case 1:
      return { direction: 1, mirror: false, action: 'wlk', frame };
    case 3:
      return { direction: 3, mirror: false, action: 'wlk', frame };
    case 5:
      return { direction: 3, mirror: true, action: 'wlk', frame };
    case 7:
      return { direction: 1, mirror: true, action: 'wlk', frame };
    default:
      return { direction: fallbackDirection, mirror: false, action: 'wlk', frame };
  }
}

function drawGridTile(
  graphics: Graphics,
  cell: GridCell,
  grid: Props['editorState']['grid'],
  fillColor: number,
  alpha: number,
  strokeColor: number,
) {
  const diamond = getIsoDiamond(cell, grid);
  graphics.setFillStyle({ color: fillColor, alpha });
  graphics.poly(flattenScreenPoints(diamond));
  graphics.fill();
  graphics.setStrokeStyle({ color: strokeColor, width: 1, alpha: 0.5 });
  graphics.poly(flattenScreenPoints(diamond));
  graphics.stroke();
}

function drawTopDownTile(
  graphics: Graphics,
  cell: GridCell,
  fillColor: number,
  alpha: number,
  strokeColor: number,
) {
  const x = cell.x * TILE_2D_SIZE;
  const y = cell.y * TILE_2D_SIZE;
  graphics.setFillStyle({ color: fillColor, alpha });
  graphics.rect(x, y, TILE_2D_SIZE, TILE_2D_SIZE);
  graphics.fill();
  graphics.setStrokeStyle({ color: strokeColor, width: 1, alpha: 0.6 });
  graphics.rect(x, y, TILE_2D_SIZE, TILE_2D_SIZE);
  graphics.stroke();
}

function drawRaisedTile(
  graphics: Graphics,
  cell: GridCell,
  grid: Props['editorState']['grid'],
  topColor: number,
  leftColor: number,
  rightColor: number,
) {
  const top = getIsoDiamond(cell, grid);
  const topRaised = top.map((point) => ({ x: point.x, y: point.y - BUILDING_ELEVATION }));
  const [, rightPoint, bottomPoint, leftPoint] = top;
  const [, rightRaisedPoint, bottomRaisedPoint, leftRaisedPoint] = topRaised;

  graphics.setFillStyle({ color: leftColor, alpha: 1 });
  graphics.poly(flattenScreenPoints([leftRaisedPoint, bottomRaisedPoint, bottomPoint, leftPoint]));
  graphics.fill();

  graphics.setFillStyle({ color: rightColor, alpha: 1 });
  graphics.poly(flattenScreenPoints([rightRaisedPoint, bottomRaisedPoint, bottomPoint, rightPoint]));
  graphics.fill();

  graphics.setFillStyle({ color: topColor, alpha: 1 });
  graphics.poly(flattenScreenPoints(topRaised));
  graphics.fill();

  graphics.setStrokeStyle({ color: 0x27313f, width: 1, alpha: 0.45 });
  graphics.poly(flattenScreenPoints(topRaised));
  graphics.stroke();
}

function drawTrackTile(
  graphics: Graphics,
  cell: GridCell,
  grid: Props['editorState']['grid'],
  selected: boolean,
  viewMode: Props['viewMode'],
) {
  if (viewMode === '2d') {
    const x = cell.x * TILE_2D_SIZE;
    const y = cell.y * TILE_2D_SIZE;
    const fill = selected ? 0xfbbf24 : (cell.x + cell.y) % 2 === 0 ? 0xf97316 : 0xea580c;
    const stroke = selected ? 0xfffbeb : 0x7c2d12;
    graphics.setFillStyle({ color: fill, alpha: 0.96 });
    graphics.rect(x, y, TILE_2D_SIZE, TILE_2D_SIZE);
    graphics.fill();
    graphics.setStrokeStyle({ color: stroke, width: selected ? 2 : 1.5, alpha: 0.95 });
    graphics.rect(x, y, TILE_2D_SIZE, TILE_2D_SIZE);
    graphics.stroke();
    return;
  }

  const fill = selected ? 0xfbbf24 : (cell.x + cell.y) % 2 === 0 ? 0xf97316 : 0xea580c;
  const stroke = selected ? 0xfffbeb : 0x7c2d12;
  const diamond = getIsoDiamond(cell, grid);
  const center = diamond.reduce(
    (accumulator, point) => ({ x: accumulator.x + point.x / 4, y: accumulator.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  const inset = diamond.map((point) => ({
    x: center.x + (point.x - center.x) * 0.58,
    y: center.y + (point.y - center.y) * 0.58,
  }));

  graphics.setFillStyle({ color: fill, alpha: 0.96 });
  graphics.poly(flattenScreenPoints(diamond));
  graphics.fill();
  graphics.setStrokeStyle({ color: stroke, width: selected ? 2 : 1.5, alpha: 0.95 });
  graphics.poly(flattenScreenPoints(diamond));
  graphics.stroke();

  graphics.setStrokeStyle({ color: 0xfff7ed, width: 1, alpha: 0.75 });
  graphics.poly(flattenScreenPoints(inset));
  graphics.stroke();
}

function getBuildingColors(type: ModularBuilding['type']) {
  switch (type) {
    case 'academic':
      return { top: 0xeb8d86, left: 0xc86a62, right: 0xaf554e };
    case 'administrative':
      return { top: 0x7eb8ff, left: 0x4a88d8, right: 0x356bb1 };
    case 'services':
      return { top: 0xf0c564, left: 0xd9a73e, right: 0xb78227 };
    case 'sports':
      return { top: 0x7dd79b, left: 0x4db26f, right: 0x39915a };
    case 'research':
      return { top: 0xb09cff, left: 0x856fd7, right: 0x6654b4 };
    case 'mixed':
    default:
      return { top: 0xc8d0da, left: 0x919ba8, right: 0x6a7482 };
  }
}

function getPropLabel(prop: { kind: PropKind; metadata?: Record<string, string> }) {
  const label = prop.metadata?.label?.trim();
  if (!label) {
    return '';
  }
  return prop.kind === 'park' ||
    prop.kind === 'track' ||
    prop.kind === 'access-vehicular' ||
    prop.kind === 'access-pedestrian' ||
    prop.kind === 'poi'
    ? label
    : '';
}

function isSameCell(left: GridCell | null, right: GridCell | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.x === right.x && left.y === right.y;
}

export function ModularMapCanvas({
  editorState,
  onDropPaletteItem,
  onPathBrushStart,
  onPathBrushMove,
  onPathBrushEnd,
  onErase,
  onEraseEnd,
  onSelect,
  onMoveProp,
  onPlaceBuildingBlock,
  onPlaceProp,
  viewMode = 'isometric',
  routePolyline = [],
  manualRoutePolyline = [],
  altPolylines = [],
  onCellClick,
  avatarPosition,
  avatarPositionRef,
  avatarFigure,
  avatarDirection,
  avatarIsMoving = false,
  avatarImageUrl,
  onFirstFrameRendered,
  templateUnderlayEnabled = false,
  controllerRef,
  layoutVersionKey,
  autoRefitOnViewportResize = false,
}: Props) {
  const didNotifyFirstFrameRef = useRef(false);
  const showTemplateUnderlay =
    import.meta.env.DEV &&
    templateUnderlayEnabled &&
    viewMode === '2d' &&
    typeof import.meta.env.VITE_CAMPUS_MAP_UNDERLAY_URL === 'string' &&
    import.meta.env.VITE_CAMPUS_MAP_UNDERLAY_URL.trim().length > 0;

  const devUnderlayUrl = showTemplateUnderlay
    ? import.meta.env.VITE_CAMPUS_MAP_UNDERLAY_URL.trim()
    : '';

  const devUnderlayStorageKey = useMemo(() => {
    const url = devUnderlayUrl.trim();
    return url ? `cuceiverse.templateUnderlay.v1:${url}` : '';
  }, [devUnderlayUrl]);

  const [devUnderlayScale, setDevUnderlayScale] = useState(() => {
    if (!import.meta.env.DEV) {
      return 1;
    }
    const raw = import.meta.env.VITE_CAMPUS_MAP_UNDERLAY_SCALE;
    const parsed = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });

  const [devUnderlayOffset, setDevUnderlayOffset] = useState(() => ({ x: 0, y: 0 }));

  const [devUnderlayVisible, setDevUnderlayVisible] = useState(true);

  const [devUnderlayTexture, setDevUnderlayTexture] = useState<Texture | null>(null);

  // Base de ajuste (fit + centro) que NO debe cambiar aunque el grid se expanda.
  // Esto evita que la plantilla se mueva/reescale sola mientras construyes.
  const [devUnderlayBase, setDevUnderlayBase] = useState<{
    centerX: number;
    centerY: number;
    fitScale: number;
  } | null>(null);

  useEffect(() => {
    if (!devUnderlayUrl) {
      setDevUnderlayTexture(null);
      setDevUnderlayBase(null);
      return;
    }

    let cancelled = false;
    setDevUnderlayTexture(null);

    (async () => {
      try {
        const texture = (await Assets.load(devUnderlayUrl)) as Texture;
        if (!cancelled) {
          setDevUnderlayTexture(texture);
        }
      } catch {
        if (!cancelled) {
          setDevUnderlayTexture(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [devUnderlayUrl]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    if (!devUnderlayStorageKey || typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(devUnderlayStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        scale?: unknown;
        offset?: { x?: unknown; y?: unknown };
        base?: { centerX?: unknown; centerY?: unknown; fitScale?: unknown };
      };

      const nextScale = typeof parsed.scale === 'number' ? parsed.scale : NaN;
      if (Number.isFinite(nextScale) && nextScale > 0) {
        setDevUnderlayScale(nextScale);
      }

      const nextX = typeof parsed.offset?.x === 'number' ? parsed.offset.x : NaN;
      const nextY = typeof parsed.offset?.y === 'number' ? parsed.offset.y : NaN;
      if (Number.isFinite(nextX) || Number.isFinite(nextY)) {
        setDevUnderlayOffset((current) => ({
          x: Number.isFinite(nextX) ? nextX : current.x,
          y: Number.isFinite(nextY) ? nextY : current.y,
        }));
      }

      const nextCenterX = typeof parsed.base?.centerX === 'number' ? parsed.base.centerX : NaN;
      const nextCenterY = typeof parsed.base?.centerY === 'number' ? parsed.base.centerY : NaN;
      const nextFitScale = typeof parsed.base?.fitScale === 'number' ? parsed.base.fitScale : NaN;
      if (Number.isFinite(nextCenterX) && Number.isFinite(nextCenterY) && Number.isFinite(nextFitScale) && nextFitScale > 0) {
        setDevUnderlayBase({ centerX: nextCenterX, centerY: nextCenterY, fitScale: nextFitScale });
      }
    } catch {
      // ignore
    }
  }, [devUnderlayStorageKey]);

  // When a template underlay is active in 2D, make tiles partially transparent
  // so the image can be seen behind the grid.
  const templateTileAlpha = devUnderlayTexture && devUnderlayVisible ? 0.35 : 1;
  const templateBuildingAlpha = devUnderlayTexture && devUnderlayVisible ? 0.75 : 1;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pixiApplicationRef = useRef<ApplicationRef | null>(null);
  const avatarOverlayRef = useRef<HTMLDivElement | null>(null);
  const avatarVisualRef = useRef<HTMLElement | null>(null);
  const avatarBubbleRef = useRef<HTMLDivElement | null>(null);
  const avatarBubbleVisualRef = useRef<HTMLElement | null>(null);
  const avatarOverlayFrameRef = useRef(0);
  const avatarMotionFrameRef = useRef(0);
  const avatarMotionTimerRef = useRef<number | null>(null);
  const worldContainerRef = useRef<Container | null>(null);
  const overlayContainerRef = useRef<Container | null>(null);
  const didMeasureViewportRef = useRef(false);
  const cameraRef = useRef<EditorCamera | null>(null);
  const pendingCameraRef = useRef<EditorCamera | null>(null);
  const cameraFrameRef = useRef(0);
  const panRef = useRef<{
    pointerX: number;
    pointerY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const propDragRef = useRef<string | null>(null);
  const brushActiveRef = useRef(false);
  const areaBrushActiveRef = useRef(false);
  const lastAreaBrushCellKeyRef = useRef<string | null>(null);
  const eraseActiveRef = useRef(false);
  const erasedCellKeysRef = useRef<Set<string>>(new Set());
  // Used to distinguish a click (no drag) from a pan drag in pan mode
  const panStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const activeTouchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initialCameraX: number;
    initialCameraY: number;
    initialWorldX: number;
    initialWorldY: number;
  } | null>(null);
  const lastNativeTouchAtRef = useRef(0);
  const suppressNextTapUntilRef = useRef(0);
  const nativeTouchGestureRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pinching: boolean;
  } | null>(null);
  const touchCameraTargetRef = useRef<EditorCamera | null>(null);
  const touchCameraFrameRef = useRef(0);

  const [camera, setCamera] = useState<EditorCamera>(() => ({
    ...fitCameraToBounds(
      { width: 1400, height: 820 },
      getIsoCampusBounds(editorState.grid),
    ),
  }));
  const [hoverCell, setHoverCell] = useState<GridCell | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const didAutoFitRef = useRef(false);
  const lastAutoFitModeRef = useRef<NonNullable<Props['viewMode']> | undefined>(undefined);
  const lastAutoFitLayoutKeyRef = useRef<string | undefined>(layoutVersionKey);
  const lastAutoFitViewportKeyRef = useRef<string | undefined>(undefined);

  const applyCameraTransform = useCallback((nextCamera: EditorCamera) => {
    cameraRef.current = nextCamera;
    const worldContainer = worldContainerRef.current;
    if (worldContainer) {
      worldContainer.position.set(nextCamera.x, nextCamera.y);
      worldContainer.scale.set(nextCamera.scale, nextCamera.scale);
    }

    const overlayContainer = overlayContainerRef.current;
    if (overlayContainer) {
      overlayContainer.position.set(nextCamera.x, nextCamera.y);
      overlayContainer.scale.set(nextCamera.scale, nextCamera.scale);
    }
  }, []);

  const scheduleCameraUpdate = useCallback(
    (updater: EditorCamera | ((current: EditorCamera) => EditorCamera)) => {
      const current = pendingCameraRef.current ?? cameraRef.current ?? camera;
      pendingCameraRef.current = typeof updater === 'function' ? updater(current) : updater;

      if (cameraFrameRef.current) {
        return;
      }

      cameraFrameRef.current = requestAnimationFrame(() => {
        cameraFrameRef.current = 0;
        const next = pendingCameraRef.current;
        pendingCameraRef.current = null;
        if (!next) {
          return;
        }
        applyCameraTransform(next);
      });
    },
    [applyCameraTransform, camera],
  );

  const campusBounds = useMemo(() => {
    return viewMode === '2d'
      ? get2DCampusBounds(editorState.grid)
      : getIsoCampusBounds(editorState.grid);
  }, [viewMode, editorState.grid]);

  const resetCamera = useCallback(() => {
    const nextCamera = fitCameraToBounds(viewportSize, campusBounds);
    pendingCameraRef.current = null;
    setCamera(nextCamera);
    applyCameraTransform(nextCamera);
  }, [applyCameraTransform, campusBounds, viewportSize]);

  const zoomCamera = useCallback(
    (factor: number) => {
      scheduleCameraUpdate((current) => {
        const nextScale = clamp(current.scale * factor, MIN_ZOOM, MAX_ZOOM);
        const centerX = viewportSize.width / 2;
        const centerY = viewportSize.height / 2;
        const worldX = (centerX - current.x) / current.scale;
        const worldY = (centerY - current.y) / current.scale;
        return {
          x: centerX - worldX * nextScale,
          y: centerY - worldY * nextScale,
          scale: nextScale,
        };
      });
    },
    [scheduleCameraUpdate, viewportSize.height, viewportSize.width],
  );

  const smoothTouchCamera = useCallback(
    (nextCamera: EditorCamera) => {
      touchCameraTargetRef.current = nextCamera;

      if (touchCameraFrameRef.current) {
        return;
      }

      const tick = () => {
        const target = touchCameraTargetRef.current;
        if (!target) {
          touchCameraFrameRef.current = 0;
          return;
        }

        const current = cameraRef.current ?? camera;
        const deltaX = target.x - current.x;
        const deltaY = target.y - current.y;
        const deltaScale = target.scale - current.scale;

        const nextCamera = {
          x: current.x + deltaX * 0.28,
          y: current.y + deltaY * 0.28,
          scale: current.scale + deltaScale * 0.22,
        };

        const closeEnough =
          Math.abs(deltaX) < 0.15 &&
          Math.abs(deltaY) < 0.15 &&
          Math.abs(deltaScale) < 0.0015;

        applyCameraTransform(nextCamera);
        setCamera(nextCamera);

        if (closeEnough) {
          applyCameraTransform(target);
          setCamera(target);
          touchCameraTargetRef.current = null;
          touchCameraFrameRef.current = 0;
          return;
        }

        touchCameraFrameRef.current = requestAnimationFrame(tick);
      };

      touchCameraFrameRef.current = requestAnimationFrame(tick);
    },
    [applyCameraTransform, camera],
  );

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      zoomIn: () => zoomCamera(1.15),
      zoomOut: () => zoomCamera(1 / 1.15),
      reset: () => resetCamera(),
    };
    return () => {
      if (controllerRef) controllerRef.current = null;
    };
  }, [controllerRef, zoomCamera, resetCamera]);

  useEffect(() => {
    applyCameraTransform(camera);
  }, [applyCameraTransform, camera]);

  // Inicializar la base una sola vez cuando exista textura.
  useEffect(() => {
    if (!devUnderlayTexture) {
      return;
    }
    if (devUnderlayBase) {
      return;
    }

    const campusWidth = Math.max(1, campusBounds.maxX - campusBounds.minX);
    const campusHeight = Math.max(1, campusBounds.maxY - campusBounds.minY);

    const textureWidth = Math.max(1, devUnderlayTexture.width);
    const textureHeight = Math.max(1, devUnderlayTexture.height);
    const fitScale = Math.min(campusWidth / textureWidth, campusHeight / textureHeight);

    const centerX = (campusBounds.minX + campusBounds.maxX) / 2;
    const centerY = (campusBounds.minY + campusBounds.maxY) / 2;

    setDevUnderlayBase({ centerX, centerY, fitScale: Math.max(0.0001, fitScale) });
  }, [devUnderlayTexture, devUnderlayBase, campusBounds.maxX, campusBounds.maxY, campusBounds.minX, campusBounds.minY]);

  const devUnderlayPlacement = useMemo(() => {
    if (!devUnderlayTexture) {
      return null;
    }

    // Si existe base, no dependemos de campusBounds para evitar que la plantilla se mueva
    // cuando el grid crece mientras construyes.
    const fallbackCenterX = (campusBounds.minX + campusBounds.maxX) / 2;
    const fallbackCenterY = (campusBounds.minY + campusBounds.maxY) / 2;

    const campusWidth = Math.max(1, campusBounds.maxX - campusBounds.minX);
    const campusHeight = Math.max(1, campusBounds.maxY - campusBounds.minY);
    const textureWidth = Math.max(1, devUnderlayTexture.width);
    const textureHeight = Math.max(1, devUnderlayTexture.height);
    const fallbackFitScale = Math.min(campusWidth / textureWidth, campusHeight / textureHeight);

    const baseCenterX = devUnderlayBase?.centerX ?? fallbackCenterX;
    const baseCenterY = devUnderlayBase?.centerY ?? fallbackCenterY;
    const baseFitScale = devUnderlayBase?.fitScale ?? Math.max(0.0001, fallbackFitScale);

    const scale = baseFitScale * devUnderlayScale;
    return {
      x: baseCenterX + devUnderlayOffset.x,
      y: baseCenterY + devUnderlayOffset.y,
      scale,
    };
  }, [campusBounds.maxX, campusBounds.maxY, campusBounds.minX, campusBounds.minY, devUnderlayBase, devUnderlayOffset.x, devUnderlayOffset.y, devUnderlayScale, devUnderlayTexture]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      if (!isEditableElement(event.target)) {
        event.preventDefault();
      }
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      if (!isEditableElement(event.target)) {
        event.preventDefault();
      }
      setIsSpacePressed(false);
      setIsPanning(false);
      panRef.current = null;
    };

    const handleWindowBlur = () => {
      setIsSpacePressed(false);
      setIsPanning(false);
      panRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let frameId = 0;
    const updateSize = () => {
      didMeasureViewportRef.current = true;
      setViewportSize({
        width: Math.max(1, viewport.clientWidth),
        height: Math.max(1, viewport.clientHeight),
      });
    };

    updateSize();
    frameId = window.requestAnimationFrame(updateSize);
      // Medir múltiples veces en RAF para capturar cambios de layout en móvil
      let frame2 = window.requestAnimationFrame(() => {
        updateSize();
        frame2 = window.requestAnimationFrame(updateSize);
      });
      const observer = new ResizeObserver(updateSize);
      observer.observe(viewport);

    return () => {
        if (frame2) {
          window.cancelAnimationFrame(frame2);
        }
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const app = pixiApplicationRef.current?.getApplication();
    const viewport = viewportRef.current;
    if (!app || !viewport) {
      return;
    }

    app.resizeTo = viewport;
    app.resize();

    const frameId = window.requestAnimationFrame(() => {
      pixiApplicationRef.current?.getApplication()?.resize();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [viewportSize.width, viewportSize.height]);

  useEffect(() => {
    // Auto-fit only on first layout (or when switching view mode).
    // Avoid re-fitting when the editor expands the grid while placing blocks,
    // which would feel like a random re-center.
    if (!didMeasureViewportRef.current) {
      return;
    }

    // Ignore spurious very-small measurements that sometimes occur on first
    // paint (e.g. 0x0 or very small values). Wait until the viewport has a
    // reasonable size before performing the initial auto-fit so a later
    // ResizeObserver update can still trigger the fit.
      const MIN_VIEWPORT_DIM = 50;
    if (viewportSize.width < MIN_VIEWPORT_DIM || viewportSize.height < MIN_VIEWPORT_DIM) {
      return;
    }

    const modeChanged = lastAutoFitModeRef.current !== viewMode;
    const layoutChanged =
      layoutVersionKey !== undefined &&
      lastAutoFitLayoutKeyRef.current !== layoutVersionKey;
    const viewportKey = `${viewportSize.width}x${viewportSize.height}`;
    const viewportChanged = lastAutoFitViewportKeyRef.current !== viewportKey;

    if (!didAutoFitRef.current || modeChanged || layoutChanged || (autoRefitOnViewportResize && viewportChanged)) {
      const nextCamera = fitCameraToBounds(viewportSize, campusBounds);
      applyCameraTransform(nextCamera);
      setCamera(nextCamera);
      didAutoFitRef.current = true;
      lastAutoFitModeRef.current = viewMode;
      lastAutoFitLayoutKeyRef.current = layoutVersionKey;
      lastAutoFitViewportKeyRef.current = viewportKey;
    }
  }, [
    applyCameraTransform,
    autoRefitOnViewportResize,
    viewportSize.width,
    viewportSize.height,
    viewMode,
    campusBounds,
    layoutVersionKey,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleZoom = (event: WheelEvent) => {
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      scheduleCameraUpdate((current) => {
        const nextScale = clamp(current.scale - event.deltaY * 0.0012, MIN_ZOOM, MAX_ZOOM);
        const worldX = (localX - current.x) / current.scale;
        const worldY = (localY - current.y) / current.scale;
        return {
          x: localX - worldX * nextScale,
          y: localY - worldY * nextScale,
          scale: nextScale,
        };
      });
    };

    viewport.addEventListener('wheel', handleZoom, { passive: false });

    return () => {
      viewport.removeEventListener('wheel', handleZoom);
    };
  }, [scheduleCameraUpdate]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const getTouchPoint = (touch: Touch) => ({
      x: touch.clientX,
      y: touch.clientY,
    });

    const nativeTouchToGridCell = (touch: Touch): GridCell => {
      const rect = viewport.getBoundingClientRect();
      const currentCamera = cameraRef.current ?? camera;
      const localX = touch.clientX - rect.left;
      const localY = touch.clientY - rect.top;

      if (viewMode === '2d') {
        const worldX = (localX - currentCamera.x) / currentCamera.scale;
        const worldY = (localY - currentCamera.y) / currentCamera.scale;
        return {
          x: Math.floor(worldX / TILE_2D_SIZE),
          y: Math.floor(worldY / TILE_2D_SIZE),
        };
      }

      return screenToIsoGrid(localX, localY, currentCamera, editorState.grid);
    };

    const beginNativePinch = (touches: TouchList) => {
      suppressNextTapUntilRef.current = Date.now() + 600;
      const currentCamera = cameraRef.current ?? camera;
      const first = getTouchPoint(touches[0]);
      const second = getTouchPoint(touches[1]);
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const midClientX = (first.x + second.x) / 2;
      const midClientY = (first.y + second.y) / 2;
      const rect = viewport.getBoundingClientRect();
      const localX = midClientX - rect.left;
      const localY = midClientY - rect.top;

      pinchRef.current = {
        initialDistance: distance,
        initialScale: currentCamera.scale,
        initialCameraX: currentCamera.x,
        initialCameraY: currentCamera.y,
        initialWorldX: (localX - currentCamera.x) / currentCamera.scale,
        initialWorldY: (localY - currentCamera.y) / currentCamera.scale,
      };
      panRef.current = null;
      panStartPosRef.current = null;
      nativeTouchGestureRef.current = nativeTouchGestureRef.current
        ? { ...nativeTouchGestureRef.current, pinching: true, moved: true }
        : null;
      setIsPanning(true);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (editorState.activeTool !== 'pan') {
        return;
      }

      lastNativeTouchAtRef.current = Date.now();
      event.preventDefault();

      if (event.touches.length >= 2) {
        suppressNextTapUntilRef.current = Date.now() + 600;
        beginNativePinch(event.touches);
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      const currentCamera = cameraRef.current ?? camera;
      panRef.current = {
        pointerX: touch.clientX,
        pointerY: touch.clientY,
        cameraX: currentCamera.x,
        cameraY: currentCamera.y,
      };
      panStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      nativeTouchGestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        moved: false,
        pinching: false,
      };
      pinchRef.current = null;
      setIsPanning(true);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (editorState.activeTool !== 'pan') {
        return;
      }

      lastNativeTouchAtRef.current = Date.now();
      event.preventDefault();

      if (event.touches.length >= 2) {
        if (nativeTouchGestureRef.current) {
          nativeTouchGestureRef.current.moved = true;
          nativeTouchGestureRef.current.pinching = true;
        }
        if (!pinchRef.current) {
          beginNativePinch(event.touches);
        }

        const pinch = pinchRef.current;
        if (!pinch) {
          return;
        }

        const first = getTouchPoint(event.touches[0]);
        const second = getTouchPoint(event.touches[1]);
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const midClientX = (first.x + second.x) / 2;
        const midClientY = (first.y + second.y) / 2;
        const rect = viewport.getBoundingClientRect();
        const localX = midClientX - rect.left;
        const localY = midClientY - rect.top;
        const nextScale = clamp(
          pinch.initialScale * (distance / pinch.initialDistance),
          MIN_ZOOM,
          MAX_ZOOM,
        );

        applyCameraTransform({
          x: localX - pinch.initialWorldX * nextScale,
          y: localY - pinch.initialWorldY * nextScale,
          scale: nextScale,
        });
        return;
      }

      const touch = event.touches[0];
      const pan = panRef.current;
      if (!touch || !pan) {
        return;
      }

      const gesture = nativeTouchGestureRef.current;
      if (gesture && Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY) > 8) {
        gesture.moved = true;
      }

      applyCameraTransform({
        x: pan.cameraX + (touch.clientX - pan.pointerX),
        y: pan.cameraY + (touch.clientY - pan.pointerY),
        scale: cameraRef.current?.scale ?? camera.scale,
      });
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (editorState.activeTool !== 'pan') {
        return;
      }

      lastNativeTouchAtRef.current = Date.now();
      event.preventDefault();

      if (event.touches.length >= 2) {
        beginNativePinch(event.touches);
        return;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        const currentCamera = cameraRef.current ?? camera;
        panRef.current = {
          pointerX: touch.clientX,
          pointerY: touch.clientY,
          cameraX: currentCamera.x,
          cameraY: currentCamera.y,
        };
        panStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        nativeTouchGestureRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          moved: false,
          pinching: false,
        };
        pinchRef.current = null;
        return;
      }

      const changedTouch = event.changedTouches[0];
      const gesture = nativeTouchGestureRef.current;
      if (
        changedTouch &&
        gesture &&
        !gesture.moved &&
        !gesture.pinching &&
        Date.now() >= suppressNextTapUntilRef.current &&
        onCellClick
      ) {
        onCellClick(nativeTouchToGridCell(changedTouch));
      }

      pinchRef.current = null;
      panRef.current = null;
      panStartPosRef.current = null;
      nativeTouchGestureRef.current = null;
      touchCameraTargetRef.current = null;
      setIsPanning(false);
    };

    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd, { passive: false });
    viewport.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [applyCameraTransform, camera, editorState.activeTool, editorState.grid, onCellClick, viewMode]);

  useEffect(() => {
    return () => {
      if (cameraFrameRef.current) {
        cancelAnimationFrame(cameraFrameRef.current);
      }
      if (touchCameraFrameRef.current) {
        cancelAnimationFrame(touchCameraFrameRef.current);
      }
    };
  }, []);

  const buildings = useMemo(
    () => Object.values(editorState.buildingsById).sort((left, right) => left.id.localeCompare(right.id)),
    [editorState.buildingsById],
  );
  const props = useMemo(
    () =>
      Object.values(editorState.propsById).sort((left, right) => {
        const byCell = left.cell.y - right.cell.y || left.cell.x - right.cell.x;
        if (byCell !== 0) {
          return byCell;
        }
        const layerPriority = (kind: PropKind) => {
          if (kind === 'asphalt') return 10;
          if (kind === 'car') return 100;
          if (kind === 'motorcycle') return 95;
          if (kind === 'access-vehicular' || kind === 'access-pedestrian') return 80;
          return 50;
        };
        return layerPriority(left.kind) - layerPriority(right.kind);
      }),
    [editorState.propsById],
  );
  const asphaltCells = useMemo(() => {
    const set = new Set<string>();
    for (const prop of Object.values(editorState.propsById)) {
      if (prop.kind === 'asphalt') {
        set.add(cellKey(prop.cell));
      }
    }
    return set;
  }, [editorState.propsById]);

  const updateHoverCell = useCallback((nextCell: GridCell | null) => {
    setHoverCell((current) => (isSameCell(current, nextCell) ? current : nextCell));
  }, []);

  const toGridCell = (event: { clientX: number; clientY: number }, currentTarget: HTMLDivElement) => {
    const rect = currentTarget.getBoundingClientRect();
    const currentCamera = cameraRef.current ?? camera;
    if (viewMode === '2d') {
      const worldX = (event.clientX - rect.left - currentCamera.x) / currentCamera.scale;
      const worldY = (event.clientY - rect.top - currentCamera.y) / currentCamera.scale;
      return {
        x: Math.floor(worldX / TILE_2D_SIZE),
        y: Math.floor(worldY / TILE_2D_SIZE),
      };
    }
    return screenToIsoGrid(
      event.clientX - rect.left,
      event.clientY - rect.top,
      currentCamera,
      editorState.grid,
    );
  };

  const eraseAtCellOnce = (cell: GridCell) => {
    const footprint = editorState.activeEraseFootprint;
    const width = Math.max(1, Math.floor(footprint.width));
    const height = Math.max(1, Math.floor(footprint.height));

    const topLeft: GridCell = {
      x: cell.x - Math.floor(width / 2),
      y: cell.y - Math.floor(height / 2),
    };

    for (const target of expandBlockCells(topLeft, { width, height })) {
      if (
        target.x < 0 ||
        target.y < 0 ||
        target.x >= editorState.grid.columns ||
        target.y >= editorState.grid.rows
      ) {
        continue;
      }
      const key = cellKey(target);
      if (erasedCellKeysRef.current.has(key)) {
        continue;
      }
      erasedCellKeysRef.current.add(key);
      onErase(target);
    }
  };

  const paintAreaAtCellOnce = (cell: GridCell) => {
    const key = cellKey(cell);
    if (lastAreaBrushCellKeyRef.current === key) {
      return;
    }
    lastAreaBrushCellKeyRef.current = key;
    onPlaceBuildingBlock(cell);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((isSpacePressed || editorState.activeTool === 'pan') && event.button === 0) {
      const currentCamera = cameraRef.current ?? camera;
      panRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        cameraX: currentCamera.x,
        cameraY: currentCamera.y,
      };
      panStartPosRef.current = { x: event.clientX, y: event.clientY };
      setIsPanning(true);
      return;
    }

    const cell = toGridCell(event, event.currentTarget);
    updateHoverCell(cell);

    if (event.button !== 0) {
      return;
    }

    if (editorState.activeTool === 'path-brush') {
      brushActiveRef.current = true;
      onPathBrushStart(cell);
      return;
    }

    if (editorState.activeTool === 'erase') {
      eraseActiveRef.current = true;
      erasedCellKeysRef.current = new Set();
      eraseAtCellOnce(cell);
      return;
    }

    if (editorState.activeTool === 'area-block') {
      areaBrushActiveRef.current = true;
      paintAreaAtCellOnce(cell);
      return;
    }

    if (editorState.activeTool === 'building-block') {
      onPlaceBuildingBlock(cell);
      return;
    }

    if (editorState.activeTool === 'prop') {
      onPlaceProp(cell);
      return;
    }

    if (editorState.activeTool === 'select') {
      const propId = getPropAtCell(cell, editorState.propsById);
      if (propId) {
        propDragRef.current = propId;
      }
      onSelect(cell);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // En touch necesitamos gestures y evitar scroll/pinch del navegador.
    if (event.pointerType === 'touch') {
      if (Date.now() - lastNativeTouchAtRef.current < 500) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      activeTouchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (activeTouchPointersRef.current.size >= 2) {
        suppressNextTapUntilRef.current = Date.now() + 600;
        const currentCamera = cameraRef.current ?? camera;
        const points = Array.from(activeTouchPointersRef.current.values());
        const a = points[0];
        const b = points[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const midClientX = (a.x + b.x) / 2;
        const midClientY = (a.y + b.y) / 2;

        const rect = event.currentTarget.getBoundingClientRect();
        const localX = midClientX - rect.left;
        const localY = midClientY - rect.top;

        pinchRef.current = {
          initialDistance: distance,
          initialScale: currentCamera.scale,
          initialCameraX: currentCamera.x,
          initialCameraY: currentCamera.y,
          initialWorldX: (localX - currentCamera.x) / currentCamera.scale,
          initialWorldY: (localY - currentCamera.y) / currentCamera.scale,
        };

        setIsPanning(true);
        panRef.current = null;
        panStartPosRef.current = null;
        return;
      }

      // Pan con 1 dedo solo cuando el tool sea pan.
      if (editorState.activeTool === 'pan') {
        const currentCamera = cameraRef.current ?? camera;
        panRef.current = {
          pointerX: event.clientX,
          pointerY: event.clientY,
          cameraX: currentCamera.x,
          cameraY: currentCamera.y,
        };
        panStartPosRef.current = { x: event.clientX, y: event.clientY };
        setIsPanning(true);
        return;
      }

      // Si no es pan, tratar como click izquierdo.
      handleMouseDown(event);
      return;
    }

    // mouse/pen: reusar handler existente.
    handleMouseDown(event);
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && (isSpacePressed || editorState.activeTool === 'pan') && isPanning) {
      scheduleCameraUpdate((current) => ({
        ...current,
        x: pan.cameraX + (event.clientX - pan.pointerX),
        y: pan.cameraY + (event.clientY - pan.pointerY),
      }));
      return;
    }

    const cell = toGridCell(event, event.currentTarget);
    updateHoverCell(cell);

    if (brushActiveRef.current && editorState.activeTool === 'path-brush') {
      onPathBrushMove(cell);
      return;
    }

    if (eraseActiveRef.current && editorState.activeTool === 'erase') {
      eraseAtCellOnce(cell);
      return;
    }

    if (areaBrushActiveRef.current && editorState.activeTool === 'area-block') {
      paintAreaAtCellOnce(cell);
      return;
    }

    if (propDragRef.current && editorState.activeTool === 'select') {
      onMoveProp(propDragRef.current, cell);
      return;
    }

    if (!isPanning) {
      return;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      if (Date.now() - lastNativeTouchAtRef.current < 500) {
        return;
      }
      if (activeTouchPointersRef.current.has(event.pointerId)) {
        activeTouchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      // Pinch (2 dedos)
      if (pinchRef.current && activeTouchPointersRef.current.size >= 2) {
        suppressNextTapUntilRef.current = Date.now() + 600;
        const points = Array.from(activeTouchPointersRef.current.values());
        const a = points[0];
        const b = points[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const midClientX = (a.x + b.x) / 2;
        const midClientY = (a.y + b.y) / 2;

        const rect = event.currentTarget.getBoundingClientRect();
        const localX = midClientX - rect.left;
        const localY = midClientY - rect.top;

        const pinch = pinchRef.current;
        const rawScale = pinch.initialScale * (distance / pinch.initialDistance);
        const nextScale = clamp(rawScale, MIN_ZOOM, MAX_ZOOM);

        smoothTouchCamera({
          x: localX - pinch.initialWorldX * nextScale,
          y: localY - pinch.initialWorldY * nextScale,
          scale: nextScale,
        });
        return;
      }

      // Pan con 1 dedo
      const pan = panRef.current;
      if (pan && editorState.activeTool === 'pan' && isPanning) {
        smoothTouchCamera({
          x: pan.cameraX + (event.clientX - pan.pointerX),
          y: pan.cameraY + (event.clientY - pan.pointerY),
          scale: cameraRef.current?.scale ?? camera.scale,
        });
        return;
      }

      // Hover/drag en herramientas: reusar handler.
      handleMouseMove(event);
      return;
    }

    // mouse/pen
    handleMouseMove(event);
  };

  const finishInteraction = (event?: ReactMouseEvent<HTMLDivElement>) => {
    if (brushActiveRef.current) {
      brushActiveRef.current = false;
      onPathBrushEnd();
    }
    if (areaBrushActiveRef.current) {
      areaBrushActiveRef.current = false;
      lastAreaBrushCellKeyRef.current = null;
    }
    if (eraseActiveRef.current) {
      eraseActiveRef.current = false;
      erasedCellKeysRef.current = new Set();
      onEraseEnd();
    }
    // If we were in pan mode and barely moved (i.e. a click), fire onCellClick
    if (
      onCellClick &&
      event &&
      (isSpacePressed || editorState.activeTool === 'pan') &&
      panStartPosRef.current &&
      Date.now() >= suppressNextTapUntilRef.current
    ) {
      const dx = event.clientX - panStartPosRef.current.x;
      const dy = event.clientY - panStartPosRef.current.y;
      if (Math.hypot(dx, dy) < 6) {
        const cell = toGridCell(event, event.currentTarget);
        onCellClick(cell);
      }
    }
    panStartPosRef.current = null;
    propDragRef.current = null;
    setIsPanning(false);
    panRef.current = null;
    touchCameraTargetRef.current = null;
  };

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      if (Date.now() - lastNativeTouchAtRef.current < 500) {
        return;
      }
      activeTouchPointersRef.current.delete(event.pointerId);
      if (activeTouchPointersRef.current.size < 2) {
        pinchRef.current = null;
      }
    }

    finishInteraction(event);
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData(DROP_MIME);
    if (!raw) {
      return;
    }

    try {
      const payload = JSON.parse(raw) as DragPalettePayload;
      const cell = toGridCell(event, event.currentTarget);
      onDropPaletteItem(payload, cell);
    } catch {
      // Ignorar payload invÃ¡lido del drag externo.
    }
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const cell = toGridCell(event, event.currentTarget);
    updateHoverCell(cell);
  };

  const selectedBuildingId = editorState.selection?.kind === 'building' ? editorState.selection.id : null;
  const selectedPropId = editorState.selection?.kind === 'prop' ? editorState.selection.id : null;
  const renderCamera = cameraRef.current ?? camera;
  const avatarIdleDirection = getAvatarIdleDirection(viewMode);
  const canvasCursorClass = isPanning
    ? 'modular-canvas-shell--grabbing'
    : (isSpacePressed || editorState.activeTool === 'pan')
      ? 'modular-canvas-shell--grab'
      : 'modular-canvas-shell--tool';
  const syncAvatarVisuals = useCallback(() => {
    const mainVisual = avatarVisualRef.current;
    const bubbleVisual = avatarBubbleVisualRef.current;

    if (!mainVisual && !bubbleVisual) {
      return;
    }

    const pose = getAvatarPose(viewMode, avatarDirection, avatarIsMoving, avatarMotionFrameRef.current);
    const nextMainSrc = avatarFigure
      ? resolveAvatarImage(avatarFigure, {
          size: 'n',
          direction: pose.direction,
          headDirection: pose.direction,
          action: pose.action,
          gesture: 'std',
          format: pose.action === 'wlk' ? 'gif' : 'png',
        })
      : avatarImageUrl ?? null;
    const nextBubbleSrc = avatarFigure
      ? resolveAvatarImage(avatarFigure, {
          size: 's',
          direction: avatarIdleDirection,
          headDirection: avatarIdleDirection,
          action: 'std',
          gesture: 'std',
          format: 'png',
        })
      : avatarImageUrl ?? null;

    const mainTransform = `translate3d(-50%, -100%, 0) scaleX(${pose.mirror ? -1 : 1})`;
    const bubbleTransform = `scaleX(${pose.mirror ? -1 : 1})`;

    if (mainVisual instanceof HTMLImageElement) {
      if (nextMainSrc && mainVisual.getAttribute('src') !== nextMainSrc) {
        mainVisual.src = nextMainSrc;
      }
      mainVisual.style.transform = mainTransform;
    } else if (mainVisual) {
      mainVisual.style.transform = 'translate3d(-50%, -100%, 0)';
    }

    if (bubbleVisual instanceof HTMLImageElement) {
      if (nextBubbleSrc && bubbleVisual.getAttribute('src') !== nextBubbleSrc) {
        bubbleVisual.src = nextBubbleSrc;
      }
      bubbleVisual.style.transform = bubbleTransform;
    } else if (bubbleVisual) {
      bubbleVisual.style.transform = 'scaleX(1)';
    }
  }, [avatarDirection, avatarFigure, avatarIdleDirection, avatarImageUrl, avatarIsMoving, viewMode]);

  useEffect(() => {
    avatarMotionFrameRef.current = 0;
    syncAvatarVisuals();

    if (avatarMotionTimerRef.current !== null) {
      window.clearInterval(avatarMotionTimerRef.current);
      avatarMotionTimerRef.current = null;
    }

    if (!avatarIsMoving || !avatarFigure) {
      return () => undefined;
    }

    const frames = [0, 1, 2, 1];
    let frameIndex = 0;

    avatarMotionTimerRef.current = window.setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      avatarMotionFrameRef.current = frames[frameIndex];
      syncAvatarVisuals();
    }, 140);

    return () => {
      if (avatarMotionTimerRef.current !== null) {
        window.clearInterval(avatarMotionTimerRef.current);
        avatarMotionTimerRef.current = null;
      }
    };
  }, [avatarFigure, avatarIsMoving, avatarDirection, syncAvatarVisuals]);

  const syncAvatarOverlay = useCallback(() => {
    const overlay = avatarOverlayRef.current;
    const visual = avatarVisualRef.current;
    const bubble = avatarBubbleRef.current;
    const bubbleVisual = avatarBubbleVisualRef.current;

    if (!overlay || !visual || !bubble || !bubbleVisual) {
      return;
    }

    const nextAvatarPosition = avatarPositionRef?.current ?? avatarPosition;
    if (!nextAvatarPosition) {
      overlay.style.opacity = '0';
      return;
    }

    const currentCamera = cameraRef.current ?? camera;
    const avatarWorldPoint = gridPositionToWorld(nextAvatarPosition, editorState.grid, viewMode);
    const screenX = avatarWorldPoint.x * currentCamera.scale + currentCamera.x;
    const screenY = avatarWorldPoint.y * currentCamera.scale + currentCamera.y;
    const avatarScreenHeight = Math.max(
      16,
      (viewMode === '2d' ? TILE_2D_SIZE * 1.6 : 72) * currentCamera.scale,
    );
    const bubbleSize = Math.max(34, Math.min(62, 42 + currentCamera.scale * 16));
    const bubbleInsetSize = Math.max(22, bubbleSize * 0.62);
    const bubbleOffset = Math.max(10, avatarScreenHeight * 0.34);
    const showBubble = currentCamera.scale <= (viewMode === '2d' ? 0.65 : 0.55);

    overlay.style.opacity = '1';
    overlay.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
    visual.style.height = `${avatarScreenHeight}px`;
    visual.style.display = showBubble ? 'none' : 'block';
    if (visual instanceof HTMLDivElement) {
      visual.style.width = `${Math.max(10, avatarScreenHeight * 0.58)}px`;
    }

    bubble.style.display = showBubble ? 'block' : 'none';
    bubble.style.transform = `translate3d(-50%, calc(-100% - ${bubbleOffset}px), 0)`;
    bubble.style.width = `${bubbleSize}px`;
    bubble.style.height = `${bubbleSize}px`;
    bubbleVisual.style.width = `${bubbleInsetSize}px`;
    bubbleVisual.style.height = `${bubbleInsetSize}px`;
  }, [avatarPosition, avatarPositionRef, camera, editorState.grid, viewMode]);

  useEffect(() => {
    const tick = () => {
      syncAvatarOverlay();
      avatarOverlayFrameRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(avatarOverlayFrameRef.current);
      avatarOverlayFrameRef.current = 0;
    };
  }, [syncAvatarOverlay]);

  const drawScene = useCallback((graphics: Graphics) => {
    graphics.clear();

    if (!didNotifyFirstFrameRef.current) {
      didNotifyFirstFrameRef.current = true;
      onFirstFrameRendered?.();
    }

    for (const rawKey in editorState.areaCellsByKey) {
      const separatorIndex = rawKey.indexOf(':');
      if (separatorIndex <= 0) {
        continue;
      }

      const column = Number(rawKey.slice(0, separatorIndex));
      const row = Number(rawKey.slice(separatorIndex + 1));
      if (!Number.isFinite(column) || !Number.isFinite(row)) {
        continue;
      }

      const path = editorState.pathsByCell[rawKey];
      const fill = path
        ? path.material === 'pavers'
          ? 0xd8d0bc
          : path.material === 'grass-transition'
            ? 0x8cb989
            : path.material === 'indoor'
              ? 0xe7d7b5
              : 0xc8cfd8
        : (column + row) % 2 === 0
          ? 0x86c56e
          : 0x7bb864;
      const stroke = path ? 0x6f7f8e : 0x5e8b4c;
      if (viewMode === '2d') {
        drawTopDownTile(
          graphics,
          { x: column, y: row },
          fill,
          templateTileAlpha,
          stroke,
        );
      } else {
        drawGridTile(graphics, { x: column, y: row }, editorState.grid, fill, 1, stroke);
      }
    }

    for (const building of buildings) {
      const colors = getBuildingColors(building.type);
      const isSelected = selectedBuildingId === building.id;
      const sortedCells = [...building.occupiedCells].sort(
        (left, right) => left.x + left.y - (right.x + right.y) || left.y - right.y,
      );

      for (const cell of sortedCells) {
        const internalPath = editorState.pathsByCell[cellKey(cell)];
        const hasIndoor = internalPath?.material === 'indoor';
        if (viewMode === '2d') {
          drawTopDownTile(
            graphics,
            cell,
            isSelected ? 0xffffff : hasIndoor ? 0xe7d7b5 : colors.top,
            isSelected ? 1 : templateBuildingAlpha,
            isSelected ? 0x334155 : 0x2b3642,
          );
        } else {
          drawRaisedTile(
            graphics,
            cell,
            editorState.grid,
            isSelected ? 0xffffff : hasIndoor ? 0xe7d7b5 : colors.top,
            isSelected ? 0xd6e5f6 : colors.left,
            isSelected ? 0xb6c9dd : colors.right,
          );
        }
      }
    }

    for (const prop of props) {
      const world = gridToWorld(prop.cell, editorState.grid, viewMode);
      const centerX = viewMode === '2d' ? world.x + TILE_2D_SIZE / 2 : world.x;
      const centerY = viewMode === '2d' ? world.y + TILE_2D_SIZE / 2 : world.y - 4;
      const selected = selectedPropId === prop.id;

      if (prop.kind === 'poi') {
        const radiusCells = Number(prop.metadata?.interestRadius ?? '0');
        if (Number.isFinite(radiusCells) && radiusCells > 0) {
          if (viewMode === '2d') {
            const radiusPx = radiusCells * TILE_2D_SIZE;
            graphics.setFillStyle({ color: 0xd35c82, alpha: 0.12 });
            graphics.circle(centerX, centerY, radiusPx);
            graphics.fill();
            graphics.setStrokeStyle({ color: 0xf9a8d4, width: 1.2, alpha: 0.5 });
            graphics.circle(centerX, centerY, radiusPx);
            graphics.stroke();
          } else {
            const eastWorld = gridToWorld(
              { x: prop.cell.x + radiusCells, y: prop.cell.y },
              editorState.grid,
              viewMode,
            );
            const southWorld = gridToWorld(
              { x: prop.cell.x, y: prop.cell.y + radiusCells },
              editorState.grid,
              viewMode,
            );
            const radiusX = Math.max(8, Math.abs(eastWorld.x - world.x));
            const radiusY = Math.max(6, Math.abs(southWorld.y - world.y));
            graphics.setFillStyle({ color: 0xd35c82, alpha: 0.1 });
            graphics.ellipse(centerX, centerY, radiusX, radiusY);
            graphics.fill();
            graphics.setStrokeStyle({ color: 0xf9a8d4, width: 1.1, alpha: 0.45 });
            graphics.ellipse(centerX, centerY, radiusX, radiusY);
            graphics.stroke();
          }
        }
      }

      if (prop.kind === 'track') {
        drawTrackTile(graphics, prop.cell, editorState.grid, selected, viewMode);
        continue;
      }

      if (prop.kind === 'park') {
        graphics.setFillStyle({ color: 0x16a34a, alpha: 0.95 });
        graphics.circle(centerX, centerY, selected ? 9 : 7);
        graphics.fill();
        graphics.setStrokeStyle({ color: 0x14532d, width: 2, alpha: 0.85 });
        graphics.circle(centerX, centerY, selected ? 9 : 7);
        graphics.stroke();
        graphics.setFillStyle({ color: 0xbbf7d0, alpha: 0.95 });
        graphics.circle(centerX, centerY - 1, selected ? 4 : 3);
        graphics.fill();
        continue;
      }

      if (prop.kind === 'access-vehicular') {
        const size = selected ? 12 : 10;
        const half = size / 2;
        graphics.setFillStyle({ color: 0xf59e0b, alpha: 0.96 });
        graphics.roundRect(centerX - half, centerY - half, size, size, 2);
        graphics.fill();
        graphics.setStrokeStyle({ color: 0x78350f, width: 2, alpha: 0.9 });
        graphics.roundRect(centerX - half, centerY - half, size, size, 2);
        graphics.stroke();
        graphics.setStrokeStyle({ color: 0xfffbeb, width: 1.5, alpha: 0.95 });
        graphics.moveTo(centerX, centerY - half + 2);
        graphics.lineTo(centerX, centerY + half - 2);
        graphics.stroke();
        graphics.setStrokeStyle({ color: 0xfffbeb, width: 1.5, alpha: 0.95 });
        graphics.moveTo(centerX - half + 2, centerY);
        graphics.lineTo(centerX + half - 2, centerY);
        graphics.stroke();
        continue;
      }

      if (prop.kind === 'access-pedestrian') {
        const radius = selected ? 8 : 6.5;
        graphics.setFillStyle({ color: 0x22c55e, alpha: 0.95 });
        graphics.circle(centerX, centerY, radius);
        graphics.fill();
        graphics.setStrokeStyle({ color: 0x14532d, width: 2, alpha: 0.9 });
        graphics.circle(centerX, centerY, radius);
        graphics.stroke();
        graphics.setStrokeStyle({ color: 0xecfdf5, width: 1.4, alpha: 0.95 });
        graphics.moveTo(centerX, centerY - radius + 2);
        graphics.lineTo(centerX, centerY + radius - 2);
        graphics.stroke();
        continue;
      }

      if (prop.kind === 'asphalt') {
        const width = viewMode === '2d' ? TILE_2D_SIZE : 0;
        const height = viewMode === '2d' ? TILE_2D_SIZE : 0;
        const halfW = width / 2;
        const halfH = height / 2;

        const neighbors = {
          east: asphaltCells.has(cellKey({ x: prop.cell.x + 1, y: prop.cell.y })),
          west: asphaltCells.has(cellKey({ x: prop.cell.x - 1, y: prop.cell.y })),
          south: asphaltCells.has(cellKey({ x: prop.cell.x, y: prop.cell.y + 1 })),
          north: asphaltCells.has(cellKey({ x: prop.cell.x, y: prop.cell.y - 1 })),
        };

        const connectors: Array<{ x: number; y: number; key: 'east' | 'west' | 'south' | 'north' }> = [];
        for (const [key, deltaX, deltaY] of [
          ['east', 1, 0],
          ['west', -1, 0],
          ['south', 0, 1],
          ['north', 0, -1],
        ] as const) {
          if (!neighbors[key]) {
            continue;
          }
          const neighbor = { x: prop.cell.x + deltaX, y: prop.cell.y + deltaY };
          const neighborWorld = gridToWorld(neighbor, editorState.grid, viewMode);
          const neighborX = viewMode === '2d' ? neighborWorld.x + TILE_2D_SIZE / 2 : neighborWorld.x;
          const neighborY = viewMode === '2d' ? neighborWorld.y + TILE_2D_SIZE / 2 : neighborWorld.y - 4;
          connectors.push({
            key,
            x: centerX + (neighborX - centerX) * 0.5,
            y: centerY + (neighborY - centerY) * 0.5,
          });
        }

        for (const connector of connectors) {
          graphics.setStrokeStyle({ color: 0x334155, width: selected ? 7 : 6, alpha: 0.98 });
          graphics.moveTo(centerX, centerY);
          graphics.lineTo(connector.x, connector.y);
          graphics.stroke();
        }

        if (viewMode === '2d') {
          drawTopDownTile(graphics, prop.cell, 0x334155, 0.98, 0x0f172a);
        } else {
          drawGridTile(graphics, prop.cell, editorState.grid, 0x334155, 0.98, 0x0f172a);
        }

        const connectedCount = connectors.length;
        const isHorizontal = neighbors.east && neighbors.west && !neighbors.north && !neighbors.south;
        const isVertical = neighbors.north && neighbors.south && !neighbors.east && !neighbors.west;

        graphics.setStrokeStyle({ color: 0xfacc15, width: 1.2, alpha: 0.9 });
        if (isHorizontal || isVertical) {
          const start = connectors.find((c) => c.key === (isHorizontal ? 'west' : 'north'));
          const end = connectors.find((c) => c.key === (isHorizontal ? 'east' : 'south'));
          if (start && end) {
            graphics.moveTo(start.x, start.y);
            graphics.lineTo(end.x, end.y);
            graphics.stroke();
          }
        } else if (connectedCount === 2) {
          graphics.moveTo(connectors[0].x, connectors[0].y);
          graphics.lineTo(centerX, centerY);
          graphics.lineTo(connectors[1].x, connectors[1].y);
          graphics.stroke();
        } else if (connectedCount >= 3) {
          // En cruces y T evitamos dibujar "plus" amarillos en cada celda.
        } else if (connectedCount === 1) {
          graphics.moveTo(centerX, centerY);
          graphics.lineTo(connectors[0].x, connectors[0].y);
          graphics.stroke();
        } else {
          if (viewMode === '2d') {
            graphics.moveTo(centerX - halfW + 2, centerY);
            graphics.lineTo(centerX + halfW - 2, centerY);
          }
          graphics.stroke();
        }

        if (connectedCount > 0) {
          if (viewMode === '2d') {
            graphics.setStrokeStyle({ color: 0x1e293b, width: 1.0, alpha: 0.45 });
            graphics.roundRect(centerX - halfW, centerY - halfH, width, height, 2);
            graphics.stroke();
          }
        }
        continue;
      }

      if (prop.kind === 'car') {
        const bodyW = selected ? 16 : 14;
        const bodyH = selected ? 9 : 8;
        const halfW = bodyW / 2;
        const halfH = bodyH / 2;
        graphics.setFillStyle({ color: 0xef4444, alpha: 0.97 });
        graphics.roundRect(centerX - halfW, centerY - halfH, bodyW, bodyH, 3);
        graphics.fill();
        graphics.setStrokeStyle({ color: 0x7f1d1d, width: 1.5, alpha: 0.9 });
        graphics.roundRect(centerX - halfW, centerY - halfH, bodyW, bodyH, 3);
        graphics.stroke();
        graphics.setFillStyle({ color: 0x93c5fd, alpha: 0.95 });
        graphics.roundRect(centerX - 3.5, centerY - 2.5, 7, 4.5, 1.5);
        graphics.fill();
        graphics.setFillStyle({ color: 0x0f172a, alpha: 0.95 });
        graphics.circle(centerX - halfW + 3, centerY + halfH - 1, 1.4);
        graphics.fill();
        graphics.circle(centerX + halfW - 3, centerY + halfH - 1, 1.4);
        graphics.fill();
        continue;
      }

      if (prop.kind === 'motorcycle') {
        const bodyW = selected ? 12 : 10;
        const bodyH = selected ? 6 : 5;
        const halfW = bodyW / 2;
        const halfH = bodyH / 2;
        graphics.setFillStyle({ color: 0xf97316, alpha: 0.98 });
        graphics.roundRect(centerX - halfW, centerY - halfH, bodyW, bodyH, 2);
        graphics.fill();
        graphics.setStrokeStyle({ color: 0x9a3412, width: 1.4, alpha: 0.92 });
        graphics.roundRect(centerX - halfW, centerY - halfH, bodyW, bodyH, 2);
        graphics.stroke();
        graphics.setFillStyle({ color: 0x1e293b, alpha: 0.95 });
        graphics.circle(centerX - halfW + 1.6, centerY + halfH - 0.3, 1.2);
        graphics.fill();
        graphics.circle(centerX + halfW - 1.6, centerY + halfH - 0.3, 1.2);
        graphics.fill();
        graphics.setStrokeStyle({ color: 0xfef3c7, width: 1.0, alpha: 0.9 });
        graphics.moveTo(centerX - 1.5, centerY - halfH + 0.8);
        graphics.lineTo(centerX + 1.5, centerY - halfH + 0.8);
        graphics.stroke();
        continue;
      }

      const fill =
        prop.kind === 'tree'
          ? 0x2a8f4f
          : prop.kind === 'bench'
            ? 0xa77447
            : prop.kind === 'bathroom'
              ? 0x447bd4
              : prop.kind === 'shrub'
                ? 0xe6c84d
                : prop.kind === 'trash'
                  ? 0x6d7785
                  : 0xe06a8a;
      graphics.setFillStyle({ color: fill, alpha: 1 });
      graphics.circle(centerX, centerY, selected ? 7 : 5);
      graphics.fill();
      graphics.setStrokeStyle({ color: 0x17202a, width: 2, alpha: 0.6 });
      graphics.circle(centerX, centerY, selected ? 7 : 5);
      graphics.stroke();
    }

    if (hoverCell) {
      const hoverIsEnabled = Boolean(editorState.areaCellsByKey[cellKey(hoverCell)]);
      const hoverBuildingId = getBuildingIdAtCell(hoverCell, editorState.blocksById);
      const hoverColor =
        editorState.activeTool === 'area-block'
          ? 0x58a95a
          : editorState.activeTool === 'building-block'
            ? 0x4f78ff
            : editorState.activeTool === 'path-brush'
              ? 0x2d7f7a
              : editorState.activeTool === 'erase'
                ? 0xd34d4d
                : editorState.activeTool === 'prop'
                  ? 0x4f9464
                  : hoverBuildingId
                    ? 0xf2c65c
                    : 0xffffff;

      if (
        editorState.activeTool === 'building-block' ||
        editorState.activeTool === 'area-block'
      ) {
        const footprint =
          editorState.activeTool === 'area-block'
            ? editorState.activeAreaFootprint
            : editorState.activeBuildingFootprint;

        for (let y = 0; y < footprint.height; y += 1) {
          for (let x = 0; x < footprint.width; x += 1) {
            const previewCell = { x: hoverCell.x + x, y: hoverCell.y + y };
            const shouldDrawPreview =
              editorState.activeTool === 'area-block'
                ? previewCell.x >= 0 && previewCell.y >= 0
                : Boolean(editorState.areaCellsByKey[cellKey(previewCell)]);
            if (!shouldDrawPreview) {
              continue;
            }

            if (viewMode === '2d') {
              drawTopDownTile(graphics, previewCell, hoverColor, 0.28, hoverColor);
            } else {
              drawGridTile(
                graphics,
                previewCell,
                editorState.grid,
                hoverColor,
                0.28,
                hoverColor,
              );
            }
          }
        }
      } else if (hoverIsEnabled) {
        if (viewMode === '2d') {
          drawTopDownTile(graphics, hoverCell, hoverColor, 0.24, hoverColor);
        } else {
          drawGridTile(graphics, hoverCell, editorState.grid, hoverColor, 0.24, hoverColor);
        }
      }
    }

    for (const altPoly of altPolylines) {
      if (altPoly.length < 2) {
        continue;
      }
      const firstAlt = gridToWorld(altPoly[0], editorState.grid, viewMode);
      graphics.setStrokeStyle({ color: 0x94a3b8, width: 3, alpha: 0.45 });
      graphics.moveTo(firstAlt.x, firstAlt.y);
      for (let i = 1; i < altPoly.length; i += 1) {
        const pt = gridToWorld(altPoly[i], editorState.grid, viewMode);
        graphics.lineTo(pt.x, pt.y);
      }
      graphics.stroke();
    }

    if (routePolyline.length >= 2) {
      const firstPt = gridToWorld(routePolyline[0], editorState.grid, viewMode);
      const lastPt = gridToWorld(
        routePolyline[routePolyline.length - 1],
        editorState.grid,
        viewMode,
      );

      graphics.setStrokeStyle({ color: 0x34d399, width: 9, alpha: 0.22 });
      graphics.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < routePolyline.length; i += 1) {
        const pt = gridToWorld(routePolyline[i], editorState.grid, viewMode);
        graphics.lineTo(pt.x, pt.y);
      }
      graphics.stroke();

      graphics.setStrokeStyle({ color: 0x10b981, width: 3.5, alpha: 0.97 });
      graphics.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < routePolyline.length; i += 1) {
        const pt = gridToWorld(routePolyline[i], editorState.grid, viewMode);
        graphics.lineTo(pt.x, pt.y);
      }
      graphics.stroke();

      graphics.setFillStyle({ color: 0x10b981, alpha: 1 });
      graphics.circle(firstPt.x, firstPt.y, 6);
      graphics.fill();
      graphics.setStrokeStyle({ color: 0xffffff, width: 2, alpha: 0.95 });
      graphics.circle(firstPt.x, firstPt.y, 6);
      graphics.stroke();

      graphics.setFillStyle({ color: 0xf43f5e, alpha: 1 });
      graphics.circle(lastPt.x, lastPt.y, 6);
      graphics.fill();
      graphics.setStrokeStyle({ color: 0xffffff, width: 2, alpha: 0.95 });
      graphics.circle(lastPt.x, lastPt.y, 6);
      graphics.stroke();
    }

    if (manualRoutePolyline.length >= 2) {
      const firstPt = gridToWorld(manualRoutePolyline[0], editorState.grid, viewMode);

      graphics.setStrokeStyle({ color: 0x60a5fa, width: 9, alpha: 0.22 });
      graphics.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < manualRoutePolyline.length; i += 1) {
        const pt = gridToWorld(manualRoutePolyline[i], editorState.grid, viewMode);
        graphics.lineTo(pt.x, pt.y);
      }
      graphics.stroke();

      graphics.setStrokeStyle({ color: 0x3b82f6, width: 3.5, alpha: 0.97 });
      graphics.moveTo(firstPt.x, firstPt.y);
      for (let i = 1; i < manualRoutePolyline.length; i += 1) {
        const pt = gridToWorld(manualRoutePolyline[i], editorState.grid, viewMode);
        graphics.lineTo(pt.x, pt.y);
      }
      graphics.stroke();
    }
  }, [
    altPolylines,
    asphaltCells,
    buildings,
    onFirstFrameRendered,
    editorState.activeAreaFootprint,
    editorState.activeBuildingFootprint,
    editorState.activeTool,
    editorState.areaCellsByKey,
    editorState.blocksById,
    editorState.grid,
    editorState.pathsByCell,
    hoverCell,
    manualRoutePolyline,
    props,
    routePolyline,
    selectedBuildingId,
    selectedPropId,
    templateBuildingAlpha,
    templateTileAlpha,
    viewMode,
  ]);

  return (
    <div
      ref={viewportRef}
      className={`modular-canvas-shell ${canvasCursorClass}`}
      style={{ position: 'relative', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
      onPointerLeave={finishPointerInteraction}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onContextMenu={(event) => event.preventDefault()}
    >
      {devUnderlayTexture ? (
        <div className="absolute right-3 top-36 z-20 rounded-xl border border-slate-700/60 bg-[#030610]/80 px-3 py-2 text-xs text-slate-200 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Plantilla (dev)</div>
            <button
              type="button"
              className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-100 hover:bg-slate-800"
              title={devUnderlayVisible ? 'Ocultar plantilla' : 'Mostrar plantilla'}
              onClick={() => setDevUnderlayVisible((current) => !current)}
            >
              {devUnderlayVisible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <label className="mt-1 flex items-center gap-2">
            <span className="text-slate-300">Escala</span>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.01}
              value={devUnderlayScale}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDevUnderlayScale(Number.isFinite(next) ? next : 1);
              }}
            />
            <span className="tabular-nums text-slate-300">{devUnderlayScale.toFixed(2)}Ã—</span>
          </label>

          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <span className="text-slate-300">X</span>
            <input
              type="number"
              step={1}
              value={Math.round(devUnderlayOffset.x)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDevUnderlayOffset((prev) => ({ ...prev, x: Number.isFinite(next) ? next : prev.x }));
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-100"
            />
            <span className="text-slate-300">Y</span>
            <input
              type="number"
              step={1}
              value={Math.round(devUnderlayOffset.y)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDevUnderlayOffset((prev) => ({ ...prev, y: Number.isFinite(next) ? next : prev.y }));
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-100"
            />
          </div>

          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-100 hover:bg-slate-800"
              title="Guardar escala y posiciÃ³n para esta imagen"
              onClick={() => {
                if (!import.meta.env.DEV || !devUnderlayStorageKey || typeof window === 'undefined') {
                  return;
                }
                try {
                  const fallbackCenterX = (campusBounds.minX + campusBounds.maxX) / 2;
                  const fallbackCenterY = (campusBounds.minY + campusBounds.maxY) / 2;

                  const campusWidth = Math.max(1, campusBounds.maxX - campusBounds.minX);
                  const campusHeight = Math.max(1, campusBounds.maxY - campusBounds.minY);
                  const textureWidth = Math.max(1, devUnderlayTexture.width);
                  const textureHeight = Math.max(1, devUnderlayTexture.height);
                  const fallbackFitScale = Math.min(campusWidth / textureWidth, campusHeight / textureHeight);

                  const base = {
                    centerX: devUnderlayBase?.centerX ?? fallbackCenterX,
                    centerY: devUnderlayBase?.centerY ?? fallbackCenterY,
                    fitScale: devUnderlayBase?.fitScale ?? Math.max(0.0001, fallbackFitScale),
                  };

                  window.localStorage.setItem(
                    devUnderlayStorageKey,
                    JSON.stringify({ scale: devUnderlayScale, offset: devUnderlayOffset, base }),
                  );
                } catch {
                  // ignore
                }
              }}
            >
              Fijar
            </button>
          </div>
        </div>
      ) : null}

      <Application
        ref={pixiApplicationRef}
        resizeTo={viewportRef}
        antialias
        backgroundColor={0xd9e0e8}
        resolution={DEVICE_PIXEL_RATIO}
        autoDensity
        powerPreference="high-performance"
      >
        <pixiContainer
          ref={worldContainerRef}
          x={renderCamera.x}
          y={renderCamera.y}
          scale={renderCamera.scale}
          sortableChildren
        >
          {devUnderlayVisible && devUnderlayTexture && devUnderlayPlacement ? (
            <pixiSprite
              zIndex={-100}
              texture={devUnderlayTexture}
              anchor={0.5}
              x={devUnderlayPlacement.x}
              y={devUnderlayPlacement.y}
              scale={{ x: devUnderlayPlacement.scale, y: devUnderlayPlacement.scale }}
              alpha={0.55}
            />
          ) : null}

          <pixiGraphics
            zIndex={0}
            draw={drawScene}
          />

        </pixiContainer>

        <pixiContainer
          ref={overlayContainerRef}
          x={renderCamera.x}
          y={renderCamera.y}
          scale={renderCamera.scale}
          sortableChildren
        >
          {buildings.map((building) => {
            const hasLabel = building.name.trim().length > 0;
            if (!hasLabel) {
              return null;
            }

            const labelPoint = gridToWorld(building.centroid, editorState.grid, viewMode);
            const active = selectedBuildingId === building.id;

            return (
              <pixiContainer key={building.id}>
                <pixiText
                  text={building.name}
                  x={labelPoint.x}
                  y={labelPoint.y - (viewMode === '2d' ? 10 : BUILDING_ELEVATION + 14)}
                  anchor={0.5}
                  resolution={DEVICE_PIXEL_RATIO * 2}
                  style={{
                    fill: active ? '#1c2430' : '#ffffff',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    fontSize: 15,
                    stroke: { color: active ? '#ffe39a' : '#223041', width: 3 },
                  }}
                />
                <pixiText
                  text={building.type.toUpperCase()}
                  x={labelPoint.x}
                  y={labelPoint.y - (viewMode === '2d' ? -2 : BUILDING_ELEVATION)}
                  anchor={0.5}
                  resolution={DEVICE_PIXEL_RATIO * 2}
                  style={{
                    fill: active ? '#ffe39a' : '#dce7f2',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    fontSize: 10,
                    stroke: { color: '#223041', width: 2 },
                  }}
                />
              </pixiContainer>
            );
          })}

          {props.map((prop) => {
            const label = getPropLabel(prop);
            if (!label) {
              return null;
            }

            const labelPoint = gridToWorld(prop.cell, editorState.grid, viewMode);
            const active = selectedPropId === prop.id;

            return (
              <pixiText
                key={prop.id}
                text={label}
                x={labelPoint.x}
                y={labelPoint.y - (viewMode === '2d' ? 8 : 16)}
                anchor={0.5}
                resolution={DEVICE_PIXEL_RATIO * 2}
                style={{
                  fill: active ? '#f8fafc' : '#e2e8f0',
                  fontFamily: 'monospace',
                  fontWeight: '700',
                  fontSize: 11,
                  stroke: { color: '#0f172a', width: 3 },
                }}
              />
            );
          })}
        </pixiContainer>
      </Application>

      <div
        ref={avatarOverlayRef}
        className="pointer-events-none absolute left-0 top-0 z-20 opacity-0"
        style={{ willChange: 'transform, opacity' }}
        aria-hidden="true"
      >
        <div
          ref={avatarBubbleRef}
          className="absolute left-0 top-0 hidden"
          style={{ willChange: 'transform, width, height' }}
        >
          <div
            className="relative flex items-center justify-center rounded-full border border-white/90 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.38)]"
            style={{ width: '100%', height: '100%' }}
          >
            <div
              className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/90 bg-white/95"
            />
            {avatarImageUrl ? (
              <img
                ref={(node) => {
                  avatarBubbleVisualRef.current = node;
                }}
                src={avatarImageUrl}
                alt=""
                className="block rounded-full object-cover select-none"
                style={{ imageRendering: 'pixelated' }}
                draggable={false}
              />
            ) : (
              <div
                ref={(node) => {
                  avatarBubbleVisualRef.current = node;
                }}
                className="rounded-full border border-cyan-100 bg-cyan-600/95"
              />
            )}
          </div>
        </div>

        {avatarImageUrl ? (
          <img
            ref={(node) => {
              avatarVisualRef.current = node;
            }}
            src={avatarImageUrl}
            alt=""
            className="block w-auto max-w-none select-none"
            style={{
              transform: 'translate3d(-50%, -100%, 0)',
              imageRendering: 'pixelated',
              willChange: 'height',
            }}
            draggable={false}
          />
        ) : (
          <div
            ref={(node) => {
              avatarVisualRef.current = node;
            }}
            className="rounded-full border-2 border-cyan-100 bg-cyan-600/95"
            style={{
              height: '18px',
              transform: 'translate3d(-50%, -100%, 0)',
              willChange: 'width, height',
            }}
          />
        )}
      </div>

    </div>
  );
}
