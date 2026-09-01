# Documentación de NEO PULSE

Por dónde empezar según lo que necesites saber.

---

## Cómo funciona el sistema HOY

Lo que hay que leer para entender el producto tal como está. **Se mantiene al día**: si algo aquí
deja de ser cierto, es un error que hay que corregir.

| Documento | Responde |
|---|---|
| [`glosario.md`](glosario.md) | Qué significa cada concepto del negocio: actividad, convocatoria, asignación, plan, cobertura… |
| [`arquitectura.md`](arquitectura.md) | Cómo está construido: aislamiento multi-tenant, autenticación, inmutabilidad, seguridad, deuda técnica |
| [`modulos/`](modulos/) | Un documento por módulo, con su lógica y sus decisiones de fondo |
| [`RUNBOOK.md`](RUNBOOK.md) | Cómo se opera: comandos, credenciales, incidentes y lecciones. Solo se añade |
| [`../CLAUDE.md`](../CLAUDE.md) | El modelo completo y las decisiones irreversibles |

### Módulos

Cada uno cuenta **un proceso de negocio completo**, de punta a punta, no una pantalla ni una tabla.
La regla para crear uno nuevo: si explicar cómo funciona algo exige hablar de varias pantallas, del
servidor y de una decisión de producto a la vez, es un módulo.

| Módulo | Qué cubre |
|---|---|
| [`modulos/certificacion.md`](modulos/certificacion.md) | Qué formaciones acreditan, cómo se diseña el papel, cómo nace al terminar, y qué significa vigente / vencida / anulada al verificarlo |
| [`modulos/encuestas.md`](modulos/encuestas.md) | Satisfacción y eficacia: quién responde cada una, cómo se califica, y por qué la eficacia la responde el jefe del área |
| [`modulos/seguimiento.md`](modulos/seguimiento.md) | Quién hizo cada formación, quién no y **por qué no**. Los seis estados y la diferencia entre «atrasada» y «esperando convocatoria» |
| [`modulos/plataforma.md`](modulos/plataforma.md) | La capa del proveedor por encima de todos los clientes: cuenta aparte, ingreso propio y por qué los dos tokens no se cruzan |

---

## Qué pasó y cuándo

Historia. **Envejece a propósito**: lo que dice el Sprint 2 dejará de ser exacto cuando el Sprint 5
cambie algo, y está bien.

| Documento | Responde |
|---|---|
| [`sprints/`](sprints/README.md) | Un documento por sprint: qué se propuso, qué se construyó, qué se decidió y qué quedó fuera |
| [`HANDOFF.md`](HANDOFF.md) | En qué iba, qué quedó a medias y con qué continuar. Diario de sesiones |

---

## De dónde viene el proyecto

Documentos de arranque. No se actualizan: son el punto de partida, y sirven para entender por qué
el producto es como es.

| Documento | Responde |
|---|---|
| [`00-brief-crudo.md`](00-brief-crudo.md) | Lo que pidió el cliente, sin interpretar |
| [`01-decisiones-preliminares.md`](01-decisiones-preliminares.md) | Las decisiones tomadas antes de escribir código |
| [`02-aislamiento-proyectos.md`](02-aislamiento-proyectos.md) | Por qué NEO PULSE y SAC-NEO no comparten nada |
| [`03-infraestructura-produccion.md`](03-infraestructura-produccion.md) | El despliegue previsto |
| [`ideas-producto.md`](ideas-producto.md) | Lo que se pensó y no se hizo (todavía) |

---

## Cómo escribir aquí

[`COMO-DOCUMENTAR.md`](COMO-DOCUMENTAR.md) — el criterio: se documenta el **porqué**, no el qué. El
qué ya lo dice el código.
