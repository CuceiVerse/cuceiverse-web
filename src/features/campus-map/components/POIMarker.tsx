import { Rectangle, Texture } from 'pixi.js';

import { gridToScreen } from '../lib/isometric';
import type { PoiType, PuntoInteres } from '../types';

type POIMarkerProps = {
  poi: PuntoInteres;
  selected: boolean;
  onSelect: (poi: PuntoInteres) => void;
};

const textureCache = new Map<string, Texture>();

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

function buildMarkerTexture(type: PoiType, selected: boolean): Texture {
  const cacheKey = `${type}:${selected ? 'selected' : 'idle'}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext('2d');

  if (!context) {
    return Texture.EMPTY;
  }

  const accent = selected ? '#ffe082' : '#8cf4ff';
  drawPixelRect(context, 8, 3, 8, 3, accent);
  drawPixelRect(context, 7, 6, 10, 10, '#12212c');
  drawPixelRect(context, 8, 7, 8, 8, '#f4f7fb');
  drawPixelRect(context, 10, 17, 4, 4, accent);

  switch (type) {
    case 'medical':
      drawPixelRect(context, 10, 9, 4, 2, '#ff4d6d');
      drawPixelRect(context, 11, 8, 2, 6, '#ff4d6d');
      break;
    case 'bathroom':
      drawPixelRect(context, 9, 8, 2, 6, '#2b87ff');
      drawPixelRect(context, 13, 8, 2, 6, '#45c3ff');
      drawPixelRect(context, 8, 14, 8, 1, '#163a54');
      break;
    case 'cafeteria':
    case 'food':
      drawPixelRect(context, 9, 8, 2, 6, '#ffb347');
      drawPixelRect(context, 11, 10, 5, 2, '#ff8c42');
      drawPixelRect(context, 11, 8, 2, 2, '#ffef7a');
      break;
    case 'general_services':
      drawPixelRect(context, 8, 8, 8, 6, '#72e06a');
      drawPixelRect(context, 10, 10, 4, 2, '#1d3d16');
      break;
    case 'bank':
      drawPixelRect(context, 8, 8, 8, 6, '#ffdc7b');
      drawPixelRect(context, 8, 7, 8, 1, '#ffae00');
      break;
    case 'auditorium':
      drawPixelRect(context, 8, 8, 8, 6, '#8f87ff');
      drawPixelRect(context, 10, 10, 4, 2, '#ffffff');
      break;
    default:
      drawPixelRect(context, 9, 8, 6, 6, '#3ed9a1');
      break;
  }

  const texture = Texture.from(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

export function POIMarker({ poi, selected, onSelect }: POIMarkerProps) {
  const screen = gridToScreen({
    x: poi.coordenadaXGrid,
    y: poi.coordenadaYGrid,
  });
  const texture = buildMarkerTexture(poi.tipo, selected);

  return (
    <pixiContainer x={screen.x} y={screen.y - 18} zIndex={poi.prioridadVisual + 100}>
      <pixiGraphics
        draw={(graphics) => {
          graphics.clear();
          if (!selected) return;

          graphics.setFillStyle({ color: 0xffe082, alpha: 0.22 });
          graphics.ellipse(0, 0, 14, 8);
          graphics.fill();
          graphics.setStrokeStyle({ color: 0xfff6bd, width: 2, alpha: 1 });
          graphics.ellipse(0, 0, 16, 10);
          graphics.stroke();
        }}
      />
      <pixiSprite
        texture={texture}
        anchor={0.5}
        eventMode="static"
        cursor="pointer"
        roundPixels
        hitArea={new Rectangle(-12, -12, 24, 24)}
        onPointerTap={() => onSelect(poi)}
      />
    </pixiContainer>
  );
}