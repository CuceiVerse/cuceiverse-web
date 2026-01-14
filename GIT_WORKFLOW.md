# GIT_WORKFLOW.md — CUCEIverse (Estándar de ramas y PRs)

Este documento define el flujo de trabajo Git oficial para **todos los repositorios de CUCEIverse**:

* `cuceiverse-mobile` (React Native)
* `cuceiverse-web` (React + Vite)
* `cuceiverse-backend` (NestJS)
* `cuceiverse-avatar-service` (FastAPI - Python)

El objetivo es mantener **consistencia**, **trazabilidad** y **control de releases/hotfixes** entre equipos y repositorios, alineado al enfoque de arquitectura modular del MVP.

---

## 1. Ramas base (permanentes)

Estas ramas existen siempre y tienen roles específicos protegidos.

* **`main`**: Rama de **producción**. El código aquí es sagrado y desplegable. Solo recibe cambios mediante Pull Request (Release o Hotfix).
* **`develop`**: Rama de **integración**. Aquí aterriza todo el trabajo diario (features, fixes, refactors, etc.).

> **Regla operativa:** No se trabaja directo en `main` ni en `develop`. Todo cambio entra estrictamente por Pull Request (PR).

---

## 2. Tipos de ramas permitidas

Formato general obligatorio: `tipo/descripcion-breve`

### 2.1. Tipos obligatorios
* **`feature/*`**: Desarrollo de nueva funcionalidad (producto, UX, API, capacidad).
* **`fix/*`**: Corrección de bugs en etapa de desarrollo (generalmente detectados en QA o integración).
* **`hotfix/*`**: Corrección urgente en producción. Sale de `main` y regresa a `main` (con back-merge a `develop`).
* **`chore/*`**: Tareas técnicas sin impacto funcional directo (dependencias, tooling, scripts, limpieza).
* **`docs/*`**: Documentación (README, guías, diagramas, políticas).
* **`refactor/*`**: Reestructuración de código sin cambiar comportamiento (mejorar mantenibilidad).

### 2.2. Tipos opcionales (permitidos)
* **`test/*`**: Adición o mejora de pruebas (unitarias, integración, e2e).
* **`ci/*`**: Pipelines, workflows, automatización CI/CD (GitHub Actions, hooks).

---

## 3. Flujo de trabajo (Reglas de Origen y Destino)

### 3.1. Regla de origen
Toda rama de trabajo estándar nace de `develop`.

```bash
git checkout develop
git pull origin develop
git checkout -b feature/mi-nueva-funcionalidad

```

### 3.2. Regla de destino (Pull Requests)

Todo PR de trabajo regular se dirige a: `develop`.

* `feature/*` → `develop`
* `fix/*` → `develop`
* `chore/*` → `develop`
* `refactor/*` → `develop`

### 3.3. Release (Promoción a Producción)

Un Release es un PR de `develop` → `main`.

> **Recomendación:** Agrupar un release por bloque coherente de cambios. Asegurar que `develop` pase todos los tests/linters antes de abrir el PR.

develop ──(PR: Release)──> main


### 3.4. Hotfix (Parches en Producción)

* **Origen:** Sale de `main`.
* **Destino:** PR hacia `main`.
* **Back-merge:** Obligatorio de `main` hacia `develop` tras el hotfix para mantener consistencia.

main ──> hotfix/critical-bug ──(PR)──> main
                                   └─(Back-merge PR)─> develop

---

## 4. Convención de Naming (Estricta)

### 4.1. Formato

`tipo/descripcion-breve`

### 4.2. Reglas

1. Todo en **minúsculas**.
2. Usa **guiones** para separar palabras (`-`).
3. **Sin espacios**.
4. Evita nombres genéricos (`feature/update`, `fix/bug`).
5. Descripción corta pero informativa (3–6 palabras).

| Estado | Ejemplo | Razón |
| --- | --- | --- |
| ✅ **Correcto** | `feature/siiau-link-flow` | Describe qué es y sigue formato. |
| ✅ **Correcto** | `fix/login-token-refresh` | Específico. |
| ✅ **Correcto** | `chore/update-deps-january` | Contextual. |
| ❌ **Incorrecto** | `Feature/Add SIIAU` | Usa mayúsculas y espacios. |
| ❌ **Incorrecto** | `fix/bug` | Demasiado genérico, sin contexto. |
| ❌ **Incorrecto** | `hotfix/fixLoginNow!!!` | Mal formato, caracteres inválidos. |

---

## 5. Procedimiento recomendado (Día a día)

### 5.1. Crear rama

Siempre actualiza tu local antes de empezar.

```bash
git checkout develop
git pull
git checkout -b feature/mi-cambio

```

### 5.2. Publicar rama y abrir PR

```bash
git push -u origin feature/mi-cambio

```

**Al abrir el PR hacia `develop`:**

* Describe el objetivo del cambio.
* Incluye evidencia (capturas, logs) si aplica.
* Mantén el PR acotado (evita cambios gigantes).

### 5.3. Mantener rama al día (Sync)

Si `develop` avanzó y necesitas esos cambios en tu rama:

```bash
git checkout feature/mi-cambio
git pull origin develop
# Resolver conflictos si existen

```

*(Preferencia: Merge desde develop para mantener historial claro, aunque rebase es permitido si el equipo lo domina).*

---

## 6. Políticas de Pull Request (Calidad)

Para garantizar la estabilidad de los repositorios `cuceiverse-*`:

1. **Review Mínimo:** Todo PR debe tener al menos **1 aprobación** de otro desarrollador.
2. **Checks Obligatorios:**
* El código debe compilar/ejecutarse.
* No debe haber errores de linter (ESLint, Flake8, etc.).


3. **Título del PR:** Debe seguir la convención semántica si es posible (ej: `feat: add login screen`, `fix: resolve crash on avatar load`).
4. **Criterio de Merge:**
* Solo se hace "Squash and Merge" (recomendado) o "Merge Commit" para mantener la historia limpia en `develop`.



---

## 7. Cheatsheet (Referencia Rápida)

| Acción | Comandos |
| --- | --- |
| **Iniciar trabajo** | `git checkout develop && git pull && git checkout -b tipo/nombre` |
| **Guardar cambios** | `git add . && git commit -m "mensaje claro"` |
| **Subir rama** | `git push -u origin tipo/nombre` |
| **Release** | PR de `develop` → `main` |
| **Hotfix Flow** | `main` → `hotfix/*` → PR a `main` (+ PR a `develop`) |

---

*Documento mantenido por el equipo de ingeniería de CUCEIverse.*

