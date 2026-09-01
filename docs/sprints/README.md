# Bitacora de sprints — NEO PULSE

Un documento por sprint. Cada uno responde lo mismo, para que cualquiera (incluido el equipo
dentro de un ano) entienda que hay construido sin leer el codigo:

1. **Objetivo y alcance** — que se propuso y que quedo FUERA a proposito.
2. **Que se construyo** — modulos, endpoints y pantallas reales.
3. **Decisiones tomadas** — con su porque, para no rediscutirlas.
4. **Como se verifico** — pruebas ejecutadas y su resultado, no promesas.
5. **Que quedo pendiente** — con criticidad honesta.

| Sprint | Tema | Estado |
|---|---|---|
| [00](00-fundaciones.md) | Fundaciones: monorepo, datos, aislamiento multi-tenant, autenticacion | Terminado |
| [01](01-administracion.md) | Administracion del tenant: catalogos, personas, aprobaciones, diseno | Terminado |
| [02](02-catalogo-formativo.md) | Catalogo formativo: versionado, lecciones, evaluaciones | Terminado |
| [03](03-convocatorias-asignaciones-plan.md) | Convocatorias, audiencias, asignaciones y plan anual | Terminado |
| [04](04-experiencia-aprendiz.md) | Experiencia del aprendiz: PWA, reproductor de tarjetas, examenes, repaso y racha | Terminado |
| [05](05-cumplimiento.md) | Certificados, encuestas, seguimiento de la ejecucion y capa de plataforma | Terminado salvo asistencia presencial |
| 06 | Reportes, IA, auditoria y salida a produccion | Pendiente |

## Esto es historia, no referencia

Un documento de sprint cuenta **lo que paso en una fecha** y envejece a proposito: lo que dice el
Sprint 2 dejara de ser exacto cuando el Sprint 5 cambie algo, y esta bien.

Para saber **como funciona el sistema hoy**, usar la documentacion viva. El indice completo esta
en [`docs/README.md`](../README.md); lo esencial:

| Documento | Responde |
|---|---|
| `docs/glosario.md` | Que significa cada concepto del negocio (actividad, convocatoria, asignacion, plan, cobertura...) |
| `docs/arquitectura.md` | Como esta construido: aislamiento, inmutabilidad, seguridad, calidad, deuda tecnica |
| `docs/RUNBOOK.md` | Como se opera: comandos, credenciales, incidentes y lecciones. Solo se anade |
| `docs/modulos/` | Un documento por modulo con su logica completa (certificacion, y los que vengan) |
| `docs/HANDOFF.md` | En que iba, que quedo a medias y con que continuar. Diario de sesiones |
| `CLAUDE.md` | El modelo completo y las decisiones irreversibles |
