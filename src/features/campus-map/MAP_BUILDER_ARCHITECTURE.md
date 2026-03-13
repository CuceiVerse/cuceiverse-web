# Map Builder v2 - Diseño e Implementación Base

## Paleta Expandida

Herramientas activas en editor:

- `building`: base para poligonos de edificios (calibracion)
- `area`: base para poligonos de zonas (calibracion)
- `poi`: marcador con metadata
- `asset`: mobiliario/vegetacion (ARBOL, ARBUSTO, BANCA, LUMINARIA, BASURERO)
- `walkway`: nodos del grafo peatonal
- `edge`: aristas del grafo
- `erase`: eliminacion/restauracion
- `select`: seleccion y drag-and-drop

## Flujo de Interaccion (Pseudocódigo)

```ts
onMouseDown(screenX, screenY):
  grid = screenToGrid(screenX, screenY, camera)
  if tool == select and hitDraggable(grid):
    startElementDrag(grid)
  else:
    startCameraPan(screenX, screenY)

onMouseMove(screenX, screenY):
  grid = screenToGrid(screenX, screenY, camera)
  editorGhost = grid
  if draggingElement:
    updateElementPosition(grid) // snap-to-grid
  else if draggingCamera:
    panCamera(screenX, screenY)

onMouseUp(screenX, screenY):
  grid = screenToGrid(screenX, screenY, camera)
  if draggingElement:
    commitElementPosition(grid)
  else if clickWithoutDrag:
    applyTool(grid)
```

## Snap-to-grid Isométrico

La edicion trabaja sobre grid cartesiano local y luego proyecta a vista isometrica.

Conversión click a grid (actual):

```ts
worldX = (canvasX - camera.x) / camera.scale
worldY = (canvasY - camera.y) / camera.scale

xGrid = floor((worldX - MAP_ORIGIN.x) / TILE_SIZE)
yGrid = floor((worldY - MAP_ORIGIN.y) / TILE_SIZE)
```

Proyeccion de grid a pantalla (render):

```ts
screen = gridToScreen({ x: xGrid, y: yGrid })
```

Con esto, todo elemento queda cuantizado por celda y consistente para rutas/colisiones.

## API de Edición

- `POST /mapa/sync`
  - sincronizacion masiva transaccional de:
  - `pois[]`
  - `nodos[]`
  - `aristas[]`
  - `elementos[]`

- `PUT /mapa/elemento/:id`
  - actualizacion individual de mobiliario/vegetacion

- `DELETE /mapa/elemento/:id`
  - eliminacion individual de mobiliario/vegetacion

## Notas de Integración

- El frontend ya dibuja overlays de assets en modo editor.
- `select` permite drag-and-drop con snap para POIs y assets.
- `erase` soporta delete/restore para aristas y assets.
