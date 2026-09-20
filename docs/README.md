# Documentación de ASCENT

Por dónde empezar según lo que necesites saber.

---

## Para el CLIENTE

Lo único de esta carpeta escrito para quien usa el producto, no para quien lo construye.

**Todas viven en [`guias/`](guias/README.md)** — trece, con su índice. Estuvieron repartidas entre esa
carpeta y la raíz de `docs/`, con cinco duplicadas byte a byte; se consolidaron el 2026-09-10, porque
una guía en dos sitios acaba corregida en uno solo y la otra copia sigue circulando.

| Documento | Responde |
|---|---|
| [`guias/README.md`](guias/README.md) | **El índice**: qué guía contesta a qué |
| [`guias/guia-usuarios.html`](guias/guia-usuarios.html) | El alta y la baja de personas, la carga masiva y cómo se recupera un acceso |
| [`guias/guia-montar-formaciones.html`](guias/guia-montar-formaciones.html) | De los documentos sueltos a la lección publicada, con examen y constancia |
| [`guias/guia-numeros.html`](guias/guia-numeros.html) | **Qué significa cada cifra** de Seguimiento y del plan anual, qué acción pide cada una, y por qué dos porcentajes sobre lo mismo pueden no coincidir |
| [`guias/guia-desempeno.html`](guias/guia-desempeno.html) | **El paso a paso** de la evaluación de desempeño: qué es cada opción, qué significa firmar y cómo, cómo se calcula la nota, y qué pasa después con el resultado |
| [`guias/asistencia.html`](guias/asistencia.html) | Los tres mecanismos de toma de lista y cómo sale el acta |
| [`entrega/`](entrega/README.md) | **El kit de entrega al cliente**: la página de bienvenida, el acta, la ficha técnica y los dos correos |

> Se mantiene a mano y a proposito: si cambia lo que significa un numero, esta guia se corrige en el
> mismo cambio. Una guia de usuario desactualizada hace mas daño que no tenerla, porque se cita.

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
| [`modulos/evaluaciones.md`](modulos/evaluaciones.md) | El examen: banco de preguntas, temas, bloques fijos y al azar, y por que editar una pregunta crea una version en vez de cambiarla |
| [`modulos/encuestas.md`](modulos/encuestas.md) | Satisfacción y eficacia: quién responde cada una, cómo se califica, y por qué la eficacia la responde el jefe del área |
| [`modulos/seguimiento.md`](modulos/seguimiento.md) | Quién hizo cada formación, quién no y **por qué no**. Los seis estados y la diferencia entre «atrasada» y «esperando convocatoria» |
| [`modulos/programas.md`](modulos/programas.md) | Varias formaciones certificadas como un conjunto: la regla de aprobación (obligatorios + cupo + nada sin hacer), las rondas, y por qué asignar un programa exige todos sus módulos |
| [`modulos/plataforma.md`](modulos/plataforma.md) | La capa del proveedor por encima de todos los clientes: cuenta aparte, ingreso propio y por qué los dos tokens no se cruzan |

---

## Producción — hay un cliente dentro

Ascent está viva desde el **2026-09-09** en `https://transprensa.ascentio.app`. Estos cuatro se
leen **en este orden** y el segundo es de lectura obligatoria antes de tocar la máquina.

| Documento | Responde |
|---|---|
| [`arquitectura.md` §9](arquitectura.md) | **Qué hay montado**: el mapa de la máquina, quién habla con quién, dónde vive el vídeo y qué NO tiene el servidor a propósito |
| [`05-reglas-de-despliegue.md`](05-reglas-de-despliegue.md) | **Qué no se hace nunca.** Los seis comandos prohibidos, lo que deja a la gente sin acceso sin que lo parezca, los cinco pasos de un despliegue con la copia antes, y las reglas de migración y de copias |
| [`RUNBOOK.md` § PRODUCCIÓN](RUNBOOK.md) | **Cómo se opera**: los comandos del día a día, cómo se recupera una migración a medias, cómo se restablece la cuenta de plataforma y cómo se comprueba que la copia sirve |
| [`04-despliegue-piloto.md`](04-despliegue-piloto.md) | **Cómo se montó**, paso a paso, y qué se marcó al contratar la máquina. Sirve para montar la segunda |
| [`03-infraestructura-produccion.md`](03-infraestructura-produccion.md) | **Por qué esta máquina y no otra**: el cálculo, los precios de septiembre de 2026 y qué cambia cuando llegue el segundo cliente |

> **Las credenciales NO están en el repositorio**, y no es desorden: dentro, un `git add .`
> distraído las sube, y una credencial que llegó a un repositorio ya no se arregla borrando el
> commit — hay que rotarla. Viven en `C:\Users\Prueba\Documents\ASCENT - CREDENCIALES Y ACCESOS.md`.

---
## Qué pasó y cuándo

Historia. **Envejece a propósito**: lo que dice el Sprint 2 dejará de ser exacto cuando el Sprint 5
cambie algo, y está bien.

| Documento | Responde |
|---|---|
| [`sprints/`](sprints/README.md) | Un documento por sprint: qué se propuso, qué se construyó, qué se decidió y qué quedó fuera |
| [`HANDOFF.md`](HANDOFF.md) | En qué iba, qué quedó a medias y con qué continuar. Diario de sesiones |
| [`PENDIENTES.md`](PENDIENTES.md) | **Qué falta HOY, todo junto y con dónde está el detalle.** Se corrige: lo hecho se borra de ahí |

---

## De dónde viene el proyecto

Documentos de arranque. No se actualizan: son el punto de partida, y sirven para entender por qué
el producto es como es.

| Documento | Responde |
|---|---|
| [`00-brief-crudo.md`](00-brief-crudo.md) | Lo que pidió el cliente, sin interpretar |
| [`01-decisiones-preliminares.md`](01-decisiones-preliminares.md) | Las decisiones tomadas antes de escribir código |
| [`02-aislamiento-proyectos.md`](02-aislamiento-proyectos.md) | Por qué Ascent y SAC-NEO no comparten nada |
| [`ideas-producto.md`](ideas-producto.md) | Lo que se pensó y no se hizo (todavía) |

---

## Cómo escribir aquí

[`COMO-DOCUMENTAR.md`](COMO-DOCUMENTAR.md) — el criterio: se documenta el **porqué**, no el qué. El
qué ya lo dice el código.
