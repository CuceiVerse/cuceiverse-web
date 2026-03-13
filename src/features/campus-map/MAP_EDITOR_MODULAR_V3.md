# Modo Edicion Modular v3

## Estado recomendado

El editor modular usa un store global con Zustand y separa el estado canonico de los derivados:

- `blocksById`: fuente de verdad para bloques 2x2 de edificios.
- `pathsByCell`: celdas pintadas con brush para pasillos.
- `propsById`: props 1x1 como arboles, bancas o POIs especiales.
- `buildingsById`: vista derivada por connected components; se recalcula cada vez que cambia `blocksById`.
- `buildingModalTargetId`: edificio logico seleccionado para etiquetado global.

Archivo base: [src/features/campus-map/editor/useModularMapStore.ts](src/features/campus-map/editor/useModularMapStore.ts)

## Regla de fusion de edificios

Cada bloque ocupa las celdas:

```ts
[(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
```

Dos bloques pertenecen al mismo edificio si existe al menos un par de celdas ocupadas con distancia Manhattan 1:

$$
\exists a \in A, b \in B \mid |a_x - b_x| + |a_y - b_y| = 1
$$

Eso evita fusion por esquina diagonal y permite fusion exacta por borde. El algoritmo implementado es:

1. Construir un grafo donde cada bloque 2x2 es un nodo.
2. Conectar dos nodos si cumplen adyacencia por borde.
3. Ejecutar flood fill o BFS para obtener componentes conectados.
4. Reconciliar el `buildingId` usando los ids previos de los bloques del componente para que el etiquetado sea estable ante merges.

Implementacion base: [src/features/campus-map/editor/buildingAdjacency.ts](src/features/campus-map/editor/buildingAdjacency.ts)

## Pseudocodigo de integracion con Pixi

```ts
onPaletteDrop(blockAnchor):
  store.placeBuildingBlock(blockAnchor)

onGridPointerDown(cell):
  if tool === 'path-brush':
    store.paintPathCell(cell)
  else if tool === 'prop':
    store.placeProp(cell)
  else if tool === 'select':
    store.selectAt(cell)

onGridPointerMove(cell):
  if pointerIsDown and tool === 'path-brush':
    store.paintPathCell(cell)

onGridPointerUp():
  store.clearBrushStroke()
```

## Payload de guardado

El payload recomendado hacia backend es normalizado y suficiente para reconstruir el modo lectura sin imagen estatica:

```json
{
  "schemaVersion": "modular-map@1",
  "mapId": "cucei-main-campus",
  "grid": {
    "columns": 64,
    "rows": 64,
    "tileWidth": 48,
    "tileHeight": 24,
    "origin": { "x": 760, "y": 92 }
  },
  "buildings": [
    {
      "id": "building-modulo-f",
      "name": "Modulo F",
      "type": "academic",
      "centroid": { "x": 20.5, "y": 16.5 },
      "bounds": { "minX": 18, "minY": 14, "maxX": 21, "maxY": 17 },
      "blocks": [
        {
          "id": "block-f-01",
          "anchor": { "x": 18, "y": 14 },
          "size": { "width": 2, "height": 2 }
        }
      ]
    }
  ],
  "paths": [
    { "cell": { "x": 25, "y": 20 }, "material": "pavers" }
  ],
  "props": [
    {
      "id": "prop-tree-01",
      "kind": "tree",
      "cell": { "x": 16, "y": 25 },
      "variant": "ficus"
    }
  ]
}
```

La representacion concreta ya existe en `serializeForSave()` dentro de [src/features/campus-map/editor/useModularMapStore.ts](src/features/campus-map/editor/useModularMapStore.ts).

## Seed inicial

El modo lectura puede hidratarse directamente con un JSON o respuesta de base de datos con esta misma forma. Ejemplo base: [src/features/campus-map/data/campusModularSeed.json](src/features/campus-map/data/campusModularSeed.json)