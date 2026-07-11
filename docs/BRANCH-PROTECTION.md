# Branch protection y code review — TransPadilla

Fase 2.3 del plan de trabajo original. Hoy cualquiera con acceso de escritura puede mergear
directo a `main` sin revisión, y `main` se despliega automáticamente a producción (Render) en
cada push — así que un cambio sin revisar puede llegar a producción sin que nadie más lo vea
antes. Esto se configura en el dashboard de GitHub (no hay equivalente por código/config en el
repo).

## Checklist — GitHub → Settings → Branches

1. Repo → **Settings → Branches → Add branch protection rule** (o **Add rule**).
2. **Branch name pattern**: `main`.
3. Activar:
   - [ ] **Require a pull request before merging**
     - [ ] **Require approvals** → mínimo **1**.
     - [ ] **Dismiss stale pull request approvals when new commits are pushed** (si alguien
       aprobó y después se le agregan commits nuevos al PR, la aprobación vieja no cuenta).
   - [ ] **Require status checks to pass before merging**
     - [ ] **Require branches to be up to date before merging**.
     - Marca como checks obligatorios los jobs de `.github/workflows/ci.yml`: typecheck, build,
       test (y el audit de dependencias). Estos aparecen en la lista solo después de que el
       workflow haya corrido al menos una vez sobre un PR — si no aparecen, abre un PR de prueba
       primero.
   - [ ] **Require conversation resolution before merging** (opcional, recomendado: obliga a
     resolver todos los comentarios de revisión antes de mergear).
   - [ ] **Include administrators** (importante: sin esto, los admins del repo pueden saltarse
     estas reglas — actívalo para que apliquen a todos por igual).
4. Guardar (**Create** / **Save changes**).

## Flujo de trabajo resultante

- Nadie puede hacer `git push origin main` directo — GitHub lo rechaza.
- Todo cambio va por rama + Pull Request → al menos 1 aprobación + CI en verde → recién ahí se
  puede mergear (y ese merge es lo que dispara el deploy automático a Render).
- Si se usa el entorno de staging (`docs/STAGING.md`), el flujo típico es:
  `feature/x → PR → staging (probar) → PR → main (producción)`.

## Verificación de que quedó bien

- Intentar `git push origin main` directo (sin PR) desde tu máquina → GitHub lo rechaza con un
  error de "protected branch".
- Abrir un PR con el CI fallando → el botón de merge aparece bloqueado/deshabilitado.
- Abrir un PR sin aprobaciones → el botón de merge aparece bloqueado hasta conseguir 1 review.

## Nota sobre repos privados vs. gratuitos

Branch protection con estas reglas está disponible en repos públicos gratis, y en privados
requiere GitHub Team/Enterprise (o el plan que incluya reglas de rama en repos privados) — si
el repo de TransPadilla es privado en un plan Free, algunas opciones de esta lista pueden
aparecer bloqueadas; en ese caso aplica el subconjunto disponible (como mínimo, "Require pull
request before merging" suele estar disponible).
