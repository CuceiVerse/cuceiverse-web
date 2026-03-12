# CUCEIverse Web

Frontend de CUCEIverse con React + Vite + TypeScript.

## Modulo de mapa

El mapa interactivo 2D vive en `src/features/campus-map` y consume `GET /puntos-interes` del backend.

Variables de entorno principales:

- `VITE_API_BASE_URL`: base URL del backend
- `VITE_CAMPUS_MAP_TEXTURE_URL`: textura base opcional del campus

Si no defines textura, el visor sigue funcionando con la geometría isométrica interna.

Para usar una textura real del campus, consulta `docs/MAP_TEXTURE.md`.
