import { TILE_SIZE, MAP_ORIGIN } from './topDown';
import type { GridPoint } from '../types';

export type CameraTransform = {
  x: number;
  y: number;
  scale: number;
};

/**
 * Convierte coordenadas locales del elemento canvas (relativas a su esquina
 * superior-izquierda) a la celda entera de la cuadrícula, teniendo en cuenta
 * la transformación de cámara (traslación + escala uniforme).
 *
 * canvasX/Y deben ser el resultado de:
 *   event.clientX - rect.left   (donde rect = canvas.getBoundingClientRect())
 */
export function screenToGrid(
  canvasX: number,
  canvasY: number,
  camera: CameraTransform,
): GridPoint {
  const worldX = (canvasX - camera.x) / camera.scale;
  const worldY = (canvasY - camera.y) / camera.scale;

  return {
    x: Math.floor((worldX - MAP_ORIGIN.x) / TILE_SIZE),
    y: Math.floor((worldY - MAP_ORIGIN.y) / TILE_SIZE),
  };
}
