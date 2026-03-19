# CONVENTIONAL_COMMITS.md — CUCEIverse

Este repositorio adopta **Conventional Commits** para asegurar trazabilidad, generación de release notes y consistencia entre repos.

## Formato
type(scope)!: summary

markdown
Copiar código

- **type**: obligatorio
- **scope**: opcional (ej. `backend`, `auth`, `db`, `ci`)
- **!**: opcional, indica breaking change
- **summary**: imperativo, corto, sin punto final

## Types permitidos
- `feat`: nueva funcionalidad
- `fix`: corrección de bug
- `docs`: documentación
- `refactor`: refactor sin cambio funcional
- `chore`: mantenimiento (deps, scripts, tooling)
- `ci`: pipelines, workflows
- `test`: pruebas

## Breaking changes
Usar:
- `feat!:` / `fix!:` o
- footer `BREAKING CHANGE: ...`

## Ejemplos válidos
- `feat(auth): add register endpoint`
- `fix(db): handle connection timeout`
- `docs: add conventional commits guide`
- `ci(backend): run prisma generate before lint`
- `refactor(prisma): simplify service lifecycle`
- `feat!: change auth token claims`

## Política de merges
- Se recomienda **Squash and Merge** para que el commit final respete el formato.
- **Merge commits automáticos** (por ejemplo “Merge pull request …”) pueden existir; no se consideran incumplimiento del estándar, pero se evita su uso cuando sea posible.