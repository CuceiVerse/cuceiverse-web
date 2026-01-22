# VERSIONING.md — CUCEIverse (Estrategia de Versionado)

Este documento define el estándar oficial de **versionado** para **todos los repositorios de CUCEIverse**:

- `cuceiverse-mobile` (React Native)
- `cuceiverse-web` (React + Vite)
- `cuceiverse-backend` (NestJS)
- `cuceiverse-avatar-service` (FastAPI - Python)

El objetivo es asegurar **consistencia**, **trazabilidad**, y un criterio uniforme para **releases** y **hotfixes**, manteniendo independencia entre productos.

---

## 1. Esquema oficial (SemVer 2.0.0)

Se adopta **Semantic Versioning (SemVer 2.0.0)** con el formato:

**MAJOR.MINOR.PATCH**

Ejemplo: `1.4.2`

- **MAJOR**: cambios incompatibles (breaking changes).
- **MINOR**: nuevas funcionalidades compatibles hacia atrás.
- **PATCH**: correcciones compatibles (bugs, ajustes menores).

---

## 2. Alcance: versionado independiente por repositorio

Cada repositorio mantiene su propia secuencia de versiones.

- No existe una “versión global” de CUCEIverse.
- `web`, `mobile`, `backend` y `avatar-service` pueden avanzar a ritmos distintos.
- Un release en un repo **no obliga** release en los demás.

---

## 3. Tags Git: formato estricto

Los tags **deben** seguir el formato:

**`vX.Y.Z`**

Ejemplos válidos:
- `v0.1.0`
- `v1.0.0`
- `v2.3.7`

Reglas:
1. El prefijo `v` es obligatorio.
2. No se permiten variantes como `1.2.0`, `release-1.2.0`, `v1.2`.
3. Los tags son **inmutables**: nunca se “mueve” un tag existente a otro commit.

---

## 4. Criterios de incremento (MAJOR / MINOR / PATCH)

### 4.1. MAJOR — `X.0.0` (Breaking Changes)

Incrementa **MAJOR** cuando se introduce un cambio que **rompe compatibilidad** para consumidores, integraciones o despliegue.

Ejemplos típicos:
- Cambio incompatible en contratos de API (backend):
  - renombrar/eliminar endpoints
  - cambiar payload/response de forma no retrocompatible
  - cambiar reglas de auth (claims, scopes, expiración) que invaliden clientes anteriores
- Cambios que requieren acción manual para actualizar:
  - nuevas variables de entorno obligatorias sin default razonable
  - cambios de configuración que rompen el arranque
  - migraciones de BD no retrocompatibles (schema/constraints) con impacto directo
- En web/mobile:
  - cambios que rompen navegación/estado de forma que invaliden flujos existentes
  - cambios incompatibles con el backend vigente (si el release implica romper el contrato)

Regla operativa:
- Si el cambio requiere coordinación explícita con otros repos/consumidores, es candidato a **MAJOR**.

---

### 4.2. MINOR — `X.Y.0` (Features compatibles)

Incrementa **MINOR** cuando se agrega funcionalidad nueva **compatible hacia atrás**.

Ejemplos:
- Backend:
  - nuevos endpoints sin romper existentes
  - nuevos campos opcionales en responses
  - nuevas capacidades detrás de feature flags
- Web/Mobile:
  - nuevas pantallas o flujos que no rompen el comportamiento actual
  - mejoras UX relevantes con compatibilidad de datos
- Avatar Service:
  - nuevos modos de generación manteniendo el contrato anterior
  - mejoras de pipeline con misma interfaz pública

---

### 4.3. PATCH — `X.Y.Z` (Fixes compatibles)

Incrementa **PATCH** para correcciones y ajustes que **no agregan features** y **no rompen compatibilidad**.

Ejemplos:
- Corrección de bugs funcionales.
- Fix de crash, error 500, validaciones, edge cases.
- Mejoras de performance que no cambian el comportamiento observable del contrato.
- Actualización de dependencias por seguridad o estabilidad **sin cambio funcional**.

Nota práctica:
- Cambios de documentación o refactor puro no siempre ameritan release. Si aun así se decide liberar (por ejemplo, por despliegue continuo del repo), se recomienda **PATCH**.

---

## 5. Reglas para “qué versión toca” (guía rápida)

| Tipo de cambio | Incremento |
| --- | --- |
| Breaking change (contrato, config, BD, compatibilidad) | **MAJOR** |
| Nueva funcionalidad compatible | **MINOR** |
| Bugfix / parche compatible | **PATCH** |

---

## 6. Integración recomendada con Conventional Commits

Si el repo utiliza Conventional Commits, se sugiere el mapeo:

- `feat:` → **MINOR**
- `fix:` → **PATCH**
- `feat!:` o `fix!:` o `BREAKING CHANGE:` → **MAJOR**

Esto mejora la automatización de Release Notes y reduce ambigüedad en incrementos.

---

## 7. Flujo de Release (Tag + Release Notes)

Este flujo asume el estándar definido en `GIT_WORKFLOW.md`:
- Trabajo diario en `develop`
- Release como PR `develop` → `main`

### 7.1. Reglas de release en `main`

1. **Todo merge a `main` representa un release.**
2. Inmediatamente después del merge:
   - Se crea el **tag** `vX.Y.Z` apuntando al commit de `main`.
   - Se generan y publican **Release Notes**.

### 7.2. Procedimiento recomendado (paso a paso)

1) Asegurar que `main` esté actualizado localmente:
```bash
git checkout main
git pull origin main
````

2. Determinar la versión siguiente (`X.Y.Z`) según criterios MAJOR/MINOR/PATCH.

3. Crear tag anotado:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

4. Crear la Release en GitHub/GitLab y pegar Release Notes.

### 7.3. Contenido mínimo de Release Notes

Estructura sugerida:

* **Resumen**
* **Highlights**
* **Changed**
* **Fixed**
* **Breaking Changes** (si aplica)
* **Notas de despliegue / migración** (si aplica)

Plantilla base:

```md
## Release vX.Y.Z

### Highlights
- ...

### Changed
- ...

### Fixed
- ...

### Breaking Changes
- (N/A si no aplica)

### Deployment / Migration Notes
- (N/A si no aplica)
```

---

## 8. Hotfixes y parches urgentes (producción)

Cuando exista un hotfix (según el flujo `main` → `hotfix/*` → PR a `main`):

* Normalmente incrementa **PATCH**.
* Tras merge a `main`, se taggea inmediatamente con el siguiente `vX.Y.(Z+1)`.
* Luego se hace back-merge a `develop` (para consistencia).

Ejemplo:

* Producción actual: `v1.3.4`
* Hotfix: `v1.3.5`

---

## 9. Recomendación de versión inicial

Para repositorios en etapa temprana:

* Iniciar con `v0.1.0`.
* Promover a `v1.0.0` cuando exista una primera versión estable con contrato razonablemente sólido.

---

## 10. Checklist de Release (control de calidad)

Antes del merge a `main`:

* Tests / linters pasan en `develop`.
* Version bump decidido (MAJOR/MINOR/PATCH) y documentado en el PR.
* Si hay breaking changes: incluir notas de migración.

Después del merge a `main`:

* Tag `vX.Y.Z` creado y pusheado.
* Release Notes publicadas.
* (Si aplica) despliegue verificado y smoke test básico.

---

*Documento mantenido por el equipo de ingeniería de CUCEIverse.*

