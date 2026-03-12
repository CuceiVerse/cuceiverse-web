# Textura Del Campus

El visor Pixi del mapa intenta cargar una textura base desde:

- `VITE_CAMPUS_MAP_TEXTURE_URL`
- o, si no existe, desde `/maps/cucei-campus-base.png`
- o, como fallback, desde `/maps/cucei-campus-base.svg`

## Flujo recomendado

1. Exporta tu mapa pixel-art final como PNG.
2. Guárdalo en `public/maps/cucei-campus-base.png`.
3. Si quieres otra ruta, define `VITE_CAMPUS_MAP_TEXTURE_URL` en tu `.env` del frontend.

## Ejemplo

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_CAMPUS_MAP_TEXTURE_URL=/maps/cucei-campus-base.png
```

## Nota

El repo ya incluye un placeholder en `public/maps/cucei-campus-base.svg` para probar el flujo.

Si no existe ningún archivo válido, el visor sigue funcionando con la geometría isométrica del campus y simplemente omite la textura de fondo.