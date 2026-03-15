# Flujos Agregados - Marzo 2026

## 1) Flujo de login y sincronizacion academica
1. Usuario inicia sesion con codigo y NIP.
2. Se guarda token y sesion autenticada.
3. Se dispara sincronizacion de snapshot academico en backend.
4. Las vistas academicas consultan estado `idle/loading/ready/error`.
5. El boton de reintento se muestra solo en escenarios de error/sin datos.

## 2) Flujo de perfil academico
1. El HUD academico consume snapshot SIIAU.
2. Materias completadas y calificaciones se toman del perfil sincronizado (fuente SIIAU).
3. Misiones se construyen con materias cursando del semestre actual.
4. CTA de skill modal redirige a vista completa de oferta academica.

## 3) Flujo de mapa y trazado de rutas
1. Usuario selecciona origen/destino en panel de navegacion.
2. Se calcula ruta con nodos/modulo de pathfinding.
3. UI presenta estado legible, distancia y controles de trazado.
4. Se soporta origen contextual y actualizacion de ruta por eventos.

## 4) Flujo de asistente universitario en UI
1. Widget flotante persistente se monta en layout principal autenticado.
2. Usuario envia mensaje; frontend llama `POST /assistant/chat`.
3. Se renderiza respuesta, sugerencias y se actualiza contexto conversacional.
4. Si llega accion `highlight-route`, se emite evento global para el mapa.
5. El mapa escucha `cuceiverse.assistant.route` y traza destino sugerido.

## 5) Flujo conversacional multi-turno
1. El chat conserva contexto de ultimo destino.
2. Mensajes como "llevame ahi" reutilizan ese contexto.
3. Si no hay contexto/destino valido, se muestran sugerencias guiadas.

## 6) Persistencia del widget
1. Se persisten mensajes, contexto y sugerencias en `localStorage`.
2. Al recargar, se hidrata estado guardado para continuidad.
3. Se limita historial para controlar tamano (ultimos mensajes/sugerencias).
4. Si el estado guardado es invalido, se resetea de forma segura.

## 7) UX del asistente
1. Auto-scroll al ultimo mensaje al abrir/recibir respuestas.
2. Chips de sugerencias clickeables para consultas rapidas.
3. Resaltado temporal de sugerencia activa para feedback visual.
