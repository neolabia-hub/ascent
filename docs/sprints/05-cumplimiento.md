# Sprint 5 — Certificados, encuestas, seguimiento y capa de plataforma

*Historia del 2026-09-01 y 02. Para saber cómo funciona el sistema HOY, ver
[`docs/README.md`](../README.md).*

---

## 1. Objetivo y alcance

Cerrar el ciclo de cumplimiento: que una capacitación terminada **produzca evidencia** (constancia),
**se evalúe** (encuesta) y **se pueda seguir** (quién la hizo y quién no).

**Fuera a propósito:**

- **Asistencia presencial y QR.** El cliente dijo explícitamente que no era urgente. Tiene una
  consecuencia que hay que recordar: **las formaciones presenciales no emiten constancia**, porque
  ahí no hay reproductor que marque completado sino asistencia marcada.
- **Reportes agregados y exportables.** Van a Sprint 6. Lo que se construyó es el *seguimiento de la
  ejecución*, que es otra cosa: el estado persona a persona, no el indicador consolidado.
- **Evaluación de desempeño anual.** Se analizó y se decidió que es un módulo aparte: distinto ciclo,
  distinta confidencialidad, se firma. No es una variante de la encuesta de eficacia.

---

## 2. El hilo que atravesó todo el sprint

**Configuración sembrada en el Sprint 1 que la interfaz prometía y el motor ignoraba.**

Ya había pasado con `requiresAssessment` en el Sprint 4. Aquí aparecieron cuatro casos más, y los
cuatro se descubrieron por una pregunta del cliente, no por una revisión:

| Campo | Síntoma | Cómo apareció |
|---|---|---|
| `issuesCertificate` | Ninguna formación emitía constancia | Al construir el módulo |
| `requiresSurvey` | **Bloqueaba publicar** «Capacitación del plan», sin forma de crear una encuesta | *«¿qué falta de Sprint 5?»* |
| `requiresEfficacy` | Sembrado, sin leer y sin interruptor | *«¿cómo se sabe quién es el jefe?»* |
| `reviewPolicy` | Enseñaba el detalle del examen sin poder configurarlo | *«me dio las respuestas aun teniendo intentos»* |

**La lección, y es de proceso:** sembrar un campo de configuración sin leerlo *y* sin poder
cambiarlo es deuda que no se ve hasta que un cliente pregunta. Antes de dar por buena una casilla,
comprobar las dos mitades.

---

## 3. Qué se construyó

### Certificación (#110 – #113)

- Cascada **tipo → actividad → snapshot en la versión**, con los tres estados de siempre.
- **Vigencia derivada de la recurrencia** del requisito, no un campo aparte.
- **Diseño del papel por el cliente**: sube su arte y arrastra los campos encima. `pdf-lib`, sin
  Chromium y sin ejecutar HTML ajeno.
- **Verificación pública** sin sesión, con QR y código no enumerable. Tres estados: vigente, vencida
  (*«se hizo de verdad, pero caducó»*) y anulada.
- **Migración retroactiva** para las 1.630 versiones publicadas antes de que existiera la columna.

### Encuestas (#114 – #121)

- Satisfacción como **instrumento único de la empresa**, enganchado solo.
- Eficacia **por formación**, respondida por el **jefe del área**. Apagada por decisión del cliente.
- Escalas en caras, estrellas o números; calificación donde **el binario manda sobre el promedio**.
- Constructor con **vista previa viva en marco de teléfono**, usando el mismo componente que el
  reproductor.

### Seguimiento (#117, #122, #123)

- Seis estados resueltos en el servidor, con `ESPERANDO` ganando al vencimiento.
- **Barra apilada** en vez de un porcentaje suelto.
- Vista general + detalle persona a persona + pestaña «Cómo va» en el plan.
- Camino por lote de **3 consultas fijas** para las vistas de muchas formaciones.

### Capa de plataforma (#100)

- Cuenta del proveedor **fuera de los tenants**, con ingreso propio y tokens que no se cruzan.

### Login (#97)

- «No puedo entrar» con contacto por tenant y aviso a quien puede restablecer.

---

## 4. Decisiones que costaron discusión

**El certificado en HTML no se sostenía.** El esquema del Sprint 0 asumía que el cliente maquetaría.
En la práctica «nosotros lo diseñamos» significa que tienen un arte en Canva. Tres razones para
cambiarlo: nadie escribe HTML, renderizarlo exige Chromium, y HTML ajeno ejecutado por el servidor es
superficie de ataque.

**Las que esperan convocatoria cuentan en el denominador.** Sacarlas daría un porcentaje más bonito y
falso. *El número tiene que doler cuando la ejecución va mal.*

**La encuesta no es obligatoria.** Si lo fuera, quien no opina se queda sin constancia — se le
negaría la evidencia de una capacitación que sí hizo.

**El evaluador de eficacia es el jefe del área, no el dueño del proceso.** El coordinador de SST sabe
del tema y no ve trabajar a nadie; evaluaría a 600 personas en fila.

---

## 5. Cómo se verificó

| | |
|---|---|
| Pruebas unitarias | **309** (partiendo de 259) |
| e2e | **21 / 21** |
| Lint, typecheck, build | En verde |

**Lo nuevo cubierto con pruebas puras:** la cascada de la constancia y su vigencia, el dibujado del
PDF (incluido «sale igual sin fondo, sin firmas y sin QR»), la calificación de encuestas, la
resolución del evaluador de eficacia, los seis estados de ejecución, y el guard de plataforma
—incluida la prueba de que **un token de tenant bien firmado no entra**—.

**Dos fallos del e2e que resultaron ser cosas distintas:**

- `sprint-4` falló porque la tarjeta de `/hoy` dejó de ser un botón entero al ganar su «Empezar».
  La prueba estaba desfasada, no el código.
- `alcance-analista` llevaba fallando desde antes: cerraba un desplegable pulsando el control, y con
  una sola opción marcada **el aspa de quitar el chip cae cerca del centro**. El clic para cerrar
  borraba la selección. Escape tampoco servía —lo escucha el cajón entero— y el desplegable tapa la
  etiqueta de debajo. Se cierra con un clic neutro por encima.

---

## 6. Qué quedó pendiente

| Pendiente | Criticidad | Nota |
|---|---|---|
| **Asistencia presencial y QR** | **Alta** | Bloquea que lo presencial emita constancia |
| ~~Exportar el seguimiento a Excel~~ | — | **Hecho el 2026-09-01** (Decision #124). El PDF se descarto: 600 filas en PDF no se ordenan ni se filtran. Ver `docs/modulos/seguimiento.md` |
| El enlace del plan no filtra al llegar a Seguimiento | Media | Falta leer `?formacion=` |
| Renombrar «Reportes» a «Seguimiento» en la navegación | Media | Los reportes de verdad llegan en Sprint 6 |
| Mensaje claro al no poder eliminar un tipo en uso | Media | La regla es correcta; el mensaje no explica |
| Pantalla del jefe para la eficacia y su programador | Media | El motor está; la eficacia está apagada |
| Emisión manual de constancia | Media | `certificates:issue` sin endpoint de alta |
| `MultiSelect`: el aspa dentro del botón que abre y cierra | Baja | Documentado en el componente |
| El e2e deja audiencias y reglas de prueba | Baja | Paliativo: `dev:limpiar-reglas`. Falta teardown |
| `X-Forwarded-For` | Media | Sube de prioridad desde que existe «No puedo entrar» |

---

*Historia del 2026-09-02. Para saber cómo funciona el sistema HOY, ver
[`docs/modulos/`](../modulos/).*
