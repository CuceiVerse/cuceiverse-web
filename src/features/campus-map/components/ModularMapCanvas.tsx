import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text } from 'pixi.js';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { cellKey, getBuildingIdAtCell } from '../editor/buildingAdjacency';
import {
  clamp,
  flattenScreenPoints,
  getIsoDiamond,
  isoGridToScreen,
  screenToIsoGrid,
  type EditorCamera,
} from '../editor/isometricGridMath';
import type {
  BlockFootprint,
  GridCell,
  ModularBuilding,
  ModularMapStoreState,
  PropKind,
} from '../editor/modularMapTypes';

extend({ Container, Graphics, Text });

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
  /** Polilínea de la ruta recomendada principal (coordenadas de grid). */
  routePolyline?: Array<{ x: number; y: number }>;
  /** Polilíneas de rutas alternativas (coordenadas de grid). */
  altPolylines?: Array<Array<{ x: number; y: number }>>;
};

const DROP_MIME = 'application/x-cuceiverse-map-item';
const BUILDING_ELEVATION = 16;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const DEVICE_PIXEL_RATIO = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
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
  altPolylines = [],
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    pointerX: number;
    pointerY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const propDragRef = useRef<string | null>(null);
  const brushActiveRef = useRef(false);
  const eraseActiveRef = useRef(false);
  const lastEraseCellKeyRef = useRef<string | null>(null);

  const [camera, setCamera] = useState<EditorCamera>(() => ({
    ...fitCameraToBounds(
      { width: 1400, height: 820 },
      getIsoCampusBounds(editorState.grid),
    ),
  }));
  const [hoverCell, setHoverCell] = useState<GridCell | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 1400, height: 820 });

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

    const updateSize = () => {
      setViewportSize({
        width: Math.max(1, viewport.clientWidth),
        height: Math.max(1, viewport.clientHeight),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const bounds =
      viewMode === '2d'
        ? get2DCampusBounds(editorState.grid)
        : getIsoCampusBounds(editorState.grid);

    setCamera(fitCameraToBounds(viewportSize, bounds));
  }, [viewMode, viewportSize, editorState.grid.columns, editorState.grid.rows, editorState.grid.tileWidth, editorState.grid.tileHeight, editorState.grid.origin.x, editorState.grid.origin.y]);

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

      setCamera((current) => {
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

  const toGridCell = (event: { clientX: number; clientY: number }, currentTarget: HTMLDivElement) => {
    const rect = currentTarget.getBoundingClientRect();
    if (viewMode === '2d') {
      const worldX = (event.clientX - rect.left - camera.x) / camera.scale;
      const worldY = (event.clientY - rect.top - camera.y) / camera.scale;
      return {
        x: Math.floor(worldX / TILE_2D_SIZE),
        y: Math.floor(worldY / TILE_2D_SIZE),
      };
    }
    return screenToIsoGrid(
      event.clientX - rect.left,
      event.clientY - rect.top,
      camera,
      editorState.grid,
    );
  };

  const eraseAtCellOnce = (cell: GridCell) => {
    const key = cellKey(cell);
    if (lastEraseCellKeyRef.current === key) {
      return;
    }
    lastEraseCellKeyRef.current = key;
    onErase(cell);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((isSpacePressed || editorState.activeTool === 'pan') && event.button === 0) {
      panRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        cameraX: camera.x,
        cameraY: camera.y,
      };
      setIsPanning(true);
      return;
    }

    const cell = toGridCell(event, event.currentTarget);
    setHoverCell(cell);

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
      eraseAtCellOnce(cell);
      return;
    }

    if (editorState.activeTool === 'building-block' || editorState.activeTool === 'area-block') {
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

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && (isSpacePressed || editorState.activeTool === 'pan') && isPanning) {
      setCamera((current) => ({
        ...current,
        x: pan.cameraX + (event.clientX - pan.pointerX),
        y: pan.cameraY + (event.clientY - pan.pointerY),
      }));
      return;
    }

    const cell = toGridCell(event, event.currentTarget);
    setHoverCell(cell);

    if (brushActiveRef.current && editorState.activeTool === 'path-brush') {
      onPathBrushMove(cell);
      return;
    }

    if (eraseActiveRef.current && editorState.activeTool === 'erase') {
      eraseAtCellOnce(cell);
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

  const finishInteraction = () => {
    if (brushActiveRef.current) {
      brushActiveRef.current = false;
      onPathBrushEnd();
    }
    if (eraseActiveRef.current) {
      eraseActiveRef.current = false;
      lastEraseCellKeyRef.current = null;
      onEraseEnd();
    }
    propDragRef.current = null;
    setIsPanning(false);
    panRef.current = null;
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
      // Ignorar payload inválido del drag externo.
    }
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const cell = toGridCell(event, event.currentTarget);
    setHoverCell(cell);
  };

  const selectedBuildingId = editorState.selection?.kind === 'building' ? editorState.selection.id : null;
  const selectedPropId = editorState.selection?.kind === 'prop' ? editorState.selection.id : null;
  const canvasCursorClass = isPanning
    ? 'modular-canvas-shell--grabbing'
    : (isSpacePressed || editorState.activeTool === 'pan')
      ? 'modular-canvas-shell--grab'
      : 'modular-canvas-shell--tool';

  return (
    <div
      ref={viewportRef}
      className={`modular-canvas-shell ${canvasCursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={finishInteraction}
      onMouseLeave={finishInteraction}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Application
        resizeTo={viewportRef}
        antialias
        backgroundColor={0xe6eef6}
        resolution={DEVICE_PIXEL_RATIO}
        autoDensity
      >
        <pixiContainer x={camera.x} y={camera.y} scale={camera.scale} sortableChildren>
          <pixiGraphics
            zIndex={0}
            draw={(graphics) => {
              graphics.clear();

              for (let row = 0; row < editorState.grid.rows; row += 1) {
                for (let column = 0; column < editorState.grid.columns; column += 1) {
                  if (!editorState.areaCellsByKey[`${column}:${row}`]) {
                    continue;
                  }

                  const path = editorState.pathsByCell[`${column}:${row}`];
                  const fill = path
                    ? path.material === 'pavers'
                      ? 0xd8d0bc
                      : path.material === 'grass-transition'
                        ? 0x8cb989
                        : 0xc8cfd8
                    : (column + row) % 2 === 0
                      ? 0x86c56e
                      : 0x7bb864;
                  const stroke = path ? 0x6f7f8e : 0x5e8b4c;
                  if (viewMode === '2d') {
                    drawTopDownTile(graphics, { x: column, y: row }, fill, 1, stroke);
                  } else {
                    drawGridTile(graphics, { x: column, y: row }, editorState.grid, fill, 1, stroke);
                  }
                }
              }

              for (const building of buildings) {
                const colors = getBuildingColors(building.type);
                const isSelected = selectedBuildingId === building.id;
                const sortedCells = [...building.occupiedCells].sort(
                  (left, right) => left.x + left.y - (right.x + right.y) || left.y - right.y,
                );

                for (const cell of sortedCells) {
                  if (viewMode === '2d') {
                    drawTopDownTile(
                      graphics,
                      cell,
                      isSelected ? 0xffffff : colors.top,
                      1,
                      isSelected ? 0x334155 : 0x2b3642,
                    );
                  } else {
                    drawRaisedTile(
                      graphics,
                      cell,
                      editorState.grid,
                      isSelected ? 0xffffff : colors.top,
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

              // ── Rutas alternativas (capa inferior) ────────────────────────
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

              // ── Ruta recomendada principal ────────────────────────────────
              if (routePolyline.length >= 2) {
                const firstPt = gridToWorld(routePolyline[0], editorState.grid, viewMode);
                const lastPt = gridToWorld(
                  routePolyline[routePolyline.length - 1],
                  editorState.grid,
                  viewMode,
                );

                // Halo/glow exterior
                graphics.setStrokeStyle({ color: 0x34d399, width: 9, alpha: 0.22 });
                graphics.moveTo(firstPt.x, firstPt.y);
                for (let i = 1; i < routePolyline.length; i += 1) {
                  const pt = gridToWorld(routePolyline[i], editorState.grid, viewMode);
                  graphics.lineTo(pt.x, pt.y);
                }
                graphics.stroke();

                // Línea principal
                graphics.setStrokeStyle({ color: 0x10b981, width: 3.5, alpha: 0.97 });
                graphics.moveTo(firstPt.x, firstPt.y);
                for (let i = 1; i < routePolyline.length; i += 1) {
                  const pt = gridToWorld(routePolyline[i], editorState.grid, viewMode);
                  graphics.lineTo(pt.x, pt.y);
                }
                graphics.stroke();

                // Marcador de origen (verde)
                graphics.setFillStyle({ color: 0x10b981, alpha: 1 });
                graphics.circle(firstPt.x, firstPt.y, 6);
                graphics.fill();
                graphics.setStrokeStyle({ color: 0xffffff, width: 2, alpha: 0.95 });
                graphics.circle(firstPt.x, firstPt.y, 6);
                graphics.stroke();

                // Marcador de destino (rosa)
                graphics.setFillStyle({ color: 0xf43f5e, alpha: 1 });
                graphics.circle(lastPt.x, lastPt.y, 6);
                graphics.fill();
                graphics.setStrokeStyle({ color: 0xffffff, width: 2, alpha: 0.95 });
                graphics.circle(lastPt.x, lastPt.y, 6);
                graphics.stroke();
              }
            }}
          />

        </pixiContainer>

        <pixiContainer>
          {buildings.map((building) => {
            const hasLabel = building.name.trim().length > 0;
            if (!hasLabel) {
              return null;
            }

            const worldLabelPoint = gridToWorld(building.centroid, editorState.grid, viewMode);
            const labelPoint = {
              x: camera.x + worldLabelPoint.x * camera.scale,
              y:
                camera.y +
                (viewMode === '2d'
                  ? (worldLabelPoint.y + TILE_2D_SIZE / 2) * camera.scale
                  : worldLabelPoint.y * camera.scale),
            };
            const active = selectedBuildingId === building.id;

            return (
              <pixiContainer key={building.id}>
                <pixiText
                  text={building.name}
                  x={labelPoint.x}
                  y={labelPoint.y - 32}
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
                  y={labelPoint.y - 14}
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

            const worldPoint = gridToWorld(prop.cell, editorState.grid, viewMode);
            const labelPoint = {
              x: camera.x + (viewMode === '2d' ? (worldPoint.x + TILE_2D_SIZE / 2) * camera.scale : worldPoint.x * camera.scale),
              y: camera.y + (viewMode === '2d' ? (worldPoint.y + TILE_2D_SIZE / 2) * camera.scale : worldPoint.y * camera.scale),
            };
            const active = selectedPropId === prop.id;

            return (
              <pixiText
                key={prop.id}
                text={label}
                x={labelPoint.x}
                y={labelPoint.y - 22}
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
    </div>
  );
}
