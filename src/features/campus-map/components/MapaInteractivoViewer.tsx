import { Application, extend } from '@pixi/react';
import {
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  useEffect,
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
import {
  flattenPoints,
  getSegmentLeftPolygon,
  getSegmentRightPolygon,
  getSegmentTopPolygon,
  getTilePolygon,
  gridToScreen,
  ISO_ORIGIN,
} from '../lib/isometric';
import { POIDetailModal } from './POIDetailModal';
import { POIMarker } from './POIMarker';
import { poiTypeLabels, type GridPoint, type PoiFilters, type PuntoInteres } from '../types';
import '../campus-map.css';

extend({ Container, Graphics, Sprite, Text });

type CameraState = {
  x: number;
  y: number;
  scale: number;
  followAvatar: boolean;
};

const avatarTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 28;
  const context = canvas.getContext('2d');

  if (!context) return Texture.EMPTY;

  context.fillStyle = '#f9d59d';
  context.fillRect(7, 1, 6, 5);
  context.fillStyle = '#23395d';
  context.fillRect(5, 6, 10, 8);
  context.fillStyle = '#6dd3ff';
  context.fillRect(7, 8, 6, 4);
  context.fillStyle = '#1b2634';
  context.fillRect(7, 14, 2, 7);
  context.fillRect(11, 14, 2, 7);
  context.fillStyle = '#ffe082';
  context.fillRect(4, 6, 2, 6);
  context.fillRect(14, 6, 2, 6);

  return Texture.from(canvas);
})();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointInRect(point: GridPoint, rect: { x: number; y: number; width: number; height: number }) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function drawPolygon(
  graphics: Graphics,
  points: { x: number; y: number }[],
  fill: number,
  stroke = 0x142131,
  alpha = 1,
) {
  graphics.setFillStyle({ color: fill, alpha });
  graphics.poly(flattenPoints(points));
  graphics.fill();
  graphics.setStrokeStyle({ color: stroke, width: 1, alpha: 0.9 });
  graphics.poly(flattenPoints(points));
  graphics.stroke();
}

function focusCameraOnPoint(
  point: GridPoint,
  viewport: { width: number; height: number },
  scale: number,
): Pick<CameraState, 'x' | 'y'> {
  const screen = gridToScreen(point);
  return {
    x: viewport.width / 2 - screen.x * scale,
    y: viewport.height / 2 - screen.y * scale,
  };
}

export function MapaInteractivoViewer() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; cameraX: number; cameraY: number } | null>(null);

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
  const [selectedPoi, setSelectedPoi] = useState<PuntoInteres | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeStart, setRouteStart] = useState<GridPoint>(avatarSpawnPoint);
  const [routeEnd, setRouteEnd] = useState<GridPoint | null>(null);
  const [baseMapTexture, setBaseMapTexture] = useState<Texture | null>(null);

  const { position: avatarPosition, route: avatarRoute, isMoving } =
    useFakeUserPosition(routeStart, routeEnd);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextViewport = {
        width: Math.max(640, Math.round(entry.contentRect.width)),
        height: Math.max(480, Math.round(entry.contentRect.height)),
      };
      setViewport(nextViewport);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchPuntosInteres(filters, controller.signal)
      .then((data) => setPois(data))
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        const message = fetchError instanceof Error ? fetchError.message : 'Error desconocido';
        setError(message);
        setPois([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    if (!selectedPoi) return;
    const stillExists = pois.some((poi) => poi.id === selectedPoi.id);
    if (!stillExists) {
      setSelectedPoi(null);
    }
  }, [pois, selectedPoi]);

  useEffect(() => {
    if (!routeEnd || isMoving) return;
    setRouteStart(avatarPosition);
    setRouteEnd(null);
  }, [avatarPosition, isMoving, routeEnd]);

  useEffect(() => {
    if (!camera.followAvatar) return;

    setCamera((current) => ({
      ...current,
      ...focusCameraOnPoint(avatarPosition, viewport, current.scale),
    }));
  }, [avatarPosition, camera.followAvatar, viewport]);

  useEffect(() => {
    const explicitTextureUrl = import.meta.env.VITE_CAMPUS_MAP_TEXTURE_URL;
    const candidateUrls = explicitTextureUrl
      ? [explicitTextureUrl]
      : ['/maps/cucei-campus-base.png', '/maps/cucei-campus-base.svg'];
    let cancelled = false;

    const resolveTexture = async () => {
      for (const url of candidateUrls) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (!response.ok || cancelled) {
            continue;
          }

          setBaseMapTexture(Texture.from(url));
          return;
        } catch {
          continue;
        }
      }

      if (!cancelled) {
        setBaseMapTexture(null);
      }
    };

    void resolveTexture();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    setCamera((current) => {
      const nextScale = clamp(current.scale - event.deltaY * 0.0012, 0.55, 2.4);
      const worldX = (localX - current.x) / current.scale;
      const worldY = (localY - current.y) / current.scale;

      return {
        x: localX - worldX * nextScale,
        y: localY - worldY * nextScale,
        scale: nextScale,
        followAvatar: false,
      };
    });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag) return;

    setCamera((current) => ({
      ...current,
      x: drag.cameraX + (event.clientX - drag.pointerX),
      y: drag.cameraY + (event.clientY - drag.pointerY),
      followAvatar: false,
    }));
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
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
          <p className="toolbar-eyebrow">CUCEIverse MVP</p>
          <h1>Mapa interactivo isometrico 2D</h1>
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
                setFilters((current) => ({
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
                  setFilters((current) => ({ ...current, tipo: 'all' }))
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
                    setFilters((current) => ({
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
                setFilters((current) => ({
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
          onMouseLeave={handleMouseUp}
        >
          <Application
            resizeTo={viewportRef}
            antialias={false}
            backgroundColor={0x091420}
            resolution={1}
            autoDensity
          >
            <pixiContainer
              x={camera.x}
              y={camera.y}
              scale={camera.scale}
              sortableChildren
            >
              {baseMapTexture ? (
                <pixiSprite
                  texture={baseMapTexture}
                  x={ISO_ORIGIN.x - 460}
                  y={ISO_ORIGIN.y + 40}
                  width={900}
                  height={620}
                  alpha={0.18}
                  zIndex={-20}
                />
              ) : null}

              <pixiGraphics
                zIndex={-10}
                draw={(graphics) => {
                  graphics.clear();

                  for (let y = 0; y < campusGridSize.height; y += 1) {
                    for (let x = 0; x < campusGridSize.width; x += 1) {
                      const tileColor = campusWalkways.some((walkway) =>
                        pointInRect({ x: x + 0.5, y: y + 0.5 }, walkway),
                      )
                        ? (x + y) % 2 === 0
                          ? 0xa7b9c9
                          : 0x94a8b9
                        : (x + y) % 2 === 0
                          ? 0x67b96a
                          : 0x5cab60;

                      drawPolygon(graphics, getTilePolygon(x, y), tileColor, 0x2c5130, 1);
                    }
                  }

                  const trackCenter = gridToScreen(athleticTrack.center);
                  graphics.setFillStyle({ color: 0xc56a3f, alpha: 0.72 });
                  graphics.ellipse(
                    trackCenter.x,
                    trackCenter.y,
                    athleticTrack.radiusX * 24,
                    athleticTrack.radiusY * 12,
                  );
                  graphics.fill();
                  graphics.setStrokeStyle({ color: 0xf7d37f, width: 3, alpha: 0.95 });
                  graphics.ellipse(
                    trackCenter.x,
                    trackCenter.y,
                    athleticTrack.radiusX * 19,
                    athleticTrack.radiusY * 8,
                  );
                  graphics.stroke();

                  graphics.setStrokeStyle({ color: 0xffeb55, width: 3, alpha: 0.96 });
                  graphics.poly(flattenPoints(campusBoundary.map(gridToScreen)));
                  graphics.stroke();

                  const cidCenter = gridToScreen(cidBlock.grid);
                  graphics.setFillStyle({ color: cidBlock.accent, alpha: 0.84 });
                  graphics.rect(cidCenter.x - 42, cidCenter.y - 28, 84, 64);
                  graphics.fill();
                }}
              />

              <pixiGraphics
                zIndex={5}
                draw={(graphics) => {
                  graphics.clear();
                  for (const building of campusBuildings) {
                    for (const segment of building.segments) {
                      drawPolygon(
                        graphics,
                        getSegmentLeftPolygon(segment),
                        building.colorLeft ?? 0xbe4f64,
                        0x6f2f42,
                      );
                      drawPolygon(
                        graphics,
                        getSegmentRightPolygon(segment),
                        building.colorRight ?? 0xd55a73,
                        0x7d3448,
                      );
                      drawPolygon(
                        graphics,
                        getSegmentTopPolygon(segment),
                        building.colorTop ?? 0xf48aa2,
                        0xa4495e,
                      );
                    }
                  }

                  if (avatarRoute.length > 1) {
                    graphics.setStrokeStyle({ color: 0x82f0ff, width: 3, alpha: 0.9 });
                    graphics.poly(flattenPoints(avatarRoute.map(gridToScreen)));
                    graphics.stroke();
                  }
                }}
              />

              {campusBuildings.map((building) => {
                const labelScreen = gridToScreen(building.labelGrid);
                const roofTextPoint = gridToScreen(
                  building.roofTextGrid ?? building.labelGrid,
                );

                return (
                  <pixiContainer key={building.id} zIndex={20}>
                    <pixiText
                      text={building.id}
                      x={labelScreen.x}
                      y={labelScreen.y - 42}
                      anchor={0.5}
                      style={{
                        fill: '#fff4f2',
                        fontFamily: 'monospace',
                        fontSize: 16,
                        fontWeight: '700',
                        stroke: { color: '#66273a', width: 3 },
                      }}
                    />
                    {building.roofText ? (
                      <pixiText
                        text={building.roofText}
                        x={roofTextPoint.x}
                        y={roofTextPoint.y - 26}
                        anchor={0.5}
                        style={{
                          fill: '#1c2430',
                          fontFamily: 'monospace',
                          fontSize: 8,
                          fontWeight: '700',
                        }}
                      />
                    ) : null}
                  </pixiContainer>
                );
              })}

              {campusAreaLabels.map((area) => {
                const labelScreen = gridToScreen(area.grid);
                return (
                  <pixiText
                    key={area.id}
                    text={area.label}
                    x={labelScreen.x}
                    y={labelScreen.y - 10}
                    anchor={0.5}
                    zIndex={40}
                    style={{
                      fill: `#${area.accent.toString(16).padStart(6, '0')}`,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: '700',
                      stroke: { color: '#ffffff', width: 2 },
                    }}
                  />
                );
              })}

              {pois.map((poi) => (
                <POIMarker
                  key={poi.id}
                  poi={poi}
                  selected={selectedPoi?.id === poi.id}
                  onSelect={setSelectedPoi}
                />
              ))}

              <pixiContainer zIndex={120}>
                <pixiGraphics
                  draw={(graphics) => {
                    graphics.clear();
                    const shadow = gridToScreen(avatarPosition);
                    graphics.setFillStyle({ color: 0x041019, alpha: 0.28 });
                    graphics.ellipse(shadow.x, shadow.y - 4, 12, 6);
                    graphics.fill();
                  }}
                />
                <pixiSprite
                  texture={avatarTexture}
                  x={gridToScreen(avatarPosition).x}
                  y={gridToScreen(avatarPosition).y - 24}
                  anchor={{ x: 0.5, y: 0.86 }}
                  roundPixels
                />
              </pixiContainer>
            </pixiContainer>
          </Application>
        </div>

        <POIDetailModal
          poi={selectedPoi}
          onClose={() => setSelectedPoi(null)}
          onSimulateRoute={handleSimulateRoute}
        />
      </div>
    </section>
  );
}